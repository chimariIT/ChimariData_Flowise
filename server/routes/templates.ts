// Template API Routes - Database-backed template access
import { Router } from 'express';
import { TemplateService } from '../services/template-service';

const router = Router();

/**
 * GET /api/templates
 * Get all active templates with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const filter = {
      journeyType: req.query.journeyType as string | undefined,
      industry: req.query.industry as string | undefined,
      persona: req.query.persona as string | undefined,
      isSystem: req.query.isSystem === 'true' ? true : req.query.isSystem === 'false' ? false : undefined,
      searchTerm: req.query.search as string | undefined
    };

    const templates = await TemplateService.getAllTemplates(filter);

    res.json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (error: any) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/catalog
 * Get templates organized by journey type (compatibility endpoint)
 */
router.get('/catalog', async (req, res) => {
  try {
    const catalog = await TemplateService.getTemplateCatalog();

    res.json({
      success: true,
      data: catalog
    });
  } catch (error: any) {
    console.error('Error fetching template catalog:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template catalog',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/search
 * Search templates by keyword
 */
router.get('/search', async (req, res) => {
  try {
    const searchTerm = req.query.q as string;

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search term required'
      });
    }

    const templates = await TemplateService.searchTemplates(searchTerm);

    res.json({
      success: true,
      data: templates,
      count: templates.length,
      searchTerm
    });
  } catch (error: any) {
    console.error('Error searching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search templates',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/industry/:industry
 * Get templates for a specific industry
 */
router.get('/industry/:industry', async (req, res) => {
  try {
    const { industry } = req.params;
    const templates = await TemplateService.getTemplatesByIndustry(industry);

    res.json({
      success: true,
      data: templates,
      count: templates.length,
      industry
    });
  } catch (error: any) {
    console.error('Error fetching templates by industry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/journey/:journeyType
 * Get templates for a specific journey type
 */
router.get('/journey/:journeyType', async (req, res) => {
  try {
    const { journeyType } = req.params;
    const templates = await TemplateService.getTemplatesByJourneyType(journeyType);

    res.json({
      success: true,
      data: templates,
      count: templates.length,
      journeyType
    });
  } catch (error: any) {
    console.error('Error fetching templates by journey type:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/system
 * Get all system (built-in) templates
 */
router.get('/system', async (req, res) => {
  try {
    const templates = await TemplateService.getSystemTemplates();

    res.json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (error: any) {
    console.error('Error fetching system templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system templates',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/summary
 * Get template summary by industry
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await TemplateService.getIndustrySummary();

    res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error('Error fetching template summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template summary',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/with-patterns
 * Get templates with their linked analysis patterns
 */
router.get('/with-patterns', async (req, res) => {
  try {
    const templatesWithPatterns = await TemplateService.getTemplatesWithPatterns();

    res.json({
      success: true,
      data: templatesWithPatterns,
      count: templatesWithPatterns.length
    });
  } catch (error: any) {
    console.error('Error fetching templates with patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates with patterns',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/:id
 * Get a specific template by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = await TemplateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        templateId: id
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error: any) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
      message: error.message
    });
  }
});

/**
 * GET /api/templates/name/:name
 * Get a template by name (case-insensitive)
 */
router.get('/name/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const template = await TemplateService.getTemplateByName(name);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
        templateName: name
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error: any) {
    console.error('Error fetching template by name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
      message: error.message
    });
  }
});

export default router;
