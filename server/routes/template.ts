import * as expressModule from 'express';
import type _express from 'express';
const express: typeof _express = (expressModule as any).default || expressModule;
import { nanoid } from 'nanoid';
import { db } from '../db';
import { artifactTemplates, projects, templateFeedback } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { DynamicTemplateEngine } from '../dynamic-template-engine';
import { BusinessTemplates, type BusinessTemplate } from '../services/business-templates';
import { TemplateService } from '../services/template-service';

const router = express.Router();
const templateEngine = new DynamicTemplateEngine();

/**
 * Semantic/keyword search templates
 */
router.get('/search', async (req, res) => {
  try {
    const { userId } = req.user || {};
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { q, journeyType, industry, persona, isSystem, isActive, limit, minSimilarity } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Missing query param q' });
    }

    const results = await TemplateService.searchTemplatesWithFilters(q, {
      journeyType: typeof journeyType === 'string' ? journeyType : undefined,
      industry: typeof industry === 'string' ? industry : undefined,
      persona: typeof persona === 'string' ? persona : undefined,
      isSystem: typeof isSystem !== 'undefined' ? isSystem === 'true' : undefined,
      isActive: typeof isActive !== 'undefined' ? isActive === 'true' : true,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
      minSimilarity: typeof minSimilarity === 'string' ? parseFloat(minSimilarity) : undefined,
    });

    res.json({ results });
  } catch (error) {
    console.error('Failed to search templates:', error);
    res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

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
 * Get template configuration for analysis execution (Phase 3 - Task 3.2)
 */
router.get('/:templateId/config', async (req, res) => {
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

    if (template) {
      const resolvedTemplateId = template.templateId || template.id;
      const config = {
        templateId: resolvedTemplateId,
        templateName: template.name,
        recommendedAnalyses: getRecommendedAnalyses(resolvedTemplateId, template),
        analysisParameters: getAnalysisParameters(resolvedTemplateId, template),
        workflowSteps: getWorkflowSteps(resolvedTemplateId, template),
        visualizationPreferences: getVisualizationPreferences(resolvedTemplateId, template)
      };

      return res.json({
        success: true,
        config
      });
    }

    const fallbackTemplate = BusinessTemplates.getTemplate(templateId);
    if (!fallbackTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const fallbackConfig = buildBusinessTemplateConfig(fallbackTemplate);
    res.json({
      success: true,
      config: fallbackConfig
    });

  } catch (error) {
    console.error('Failed to get template config:', error);
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

    if (template) {
      return res.json(template);
    }

    const fallbackTemplate = BusinessTemplates.getTemplate(templateId);

    if (!fallbackTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json(fallbackTemplate);

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
    const feedbackId = `feedback_${nanoid()}`;

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

// Helper functions for template configuration extraction (Phase 3 - Task 3.2)

function getRecommendedAnalyses(templateId: string, template: any): string[] {
  // Map template types to recommended analyses
  const templateAnalysesMap: Record<string, string[]> = {
    'customer_retention': ['descriptive', 'classification', 'clustering', 'time-series'],
    'sales_forecasting': ['descriptive', 'regression', 'time-series'],
    'risk_assessment': ['descriptive', 'classification', 'correlation', 'regression'],
    'marketing_campaign': ['descriptive', 'correlation', 'regression', 'time-series'],
    'financial_reporting': ['descriptive', 'time-series', 'correlation'],
    'operational_efficiency': ['descriptive', 'correlation', 'clustering', 'time-series'],
    'employee_attrition': ['descriptive', 'classification', 'correlation', 'time-series'],
    'product_recommendation': ['descriptive', 'clustering', 'classification'],
    'inventory_optimization': ['descriptive', 'regression', 'time-series'],
    'default': ['descriptive', 'correlation', 'regression']
  };

  // Try to match template ID to known types
  for (const [key, analyses] of Object.entries(templateAnalysesMap)) {
    if (templateId.toLowerCase().includes(key)) {
      return analyses;
    }
  }

  // Check template metadata for analysis recommendations
  if (template.recommendedAnalyses && Array.isArray(template.recommendedAnalyses)) {
    return template.recommendedAnalyses;
  }

  return templateAnalysesMap.default;
}

function getAnalysisParameters(templateId: string, template: any): Record<string, any> {
  // Extract parameters from template metadata or provide sensible defaults
  const defaultParams = {
    confidence_level: 0.95,
    test_size: 0.2,
    random_state: 42,
    max_features: 10,
    clustering_method: 'kmeans',
    time_series_frequency: 'D'
  };

  if (template.analysisParameters && typeof template.analysisParameters === 'object') {
    return { ...defaultParams, ...template.analysisParameters };
  }

  return defaultParams;
}

function buildBusinessTemplateConfig(template: BusinessTemplate) {
  const recommendedAnalyses = Array.from(new Set([
    ...(template.workflow || []).flatMap((step: any) => {
      switch (step.component) {
        case 'ml_training':
          return ['classification', 'regression', 'clustering'];
        case 'statistical_analysis':
          return ['descriptive', 'correlation'];
        case 'text_analysis':
          return ['sentiment', 'descriptive'];
        case 'visualization':
          return ['descriptive'];
        default:
          return ['descriptive'];
      }
    })
  ].filter(Boolean)));

  return {
    templateId: template.templateId,
    templateName: template.name,
    recommendedAnalyses: recommendedAnalyses.length > 0 ? recommendedAnalyses : ['descriptive', 'correlation'],
    analysisParameters: getAnalysisParameters(template.templateId || 'default', template),
    workflowSteps: (template.workflow || []).map((step: any, index: number) => ({
      id: step.stepId || `step_${index + 1}`,
      name: step.name,
      component: step.component,
      description: step.description || 'Template workflow step',
      checkpointQuestions: step.checkpointQuestions || []
    })),
    visualizationPreferences: {
      preferredCharts: (template.visualizations || []).map((viz: any) => viz.type),
      deliverables: (template.deliverables || []).map((deliverable: any) => deliverable.name)
    }
  };
}

function getWorkflowSteps(templateId: string, template: any): Array<{ id: string; name: string; description: string; duration: string }> {
  // Define workflow steps based on template type
  const commonSteps = [
    { id: 'data_validation', name: 'Data Validation', description: 'Validate data quality and completeness', duration: '2-3 min' },
    { id: 'data_preparation', name: 'Data Preparation', description: 'Clean and transform data for analysis', duration: '3-5 min' },
    { id: 'analysis_execution', name: 'Analysis Execution', description: 'Run recommended analyses', duration: '8-12 min' },
    { id: 'visualization', name: 'Visualization', description: 'Generate charts and dashboards', duration: '3-5 min' },
    { id: 'report_generation', name: 'Report Generation', description: 'Create business-ready reports', duration: '4-6 min' }
  ];

  if (template.workflowSteps && Array.isArray(template.workflowSteps)) {
    return template.workflowSteps;
  }

  return commonSteps;
}

function getVisualizationPreferences(templateId: string, template: any): Record<string, any> {
  // Map template types to visualization preferences
  const vizPreferences: Record<string, any> = {
    'customer_retention': {
      primary: 'line_chart',
      secondary: ['bar_chart', 'pie_chart'],
      dashboard_layout: 'retention_dashboard'
    },
    'sales_forecasting': {
      primary: 'line_chart',
      secondary: ['area_chart', 'bar_chart'],
      dashboard_layout: 'forecast_dashboard'
    },
    'risk_assessment': {
      primary: 'heatmap',
      secondary: ['scatter_plot', 'bar_chart'],
      dashboard_layout: 'risk_dashboard'
    },
    'default': {
      primary: 'bar_chart',
      secondary: ['line_chart', 'scatter_plot'],
      dashboard_layout: 'standard_dashboard'
    }
  };

  // Try to match template ID to known types
  for (const [key, prefs] of Object.entries(vizPreferences)) {
    if (templateId.toLowerCase().includes(key)) {
      return prefs;
    }
  }

  if (template.visualizationPreferences && typeof template.visualizationPreferences === 'object') {
    return template.visualizationPreferences;
  }

  return vizPreferences.default;
}

export default router;