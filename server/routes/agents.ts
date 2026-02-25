import * as expressModule from 'express';
import type _express from 'express';
const express: typeof _express = (expressModule as any).default || expressModule;
import { db } from '../db';
import { projects, analysisSubscriptions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import { journeyStateManager } from '../services/journey-state-manager';

const router = express.Router();

router.use(ensureAuthenticated);

/**
 * Get current agent activities for a project
 */
router.get('/activities/:projectId', async (req, res) => {
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

    // Get journey state to determine real agent activities
    let journeyState = null;
    try {
      journeyState = await journeyStateManager.getJourneyState(projectId);
    } catch (error) {
      console.warn('Could not fetch journey state for agent activities:', error);
    }

    const activities = [];

    // Determine agent activities based on journey state if available
    if (journeyState && journeyState.currentStep) {
      const currentStep = journeyState.currentStep;
      const currentStepData = journeyState.steps[currentStep.index];
      
      // Get active agent from current step
      if (currentStepData) {
        const activeAgent = currentStepData.agent;
        const completedSteps = journeyState.completedSteps || [];
        const isCurrentStepCompleted = completedSteps.includes(currentStep.id);
        
        // Project Manager - active if coordinating workflow
        const pmActive = activeAgent === 'project_manager' && !isCurrentStepCompleted;
        activities.push({
          id: 'pm_agent',
          agent: 'project_manager',
          activity: pmActive ? 'Coordinating workflow' : 'Monitoring progress',
          status: pmActive ? 'active' : (journeyState.percentComplete >= 100 ? 'idle' : 'waiting'),
          currentTask: pmActive ? currentStepData.description || 'Managing workflow step' : 'Standby',
          progress: isCurrentStepCompleted ? 100 : Math.round((journeyState.percentComplete / journeyState.totalSteps) * 100),
          estimatedCompletion: journeyState.estimatedTimeRemaining 
            ? new Date(Date.now() + (parseInt(journeyState.estimatedTimeRemaining.split(' ')[0]) || 0) * 60000)
            : undefined,
          lastUpdate: new Date()
        });

        // Data Scientist / Technical AI Agent - active if on technical step
        const dsActive = (activeAgent === 'technical_ai_agent' || activeAgent === 'data_engineer') && !isCurrentStepCompleted;
        activities.push({
          id: 'ds_agent',
          agent: 'data_scientist',
          activity: dsActive ? currentStepData.description || 'Processing data' : 'Waiting for data',
          status: dsActive ? 'active' : (journeyState.percentComplete >= 100 ? 'idle' : 'waiting'),
          currentTask: dsActive ? currentStepData.name : 'Awaiting technical tasks',
          progress: isCurrentStepCompleted ? 100 : 0,
          estimatedCompletion: dsActive && currentStepData.estimatedDuration
            ? new Date(Date.now() + currentStepData.estimatedDuration * 60000)
            : undefined,
          lastUpdate: new Date()
        });

        // Business Agent - active if on business step
        const baActive = activeAgent === 'business_agent' && !isCurrentStepCompleted;
        activities.push({
          id: 'ba_agent',
          agent: 'business_agent',
          activity: baActive ? currentStepData.description || 'Generating insights' : 'Preparing business context',
          status: baActive ? 'active' : (journeyState.percentComplete >= 100 ? 'idle' : 'waiting'),
          currentTask: baActive ? currentStepData.name : 'Awaiting business tasks',
          progress: isCurrentStepCompleted ? 100 : 0,
          estimatedCompletion: baActive && currentStepData.estimatedDuration
            ? new Date(Date.now() + currentStepData.estimatedDuration * 60000)
            : undefined,
          lastUpdate: new Date()
        });
      }
    } else {
      // P1-3 FIX: Use journeyProgress for DYNAMIC context-aware agent activities
      const progress = (project as any).journeyProgress || {};
      const currentStep = progress.currentStep || 'upload';
      const completedSteps = progress.completedSteps || [];
      const hasRequirements = !!progress.requirementsDocument;
      const hasTransformations = !!progress.transformationPlan;
      const hasAnalysisResults = !!(project as any).analysisResults;

      // P1-3: Extract project-specific context for dynamic messages
      const projectName = (project as any).name || 'your project';
      const datasetCount = progress.datasetCount || 1;
      const elementCount = progress.requirementsDocument?.requiredDataElements?.length || 0;
      const questionCount = progress.businessQuestions?.length || 0;
      const analysisTypes = progress.analysisPath?.map((a: any) => a.analysisName || a.analysisType).filter(Boolean) || [];
      const audience = progress.audience?.primaryAudience || progress.audience?.primary || '';

      // Project Manager Agent - context-aware activity description
      const pmActivity = completedSteps.includes('plan')
        ? `Orchestrating ${analysisTypes.length || 'multiple'} analysis execution${datasetCount > 1 ? ` across ${datasetCount} datasets` : ''}`
        : completedSteps.includes('verification')
        ? `Coordinating transformation planning${elementCount > 0 ? ` for ${elementCount} data elements` : ''}`
        : completedSteps.includes('prepare')
        ? `Overseeing data verification${questionCount > 0 ? ` (${questionCount} questions to answer)` : ''}`
        : hasRequirements
        ? `Requirements locked${elementCount > 0 ? ` (${elementCount} elements)` : ''}, coordinating verification`
        : `Analyzing requirements for "${projectName}"`;

      activities.push({
        id: 'pm_agent',
        agent: 'project_manager',
        activity: pmActivity,
        status: hasAnalysisResults ? 'idle' : 'active',
        currentTask: `Step: ${currentStep}${completedSteps.length > 0 ? ` (${completedSteps.length} completed)` : ''}`,
        progress: Math.min(100, completedSteps.length * 15),
        estimatedCompletion: undefined,
        lastUpdate: progress.updatedAt ? new Date(progress.updatedAt) : new Date()
      });

      // Data Scientist Agent - context-aware
      const dsActivity = hasAnalysisResults
        ? `Analysis complete${analysisTypes.length > 0 ? ` (${analysisTypes.slice(0, 3).join(', ')})` : ''}`
        : completedSteps.includes('transformation')
        ? `Preparing ${analysisTypes.length > 0 ? analysisTypes.join(', ') : 'analysis'} execution plan`
        : hasTransformations
        ? `Transformation plan ready${elementCount > 0 ? ` for ${elementCount} elements` : ''}, awaiting execution`
        : completedSteps.includes('verification')
        ? `Generating transformation recommendations${datasetCount > 1 ? ` for ${datasetCount} datasets` : ''}`
        : hasRequirements
        ? `Defining ${elementCount || 'required'} data elements for analysis`
        : 'Waiting for analysis context';

      activities.push({
        id: 'ds_agent',
        agent: 'data_scientist',
        activity: dsActivity,
        status: hasAnalysisResults ? 'idle' : (completedSteps.includes('verification') ? 'active' : 'waiting'),
        currentTask: hasTransformations
          ? `${analysisTypes.length > 0 ? analysisTypes[0] : 'Transformation'} plan ready`
          : 'Awaiting data context',
        progress: hasAnalysisResults ? 100 : (hasTransformations ? 60 : (hasRequirements ? 30 : 0)),
        estimatedCompletion: undefined,
        lastUpdate: progress.updatedAt ? new Date(progress.updatedAt) : new Date()
      });

      // Business Agent - context-aware
      const baActivity = hasAnalysisResults
        ? `Translating results${audience ? ` for ${audience} audience` : ''}`
        : completedSteps.includes('plan')
        ? `Preparing ${audience || 'audience'}-specific insights framework`
        : hasRequirements
        ? `Business context defined${questionCount > 0 ? ` (${questionCount} questions mapped)` : ''}, awaiting analysis`
        : `Gathering industry context for "${projectName}"`;

      activities.push({
        id: 'ba_agent',
        agent: 'business_agent',
        activity: baActivity,
        status: hasAnalysisResults ? 'active' : (hasRequirements ? 'waiting' : 'active'),
        currentTask: hasAnalysisResults
          ? `Generating ${audience || 'business'} insights`
          : 'Building business context',
        progress: hasAnalysisResults ? 80 : (hasRequirements ? 40 : 10),
        estimatedCompletion: undefined,
        lastUpdate: progress.updatedAt ? new Date(progress.updatedAt) : new Date()
      });
    }

    res.json({ data: activities });
  } catch (error) {
    console.error('Failed to get agent activities:', error);
    const msg = (error as any)?.message || 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

/**
 * Get agent capabilities and status
 */
router.get('/status', async (req, res) => {
  try {
    const agentStatus = {
      project_manager_agent: {
        name: 'Project Manager',
        description: 'Orchestrates analysis workflows and user interaction',
        capabilities: [
          'Goal analysis and refinement',
          'Workflow coordination',
          'User communication',
          'Progress tracking'
        ],
        status: 'active',
        currentLoad: 0.3,
        averageResponseTime: '2.3s'
      },
      data_scientist_agent: {
        name: 'Data Scientist',
        description: 'Performs technical analysis and ML operations',
        capabilities: [
          'Statistical analysis',
          'Machine learning',
          'Data preprocessing',
          'Model validation'
        ],
        status: 'active',
        currentLoad: 0.7,
        averageResponseTime: '15.2s'
      },
      business_agent: {
        name: 'Business Analyst',
        description: 'Provides business context and generates insights',
        capabilities: [
          'Industry knowledge',
          'Business template matching',
          'Insight generation',
          'Report customization'
        ],
        status: 'active',
        currentLoad: 0.4,
        averageResponseTime: '5.8s'
      }
    };

    res.json(agentStatus);
  } catch (error) {
    console.error('Failed to get agent status:', error);
    const msg = (error as any)?.message || 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

/**
 * Request agent intervention or clarification
 */
router.post('/intervention', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { projectId, agent, requestType, message, context } = req.body;

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

    console.log(`📋 [Agent Intervention] ${agent} for project ${projectId}: ${requestType}`);
    console.log(`   Message: ${message}`);

    // Template response based on agent role and request type
    const response = generateMockAgentResponse(agent, requestType, message, context);

    res.json({
      success: true,
      response,
      estimatedResponseTime: response.estimatedTime
    });
  } catch (error) {
    console.error('Failed to request agent intervention:', error);
    const msg = (error as any)?.message || 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

// Helper functions
function getProjectManagerStatus(project: any) {
  switch (project.workflowStep) {
    case 'questions':
      return {
        activity: 'Analyzing project requirements',
        status: 'active',
        currentTask: 'Processing analysis goals and questions',
        progress: 60,
        remainingMinutes: 5
      };
    case 'upload':
    case 'scan':
    case 'schema':
      return {
        activity: 'Coordinating data preparation',
        status: 'active',
        currentTask: 'Overseeing data processing pipeline',
        progress: 40,
        remainingMinutes: 10
      };
    case 'analysis':
      return {
        activity: 'Monitoring analysis execution',
        status: 'active',
        currentTask: 'Tracking analysis progress and quality',
        progress: 80,
        remainingMinutes: 15
      };
    case 'complete':
      return {
        activity: 'Project completed',
        status: 'idle',
        currentTask: 'Monitoring for follow-up requests',
        progress: 100,
        remainingMinutes: 0
      };
    default:
      return {
        activity: 'Initializing project',
        status: 'active',
        currentTask: 'Setting up project workflow',
        progress: 10,
        remainingMinutes: 2
      };
  }
}

function getDataScientistStatus(project: any) {
  // Use journey-state-aware activity messages instead of hardcoded strings
  const jp = project?.journeyProgress || {};
  const currentStep = jp.currentStepId || '';
  const percentComplete = jp.percentComplete || 0;
  const analysisType = jp.analysisType || project?.analysisType || 'statistical';

  if (percentComplete >= 100) {
    return {
      activity: 'Analysis complete',
      status: 'idle',
      currentTask: `${analysisType} analysis results are available`,
      progress: 100,
      remainingMinutes: 0
    };
  }

  if (percentComplete === 0 || (!currentStep && !project.workflowStep)) {
    return {
      activity: 'Waiting for data',
      status: 'waiting_for_user',
      currentTask: 'Ready to begin analysis once data is uploaded',
      progress: 0,
      remainingMinutes: 0
    };
  }

  // Map current journey step OR legacy workflowStep to contextual activity
  const stepKey = currentStep || project.workflowStep || '';
  const stepActivities: Record<string, { activity: string; task: string; progress: number; minutes: number }> = {
    'data_upload': { activity: 'Processing uploaded data', task: 'Validating data format and quality', progress: 20, minutes: 8 },
    'upload': { activity: 'Processing uploaded data', task: 'Validating data format and quality', progress: 20, minutes: 8 },
    'data_verification': { activity: 'Verifying data integrity', task: 'Running quality checks and PII detection', progress: 35, minutes: 10 },
    'scan': { activity: 'Verifying data integrity', task: 'Running quality checks and PII detection', progress: 35, minutes: 10 },
    'data_transformation': { activity: 'Transforming data', task: 'Applying data transformations and column mappings', progress: 50, minutes: 12 },
    'schema': { activity: 'Preparing analysis pipeline', task: `Setting up ${analysisType} analysis workflow`, progress: 60, minutes: 15 },
    'analysis_planning': { activity: 'Planning analysis', task: `Designing ${analysisType} analysis pipeline`, progress: 70, minutes: 18 },
    'questions': { activity: 'Gathering requirements', task: 'Waiting for user questions and analysis goals', progress: 10, minutes: 5 },
    'execution': { activity: 'Executing analysis', task: `Running ${analysisType} analysis on your data`, progress: 85, minutes: 25 },
    'analysis': { activity: 'Executing analysis', task: `Running ${analysisType} analysis on your data`, progress: 85, minutes: 25 },
    'results_translation': { activity: 'Translating results', task: 'Generating business-ready insights', progress: 95, minutes: 5 }
  };

  const stepInfo = stepActivities[stepKey];
  if (stepInfo) {
    return {
      activity: stepInfo.activity,
      status: 'active',
      currentTask: stepInfo.task,
      progress: percentComplete > 0 ? percentComplete : stepInfo.progress,
      remainingMinutes: stepInfo.minutes
    };
  }

  // Fallback for unknown steps — derive from percentComplete
  const estimatedMinutes = Math.max(0, Math.round((100 - percentComplete) * 0.3));
  return {
    activity: percentComplete > 0 ? `Processing (${percentComplete}% complete)` : 'Initializing',
    status: percentComplete > 0 ? 'active' : 'idle',
    currentTask: stepKey ? `Working on ${stepKey.replace(/_/g, ' ')}` : 'Preparing analysis capabilities',
    progress: percentComplete || 0,
    remainingMinutes: estimatedMinutes
  };
}

function getBusinessAgentStatus(project: any) {
  switch (project.workflowStep) {
    case 'questions':
      return {
        activity: 'Analyzing business context',
        status: 'active',
        currentTask: 'Matching requirements to industry templates',
        progress: 45,
        remainingMinutes: 7
      };
    case 'upload':
    case 'scan':
    case 'schema':
      return {
        activity: 'Preparing business insights',
        status: 'active',
        currentTask: 'Identifying key business metrics and KPIs',
        progress: 60,
        remainingMinutes: 10
      };
    case 'analysis':
      return {
        activity: 'Generating business insights',
        status: 'active',
        currentTask: 'Creating audience-specific reports',
        progress: 75,
        remainingMinutes: 20
      };
    case 'complete':
      return {
        activity: 'Insights delivered',
        status: 'idle',
        currentTask: 'Available for insight refinement',
        progress: 100,
        remainingMinutes: 0
      };
    default:
      return {
        activity: 'Initializing business context',
        status: 'active',
        currentTask: 'Loading industry knowledge base',
        progress: 20,
        remainingMinutes: 3
      };
  }
}

function generateMockAgentResponse(agent: string, requestType: string, message: string, context: any) {
  const responses = {
    project_manager: {
      explanation: {
        message: "I orchestrate the entire analysis workflow by coordinating between the Data Scientist and Business Analyst agents. Based on your goals, I determine the optimal sequence of steps and ensure quality at each stage.",
        estimatedTime: "2-3 minutes"
      },
      clarification: {
        message: "I'd be happy to clarify the analysis approach. Could you be more specific about which aspect you'd like me to explain - the workflow steps, timing, or decision criteria?",
        estimatedTime: "1-2 minutes"
      },
      modification: {
        message: "I can adjust the analysis approach based on your feedback. What specific changes would you like to make to the current workflow or goals?",
        estimatedTime: "3-5 minutes"
      }
    },
    data_scientist: {
      explanation: {
        message: "I handle the technical analysis including data preprocessing, statistical analysis, and machine learning. The current approach was selected based on your data characteristics and analysis objectives.",
        estimatedTime: "5-8 minutes"
      },
      clarification: {
        message: "I can provide more technical details about the analysis methods being used. Which aspect would you like me to explain - the statistical approach, algorithms, or validation methods?",
        estimatedTime: "3-5 minutes"
      },
      modification: {
        message: "I can adjust the technical analysis parameters. Please specify which aspects you'd like to modify - the statistical methods, model complexity, or validation criteria.",
        estimatedTime: "8-12 minutes"
      }
    },
    business_agent: {
      explanation: {
        message: "I focus on translating technical results into business insights and creating reports tailored to your audience. I match your requirements with industry best practices and templates.",
        estimatedTime: "3-5 minutes"
      },
      clarification: {
        message: "I can explain how the business insights were generated and how they relate to your industry context. What specific business aspect would you like me to clarify?",
        estimatedTime: "2-4 minutes"
      },
      modification: {
        message: "I can adjust the business focus and reporting style. Please let me know what changes you'd like - different audience focus, industry context, or insight presentation.",
        estimatedTime: "5-8 minutes"
      }
    }
  };

  const agentResponses = responses[agent as keyof typeof responses];
  const response = agentResponses?.[requestType as keyof typeof agentResponses];

  return response || {
    message: "I'll process your request and get back to you shortly with a detailed response.",
    estimatedTime: "5-10 minutes"
  };
}

export default router;