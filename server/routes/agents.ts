import express from 'express';
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
      // Fallback to project-based status if no journey state
      // Project Manager Agent
      const projectManagerStatus = getProjectManagerStatus(project);
      activities.push({
        id: 'pm_agent',
        agent: 'project_manager',
        activity: projectManagerStatus.activity,
        status: projectManagerStatus.status,
        currentTask: projectManagerStatus.currentTask,
        progress: projectManagerStatus.progress,
        estimatedCompletion: new Date(Date.now() + projectManagerStatus.remainingMinutes * 60 * 1000),
        lastUpdate: new Date()
      });

      // Data Scientist Agent
      const dataScientistStatus = getDataScientistStatus(project);
      activities.push({
        id: 'ds_agent',
        agent: 'data_scientist',
        activity: dataScientistStatus.activity,
        status: dataScientistStatus.status,
        currentTask: dataScientistStatus.currentTask,
        progress: dataScientistStatus.progress,
        estimatedCompletion: new Date(Date.now() + dataScientistStatus.remainingMinutes * 60 * 1000),
        lastUpdate: new Date()
      });

      // Business Agent
      const businessAgentStatus = getBusinessAgentStatus(project);
      activities.push({
        id: 'ba_agent',
        agent: 'business_agent',
        activity: businessAgentStatus.activity,
        status: businessAgentStatus.status,
        currentTask: businessAgentStatus.currentTask,
        progress: businessAgentStatus.progress,
        estimatedCompletion: new Date(Date.now() + businessAgentStatus.remainingMinutes * 60 * 1000),
        lastUpdate: new Date()
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

    // Log the intervention request (in a real system, this would trigger actual agent processing)
    console.log(`Agent intervention requested: ${agent} for project ${projectId}`);
    console.log(`Request type: ${requestType}`);
    console.log(`Message: ${message}`);

    // Mock response based on agent and request type
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
  switch (project.workflowStep) {
    case 'questions':
      return {
        activity: 'Waiting for data upload',
        status: 'waiting_for_user',
        currentTask: 'Ready to process data once uploaded',
        progress: 0,
        remainingMinutes: 0
      };
    case 'upload':
      return {
        activity: 'Validating uploaded data',
        status: 'active',
        currentTask: 'Performing data quality checks',
        progress: 30,
        remainingMinutes: 8
      };
    case 'scan':
      return {
        activity: 'Security scanning complete',
        status: 'active',
        currentTask: 'Analyzing data schema and structure',
        progress: 50,
        remainingMinutes: 12
      };
    case 'schema':
      return {
        activity: 'Preparing analysis pipeline',
        status: 'active',
        currentTask: 'Setting up statistical analysis workflow',
        progress: 70,
        remainingMinutes: 18
      };
    case 'analysis':
      return {
        activity: 'Executing analysis',
        status: 'active',
        currentTask: 'Running machine learning algorithms',
        progress: 85,
        remainingMinutes: 25
      };
    case 'complete':
      return {
        activity: 'Analysis complete',
        status: 'idle',
        currentTask: 'Available for additional analysis requests',
        progress: 100,
        remainingMinutes: 0
      };
    default:
      return {
        activity: 'Initializing',
        status: 'idle',
        currentTask: 'Preparing analysis capabilities',
        progress: 0,
        remainingMinutes: 1
      };
  }
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