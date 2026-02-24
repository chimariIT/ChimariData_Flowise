import { Router } from 'express';
import { audienceFormatter, AudienceContext } from '../services/audience-formatter';
import { ensureAuthenticated } from './auth';
import { storage } from '../storage';

const router = Router();

/**
 * Format analysis results for specific audience
 */
router.post('/format-results', ensureAuthenticated, async (req, res) => {
  try {
    const { analysisResult, audienceContext, projectId } = req.body;

    if (!analysisResult || !audienceContext) {
      return res.status(400).json({
        success: false,
        error: 'Analysis result and audience context are required'
      });
    }

    // Validate audience context
    const validAudiences = ['executive', 'technical', 'business_ops', 'marketing', 'mixed'];
    if (!validAudiences.includes(audienceContext.primaryAudience)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid primary audience. Must be one of: ' + validAudiences.join(', ')
      });
    }

    // Format results for the specified audience
    const formattedResult = await audienceFormatter.formatForAudience(
      analysisResult,
      audienceContext as AudienceContext
    );

    res.json({
      success: true,
      formattedResult,
      audienceContext: {
        primaryAudience: audienceContext.primaryAudience,
        secondaryAudiences: audienceContext.secondaryAudiences || [],
        decisionContext: audienceContext.decisionContext || ''
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to format results for audience:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to format results for audience'
    });
  }
});

/**
 * Get audience-specific analysis preview
 */
router.post('/preview-analysis', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, analysisType, audienceContext } = req.body;

    if (!projectId || !analysisType || !audienceContext) {
      return res.status(400).json({
        success: false,
        error: 'Project ID, analysis type, and audience context are required'
      });
    }

    // Load project data for data-aware preview generation
    let projectContext = { datasetName: '', columnNames: [] as string[], rowCount: 0, questions: [] as string[], goal: '', qualityScore: 0 };
    try {
      const project = await storage.getProject(projectId);
      if (project) {
        const jp = (project as any).journeyProgress || {};
        const datasetResults = await storage.getProjectDatasets(projectId);
        const firstDataset = datasetResults?.[0]?.dataset;

        projectContext.datasetName = (firstDataset as any)?.name || (firstDataset as any)?.fileName || project.fileName || 'your dataset';
        projectContext.rowCount = (firstDataset as any)?.recordCount || project.recordCount || 0;
        projectContext.qualityScore = jp.dataQualityScore || (firstDataset as any)?.ingestionMetadata?.qualityScore || 0;
        projectContext.goal = jp.analysisGoal || jp.requirementsDocument?.analysisGoal || '';
        projectContext.questions = (jp.userQuestions || []).slice(0, 3).map((q: any) => typeof q === 'string' ? q : q?.text || '');

        // Get column names from schema
        const schema = (firstDataset as any)?.ingestionMetadata?.schema
          || (firstDataset as any)?.metadata?.schema || {};
        projectContext.columnNames = Object.keys(schema).slice(0, 6);
      }
    } catch (e) {
      // Non-fatal: fall back to generic preview
    }

    const { datasetName, columnNames, rowCount, questions, goal, qualityScore } = projectContext;
    const colSample = columnNames.length > 0 ? columnNames.slice(0, 3).join(', ') : 'your data fields';
    const goalPhrase = goal ? ` focused on ${goal}` : '';
    const rowPhrase = rowCount > 0 ? ` across ${rowCount.toLocaleString()} records` : '';

    // Generate data-aware preview strings using actual project context
    const audiencePreviews = {
      executive: {
        summary: `Executive analysis of ${datasetName}${rowPhrase}${goalPhrase}, highlighting strategic implications and ROI opportunities from ${analysisType}.`,
        keyInsights: [
          `Strategic patterns in ${colSample}`,
          `Performance trends and improvement potential${rowPhrase}`,
          'Competitive positioning and risk factors'
        ],
        recommendations: ['High-level strategic initiatives based on findings', 'Resource allocation guidance', 'Risk mitigation strategies']
      },
      technical: {
        summary: `Detailed ${analysisType} of ${datasetName}${rowPhrase}, including statistical methods, data quality assessment, and implementation details.`,
        keyInsights: [
          `Statistical relationships between ${colSample}`,
          `Data quality assessment (${qualityScore > 0 ? qualityScore + '% quality score' : 'validated'})`,
          'Model performance and significance metrics'
        ],
        recommendations: ['Technical implementation steps', 'Data validation requirements', 'Performance optimization paths']
      },
      business_ops: {
        summary: `Operational insights from ${datasetName}${goalPhrase}, with process improvement recommendations from ${analysisType} analysis.`,
        keyInsights: [
          `Operational patterns in ${colSample}`,
          'Process efficiency opportunities',
          'Performance benchmarks and metrics'
        ],
        recommendations: ['Process optimization based on findings', 'Operational improvements', 'Performance monitoring setup']
      },
      marketing: {
        summary: `Behavioral insights from ${datasetName}${goalPhrase}, with ${analysisType}-driven marketing recommendations.`,
        keyInsights: [
          `Behavioral patterns across ${colSample}`,
          'Segmentation opportunities',
          'Campaign performance indicators'
        ],
        recommendations: ['Campaign optimization strategies', 'Targeting refinements', 'Marketing ROI improvements']
      },
      mixed: {
        summary: `Comprehensive ${analysisType} of ${datasetName}${rowPhrase}${goalPhrase}, with executive summary, technical details, and actionable recommendations.`,
        keyInsights: [
          `Key patterns across ${colSample}`,
          `Data-driven findings${rowPhrase}`,
          'Strategic and tactical opportunities'
        ],
        recommendations: [
          `Strategic actions based on ${analysisType} findings`,
          'Implementation roadmap',
          'Operational next steps'
        ]
      }
    };

    const primaryAudience = (audienceContext.primaryAudience || 'mixed') as keyof typeof audiencePreviews;
    const preview = audiencePreviews[primaryAudience] || audiencePreviews.mixed;

    // Derive confidence from data quality and analysis complexity
    const baseConfidence = qualityScore > 0 ? Math.min(0.95, qualityScore / 100) : 0.80;
    const confidence = Math.round(baseConfidence * 100) / 100;

    // Derive visualization types from analysis type
    const vizMap: Record<string, string[]> = {
      correlation: ['Correlation Heatmap', 'Scatter Plot Matrix', 'Variable Importance Chart'],
      regression: ['Regression Line Chart', 'Residual Plot', 'Coefficient Impact Chart'],
      clustering: ['Cluster Visualization', 'Silhouette Plot', 'Feature Importance'],
      time_series: ['Trend Analysis Chart', 'Seasonal Decomposition', 'Forecast Plot'],
      comparative: ['Group Comparison Chart', 'Box Plot Analysis', 'Effect Size Visualization'],
      descriptive: ['Distribution Charts', 'Summary Statistics Dashboard', 'Key Metrics Overview'],
      statistical: ['Statistical Test Results', 'Distribution Analysis', 'Confidence Intervals'],
    };
    const normalizedType = (analysisType || '').toLowerCase().replace(/[^a-z_]/g, '_');
    const sampleVisualizations = vizMap[normalizedType] || ['Data Overview Dashboard', 'Key Metrics Chart', 'Trend Analysis'];

    res.json({
      success: true,
      preview,
      confidence,
      sampleVisualizations,
      audienceContext: {
        primaryAudience: audienceContext.primaryAudience,
        secondaryAudiences: audienceContext.secondaryAudiences || [],
        decisionContext: audienceContext.decisionContext || ''
      },
      estimatedValue: {
        executive: 'Strategic decision support and ROI insights',
        technical: 'Technical implementation guidance and validation',
        business_ops: 'Operational efficiency and process improvements',
        marketing: 'Customer insights and campaign optimization',
        mixed: 'Comprehensive multi-stakeholder value'
      }[primaryAudience] || 'General business value',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to generate analysis preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate analysis preview'
    });
  }
});

