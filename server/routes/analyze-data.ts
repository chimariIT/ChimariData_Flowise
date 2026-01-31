import { Router } from 'express';
import { JourneyType, JourneyTypeEnum } from '@shared/canonical-types';
import { nanoid } from 'nanoid';
import { ensureAuthenticated } from './auth';
import { storage } from '../services/storage';
import { PythonProcessor } from '../services/python-processor';
import { audienceFormatter, AudienceContext } from '../services/audience-formatter';

const router = Router();

const coerceJourneyType = (value: unknown): JourneyType => {
  if (typeof value === 'string') {
    const options = JourneyTypeEnum.options as readonly string[];
    if (options.includes(value)) {
      return value as JourneyType;
    }
  }
  return 'non-tech';
};

const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const normalizeAudience = (value: unknown): AudienceContext['primaryAudience'] => {
  const allowed: AudienceContext['primaryAudience'][] = ['executive', 'technical', 'business_ops', 'marketing', 'mixed'];
  return allowed.includes(value as AudienceContext['primaryAudience'])
    ? value as AudienceContext['primaryAudience']
    : 'mixed';
};

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
    const rawDatasetData = (dataset as any)?.data;
    const datasetRows = ensureArray<any>(rawDatasetData);
    if (!dataset || datasetRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project has no data to analyze'
      });
    }

    const datasetSchemaRaw = (dataset as any)?.schema;
    const datasetSchema = datasetSchemaRaw && typeof datasetSchemaRaw === 'object'
      ? (datasetSchemaRaw as Record<string, unknown>)
      : {};
    const schemaColumns = Object.keys(datasetSchema);

    const projectJourneyType = coerceJourneyType((project as any)?.journeyType);

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
            journeyType: projectJourneyType
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
          journeyType: projectJourneyType
        };
      }
    }

    console.log(`Analyzing project ${projectId} with ${analysisType} for ${finalAudienceContext.primaryAudience} audience`);

    // Perform the analysis
    const analysisResult = await PythonProcessor.analyzeData(
      projectId,
      datasetRows,
      analysisType,
      config || {}
    );

    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        error: analysisResult.error || 'Analysis failed'
      });
    }

    const processorPayload = analysisResult.data;
    const payloadObject = processorPayload && typeof processorPayload === 'object'
      ? (processorPayload as Record<string, unknown>)
      : {};
    const payloadData = Object.prototype.hasOwnProperty.call(payloadObject, 'data')
      ? (payloadObject as any).data
      : (processorPayload ?? {});
    const summary = typeof (payloadObject as any).summary === 'string' ? (payloadObject as any).summary : undefined;
    const insights = Array.isArray((payloadObject as any).insights) ? (payloadObject as any).insights as string[] : undefined;
    const recommendations = Array.isArray((payloadObject as any).recommendations)
      ? (payloadObject as any).recommendations as string[]
      : undefined;
    const visualizationList = Array.isArray(analysisResult.visualizations)
      ? analysisResult.visualizations
      : Array.isArray((payloadObject as any).visualizations)
        ? (payloadObject as any).visualizations as any[]
        : undefined;
    const metadataFromPayload = (payloadObject as any).metadata;
    const metadata = {
      projectId,
      analysisType,
      timestamp: new Date().toISOString(),
      dataSize: datasetRows.length,
      columns: schemaColumns,
      ...(metadataFromPayload && typeof metadataFromPayload === 'object' ? metadataFromPayload : {})
    };

    // Format results for the specified audience
    const formattedResult = await audienceFormatter.formatForAudience(
      {
        type: analysisType,
        data: payloadData,
        summary,
        insights,
        recommendations,
        visualizations: visualizationList,
        metadata
      },
      finalAudienceContext
    );

    // Save analysis results as project artifact
    try {
      await storage.createArtifact({
        id: nanoid(),
        projectId,
        type: 'analysis',
        status: 'completed',
        params: {
          analysisType,
          audience: finalAudienceContext.primaryAudience,
          journeyType: finalAudienceContext.journeyType
        },
        output: {
          analysisType,
          audienceContext: finalAudienceContext,
          rawResults: processorPayload,
          formattedResults: formattedResult,
          metadata
        },
        createdBy: userId || null
      });
    } catch (artifactError) {
      console.warn('Failed to save analysis artifact:', artifactError);
      // Continue without failing the request
    }

    res.json({
      success: true,
      analysisType,
      audienceContext: finalAudienceContext,
      rawResults: processorPayload,
      formattedResults: formattedResult,
      metadata
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
    const requestedAudience = normalizeAudience(audienceType);
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

    const projectJourneyType = coerceJourneyType((project as any)?.journeyType);

    // Get analysis artifacts for this project
    const artifacts = await storage.getProjectArtifacts(projectId, 'analysis');

    if (artifacts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No analysis results found for this project'
      });
    }

    // Get the most recent analysis
    const getTimestamp = (value: Date | string | null | undefined) => value ? new Date(value).getTime() : 0;
    const latestAnalysis = artifacts.sort((a, b) =>
      getTimestamp(b.createdAt) - getTimestamp(a.createdAt)
    )[0];

    // Get audience context from session
    let audienceContext: AudienceContext;
    try {
      const sessionData = await storage.getProjectSession(projectId);
      if (sessionData?.prepare?.audience) {
        audienceContext = {
          primaryAudience: requestedAudience || sessionData.prepare.audience.primaryAudience || 'mixed',
          secondaryAudiences: sessionData.prepare.audience.secondaryAudiences || [],
          decisionContext: sessionData.prepare.audience.decisionContext || '',
          journeyType: projectJourneyType
        };
      } else {
        audienceContext = {
          primaryAudience: requestedAudience || 'mixed',
          secondaryAudiences: [],
          decisionContext: '',
          journeyType: projectJourneyType
        };
      }
    } catch (error) {
      audienceContext = {
        primaryAudience: requestedAudience || 'mixed',
        secondaryAudiences: [],
        decisionContext: '',
        journeyType: projectJourneyType
      };
    }

    // Re-format results for the requested audience if different
    const artifactContent = (latestAnalysis.output ?? {}) as any;
    const artifactMetadata = artifactContent?.metadata || {};

    if (artifactContent?.formattedResults &&
      artifactContent?.audienceContext?.primaryAudience === requestedAudience) {
      // Use existing formatted results
      res.json({
        success: true,
        analysisId: latestAnalysis.id,
        analysisType: artifactContent.analysisType,
        audienceContext,
        formattedResults: artifactContent.formattedResults,
        metadata: artifactMetadata,
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
          metadata: artifactMetadata
        },
        audienceContext
      );

      res.json({
        success: true,
        analysisId: latestAnalysis.id,
        analysisType: artifactContent?.analysisType || 'analysis',
        audienceContext,
        formattedResults: formattedResult,
        metadata: artifactMetadata,
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
    const datasetSchemaRaw = (dataset as any)?.schema;
    const datasetSchema = datasetSchemaRaw && typeof datasetSchemaRaw === 'object'
      ? (datasetSchemaRaw as Record<string, { type?: string }>)
      : {};
    if (!dataset || Object.keys(datasetSchema).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project has no data schema'
      });
    }

    const columnTypes = Object.values(datasetSchema).map((col) => (col as any)?.type);
    const datasetRows = ensureArray<any>((dataset as any)?.data);

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
        columns: Object.keys(datasetSchema),
        columnTypes,
        totalColumns: Object.keys(datasetSchema).length,
        totalRows: datasetRows.length
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
