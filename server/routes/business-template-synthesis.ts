import { Router } from 'express';
import { businessTemplateSynthesisService } from '../services/business-template-synthesis';
import { ensureAuthenticated } from './auth';

const router = Router();

/**
 * Synthesize business template with user goals and data
 */
router.post('/synthesize', ensureAuthenticated, async (req, res) => {
  try {
    const { templateId, userGoals, dataSchema, audienceContext, industry } = req.body;

    if (!templateId || !userGoals || !Array.isArray(userGoals)) {
      return res.status(400).json({
        success: false,
        error: 'Template ID and user goals are required'
      });
    }

    if (!dataSchema || typeof dataSchema !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Data schema is required'
      });
    }

    if (!audienceContext || !audienceContext.primaryAudience) {
      return res.status(400).json({
        success: false,
        error: 'Audience context with primary audience is required'
      });
    }

    console.log(`Synthesizing template ${templateId} for ${audienceContext.primaryAudience} audience`);

    const synthesisResult = await businessTemplateSynthesisService.synthesizeTemplate({
      templateId,
      userGoals,
      dataSchema,
      audienceContext,
      industry
    });

    res.json({
      success: true,
      synthesis: synthesisResult,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Template synthesis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Template synthesis failed'
    });
  }
});

/**
 * Get available templates for synthesis
 */
router.get('/templates', ensureAuthenticated, async (req, res) => {
  try {
    const { domain, complexity, goals } = req.query;

    // Get templates from the business template library
    const templates = businessTemplateSynthesisService.getAvailableTemplates({
      domain: domain as string,
      complexity: complexity as string,
      goals: goals ? (goals as string).split(',') : undefined
    });

    res.json({
      success: true,
      templates,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Failed to get templates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get templates'
    });
  }
});

/**
 * Validate template synthesis configuration
 */
router.post('/validate', ensureAuthenticated, async (req, res) => {
  try {
    const { templateId, dataSchema, userGoals } = req.body;

    if (!templateId || !dataSchema || !userGoals) {
      return res.status(400).json({
        success: false,
        error: 'Template ID, data schema, and user goals are required'
      });
    }

    const validation = await businessTemplateSynthesisService.validateSynthesis({
      templateId,
      dataSchema,
      userGoals
    });

    res.json({
      success: true,
      validation,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Template validation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Template validation failed'
    });
  }
});

/**
 * Get template synthesis preview
 */
router.post('/preview', ensureAuthenticated, async (req, res) => {
  try {
    const { templateId, userGoals, audienceContext } = req.body;

    if (!templateId || !userGoals || !audienceContext) {
      return res.status(400).json({
        success: false,
        error: 'Template ID, user goals, and audience context are required'
      });
    }

    const preview = await businessTemplateSynthesisService.generatePreview({
      templateId,
      userGoals,
      audienceContext
    });

    res.json({
      success: true,
      preview,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Template preview failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Template preview failed'
    });
  }
});

export default router;
