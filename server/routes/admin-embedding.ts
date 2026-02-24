/**
 * Admin Embedding Provider Management Routes
 *
 * Endpoints for managing embedding provider configuration, testing connectivity,
 * and viewing embedding statistics. All endpoints require admin authentication.
 */

import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from './auth';
import { requireAdmin, requireSuperAdmin } from '../middleware/rbac';
import { embeddingService } from '../services/embedding-service';
import { embeddingConfigService } from '../services/embedding-config-service';
import type { EmbeddingProviderConfig, EmbeddingProviderName } from '../services/embedding-providers/types';

const router = Router();

// ============================================================================
// GET /api/admin/embedding/config — Current configuration
// ============================================================================

router.get('/config', ensureAuthenticated, requireAdmin, async (req: Request, res: Response) => {
  try {
    const config = await embeddingConfigService.loadConfig();
    res.json({ success: true, data: config });
  } catch (error: any) {
    console.error('[AdminEmbedding] Failed to load config:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load embedding config' });
  }
});

// ============================================================================
// PUT /api/admin/embedding/config — Update configuration
// ============================================================================

router.put('/config', ensureAuthenticated, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id || 'unknown';
    const body = req.body as Partial<EmbeddingProviderConfig>;

    // Validate required fields
    if (!body.targetDimension || !body.providerOrder || !Array.isArray(body.providerOrder)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: targetDimension, providerOrder',
      });
    }

    // Validate targetDimension is reasonable
    if (body.targetDimension < 128 || body.targetDimension > 4096) {
      return res.status(400).json({
        success: false,
        error: 'targetDimension must be between 128 and 4096',
      });
    }

    const registry = embeddingService.getRegistry();
    const currentConfig = registry.getConfig();

    const newConfig: EmbeddingProviderConfig = {
      targetDimension: body.targetDimension,
      providerOrder: body.providerOrder,
      providerModels: body.providerModels || {},
      configVersion: currentConfig.configVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    };

    // Save to DB (auto-increments configVersion if dimension changed)
    const savedConfig = await embeddingConfigService.saveConfig(newConfig, userId);

    // Update the in-memory registry
    registry.setConfig(savedConfig);

    res.json({ success: true, data: savedConfig });
  } catch (error: any) {
    console.error('[AdminEmbedding] Failed to update config:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update embedding config' });
  }
});

// ============================================================================
// GET /api/admin/embedding/providers — All providers with status
// ============================================================================

router.get('/providers', ensureAuthenticated, requireAdmin, async (req: Request, res: Response) => {
  try {
    const registry = embeddingService.getRegistry();
    const allProviders = registry.getAllProviders();
    const config = registry.getConfig();

    const providers = allProviders.map(provider => ({
      name: provider.name,
      isConfigured: provider.isConfigured(),
      models: provider.getAvailableModels(),
      defaultModel: provider.getDefaultModel(),
      selectedModel: config.providerModels[provider.name] || provider.getDefaultModel(),
      orderIndex: config.providerOrder.indexOf(provider.name),
      envVars: getEnvVarsForProvider(provider.name),
    }));

    res.json({ success: true, data: providers });
  } catch (error: any) {
    console.error('[AdminEmbedding] Failed to list providers:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list providers' });
  }
});

// ============================================================================
// POST /api/admin/embedding/providers/:name/test — Test provider connectivity
// ============================================================================

router.post('/providers/:name/test', ensureAuthenticated, requireAdmin, async (req: Request, res: Response) => {
  try {
    const providerName = req.params.name as EmbeddingProviderName;
    const registry = embeddingService.getRegistry();
    const provider = registry.getProvider(providerName);

    if (!provider) {
      return res.status(404).json({ success: false, error: `Provider '${providerName}' not found` });
    }

    if (!provider.isConfigured()) {
      return res.json({
        success: true,
        data: {
          ok: false,
          error: `Provider not configured. Set ${getEnvVarsForProvider(providerName).join(' or ')}`,
          latencyMs: 0,
        },
      });
    }

    const result = await provider.testConnection();

    // If test succeeded, also test dimension normalization
    let normalizedDimension: number | undefined;
    if (result.ok) {
      try {
        const testResult = await provider.embedSingle('dimension test');
        const normalized = registry.normalizeEmbedding(testResult.embedding);
        normalizedDimension = normalized.length;
      } catch {
        // Non-fatal
      }
    }

    res.json({
      success: true,
      data: {
        ...result,
        nativeDimensions: provider.getAvailableModels()?.[0]?.nativeDimensions,
        normalizedDimension,
      },
    });
  } catch (error: any) {
    console.error(`[AdminEmbedding] Test failed for ${req.params.name}:`, error.message);
    res.status(500).json({ success: false, error: 'Test failed: ' + error.message });
  }
});

// ============================================================================
// GET /api/admin/embedding/stats — Embedding statistics
// ============================================================================

router.get('/stats', ensureAuthenticated, requireAdmin, async (req: Request, res: Response) => {
  try {
    const registry = embeddingService.getRegistry();
    const config = registry.getConfig();
    const staleStats = await embeddingConfigService.getStaleStats(config.configVersion);

    res.json({
      success: true,
      data: {
        targetDimension: config.targetDimension,
        configVersion: config.configVersion,
        ...staleStats,
        configuredProviders: registry.getConfiguredProviders().map(p => p.name),
        isAvailable: registry.isAvailable(),
      },
    });
  } catch (error: any) {
    console.error('[AdminEmbedding] Failed to get stats:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get embedding stats' });
  }
});

// ============================================================================
// POST /api/admin/embedding/regenerate — Trigger stale embedding regeneration
// ============================================================================

router.post('/regenerate', ensureAuthenticated, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    // This is a placeholder — actual bulk regeneration would be a background job
    // For now, return info about what needs regeneration
    const registry = embeddingService.getRegistry();
    const config = registry.getConfig();
    const staleStats = await embeddingConfigService.getStaleStats(config.configVersion);

    if (staleStats.stale === 0) {
      return res.json({
        success: true,
        data: { message: 'No stale embeddings to regenerate', stale: 0 },
      });
    }

    // TODO: Queue background regeneration job
    res.json({
      success: true,
      data: {
        message: `Found ${staleStats.stale} stale embeddings (out of ${staleStats.total}). Background regeneration not yet implemented — embeddings will be regenerated on next access.`,
        stale: staleStats.stale,
        total: staleStats.total,
      },
    });
  } catch (error: any) {
    console.error('[AdminEmbedding] Regenerate failed:', error.message);
    res.status(500).json({ success: false, error: 'Failed to regenerate embeddings' });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function getEnvVarsForProvider(name: EmbeddingProviderName): string[] {
  switch (name) {
    case 'openai':
      return ['OPENAI_API_KEY'];
    case 'gemini':
      return ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'];
    case 'ollama':
      return ['OLLAMA_BASE_URL'];
    case 'together':
      return ['TOGETHER_API_KEY'];
    case 'huggingface':
      return ['HUGGINGFACE_API_KEY'];
    case 'cohere':
      return ['COHERE_API_KEY'];
    default:
      return [];
  }
}

export default router;
