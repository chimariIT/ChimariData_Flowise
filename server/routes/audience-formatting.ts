import { Router } from 'express';
import { audienceFormatter, AudienceContext } from '../services/audience-formatter';
import { ensureAuthenticated } from './auth';

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

    // Generate a preview of what the analysis would look like for this audience
    const previewPrompt = `Generate a preview of ${analysisType} analysis results formatted for ${audienceContext.primaryAudience} audience.

Decision Context: ${audienceContext.decisionContext || 'General analysis'}

Provide a brief preview (2-3 sentences) of what the analysis results would include, focusing on:
- Key insights relevant to this audience
- Expected recommendations
- Value proposition for this audience type

Keep it concise and audience-appropriate.`;

    // For now, return a structured preview
    const audiencePreviews = {
      executive: {
        summary: `Executive summary highlighting strategic implications and ROI opportunities from ${analysisType} analysis.`,
        keyInsights: ['Strategic business opportunities', 'Performance improvement potential', 'Competitive advantages'],
        recommendations: ['High-level strategic initiatives', 'Resource allocation guidance', 'Risk mitigation strategies']
      },
      technical: {
        summary: `Detailed technical analysis including statistical methods, data quality assessment, and implementation details for ${analysisType}.`,
        keyInsights: ['Statistical significance', 'Data quality metrics', 'Model performance indicators'],
        recommendations: ['Technical implementation steps', 'Data validation requirements', 'Performance optimization']
      },
      business_ops: {
        summary: `Operational insights and process improvement recommendations from ${analysisType} analysis.`,
        keyInsights: ['Operational efficiency opportunities', 'Process bottlenecks', 'Performance metrics'],
        recommendations: ['Process optimization', 'Operational improvements', 'Performance monitoring']
      },
      marketing: {
        summary: `Customer behavior insights and marketing strategy recommendations from ${analysisType} analysis.`,
        keyInsights: ['Customer behavior patterns', 'Campaign performance', 'Segmentation opportunities'],
        recommendations: ['Campaign optimization', 'Customer targeting', 'Marketing strategy adjustments']
      },
      mixed: {
        summary: `Comprehensive analysis results with executive summary, technical details, and actionable recommendations for ${analysisType}.`,
        keyInsights: ['Multi-perspective insights', 'Cross-functional opportunities', 'Strategic and tactical findings'],
        recommendations: ['Executive-level strategy', 'Technical implementation', 'Operational improvements']
      }
    };

  const primaryAudience = (audienceContext.primaryAudience || 'mixed') as keyof typeof audiencePreviews;
  const preview = audiencePreviews[primaryAudience] || audiencePreviews.mixed;

    res.json({
      success: true,
      preview,
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
