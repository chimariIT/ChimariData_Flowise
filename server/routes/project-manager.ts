import { Router } from 'express';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { authenticateUser } from '../middleware/auth';
import { db } from '../db';
import { projectSessions } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

/**
 * Analyze transformation needs and provide guidance
 */
router.post('/analyze-transformation-needs', authenticateUser, async (req, res) => {
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
router.post('/coordinate-transformation', authenticateUser, async (req, res) => {
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
router.post('/validate-transformation', authenticateUser, async (req, res) => {
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
router.get('/transformation-checkpoint/:projectId', authenticateUser, async (req, res) => {
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
router.post('/clarify-goal', authenticateUser, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { sessionId, analysisGoal, businessQuestions, journeyType } = req.body;

    if (!sessionId || !analysisGoal) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and analysis goal are required'
      });
    }

    console.log(`🤖 PM Agent clarifying goal for session ${sessionId}`);
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
router.post('/recommend-datasets', authenticateUser, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { sessionId, analysisGoal, businessQuestions, clarificationAnswers } = req.body;

    if (!sessionId || !analysisGoal) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and analysis goal are required'
      });
    }

    console.log(`🤖 PM Agent coordinating multi-agent consultation for dataset recommendations`);

    // Initialize PM Agent
    const pmAgent = new ProjectManagerAgent();
    await pmAgent.initialize();

    // Get session to retrieve full context
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

    const prepareData = (session.prepareData as any) || {};

    // Prepare data for multi-agent analysis
    const uploadedData = {
      analysisGoal,
      businessQuestions: businessQuestions || prepareData.businessQuestions || '',
      clarificationAnswers: clarificationAnswers || prepareData.clarificationAnswers || {},
      audience: prepareData.audience || { primaryAudience: 'mixed' },
      journeyType: session.journeyType,
      templates: prepareData.selectedTemplates || []
    };

    const userGoals = [analysisGoal];
    if (businessQuestions) {
      userGoals.push(...businessQuestions.split('\n').filter((q: string) => q.trim()));
    }

    // Coordinate with Business, DE, and DS agents
    console.log(`🔄 Coordinating with Business Agent, Data Engineer, and Data Scientist...`);

    const coordination = await pmAgent.coordinateMultiAgentAnalysis(
      'temp_project_id', // Will be created after data upload
      uploadedData,
      userGoals,
      'general' // Industry - could be extracted from goals
    );

    // Generate natural language advice
    const advice = {
      summary: coordination.synthesis.overallAssessment,
      recommendedDatasets: extractDatasetRecommendations(coordination),
      dataRequirements: extractDataRequirements(coordination),
      qualityExpectations: extractQualityExpectations(coordination),
      naturalLanguageAdvice: generateNaturalLanguageAdvice(coordination, analysisGoal),
      technicalDetails: {
        dataEngineerOpinion: coordination.expertOpinions.find(o => o.agentId === 'data_engineer')?.opinion,
        dataScientistOpinion: coordination.expertOpinions.find(o => o.agentId === 'data_scientist')?.opinion,
        businessAgentOpinion: coordination.expertOpinions.find(o => o.agentId === 'business_agent')?.opinion
      }
    };

    res.json({
      success: true,
      advice,
      coordination: {
        coordinationId: coordination.coordinationId,
        timestamp: coordination.timestamp,
        expertConsensus: coordination.synthesis.expertConsensus
      }
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
function extractDatasetRecommendations(coordination: any): Array<{name: string; description: string; priority: string}> {
  const synthesis = coordination.synthesis;
  return [
    {
      name: 'Primary Transaction Data',
      description: 'Core business transactions including timestamps, amounts, and categorical information',
      priority: 'Required'
    },
    {
      name: 'Customer/User Data',
      description: 'Demographic and behavioral information to enable segmentation',
      priority: 'Required'
    },
    {
      name: 'Historical Metrics',
      description: 'Time-series data for trend analysis and forecasting',
      priority: 'Recommended'
    }
  ];
}

function extractDataRequirements(coordination: any): string[] {
  return [
    'Minimum 3 months of historical data for trend analysis',
    'Unique identifiers for joining datasets',
    'Timestamp fields for temporal analysis',
    'Clean categorical variables (no excessive nulls)',
    'Sufficient sample size (recommend 1000+ records)'
  ];
}

function extractQualityExpectations(coordination: any): string[] {
  return [
    'Missing values < 20% per column',
    'No duplicate records on key identifiers',
    'Consistent date formats',
    'Valid ranges for numerical fields',
    'No PII unless properly disclosed'
  ];
}

function generateNaturalLanguageAdvice(coordination: any, analysisGoal: string): string {
  const synthesis = coordination.synthesis;

  return `Based on your goal to "${analysisGoal.substring(0, 100)}...", here's what our expert team recommends:

**Data Strategy**: ${synthesis.keyFindings[0] || 'Focus on collecting comprehensive transactional data with clear timestamps and identifiers.'}

**What You'll Need**:
- Core business data showing the metrics you want to analyze
- Historical records going back at least 3-6 months
- Customer or entity identifiers to enable segmentation
- Any contextual data that might explain the patterns (e.g., marketing campaigns, seasonal events)

**Quality Expectations**:
Our data quality analysis will check for completeness, consistency, and accuracy. You'll be able to review and approve any issues before analysis begins.

**Next Steps**:
1. Gather your data files (CSV, Excel, or JSON formats work best)
2. Upload them in the next step
3. We'll automatically analyze schema, detect PII, and assess quality
4. You'll review and approve everything before we proceed

${synthesis.actionableRecommendations[0] || 'Our agents will guide you through each step of the preparation process.'}`;
}

/**
 * Update goal after clarification
 */
router.post('/update-goal-after-clarification', authenticateUser, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { sessionId, refinedGoal, answersToQuestions, confirmedUnderstanding } = req.body;

    if (!sessionId) {
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
