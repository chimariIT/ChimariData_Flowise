import express from 'express';
import { db } from '../db';
import { artifactTemplates, projects, templateFeedback } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { DynamicTemplateEngine } from '../dynamic-template-engine';

const router = express.Router();
const templateEngine = new DynamicTemplateEngine();

/**
 * Generate dynamic template for industry/business context
 */
router.post('/generate', async (req, res) => {
  try {
    const { userId } = req.user || {};
  const { industry, businessContext, analysisGoals, projectId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!industry || !businessContext || !projectId) {
      return res.status(400).json({ error: 'Missing required fields: industry, businessContext, projectId' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate dynamic template
    const template = await templateEngine.generateDynamicTemplate({
      industryDescription: industry,
      businessContext,
      specificRequirements: Array.isArray(analysisGoals) ? analysisGoals : [],
      stakeholderRoles: [],
    } as any);

    res.json({
      template,
      confidence: (template as any).confidence,
      sources: (template as any).sources?.researchSources || [],
      generationTime: (template as any).metadata?.researchTime || 0
    });

  } catch (error) {
    console.error('Failed to generate dynamic template:', error);
    res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Get existing template by ID
 */
router.get('/:templateId', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { templateId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get template from database
    const [template] = await db
      .select()
      .from(artifactTemplates)
      .where(eq(artifactTemplates.id, templateId));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // For now, allow access to any template (in production, add access control)
    res.json(template);

  } catch (error) {
    console.error('Failed to get template:', error);
    res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Research industry context for template generation
 */
router.get('/research/:industry', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { industry } = req.params;
    const { businessContext } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Research industry context
    // Use public method getTemplateForContext to indirectly perform research
    const researchTemplate = await templateEngine.getTemplateForContext(
      industry,
      (businessContext as string) || '',
      []
    );

    res.json({
      industry,
      research: researchTemplate,
      confidence: researchTemplate.confidence,
      sources: researchTemplate.sources
    });

  } catch (error) {
    console.error('Failed to research industry:', error);
    res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Provide feedback on generated template
 */
router.post('/:templateId/feedback', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { templateId } = req.params;
    const { rating, missingMetrics, irrelevantSections, industryAccuracy, additionalComments } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify template exists
    const [template] = await db
      .select()
      .from(artifactTemplates)
      .where(eq(artifactTemplates.id, templateId));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Record feedback
    const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    await db.insert(templateFeedback).values({
      id: feedbackId,
      templateId,
      userId,
      rating: rating || 5,
      missingMetrics: Array.isArray(missingMetrics) ? missingMetrics : (missingMetrics ? [missingMetrics] : []),
      irrelevantSections: Array.isArray(irrelevantSections) ? irrelevantSections : (irrelevantSections ? [irrelevantSections] : []),
      industryAccuracy: industryAccuracy || 5,
      additionalComments: additionalComments || '',
      createdAt: new Date(),
      processed: false
    });

    // Process feedback to improve template
    await (templateEngine as any).updateTemplateFromFeedback(templateId, {
      rating: rating || 5,
      missingMetrics: Array.isArray(missingMetrics) ? missingMetrics : (missingMetrics ? [missingMetrics] : []),
      irrelevantSections: Array.isArray(irrelevantSections) ? irrelevantSections : (irrelevantSections ? [irrelevantSections] : []),
      industryAccuracy: industryAccuracy || 5,
      additionalComments: additionalComments || '',
      userId,
      templateId
    });

    res.json({
      success: true,
      feedbackId,
      message: 'Feedback recorded and template improvement initiated'
    });

  } catch (error) {
    console.error('Failed to process template feedback:', error);
    res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Get template validation results
 */
router.get('/:templateId/validation', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { templateId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get template
    const [template] = await db
      .select()
      .from(artifactTemplates)
      .where(eq(artifactTemplates.id, templateId));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Validate template
    const validation = await (templateEngine as any).generateDynamicTemplate({
      industryDescription: template.industry || (template.targetIndustries?.[0] || ''),
      businessContext: template.businessContext || '',
      specificRequirements: [],
      stakeholderRoles: []
    });

    res.json(validation);

  } catch (error) {
    console.error('Failed to validate template:', error);
    res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Refine template based on feedback
 */
router.post('/:templateId/refine', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { templateId } = req.params;
    const { refinementRequest } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get existing template
    const [existingTemplate] = await db
      .select()
      .from(artifactTemplates)
      .where(eq(artifactTemplates.id, templateId));

    if (!existingTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Refine template
    const refinedTemplate = await (templateEngine as any).generateDynamicTemplate({
      industryDescription: existingTemplate.industry || (existingTemplate.targetIndustries?.[0] || ''),
      businessContext: (refinementRequest && refinementRequest.context) || '',
      specificRequirements: (refinementRequest && refinementRequest.requirements) || [],
      stakeholderRoles: []
    });

    res.json({
      success: true,
      refinedTemplate,
      improvements: refinedTemplate.improvements || []
    });

  } catch (error) {
    console.error('Failed to refine template:', error);
    res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Get template generation status for a project
 */
router.get('/status/:projectId', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get template generation status (mock implementation)
    const status = {
      projectId,
      stage: 'completed', // 'researching', 'generating', 'validating', 'completed', 'error'
      progress: 100,
      currentStep: 'Template generation complete',
      estimatedTimeRemaining: 0,
      researchSources: 4,
      confidence: 85,
      generatedAt: new Date(),
      errors: []
    };

    res.json(status);

  } catch (error) {
    console.error('Failed to get template status:', error);
    const msg = (error as any)?.message || 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

export default router;