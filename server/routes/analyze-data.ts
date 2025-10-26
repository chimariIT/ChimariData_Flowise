import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { storage } from '../services/storage';
import { PythonProcessor } from '../python-processor';
import { audienceFormatter, AudienceContext } from '../services/audience-formatter';
import { useProjectSession } from '../hooks/useProjectSession';

const router = Router();

/**
 * Analyze project data with audience-specific formatting
 */
router.post('/analyze-data/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { analysisType, config, audienceContext } = req.body;
    const userId = (req.user as any)?.id;

    if (!analysisType) {
      return res.status(400).json({ 
        success: false, 
        error: 'Analysis type is required' 
      });
    }

    // Get project and verify ownership
    const project = await storage.getProject(projectId);
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found or access denied' 
      });
    }

    // Get project data
    const dataset = await storage.getDatasetForProject(projectId);
    if (!dataset || !dataset.data) {
      return res.status(400).json({ 
        success: false, 
        error: 'Project has no data to analyze' 
      });
    }

    // Get audience context from session if not provided
    let finalAudienceContext: AudienceContext;
    if (audienceContext) {
      finalAudienceContext = audienceContext;
    } else {
      // Try to get from project session
      try {
        const sessionData = await storage.getProjectSession(projectId);
        if (sessionData?.prepare?.audience) {
          finalAudienceContext = {
            primaryAudience: sessionData.prepare.audience.primaryAudience || 'mixed',
            secondaryAudiences: sessionData.prepare.audience.secondaryAudiences || [],
            decisionContext: sessionData.prepare.audience.decisionContext || '',
            journeyType: project.journeyType || 'business'
          };
        } else {
          // Default audience context
          finalAudienceContext = {
            primaryAudience: 'mixed',
            secondaryAudiences: [],
            decisionContext: '',
            journeyType: project.journeyType || 'business'
          };
        }
      } catch (error) {
        console.warn('Could not get audience context from session, using defaults');
        finalAudienceContext = {
          primaryAudience: 'mixed',
          secondaryAudiences: [],
          decisionContext: '',
          journeyType: project.journeyType || 'business'
        };
      }
    }

    console.log(`Analyzing project ${projectId} with ${analysisType} for ${finalAudienceContext.primaryAudience} audience`);

    // Perform the analysis
    const analysisResult = await PythonProcessor.analyzeData(
      projectId,
      dataset.data,
      analysisType,
      config || {}
    );

    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        error: analysisResult.error || 'Analysis failed'
      });
    }

    // Format results for the specified audience
    const formattedResult = await audienceFormatter.formatForAudience(
      {
        type: analysisType,
        data: analysisResult.data,
        summary: analysisResult.summary,
        insights: analysisResult.insights,
        recommendations: analysisResult.recommendations,
        visualizations: analysisResult.visualizations,
        metadata: {
          projectId,
          analysisType,
          timestamp: new Date().toISOString(),
          dataSize: dataset.data.length,
          columns: Object.keys(dataset.schema || {})
        }
      },
      finalAudienceContext
    );

    // Save analysis results as project artifact
    try {
      await storage.createArtifact({
        id: `analysis_${projectId}_${Date.now()}`,
        projectId,
        type: 'analysis',
        title: `${analysisType} Analysis Results`,
        description: `Analysis results formatted for ${finalAudienceContext.primaryAudience} audience`,
        content: {
          analysisType,
          audienceContext: finalAudienceContext,
          rawResults: analysisResult.data,
          formattedResults: formattedResult
        },
        metadata: {
          analysisType,
          audienceType: finalAudienceContext.primaryAudience,
          dataSize: dataset.data.length,
          columnCount: Object.keys(dataset.schema || {}).length
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } catch (artifactError) {
      console.warn('Failed to save analysis artifact:', artifactError);
      // Continue without failing the request
    }

    res.json({
      success: true,
      analysisType,
      audienceContext: finalAudienceContext,
      rawResults: analysisResult.data,
      formattedResults: formattedResult,
      metadata: {
        projectId,
        analysisType,
        audienceType: finalAudienceContext.primaryAudience,
        timestamp: new Date().toISOString(),
        dataSize: dataset.data.length,
        columnCount: Object.keys(dataset.schema || {}).length
      }
    });

  } catch (error: any) {
    console.error('Analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed'
    });
  }
});

/**
 * Get analysis results with audience formatting
 */
