import { Router } from 'express';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { ensureAuthenticated } from './auth';
import { db } from '../db';
import { projectSessions } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requiredDataElementsTool } from '../services/tools/required-data-elements-tool';

const router = Router();

/**
 * Analyze transformation needs and provide guidance
 */
router.post('/analyze-transformation-needs', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, schema, dataSize, journeyType } = req.body;

    if (!projectId || !schema) {
      return res.status(400).json({
        success: false,
        error: 'Project ID and schema are required'
      });
    }

    console.log(`PM Agent analyzing transformation needs for project ${projectId}`);

    // Initialize PM agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Analyze data characteristics
    const dataCharacteristics = {
      columnCount: Object.keys(schema).length,
      dataSize,
      fieldTypes: Object.values(schema).map((field: any) => field.type),
      journeyType
    };

    // Generate transformation recommendations
    const recommendations = await pmAgent.generateTransformationRecommendations(
      dataCharacteristics,
      journeyType
    );

    res.json({
      success: true,
      recommendation: recommendations.overallRecommendation,
      suggestedTransformations: recommendations.suggestedTransformations,
      dataQualityIssues: recommendations.dataQualityIssues,
      transformationPriority: recommendations.transformationPriority,
      estimatedComplexity: recommendations.estimatedComplexity,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('PM transformation analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze transformation needs'
    });
  }
});

/**
 * Coordinate transformation execution with specialized agents
 */
router.post('/coordinate-transformation', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, transformations, userGoals, audienceContext } = req.body;

    if (!projectId || !transformations || !Array.isArray(transformations)) {
      return res.status(400).json({
        success: false,
        error: 'Project ID and transformations array are required'
      });
    }

    console.log(`PM Agent coordinating transformation for project ${projectId}`);

    // Initialize PM agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Coordinate with specialized agents
    const coordination = await pmAgent.coordinateTransformationExecution({
      projectId,
      transformations,
      userGoals: userGoals || [],
      audienceContext: audienceContext || { primaryAudience: 'mixed' }
    });

    res.json({
      success: true,
      coordination,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('PM transformation coordination failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to coordinate transformation'
    });
  }
});

/**
 * Validate transformation configuration
 */
router.post('/validate-transformation', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, transformation, schema } = req.body;

    if (!projectId || !transformation || !schema) {
      return res.status(400).json({
        success: false,
        error: 'Project ID, transformation, and schema are required'
      });
    }

    console.log(`PM Agent validating transformation for project ${projectId}`);

    // Initialize PM agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Validate transformation
    const validation = await pmAgent.validateTransformationConfiguration(
      transformation,
      schema
    );

    res.json({
      success: true,
      validation,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('PM transformation validation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate transformation'
    });
  }
});

/**
 * Get transformation checkpoint status
 */
router.get('/transformation-checkpoint/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;

    console.log(`PM Agent getting transformation checkpoint for project ${projectId}`);

    // Initialize PM agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Get checkpoint status
    const checkpoint = await pmAgent.getTransformationCheckpoint(projectId);

    res.json({
      success: true,
      checkpoint,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('PM transformation checkpoint failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get transformation checkpoint'
    });
  }
});

/**
 * PM Agent Goal Clarification
 * Agent reads user's goal and questions, summarizes understanding, and asks clarifying questions
 */
router.post('/clarify-goal', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { sessionId, projectId, analysisGoal, businessQuestions, journeyType } = req.body;

    // FIX: Accept either sessionId or projectId from client
    const lookupId = sessionId || projectId;
    if (!lookupId || !analysisGoal) {
      return res.status(400).json({
        success: false,
        error: 'Session ID (or Project ID) and analysis goal are required'
      });
    }

    console.log(`🤖 PM Agent clarifying goal for ${sessionId ? 'session' : 'project'} ${lookupId}`);
    console.log(`📝 Goal: ${analysisGoal.substring(0, 100)}...`);

    // Initialize PM Agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Get PM Agent's understanding and clarifying questions
    const clarification = await pmAgent.clarifyGoalWithUser({
      analysisGoal,
      businessQuestions: businessQuestions || '',
      journeyType: journeyType || 'non-tech',
      userId
    });

    res.json({
      success: true,
      clarification: {
        summary: clarification.summary,
        understoodGoals: clarification.understoodGoals,
        clarifyingQuestions: clarification.clarifyingQuestions,
        suggestedFocus: clarification.suggestedFocus,
        identifiedGaps: clarification.identifiedGaps
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('PM goal clarification failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clarify goal'
    });
  }
});

