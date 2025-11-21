import express from 'express';
import { db } from '../db';
import { decisionAudits, projects, analysisSubscriptions, generatedArtifacts } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';
import { journeyStateManager } from '../services/journey-state-manager';
import { projectAgentOrchestrator } from '../services/project-agent-orchestrator';

const router = express.Router();

interface WorkflowArtifact {
  id: string;
  title: string;
  type: string;
  format: string;
  status: string;
  downloadUrl?: string;
  filename?: string;
  sizeMB?: number;
  agent: string;
  audienceProfile?: unknown;
  stepId: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

router.use(ensureAuthenticated);

/**
 * Get workflow transparency data for a project
 */
router.get('/transparency/:projectId', async (req, res) => {
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

    // Get decision audit trail
    const decisions = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.projectId, projectId))
      .orderBy(desc(decisionAudits.timestamp));

    // Get generated artifacts
    const rawGeneratedArtifacts = await db
      .select()
      .from(generatedArtifacts)
      .where(eq(generatedArtifacts.projectId, projectId))
      .orderBy(desc(generatedArtifacts.createdAt));

    const parseJsonField = (value: any) => {
      if (!value) return undefined;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return undefined;
        }
      }
      return value;
    };

    const transformedArtifacts: WorkflowArtifact[] = rawGeneratedArtifacts.map((artifact: typeof generatedArtifacts.$inferSelect) => {
      const content = (parseJsonField(artifact.content) || {}) as Record<string, unknown>;
      const metadata = (parseJsonField(artifact.metadata) || {}) as Record<string, unknown>;

      const downloadUrl = typeof content.downloadUrl === 'string' ? content.downloadUrl : undefined;
      const filename = typeof content.filename === 'string' ? content.filename : undefined;
      const contentSize = typeof content.sizeMB === 'number' ? content.sizeMB : undefined;
      const metadataSize = typeof metadata.sizeMB === 'number' ? metadata.sizeMB : undefined;
      const agent = typeof metadata.generatedBy === 'string' ? metadata.generatedBy : 'system';
      const stepId = typeof metadata.stepId === 'string' && metadata.stepId.trim().length
        ? metadata.stepId
        : 'analysis_execution';

      return {
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
        format: artifact.format,
        status: artifact.status,
        downloadUrl,
        filename,
        sizeMB: contentSize ?? metadataSize,
        agent,
        audienceProfile: metadata.audienceProfile,
        stepId,
        createdAt: artifact.createdAt,
        metadata
      };
    });

    // Get actual journey state instead of mock data
    let steps: any[] = [];
    let completedSteps = 0;
    let totalSteps = 0;
    let estimatedCompletion = 'Calculating...';
    const artifactsByStep = transformedArtifacts.reduce<Record<string, WorkflowArtifact[]>>((acc, artifact) => {
      const stepId = artifact.stepId || 'analysis_execution';
      if (!acc[stepId]) {
        acc[stepId] = [];
      }
      acc[stepId].push(artifact);
      return acc;
    }, {} as Record<string, WorkflowArtifact[]>);
    
    try {
      const journeyState = await journeyStateManager.getJourneyState(projectId);
      if (journeyState && journeyState.steps) {
        totalSteps = journeyState.totalSteps;
        completedSteps = journeyState.completedSteps?.length || 0;
        
        // Map journey state steps to workflow transparency format
        steps = journeyState.steps.map((step: any) => {
          const isCompleted = journeyState.completedSteps?.includes(step.id) || false;
          const isCurrent = journeyState.currentStep?.id === step.id;
          
          // Get decisions for this step - check context field which contains stepId
          const stepDecisions = decisions.filter((d: any) => {
            try {
              const context = typeof d.context === 'string' ? JSON.parse(d.context) : d.context;
              return context?.stepId === step.id || d.decision?.includes?.(step.name) || d.reasoning?.includes?.(step.id);
            } catch {
              // If parsing fails, check decision/reasoning text
              return d.decision?.includes?.(step.name) || d.reasoning?.includes?.(step.id);
            }
          });
          
          // Get artifacts for this step
          const stepArtifacts = artifactsByStep[step.id] || [];
          
          return {
            id: step.id,
            title: step.name || step.id,
            description: step.description || `Journey step: ${step.name || step.id}`,
            status: isCompleted ? 'completed' : isCurrent ? 'in_progress' : 'pending',
            agent: step.agent || 'project_manager',
            estimatedDuration: step.estimatedDuration || 10, // in seconds
            decisions: stepDecisions,
            artifacts: stepArtifacts,
            dependencies: step.dependencies || []
          };
        });
        
        // Calculate estimated completion from journey state
        if (journeyState.estimatedTimeRemaining) {
          const now = new Date();
          const remainingSeconds = parseInt(journeyState.estimatedTimeRemaining.split(' ')[0]) || 0;
          const completionTime = new Date(now.getTime() + remainingSeconds * 1000);
          estimatedCompletion = completionTime.toLocaleTimeString();
        }
      }
    } catch (journeyError) {
      console.error('Failed to get journey state for workflow transparency:', journeyError);
      // Fall back to mock data if journey state fails
    }
    
    // Fallback to mock workflow steps if journey state unavailable
    if (steps.length === 0) {
      steps = [
      {
        id: 'goal_analysis',
        title: 'Goal Analysis',
        description: 'Analyzing and refining your analysis objectives',
        status: project.workflowStep === 'questions' ? 'completed' : 'pending',
        agent: 'project_manager_agent',
        startedAt: project.createdAt,
        completedAt: project.workflowStep !== 'questions' ? project.createdAt : undefined,
        estimatedDuration: 15,
        actualDuration: project.workflowStep !== 'questions' ? 12 : undefined,
          decisions: decisions.filter((d: any) => d.decisionType === 'analysis_approach'),
        artifacts: artifactsByStep['goal_analysis'] || [],
        dependencies: []
      },
      {
        id: 'data_preparation',
        title: 'Data Preparation',
        description: 'Processing and validating your data',
        status: ['upload', 'scan', 'schema'].includes(project.workflowStep) ? 'in_progress' :
               project.workflowStep === 'analysis' ? 'completed' : 'pending',
        agent: 'data_scientist_agent',
        startedAt: project.workflowStep !== 'questions' ? project.updatedAt : undefined,
        estimatedDuration: 25,
          decisions: decisions.filter((d: any) => d.decisionType === 'data_processing'),
        artifacts: artifactsByStep['data_preparation'] || [],
        dependencies: ['goal_analysis']
      },
      {
        id: 'analysis_execution',
        title: 'Analysis Execution',
        description: 'Running your analysis and generating insights',
        status: project.workflowStep === 'analysis' ? 'in_progress' :
               project.workflowStep === 'complete' ? 'completed' : 'pending',
        agent: 'data_scientist_agent',
        estimatedDuration: 45,
          decisions: decisions.filter((d: any) => d.decisionType === 'analysis_approach'),
        artifacts: artifactsByStep['analysis_execution'] || transformedArtifacts.filter(a => a.type.includes('analysis')),
        dependencies: ['data_preparation']
      },
      {
        id: 'artifact_generation',
        title: 'Artifact Generation',
        description: 'Creating audience-specific reports and visualizations',
        status: transformedArtifacts.length > 0 ? 'completed' :
               project.workflowStep === 'analysis' ? 'in_progress' : 'pending',
        agent: 'business_agent',
        estimatedDuration: 30,
          decisions: decisions.filter((d: any) => d.decisionType === 'visualization_choice'),
        artifacts: transformedArtifacts,
        dependencies: ['analysis_execution']
      }
      ];
    }

    // Use values calculated from journey state if available, otherwise calculate from steps
    if (completedSteps === 0 && totalSteps === 0) {
      completedSteps = steps.filter(s => s.status === 'completed').length;
      totalSteps = steps.length;

      // Calculate estimated completion from steps
      const inProgressStep = steps.find(s => s.status === 'in_progress');
      if (inProgressStep) {
        const remainingTime = inProgressStep.estimatedDuration - (inProgressStep.actualDuration || 0);
        const futureSteps = steps.slice(steps.indexOf(inProgressStep) + 1);
        const totalRemainingTime = remainingTime + futureSteps.reduce((sum, step) => sum + step.estimatedDuration, 0);
        const completionTime = new Date(Date.now() + totalRemainingTime * 1000); // Convert seconds to ms
        estimatedCompletion = completionTime.toLocaleTimeString();
      }
    }

    res.json({
      steps,
      completedSteps,
      totalSteps,
      estimatedCompletion,
      currentPhase: project.workflowStep,
      artifacts: transformedArtifacts
    });
  } catch (error) {
    console.error('Failed to get workflow transparency:', error);
      res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Get decision audit trail for a project
 */
router.get('/decisions/:projectId', async (req, res) => {
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

    const decisions = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.projectId, projectId))
      .orderBy(desc(decisionAudits.timestamp));

    res.json(decisions);
  } catch (error) {
    console.error('Failed to get decision audit:', error);
      res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Get agent activity feed for workflow transparency
 */
router.get('/activities/:projectId', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { projectId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const checkpoints = await projectAgentOrchestrator.getProjectCheckpoints(projectId);

    const activities = checkpoints.map((checkpoint: any) => {
      const rawData = checkpoint.data;
      let parsedData: any = rawData;
      if (typeof rawData === 'string') {
        try {
          parsedData = JSON.parse(rawData);
        } catch {
          parsedData = undefined;
        }
      }

      return {
        id: checkpoint.id,
        agent: checkpoint.agentType || 'project_manager',
        activity: checkpoint.stepName || checkpoint.message || 'Agent update',
        status: checkpoint.status || 'idle',
        currentTask: checkpoint.message || parsedData?.currentTask || 'Pending user review',
        progress: typeof parsedData?.progress === 'number' ? parsedData.progress : null,
        estimatedCompletion: parsedData?.estimatedCompletion || null,
        lastUpdate: checkpoint.timestamp || checkpoint.createdAt || new Date().toISOString(),
        metadata: parsedData || null
      };
    });

    activities.sort((a: any, b: any) => {
      const aTime = new Date(a.lastUpdate).getTime();
      const bTime = new Date(b.lastUpdate).getTime();
      return bTime - aTime;
    });

    res.json({ success: true, data: activities });
  } catch (error) {
    console.error('Failed to get agent activities:', error);
      res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

/**
 * Question a decision (for reversible decisions)
 */
router.post('/decisions/:decisionId/question', async (req, res) => {
  try {
    const { userId } = req.user || {};
    const { decisionId } = req.params;
    const { question, reasoning } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get the decision
    const [decision] = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.id, decisionId));

    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    // Verify user owns the project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, decision.projectId));

    if (!project || project.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!decision.reversible) {
      return res.status(400).json({ error: 'This decision cannot be questioned' });
    }

    // Create a new audit entry for the question
    await db.insert(decisionAudits).values({
      id: `decision_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      projectId: decision.projectId,
      agent: 'system',
      decisionType: 'decision_questioning',
      decision: `User questioned decision: ${decision.decision}`,
      reasoning: `User question: ${question}. Reasoning: ${reasoning || 'No additional reasoning provided'}`,
      alternatives: ['review_decision', 'maintain_decision'],
      confidence: 70,
      context: { originalDecisionId: decisionId, userQuestion: question },
      userInput: question,
      impact: 'medium',
      reversible: true,
      timestamp: new Date()
    });

    res.json({ success: true, message: 'Question recorded and will be reviewed' });
  } catch (error) {
    console.error('Failed to question decision:', error);
      res.status(500).json({ error: (error as any)?.message || 'Internal error' });
  }
});

export default router;