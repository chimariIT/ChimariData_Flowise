/**
 * Admin Knowledge Base Review Routes
 *
 * Enrichment review, analysis pattern approval, template feedback processing.
 * All endpoints require admin authentication.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  knowledgeNodes,
  knowledgeEdges,
  analysisPatterns,
  analysisPatternSources,
  templateFeedback,
  projects,
} from '@shared/schema';
import { eq, and, or, sql, desc, count, inArray, isNull } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import { requireAdmin } from '../middleware/rbac';
import { AdminAuditLogService } from '../services/admin-audit-log';
import { AnalysisPatternRegistry } from '../services/analysis-pattern-registry';

const router = Router();
const ensureAdmin = requireAdmin;

// ============================================================================
// ENRICHMENT REVIEW
// ============================================================================

// Enrichment history — projects that have been enriched
router.get('/enrichment/history', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;

    const enrichedProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        journeyProgress: projects.journeyProgress,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(sql`${projects.journeyProgress}->'knowledgeEnrichment' IS NOT NULL`)
      .orderBy(desc(projects.updatedAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(projects)
      .where(sql`${projects.journeyProgress}->'knowledgeEnrichment' IS NOT NULL`);

    const total = Number(totalResult?.count ?? 0);

    const history = enrichedProjects.map((p: any) => {
      const jp = (p.journeyProgress ?? {}) as Record<string, any>;
      const enrichment = jp.knowledgeEnrichment || {};
      return {
        projectId: p.id,
        projectName: p.name,
        processedAt: enrichment.processedAt,
        userProfileUpdates: enrichment.userProfileUpdates || 0,
        knowledgeGraphUpdates: enrichment.knowledgeGraphUpdates || 0,
        errors: enrichment.errors || 0,
        industry: jp.resolvedIndustry?.value || jp.industry || 'unknown',
        updatedAt: p.updatedAt,
      };
    });

    res.json({
      success: true,
      data: { history, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error fetching enrichment history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pending enrichment-created nodes awaiting admin review
router.get('/enrichment/pending', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;

    // Nodes created by enrichment that haven't been admin-reviewed yet
    // Enrichment-created nodes have attributes like occurrenceCount, lastUsedAt, sampleQuestions
    // But NOT adminReviewed flag
    const pendingNodes = await db
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          // Node types created by enrichment service
          or(
            eq(knowledgeNodes.type, 'question_pattern'),
            eq(knowledgeNodes.type, 'column_pattern'),
            eq(knowledgeNodes.type, 'analysis_type'),
          ),
          // Not yet reviewed by admin
          sql`(${knowledgeNodes.attributes}->>'adminReviewed') IS NULL`,
        ),
      )
      .orderBy(desc(knowledgeNodes.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(knowledgeNodes)
      .where(
        and(
          or(
            eq(knowledgeNodes.type, 'question_pattern'),
            eq(knowledgeNodes.type, 'column_pattern'),
            eq(knowledgeNodes.type, 'analysis_type'),
          ),
          sql`(${knowledgeNodes.attributes}->>'adminReviewed') IS NULL`,
        ),
      );

    const total = Number(totalResult?.count ?? 0);

    res.json({
      success: true,
      data: { nodes: pendingNodes, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error fetching pending enrichment nodes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve or reject an enrichment-created node
router.post('/enrichment/review/:nodeId', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;
    const { action, score, notes } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be "approve" or "reject"' });
    }

    const [node] = await db.select().from(knowledgeNodes).where(eq(knowledgeNodes.id, nodeId)).limit(1);
    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }

    const adminId = (req.user as any)?.id || 'unknown';

    if (action === 'approve') {
      const currentAttrs = (node.attributes ?? {}) as Record<string, any>;
      const updatedAttrs = {
        ...currentAttrs,
        adminReviewed: true,
        adminScore: typeof score === 'number' ? score : null,
        reviewNotes: notes || null,
        reviewedAt: new Date().toISOString(),
        reviewedBy: adminId,
      };

      await db.update(knowledgeNodes)
        .set({ attributes: updatedAttrs, updatedAt: new Date() })
        .where(eq(knowledgeNodes.id, nodeId));

      await AdminAuditLogService.log({
        action: 'approve_enrichment_node',
        adminId,
        entityType: 'other',
        changes: { nodeType: node.type, nodeLabel: node.label, score },
        metadata: { nodeId },
      });

      res.json({ success: true, message: `Node "${node.label}" approved` });
    } else {
      // Reject = delete the node (cascade deletes edges)
      await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, nodeId));

      await AdminAuditLogService.log({
        action: 'reject_enrichment_node',
        adminId,
        entityType: 'other',
        changes: { nodeType: node.type, nodeLabel: node.label, reason: notes },
        metadata: { nodeId },
      });

      res.json({ success: true, message: `Node "${node.label}" rejected and deleted` });
    }
  } catch (error: any) {
    console.error('Error reviewing enrichment node:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ANALYSIS PATTERN REVIEW
// ============================================================================

// List analysis patterns with status filter
router.get('/patterns', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const filters: any[] = [];
    if (status && status !== 'all') {
      filters.push(eq(analysisPatterns.status, status));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [patterns, [totalResult]] = await Promise.all([
      db.select().from(analysisPatterns).where(whereClause).orderBy(desc(analysisPatterns.createdAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(analysisPatterns).where(whereClause),
    ]);

    const total = Number(totalResult?.count ?? 0);

    res.json({
      success: true,
      data: { patterns, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error listing analysis patterns:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single pattern with sources
router.get('/patterns/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [pattern] = await db.select().from(analysisPatterns).where(eq(analysisPatterns.id, id)).limit(1);
    if (!pattern) {
      return res.status(404).json({ success: false, error: 'Pattern not found' });
    }

    const sources = await db.select().from(analysisPatternSources)
      .where(eq(analysisPatternSources.patternId, id))
      .orderBy(desc(analysisPatternSources.confidence));

    res.json({ success: true, data: { pattern, sources } });
  } catch (error: any) {
    console.error('Error fetching analysis pattern:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edit pattern fields
router.put('/patterns/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, confidence, industry, goal } = req.body;

    const [existing] = await db.select().from(analysisPatterns).where(eq(analysisPatterns.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Pattern not found' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (confidence !== undefined) updates.confidence = confidence;
    if (industry !== undefined) updates.industry = industry;
    if (goal !== undefined) updates.goal = goal;

    await db.update(analysisPatterns).set(updates).where(eq(analysisPatterns.id, id));

    const [updated] = await db.select().from(analysisPatterns).where(eq(analysisPatterns.id, id)).limit(1);

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: 'edit_analysis_pattern',
      adminId,
      entityType: 'other',
      changes: { name, description, confidence, industry, goal },
      metadata: { patternId: id },
    });

    res.json({ success: true, message: 'Pattern updated', data: updated });
  } catch (error: any) {
    console.error('Error updating analysis pattern:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve or reject a pattern
router.post('/patterns/:id/review', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be "approve" or "reject"' });
    }

    const [existing] = await db.select().from(analysisPatterns).where(eq(analysisPatterns.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Pattern not found' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await AnalysisPatternRegistry.updatePatternStatus(id, newStatus);

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: `${action}_analysis_pattern`,
      adminId,
      entityType: 'other',
      changes: { previousStatus: existing.status, newStatus, reason },
      metadata: { patternId: id, patternName: existing.name },
    });

    res.json({ success: true, message: `Pattern "${existing.name}" ${action}d` });
  } catch (error: any) {
    console.error('Error reviewing analysis pattern:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TEMPLATE FEEDBACK PROCESSING
// ============================================================================

// List template feedback
router.get('/feedback', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
    const processed = req.query.processed as string | undefined;

    const filters: any[] = [];
    if (processed === 'true') {
      filters.push(eq(templateFeedback.processed, true));
    } else if (processed === 'false') {
      filters.push(eq(templateFeedback.processed, false));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [feedback, [totalResult]] = await Promise.all([
      db.select().from(templateFeedback).where(whereClause).orderBy(desc(templateFeedback.createdAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(templateFeedback).where(whereClause),
    ]);

    const total = Number(totalResult?.count ?? 0);

    res.json({
      success: true,
      data: { feedback, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error listing template feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single feedback entry
router.get('/feedback/:id', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [entry] = await db.select().from(templateFeedback).where(eq(templateFeedback.id, id)).limit(1);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Feedback not found' });
    }

    res.json({ success: true, data: entry });
  } catch (error: any) {
    console.error('Error fetching template feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark feedback as processed
router.post('/feedback/:id/process', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [entry] = await db.select().from(templateFeedback).where(eq(templateFeedback.id, id)).limit(1);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Feedback not found' });
    }

    await db.update(templateFeedback).set({ processed: true }).where(eq(templateFeedback.id, id));

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: 'process_template_feedback',
      adminId,
      entityType: 'other',
      metadata: { feedbackId: id, templateId: entry.templateId, rating: entry.rating },
    });

    res.json({ success: true, message: 'Feedback marked as processed' });
  } catch (error: any) {
    console.error('Error processing template feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch mark feedback as processed
router.post('/feedback/batch-process', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
    }

    if (ids.length > 100) {
      return res.status(400).json({ success: false, error: 'Maximum 100 items per batch' });
    }

    await db.update(templateFeedback)
      .set({ processed: true })
      .where(inArray(templateFeedback.id, ids));

    const adminId = (req.user as any)?.id || 'unknown';
    await AdminAuditLogService.log({
      action: 'batch_process_template_feedback',
      adminId,
      entityType: 'other',
      metadata: { count: ids.length, feedbackIds: ids.slice(0, 10) },
    });

    res.json({ success: true, message: `${ids.length} feedback entries marked as processed` });
  } catch (error: any) {
    console.error('Error batch processing feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