/**
 * Get dataset recommendations from multi-agent consultation
 * PM Agent coordinates with Business, DE, and DS agents
 */
router.post('/recommend-datasets', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { sessionId, projectId, analysisGoal, businessQuestions, clarificationAnswers } = req.body;

    // FIX: Accept either sessionId or projectId from client
    const lookupId = sessionId || projectId;
    if (!lookupId || !analysisGoal) {
      return res.status(400).json({
        success: false,
        error: 'Session ID (or Project ID) and analysis goal are required'
      });
    }

    console.log(`🤖 PM Agent coordinating multi-agent consultation for dataset recommendations`);

    // Initialize PM Agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // FIX: Get session by sessionId OR by projectId
    let session: any = null;
    if (sessionId) {
      // Direct session lookup
      const [foundSession] = await db
        .select()
        .from(projectSessions)
        .where(eq(projectSessions.id, sessionId));
      session = foundSession;
    } else if (projectId) {
      // Find session by projectId (get most recent for this project)
      const [foundSession] = await db
        .select()
        .from(projectSessions)
        .where(and(
          eq(projectSessions.projectId, projectId),
          eq(projectSessions.userId, userId)
        ))
        .orderBy(desc(projectSessions.updatedAt))
        .limit(1);
      session = foundSession;
    }

    // If no session exists for projectId, create minimal context without failing
    let prepareData: any = {};
    let journeyType = 'non-tech';

    if (session) {
      if (session.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Session not found or access denied'
        });
      }
      prepareData = (session.prepareData as any) || {};
      journeyType = session.journeyType || 'non-tech';
    } else {
      // No session found - proceed with provided data (projectId case)
      console.log(`📋 No session found for project ${projectId}, proceeding with provided data`);
    }

    // Prepare data for multi-agent analysis
    const uploadedData = {
      analysisGoal,
      businessQuestions: businessQuestions || prepareData.businessQuestions || '',
      clarificationAnswers: clarificationAnswers || prepareData.clarificationAnswers || {},
      audience: prepareData.audience || { primaryAudience: 'mixed' },
      journeyType,  // FIX: Use extracted journeyType variable (handles null session)
      templates: prepareData.selectedTemplates || []
    };

    const userGoals = [analysisGoal];
    if (businessQuestions) {
      userGoals.push(...businessQuestions.split('\n').filter((q: string) => q.trim()));
    }

    // ✅ PHASE 1: Generate Required Data Elements (before dataset available)
    console.log('📋 Phase 1: Generating required data elements from goals...');
    const dataRequirementsDoc = await requiredDataElementsTool.defineRequirements({
      projectId: projectId || session?.projectId || 'temp_project_id',  // FIX: Use actual projectId when available
      userGoals,
      userQuestions: businessQuestions ? businessQuestions.split('\n').filter((q: string) => q.trim()) : []
    });
    console.log(`✅ Generated ${dataRequirementsDoc.analysisPath.length} analysis paths with ${dataRequirementsDoc.requiredDataElements.length} required data elements`);

    // Coordinate with Business, DE, and DS agents
    console.log(`🔄 Coordinating with Business Agent, Data Engineer, and Data Scientist...`);

    const coordination = await pmAgent.coordinateGoalAnalysis(
      'temp_project_id', // Will be created after data upload
      uploadedData,
      userGoals,
      'general' // Industry - could be extracted from goals
    );

    // Generate natural language advice
    const advice = {
      summary: coordination.synthesis.overallAssessment,
      recommendedDatasets: extractDatasetRecommendations(coordination, uploadedData, userGoals),
      dataRequirements: extractDataRequirements(coordination, uploadedData, userGoals),
      qualityExpectations: extractQualityExpectations(coordination, uploadedData, userGoals),
      naturalLanguageAdvice: generateNaturalLanguageAdvice(coordination, analysisGoal),
      technicalDetails: {
        dataEngineerOpinion: coordination.expertOpinions.find((o: any) => o.agentId === 'data_engineer')?.opinion,
        dataScientistOpinion: coordination.expertOpinions.find((o: any) => o.agentId === 'data_scientist')?.opinion,
        businessAgentOpinion: coordination.expertOpinions.find((o: any) => o.agentId === 'business_agent')?.opinion
      },
      // ✅ NEW: Include progressive data requirements mapping
      dataRequirementsMapping: {
        documentId: dataRequirementsDoc.documentId,
        analysisPath: dataRequirementsDoc.analysisPath,
        requiredDataElements: dataRequirementsDoc.requiredDataElements,
        status: dataRequirementsDoc.status,
        completeness: dataRequirementsDoc.completeness
      }
    };

    res.json({
      success: true,
      advice,
      coordination: {
        coordinationId: coordination.coordinationId,
        timestamp: coordination.timestamp,
        expertConsensus: coordination.synthesis.expertConsensus
      },
      // ✅ NEW: Return data requirements for user to review immediately
      dataRequirementsDocument: dataRequirementsDoc
    });

  } catch (error: any) {
    console.error('Multi-agent dataset recommendation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get dataset recommendations'
    });
  }
});

