import { Router } from "express";
import { ensureAuthenticated } from "../../../routes/auth";
import { requireOwnership } from "../../../middleware/rbac";
import { storage } from "../../../services/storage";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
} from "../../../shared/utils/error-handling";

const router = Router();

router.post("/:id/restart", ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId && !isAdmin) {
      throw new ForbiddenError('Access denied');
    }

    const journeyProgress = (project as any)?.journeyProgress || {};
    await storage.atomicMergeJourneyProgress(projectId, {
      ...journeyProgress,
      restartCount: (journeyProgress.restartCount || 0) + 1,
      lastRestartedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: "Project restarted",
      restartCount: (journeyProgress.restartCount || 0) + 1,
    });
  } catch (error: any) {
    console.error("Restart project error:", error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || "Failed to restart project",
    });
  }
});

router.put("/:id/progress", ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    const { progress } = req.body;

    if (!progress || typeof progress !== 'object') {
      throw new ValidationError('Progress object is required');
    }

    const success = await storage.updateProject(projectId, { journeyProgress: progress } as any);

    if (success) {
      res.json({
        success: true,
        message: "Progress updated",
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Failed to update progress",
      });
    }
  } catch (error: any) {
    console.error("Update progress error:", error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || "Failed to update progress",
    });
  }
});

router.get("/:id/questions", ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const journeyProgress = (project as any)?.journeyProgress || {};
    const questions = journeyProgress.userQuestions || [];

    res.json({
      success: true,
      questions,
      count: questions.length,
    });
  } catch (error: any) {
    console.error("Get questions error:", error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || "Failed to get questions",
    });
  }
});

router.post("/:id/questions", ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const { text } = req.body;

    if (!text || !text.trim()) {
      throw new ValidationError('Question text is required');
    }

    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const journeyProgress = (project as any)?.journeyProgress || {};
    const existingQuestions = journeyProgress.userQuestions || [];
    const newQuestions = [...existingQuestions, { text: text.trim() }];

    await storage.atomicMergeJourneyProgress(projectId, {
      ...journeyProgress,
      userQuestions: newQuestions,
    });

    res.json({
      success: true,
      message: "Question added",
      questions: newQuestions,
    });
  } catch (error: any) {
    console.error("Create question error:", error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || "Failed to create question",
    });
  }
});

router.get("/:id/decision-trail", ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const journeyProgress = (project as any)?.journeyProgress || {};
    const decisionTrail: any[] = [];

    if (journeyProgress.requirementsDocument) {
      decisionTrail.push({
        type: "requirements_document",
        timestamp: journeyProgress.requirementsDocument.generatedAt,
        summary: {
          elementsCount: journeyProgress.requirementsDocument.requiredDataElements?.length || 0,
          analysisPathCount: journeyProgress.requirementsDocument.analysisPath?.length || 0,
        },
      });
    }

    if (journeyProgress.piiDecision) {
      decisionTrail.push({
        type: "pii_decision",
        timestamp: journeyProgress.piiDecision.appliedAt || journeyProgress.piiDecisionMadeAt,
        summary: {
          excludeAll: journeyProgress.piiDecision.excludeAllPII || false,
          excludedColumns: journeyProgress.piiDecision.excludedColumns?.length || 0,
        },
      });
    }

    if (journeyProgress.transformationPlan) {
      decisionTrail.push({
        type: "transformation_plan",
        timestamp: journeyProgress.transformationPlan.appliedAt,
        summary: {
          transformationsCount: journeyProgress.transformationPlan.transformations?.length || 0,
        },
      });
    }

    if (journeyProgress.restartCount) {
      decisionTrail.push({
        type: "restart",
        timestamp: journeyProgress.lastRestartedAt,
        summary: {
          restartCount: journeyProgress.restartCount,
        },
      });
    }

    res.json({
      success: true,
      decisionTrail,
      count: decisionTrail.length,
    });
  } catch (error: any) {
    console.error("Get decision trail error:", error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || "Failed to get decision trail",
    });
  }
});


export default router;