router.get('/analyze-data/:projectId/results', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { audienceType = 'mixed' } = req.query;
    const userId = (req.user as any)?.id;

    // Get project and verify ownership
    const project = await storage.getProject(projectId);
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found or access denied' 
      });
    }

    // Get analysis artifacts for this project
    const artifacts = await storage.getProjectArtifacts(projectId, 'analysis');
    
    if (artifacts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No analysis results found for this project'
      });
    }

    // Get the most recent analysis
    const latestAnalysis = artifacts.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    // Get audience context from session
    let audienceContext: AudienceContext;
    try {
      const sessionData = await storage.getProjectSession(projectId);
      if (sessionData?.prepare?.audience) {
        audienceContext = {
          primaryAudience: audienceType as any || sessionData.prepare.audience.primaryAudience || 'mixed',
          secondaryAudiences: sessionData.prepare.audience.secondaryAudiences || [],
          decisionContext: sessionData.prepare.audience.decisionContext || '',
          journeyType: project.journeyType || 'business'
        };
      } else {
        audienceContext = {
          primaryAudience: audienceType as any || 'mixed',
          secondaryAudiences: [],
          decisionContext: '',
          journeyType: project.journeyType || 'business'
        };
      }
    } catch (error) {
      audienceContext = {
        primaryAudience: audienceType as any || 'mixed',
        secondaryAudiences: [],
        decisionContext: '',
        journeyType: project.journeyType || 'business'
      };
    }

    // Re-format results for the requested audience if different
    const artifactContent = latestAnalysis.content as any;
    if (artifactContent?.formattedResults && 
        artifactContent?.audienceContext?.primaryAudience === audienceType) {
      // Use existing formatted results
      res.json({
        success: true,
        analysisId: latestAnalysis.id,
        analysisType: artifactContent.analysisType,
        audienceContext,
        formattedResults: artifactContent.formattedResults,
        metadata: latestAnalysis.metadata,
        createdAt: latestAnalysis.createdAt
      });
    } else {
      // Re-format for the requested audience
      const formattedResult = await audienceFormatter.formatForAudience(
        {
          type: artifactContent?.analysisType || 'analysis',
          data: artifactContent?.rawResults || {},
          summary: artifactContent?.summary,
          insights: artifactContent?.insights,
          recommendations: artifactContent?.recommendations,
          visualizations: artifactContent?.visualizations,
          metadata: latestAnalysis.metadata
        },
        audienceContext
      );

      res.json({
        success: true,
        analysisId: latestAnalysis.id,
        analysisType: artifactContent?.analysisType || 'analysis',
        audienceContext,
        formattedResults: formattedResult,
        metadata: latestAnalysis.metadata,
        createdAt: latestAnalysis.createdAt
      });
    }

  } catch (error: any) {
    console.error('Failed to get analysis results:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get analysis results'
    });
  }
});

/**
 * Get available analysis types for a project
 */
router.get('/analyze-data/:projectId/types', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    // Get project and verify ownership
    const project = await storage.getProject(projectId);
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (!project || owner !== userId) {
      return res.status(404).json({ 
        success: false, 
        error: 'Project not found or access denied' 
      });
    }

    // Get dataset schema to determine available analysis types
    const dataset = await storage.getDatasetForProject(projectId);
    if (!dataset || !dataset.schema) {
      return res.status(400).json({
        success: false,
        error: 'Project has no data schema'
      });
    }

    const schema = dataset.schema;
    const columnTypes = Object.values(schema).map((col: any) => col.type);
    
    // Determine available analysis types based on data types
    const availableTypes = [];
    
    if (columnTypes.some(type => ['number', 'integer', 'float'].includes(type))) {
      availableTypes.push('descriptive', 'correlation', 'regression');
    }
    
    if (columnTypes.some(type => ['string', 'text', 'category'].includes(type))) {
      availableTypes.push('categorical', 'segmentation');
    }
    
    if (columnTypes.some(type => ['date', 'datetime', 'timestamp'].includes(type))) {
      availableTypes.push('time_series', 'trend_analysis');
    }
    
    // Always available
    availableTypes.push('data_quality', 'visualization');

    res.json({
      success: true,
      availableTypes,
      schema: {
        columns: Object.keys(schema),
        columnTypes: Object.values(schema),
        totalColumns: Object.keys(schema).length,
        totalRows: dataset.data?.length || 0
      }
    });

  } catch (error: any) {
    console.error('Failed to get analysis types:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get analysis types'
    });
  }
});

export default router;