// Helper functions for dataset recommendations
type AgentId = 'data_engineer' | 'data_scientist' | 'business_agent';

const REQUIREMENT_LIBRARY: Record<string, { name: string; description: string; priority?: 'Required' | 'Recommended' }> = {
  segment_column: {
    name: 'Customer or Segment Attributes',
    description: 'Categorical columns (e.g., segment, persona, region) that support clustering and comparative analysis.',
    priority: 'Required'
  },
  temporal_data: {
    name: 'Time Series Context',
    description: 'Timestamps or date fields that allow forecasting, cohorting, and time-based trend analysis.',
    priority: 'Required'
  },
  numeric_variables: {
    name: 'Quantitative Performance Metrics',
    description: 'At least two numeric measures to unlock correlation, regression, and KPI tracking.',
    priority: 'Required'
  },
  segment_column_via_rfm: {
    name: 'Behavioral RFM Metrics',
    description: 'Recency, frequency, and monetary values that let us derive customer segments when none exist today.',
    priority: 'Recommended'
  },
  valid_data_quality_score: {
    name: 'Data Quality Profiling',
    description: 'A recent profiling output or score so agents can verify readiness before advanced analysis.',
    priority: 'Recommended'
  },
  sample_rows: {
    name: 'Representative Sample Rows',
    description: 'A lightweight extract that helps agents validate schema details and automated checks.',
    priority: 'Required'
  }
};

