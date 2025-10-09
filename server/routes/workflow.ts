import express from 'express';
import { db } from '../db';
import { decisionAudits, projects, analysisSubscriptions, generatedArtifacts } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

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
    const artifacts = await db
      .select()
      .from(generatedArtifacts)
      .where(eq(generatedArtifacts.projectId, projectId))
      .orderBy(desc(generatedArtifacts.createdAt));

    // Mock workflow steps (in a real implementation, this would come from actual workflow state)
    const steps = [
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
        artifacts: [],
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
        artifacts: [],
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
  artifacts: artifacts.filter((a: any) => a.type.includes('analysis')),
        dependencies: ['data_preparation']
      },
      {
        id: 'artifact_generation',
        title: 'Artifact Generation',
        description: 'Creating audience-specific reports and visualizations',
        status: artifacts.length > 0 ? 'completed' :
               project.workflowStep === 'analysis' ? 'in_progress' : 'pending',
        agent: 'business_agent',
        estimatedDuration: 30,
          decisions: decisions.filter((d: any) => d.decisionType === 'visualization_choice'),
        artifacts: artifacts,
        dependencies: ['analysis_execution']
      }
    ];

    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const totalSteps = steps.length;

    // Calculate estimated completion
    const inProgressStep = steps.find(s => s.status === 'in_progress');
    let estimatedCompletion = 'Calculating...';

    if (inProgressStep) {
      const remainingTime = inProgressStep.estimatedDuration - (inProgressStep.actualDuration || 0);
      const futureSteps = steps.slice(steps.indexOf(inProgressStep) + 1);
      const totalRemainingTime = remainingTime + futureSteps.reduce((sum, step) => sum + step.estimatedDuration, 0);
      const completionTime = new Date(Date.now() + totalRemainingTime * 60 * 1000);
      estimatedCompletion = completionTime.toLocaleTimeString();
    }

    res.json({
      steps,
      completedSteps,
      totalSteps,
      estimatedCompletion,
      currentPhase: project.workflowStep,
      artifacts: artifacts
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