/**
 * Get audience formatting templates
 */
router.get('/templates', ensureAuthenticated, async (req, res) => {
  try {
    const templates = {
      executive: {
        name: 'Executive Leadership',
        description: 'C-suite focused insights with strategic implications and ROI',
        sections: ['Executive Summary', 'Strategic Insights', 'High-Level Recommendations', 'Next Steps'],
        language: 'Business-focused, strategic terminology',
        detailLevel: 'High-level overview with key metrics'
      },
      technical: {
        name: 'Technical Team',
        description: 'Detailed technical analysis with methodology and implementation details',
        sections: ['Technical Details', 'Methodology', 'Data Quality', 'Implementation Guide'],
        language: 'Technical terminology, statistical language',
        detailLevel: 'Comprehensive technical documentation'
      },
      business_ops: {
        name: 'Business Operations',
        description: 'Operational insights with process improvements and KPIs',
        sections: ['Business Insights', 'Operational Recommendations', 'Performance Metrics', 'Action Items'],
        language: 'Operational terminology, process-focused',
        detailLevel: 'Actionable operational guidance'
      },
      marketing: {
        name: 'Marketing Team',
        description: 'Customer-focused insights with campaign and targeting recommendations',
        sections: ['Customer Insights', 'Marketing Recommendations', 'Campaign Performance', 'Segmentation'],
        language: 'Marketing terminology, customer-focused',
        detailLevel: 'Marketing strategy and tactics'
      },
      mixed: {
        name: 'Mixed Audience',
        description: 'Comprehensive format suitable for multiple stakeholder types',
        sections: ['Executive Summary', 'Technical Details', 'Business Insights', 'Recommendations', 'Next Steps'],
        language: 'Balanced terminology for all audiences',
        detailLevel: 'Multi-level detail for different stakeholders'
      }
    };

    res.json({
      success: true,
      templates,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to get audience templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get audience templates'
    });
  }
});

export default router;