function getAgentOpinion<T = any>(coordination: any, agentId: AgentId): T | undefined {
  if (!coordination?.expertOpinions) return undefined;
  const match = coordination.expertOpinions.find((op: any) => op?.agentId === agentId);
  return match?.opinion as T | undefined;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function humanize(value: string): string {
  const words = value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function describeRequirement(rawRequirement: string, fallbackPriority: 'Required' | 'Recommended') {
  const key = normalizeKey(rawRequirement);
  const libraryEntry = REQUIREMENT_LIBRARY[key];
  const name = libraryEntry?.name ?? humanize(rawRequirement);
  const description = libraryEntry?.description ?? `Ensure you can provide ${humanize(rawRequirement).toLowerCase()} so the analysis can proceed.`;
  const priority = libraryEntry?.priority ?? fallbackPriority;

  return { name, description, priority };
}

function extractDatasetRecommendations(
  coordination: any,
  uploadedData: any,
  userGoals: string[]
): Array<{ name: string; description: string; priority: 'Required' | 'Recommended' }> {
  const recommendations: Array<{ name: string; description: string; priority: 'Required' | 'Recommended' }> = [];
  const seen = new Set<string>();

  const dataScientistOpinion: any = getAgentOpinion(coordination, 'data_scientist');
  const dataEngineerOpinion: any = getAgentOpinion(coordination, 'data_engineer');

  const addRecommendation = (name: string, description: string, priority: 'Required' | 'Recommended') => {
    if (!name || seen.has(name.toLowerCase())) {
      return;
    }
    recommendations.push({ name, description, priority });
    seen.add(name.toLowerCase());
  };

  const missingRequirements: string[] = dataScientistOpinion?.dataRequirements?.missing || [];
  missingRequirements.forEach(requirement => {
    const detail = describeRequirement(requirement, 'Required');
    addRecommendation(detail.name, detail.description, 'Required');
  });

  const derivableRequirements: string[] = dataScientistOpinion?.dataRequirements?.canDerive || [];
  derivableRequirements.forEach(requirement => {
    const detail = describeRequirement(requirement, 'Recommended');
    addRecommendation(detail.name, detail.description, 'Recommended');
  });

  const metRequirements: string[] = dataScientistOpinion?.dataRequirements?.met || [];
  metRequirements.forEach(requirement => {
    const detail = describeRequirement(requirement, 'Recommended');
    addRecommendation(detail.name, `${detail.description} (already available in your current data)`, 'Recommended');
  });

  if (dataEngineerOpinion?.metadata?.rowsAnalyzed && dataEngineerOpinion?.metadata?.columnsAnalyzed) {
    const summary = `Current upload analyzed ${dataEngineerOpinion.metadata.rowsAnalyzed} rows across ${dataEngineerOpinion.metadata.columnsAnalyzed} columns.`;
    addRecommendation('Existing Uploaded Dataset', `${summary} The team can build on this dataset once quality issues are addressed.`, 'Recommended');
  }

  if (recommendations.length === 0) {
    const primaryGoal = buildPrimaryGoalSummary(uploadedData, userGoals);
    addRecommendation(
      `${primaryGoal || 'Goal-Aligned'} Dataset`,
      primaryGoal
        ? `Provide the dataset (metrics, identifiers, and time context) required to answer "${primaryGoal}". Include at least two measurable outcomes and the dimensions you care about.`
        : 'Provide transactional, customer, and contextual data so the agents can tailor the analysis to your goals.',
      'Required'
    );
  }

  return recommendations;
}

function extractDataRequirements(coordination: any, uploadedData: any, userGoals: string[]): string[] {
  const requirements = new Set<string>();
  const dataScientistOpinion: any = getAgentOpinion(coordination, 'data_scientist');
  const dataEngineerOpinion: any = getAgentOpinion(coordination, 'data_engineer');
  const businessOpinion: any = getAgentOpinion(coordination, 'business_agent');

  const requirementStrings = (
    dataScientistOpinion?.dataRequirements?.missing || []
  ).map((req: string) => {
    const detail = describeRequirement(req, 'Required');
    return `Need ${detail.name.toLowerCase()} to keep the analysis on track.`;
  });

  for (const requirement of requirementStrings) {
    requirements.add(requirement);
  }

  (dataScientistOpinion?.dataRequirements?.canDerive || []).forEach((req: string) => {
    const detail = describeRequirement(req, 'Recommended');
    requirements.add(`We can derive ${detail.name.toLowerCase()} if you share supporting behavior or transaction metrics.`);
  });

  if (Array.isArray(dataScientistOpinion?.requiredAnalyses) && dataScientistOpinion.requiredAnalyses.length > 0) {
    requirements.add(`Planned analyses: ${dataScientistOpinion.requiredAnalyses.join(', ')}.`);
  }

  if (Array.isArray(dataScientistOpinion?.recommendations)) {
    dataScientistOpinion.recommendations.slice(0, 3).forEach((tip: string) => requirements.add(tip));
  }

  if (Array.isArray(dataEngineerOpinion?.recommendations)) {
    dataEngineerOpinion.recommendations.slice(0, 3).forEach((tip: string) => requirements.add(tip));
  }

  if (Array.isArray(businessOpinion?.recommendations)) {
    businessOpinion.recommendations.slice(0, 2).forEach((tip: string) => requirements.add(tip));
  }

  const nextSteps: string[] = coordination?.synthesis?.nextSteps || [];
  nextSteps.forEach(step => requirements.add(step));

  if (requirements.size === 0) {
    const primaryGoal = buildPrimaryGoalSummary(uploadedData, userGoals);
    requirements.add(
      primaryGoal
        ? `Include the columns that let us answer "${primaryGoal}" (the metrics to improve and the segments you want to compare).`
        : 'Upload at least three months of data with consistent identifiers so we can validate trends and joins.'
    );
    requirements.add(
      'Share the outcome metric, relevant dimensions (persona, cohort, product), and a timestamp so we can align analyses.'
    );
  }

  return Array.from(requirements);
}

function extractQualityExpectations(coordination: any, uploadedData: any, userGoals: string[]): string[] {
  const dataEngineerOpinion: any = getAgentOpinion(coordination, 'data_engineer');
  const expectations = new Set<string>();

  const issueDetails = Array.isArray(dataEngineerOpinion?.issueDetails) ? dataEngineerOpinion.issueDetails : [];
  issueDetails.forEach((issue: any) => {
    if (typeof issue?.message === 'string') {
      expectations.add(issue.message);
    } else if (typeof issue?.type === 'string') {
      expectations.add(`Resolve ${humanize(issue.type).toLowerCase()} before moving forward.`);
    }
  });

  const issueMessages = Array.isArray(dataEngineerOpinion?.issueMessages) ? dataEngineerOpinion.issueMessages : [];
  issueMessages.forEach((message: string) => expectations.add(message));

  const warnings = Array.isArray(dataEngineerOpinion?.warnings) ? dataEngineerOpinion.warnings : [];
  warnings.forEach((warning: string) => expectations.add(warning));

  if (Array.isArray(dataEngineerOpinion?.recommendations)) {
    dataEngineerOpinion.recommendations.slice(0, 2).forEach((recommendation: string) => expectations.add(recommendation));
  }

  if (dataEngineerOpinion?.metadata?.columnsAnalyzed && dataEngineerOpinion?.metadata?.rowsAnalyzed) {
    expectations.add(`Maintain coverage across ${dataEngineerOpinion.metadata.columnsAnalyzed} columns and ${dataEngineerOpinion.metadata.rowsAnalyzed} rows to keep quality scores stable.`);
  }

  if (expectations.size === 0) {
    const primaryGoal = buildPrimaryGoalSummary(uploadedData, userGoals);
    expectations.add(
      primaryGoal
        ? `Make sure the dataset supporting "${primaryGoal}" has unique identifiers, a clean date field, and the metrics needed for comparisons.`
        : 'Keep missing values under 20% per column and remove duplicate records on key identifiers.'
    );
    expectations.add('Ensure timestamps, numeric ranges, and categorical values follow consistent formatting.');
  }

  return Array.from(expectations);
}

function buildPrimaryGoalSummary(uploadedData: any, userGoals: string[]): string | undefined {
  const sanitizedGoals = Array.isArray(userGoals) ? userGoals.filter((goal) => typeof goal === 'string' && goal.trim()) : [];
  if (sanitizedGoals.length > 0) {
    return sanitizedGoals[0].trim();
  }

  if (uploadedData) {
    if (typeof uploadedData.analysisGoal === 'string' && uploadedData.analysisGoal.trim()) {
      return uploadedData.analysisGoal.trim();
    }

    if (Array.isArray(uploadedData.businessQuestions) && uploadedData.businessQuestions.length > 0) {
      const question = uploadedData.businessQuestions.find((q: any) => typeof q === 'string' && q.trim());
      if (question) {
        return String(question).trim();
      }
    }

    if (typeof uploadedData.businessQuestions === 'string' && uploadedData.businessQuestions.trim()) {
      return uploadedData.businessQuestions.split('\n').map((q: string) => q.trim()).filter(Boolean)[0];
    }
  }

  return undefined;
}

function humanizeAssessment(value?: string): string {
  if (!value) return 'the recommended workflow';
  const lookup: Record<string, string> = {
    proceed: 'moving ahead as planned',
    proceed_with_caution: 'moving ahead with close monitoring',
    revise_approach: 'revisiting the plan before execution',
    not_feasible: 'pausing until prerequisites are met'
  };
  return lookup[value] ?? humanize(value.toLowerCase());
}

function generateNaturalLanguageAdvice(coordination: any, analysisGoal: string): string {
  const synthesis = coordination?.synthesis || {};
  const consensus = synthesis.expertConsensus;
  const businessOpinion: any = getAgentOpinion(coordination, 'business_agent');
  const goalText = typeof analysisGoal === 'string' && analysisGoal.trim().length > 0
    ? analysisGoal.trim()
    : 'your stated objectives';
  const goalSnippet = goalText.length > 120 ? `${goalText.substring(0, 120)}...` : goalText;

  const summaryLines: string[] = [];
  summaryLines.push(`Based on your goal "${goalSnippet}", our agents recommend ${humanizeAssessment(synthesis.overallAssessment)}.`);

  if (consensus) {
    summaryLines.push(
      `Consensus outlook: data quality is ${consensus.dataQuality}, technical feasibility is ${consensus.technicalFeasibility}, and expected business value is ${consensus.businessValue}.`
    );
  }

  const keyFindings = Array.isArray(synthesis.keyFindings) ? synthesis.keyFindings.filter(Boolean).slice(0, 3) : [];
  if (keyFindings.length > 0) {
    summaryLines.push(`Key findings:\n- ${keyFindings.join('\n- ')}`);
  }

  const nextSteps = Array.isArray(synthesis.nextSteps) && synthesis.nextSteps.length > 0
    ? synthesis.nextSteps
    : Array.isArray(synthesis.actionableRecommendations) ? synthesis.actionableRecommendations : [];

  if (nextSteps.length > 0) {
    const limitedSteps = nextSteps.slice(0, 4);
    summaryLines.push(`Immediate next steps:\n${limitedSteps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n')}`);
  }

  if (businessOpinion?.expectedROI) {
    summaryLines.push(`Expected ROI: ${businessOpinion.expectedROI}.`);
  }

  summaryLines.push('Our agents will stay with you through data upload, quality review, and plan approval so nothing moves forward without your sign-off.');

  return summaryLines.join('\n\n');
}

/**
 * Update goal after clarification
 */
router.post('/update-goal-after-clarification', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log('📝 [PM] Received clarification update request:', {
      body: req.body,
      bodyKeys: Object.keys(req.body),
      hasSessionId: !!req.body.sessionId
    });

    const { sessionId, refinedGoal, answersToQuestions, confirmedUnderstanding } = req.body;

    if (!sessionId) {
      console.error('❌ [PM] SessionId is missing from request body');
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    console.log(`✅ Updating goal after clarification for session ${sessionId}`);

    // Update session with refined goal
    const [session] = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.id, sessionId));

    if (!session || session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Session not found or access denied'
      });
    }

    const currentPrepareData = (session.prepareData as any) || {};

    await db
      .update(projectSessions)
      .set({
        prepareData: {
          ...currentPrepareData,
          analysisGoal: refinedGoal || currentPrepareData.analysisGoal,
          clarificationAnswers: answersToQuestions,
          pmAgentUnderstanding: confirmedUnderstanding,
          clarificationCompleted: true,
          clarifiedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      })
      .where(eq(projectSessions.id, sessionId));

    console.log(`✅ Goal refined and clarification recorded`);

    res.json({
      success: true,
      message: 'Goal clarification completed',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Update goal after clarification failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update goal'
    });
  }
});

export default router;
