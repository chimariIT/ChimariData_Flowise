# Detailed Architecture Design & Implementation Plan

**Date**: December 10, 2025
**Version**: 1.0
**Status**: Implementation in Progress (BA Agent Integration Verified Dec 13, 2025)

---

## Table of Contents

1. [Target Architecture Overview](#1-target-architecture-overview)
2. [Component 1: Question-to-Answer Pipeline](#2-component-1-question-to-answer-pipeline)
3. [Component 2: Agent Checkpoint System](#3-component-2-agent-checkpoint-system)
4. [Component 3: Journey State Management](#4-component-3-journey-state-management)
5. [Component 4: Data Storage Consolidation](#5-component-4-data-storage-consolidation)
6. [Database Schema Changes](#6-database-schema-changes)
7. [API Contract Changes](#7-api-contract-changes)
8. [Migration Strategy](#8-migration-strategy)
9. [Testing Plan](#9-testing-plan)
10. [Implementation Schedule](#10-implementation-schedule)

---

## 1. Target Architecture Overview

### 1.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ PrepareStep │  │TransformStep│  │ ExecuteStep │  │ ResultsStep │        │
│  │             │  │             │  │             │  │             │        │
│  │ Questions   │──│ Transform   │──│ Analysis    │──│ Answers     │        │
│  │ Goals       │  │ Mapping     │  │ Execution   │  │ Artifacts   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                    │                                         │
│                          useProjectContext() Hook                            │
│                          (Single source of client state)                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ REST API + WebSocket
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Express)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Project Context Service                           │   │
│  │  (Single source of truth for project state)                          │   │
│  │                                                                       │   │
│  │  getProjectContext(projectId) → ProjectContext                       │   │
│  │  updateQuestions(projectId, questions[]) → void                      │   │
│  │  getJourneyState(projectId) → JourneyState                          │   │
│  │  advanceJourney(projectId, stepId) → JourneyState                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│         ┌───────────────────────────┼───────────────────────────┐           │
│         ▼                           ▼                           ▼           │
│  ┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐     │
│  │ Question Service│  │ Checkpoint Service  │  │ Analysis Service    │     │
│  │                 │  │                     │  │                     │     │
│  │ - Create w/ ID  │  │ - DB-first storage  │  │ - Context-aware     │     │
│  │ - Track through │  │ - Atomic approvals  │  │ - Evidence chain    │     │
│  │   pipeline      │  │ - No memory state   │  │ - Answer generation │     │
│  └────────┬────────┘  └──────────┬──────────┘  └──────────┬──────────┘     │
│           │                      │                        │                 │
│           └──────────────────────┴────────────────────────┘                 │
│                                  │                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE (PostgreSQL)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  projects                    project_questions         datasets              │
│  ├─ id                       ├─ id                     ├─ id                 │
│  ├─ name                     ├─ project_id (FK)        ├─ project_id (FK)    │
│  ├─ user_id                  ├─ text                   ├─ original_data      │
│  ├─ journey_state (JSONB)    ├─ requirements (JSONB)   ├─ transformed_data   │
│  └─ created_at               ├─ answer (JSONB)         ├─ active_version     │
│                              └─ evidence_chain         └─ schema             │
│                                                                              │
│  checkpoints                 agent_results             analysis_results      │
│  ├─ id                       ├─ id                     ├─ id                 │
│  ├─ project_id (FK)          ├─ project_id (FK)        ├─ project_id (FK)    │
│  ├─ agent_type               ├─ agent_type             ├─ question_id (FK)   │
│  ├─ status                   ├─ input (JSONB)          ├─ insight (JSONB)    │
│  ├─ user_feedback            ├─ output (JSONB)         ├─ evidence (JSONB)   │
│  └─ resolved_at              └─ created_at             └─ created_at         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Single Source of Truth** | Each entity has ONE authoritative location |
| **Database-First State** | All state persisted before acknowledging |
| **Explicit Relationships** | Foreign keys, not implicit JSON references |
| **Traceable Pipeline** | Every output traces back to inputs via IDs |
| **Stateless Services** | No in-memory state that can be lost |

---

## 2. Component 1: Question-to-Answer Pipeline

### 2.1 Current vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Question ID | None (strings only) | Stable ID: `q_{projectId}_{index}` |
| Storage | 3 locations (session, project, localStorage) | 1 location: `project_questions` table |
| Tracking | Lost between steps | ID flows through entire pipeline |
| Evidence | None | Full chain: question → requirement → transform → insight → answer |

#### Dec 14, 2025 Review Notes

- The **data upload + verification path still fails to produce a normalized dataset**: `data-step.tsx` and `data-verification-step.tsx` never compose a merged preview, so downstream services cannot trust the schema they receive.
- **PII decisions remain UI-only**: excluded columns are not stripped server-side, meaning the single-source-of-truth requirement described here is still unmet for sensitive attributes.
- **Transformation orchestration is blocked** because the React client posts to `/api/projects/:id/execute-transformations` (absent in `server/routes`); without this step, the evidence chain (question → transform → answer) cannot be persisted.

### 2.2 Data Models

```typescript
// shared/types/question-context.ts

/**
 * Core question entity - single source of truth
 */
export interface ProjectQuestion {
  id: string;                           // Format: q_{projectId}_{index}
  projectId: string;
  text: string;
  createdAt: Date;

  // Phase 1: Requirements (populated in prepare step)
  requirements?: {
    dataElements: DataElementRequirement[];
    recommendedAnalyses: string[];
    complexity: 'low' | 'medium' | 'high';
    generatedAt: Date;
  };

  // Phase 2: Transformation (populated in transform step)
  transformation?: {
    mappings: TransformationMapping[];
    columnsUsed: string[];
    appliedAt: Date;
  };

  // Phase 3: Analysis (populated in execute step)
  analysis?: {
    insightIds: string[];               // References to analysis_results.id
    techniquesUsed: string[];
    executedAt: Date;
  };

  // Phase 4: Answer (populated after analysis)
  answer?: {
    text: string;
    confidence: number;                 // 0-100
    status: 'answered' | 'partial' | 'unanswerable';
    evidenceChain: EvidenceLink[];
    generatedAt: Date;
  };
}

export interface DataElementRequirement {
  name: string;
  type: 'numeric' | 'categorical' | 'temporal' | 'text';
  importance: 'required' | 'recommended' | 'optional';
  purpose: string;                      // Why this element helps answer the question
}

export interface TransformationMapping {
  sourceColumn: string;
  targetElement: string;
  transformation: string;               // e.g., "normalize", "categorize", "extract_date"
  confidence: number;
}

export interface EvidenceLink {
  type: 'data_element' | 'transformation' | 'insight';
  id: string;
  description: string;
}
```

### 2.3 Service Implementation

```typescript
// server/services/question-context-service.ts

import { db } from '../db';
import { projectQuestions } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export class QuestionContextService {

  /**
   * Create questions for a project with stable IDs
   * Called from prepare-step when user enters questions
   */
  async createQuestions(
    projectId: string,
    questionTexts: string[]
  ): Promise<ProjectQuestion[]> {

    // Delete existing questions for this project (fresh start)
    await db.delete(projectQuestions)
      .where(eq(projectQuestions.projectId, projectId));

    const questions: ProjectQuestion[] = [];

    for (let i = 0; i < questionTexts.length; i++) {
      const text = questionTexts[i].trim();
      if (!text) continue;

      const question: ProjectQuestion = {
        id: `q_${projectId}_${i + 1}`,
        projectId,
        text,
        createdAt: new Date()
      };

      await db.insert(projectQuestions).values({
        id: question.id,
        projectId: question.projectId,
        text: question.text,
        createdAt: question.createdAt,
        requirements: null,
        transformation: null,
        analysis: null,
        answer: null
      });

      questions.push(question);
    }

    console.log(`✅ Created ${questions.length} questions for project ${projectId}`);
    return questions;
  }

  /**
   * Get all questions for a project
   */
  async getQuestions(projectId: string): Promise<ProjectQuestion[]> {
    const rows = await db.select()
      .from(projectQuestions)
      .where(eq(projectQuestions.projectId, projectId))
      .orderBy(projectQuestions.createdAt);

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      text: row.text,
      createdAt: row.createdAt,
      requirements: row.requirements as any,
      transformation: row.transformation as any,
      analysis: row.analysis as any,
      answer: row.answer as any
    }));
  }

  /**
   * Update question with requirements (Phase 1)
   * Called after requirements generation in prepare step
   */
  async updateRequirements(
    questionId: string,
    requirements: ProjectQuestion['requirements']
  ): Promise<void> {
    await db.update(projectQuestions)
      .set({
        requirements: requirements as any,
        updatedAt: new Date()
      })
      .where(eq(projectQuestions.id, questionId));

    console.log(`✅ Updated requirements for question ${questionId}`);
  }

  /**
   * Update question with transformation mappings (Phase 2)
   * Called after transformation step
   */
  async updateTransformation(
    questionId: string,
    transformation: ProjectQuestion['transformation']
  ): Promise<void> {
    await db.update(projectQuestions)
      .set({
        transformation: transformation as any,
        updatedAt: new Date()
      })
      .where(eq(projectQuestions.id, questionId));

    console.log(`✅ Updated transformation for question ${questionId}`);
  }

  /**
   * Update question with analysis results (Phase 3)
   * Called after analysis execution
   */
  async updateAnalysis(
    questionId: string,
    analysis: ProjectQuestion['analysis']
  ): Promise<void> {
    await db.update(projectQuestions)
      .set({
        analysis: analysis as any,
        updatedAt: new Date()
      })
      .where(eq(projectQuestions.id, questionId));

    console.log(`✅ Updated analysis for question ${questionId}`);
  }

  /**
   * Update question with final answer (Phase 4)
   * Called after answer generation
   */
  async updateAnswer(
    questionId: string,
    answer: ProjectQuestion['answer']
  ): Promise<void> {
    await db.update(projectQuestions)
      .set({
        answer: answer as any,
        updatedAt: new Date()
      })
      .where(eq(projectQuestions.id, questionId));

    console.log(`✅ Updated answer for question ${questionId}`);
  }

  /**
   * Build complete evidence chain for a question
   */
  async buildEvidenceChain(questionId: string): Promise<EvidenceLink[]> {
    const [question] = await db.select()
      .from(projectQuestions)
      .where(eq(projectQuestions.id, questionId));

    if (!question) return [];

    const chain: EvidenceLink[] = [];

    // Add data element evidence
    const requirements = question.requirements as any;
    if (requirements?.dataElements) {
      for (const element of requirements.dataElements) {
        chain.push({
          type: 'data_element',
          id: element.name,
          description: `Required ${element.type} field: ${element.purpose}`
        });
      }
    }

    // Add transformation evidence
    const transformation = question.transformation as any;
    if (transformation?.mappings) {
      for (const mapping of transformation.mappings) {
        chain.push({
          type: 'transformation',
          id: `${mapping.sourceColumn}_to_${mapping.targetElement}`,
          description: `Mapped ${mapping.sourceColumn} → ${mapping.targetElement} (${mapping.transformation})`
        });
      }
    }

    // Add insight evidence
    const analysis = question.analysis as any;
    if (analysis?.insightIds) {
      for (const insightId of analysis.insightIds) {
        chain.push({
          type: 'insight',
          id: insightId,
          description: `Analysis insight ${insightId}`
        });
      }
    }

    return chain;
  }
}

export const questionContextService = new QuestionContextService();
```

### 2.4 API Routes

```typescript
// server/routes/question-context.ts

import { Router } from 'express';
import { questionContextService } from '../services/question-context-service';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';

const router = Router();

/**
 * POST /api/projects/:projectId/questions
 * Create questions for a project
 */
router.post('/:projectId/questions', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const { questions } = req.body;

    const access = await canAccessProject(userId, projectId, false);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason });
    }

    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'questions must be an array' });
    }

    const created = await questionContextService.createQuestions(projectId, questions);

    res.json({
      success: true,
      questions: created,
      count: created.length
    });
  } catch (error: any) {
    console.error('Failed to create questions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projects/:projectId/questions
 * Get all questions for a project with full context
 */
router.get('/:projectId/questions', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    const access = await canAccessProject(userId, projectId, false);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason });
    }

    const questions = await questionContextService.getQuestions(projectId);

    res.json({
      success: true,
      questions,
      count: questions.length
    });
  } catch (error: any) {
    console.error('Failed to get questions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projects/:projectId/questions/:questionId/evidence
 * Get evidence chain for a specific question
 */
router.get('/:projectId/questions/:questionId/evidence', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, questionId } = req.params;
    const userId = (req.user as any)?.id;

    const access = await canAccessProject(userId, projectId, false);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason });
    }

    const evidence = await questionContextService.buildEvidenceChain(questionId);

    res.json({
      success: true,
      questionId,
      evidence
    });
  } catch (error: any) {
    console.error('Failed to get evidence:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### 2.5 Frontend Integration

```typescript
// client/src/hooks/useQuestionContext.ts

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';

export interface QuestionContext {
  id: string;
  text: string;
  requirements?: any;
  transformation?: any;
  analysis?: any;
  answer?: any;
}

export function useQuestionContext(projectId: string | null) {
  const [questions, setQuestions] = useState<QuestionContext[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load questions
  const loadQuestions = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/api/projects/${projectId}/questions`);
      setQuestions(response.questions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Create questions
  const createQuestions = useCallback(async (questionTexts: string[]) => {
    if (!projectId) return [];

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post(`/api/projects/${projectId}/questions`, {
        questions: questionTexts
      });

      const created = response.questions || [];
      setQuestions(created);
      return created;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Load on mount
  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  return {
    questions,
    loading,
    error,
    createQuestions,
    refreshQuestions: loadQuestions
  };
}
```

---

## 3. Component 2: Agent Checkpoint System

### 3.1 Current vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Storage | Dual (memory + DB) | DB-only |
| Consistency | Can diverge | Always consistent |
| On restart | Memory state lost | Full recovery from DB |
| Approvals | Race conditions | Atomic transactions |

### 3.2 Data Models

```typescript
// shared/types/checkpoint.ts

export interface Checkpoint {
  id: string;
  projectId: string;
  agentType: 'project_manager' | 'data_engineer' | 'data_scientist' | 'business';
  stepId: string;                       // Links to journey step

  // Status
  status: 'pending' | 'waiting_approval' | 'approved' | 'rejected' | 'completed';
  requiresUserInput: boolean;

  // Content
  title: string;
  message: string;
  data?: Record<string, any>;           // Agent-specific data

  // User interaction
  userFeedback?: string;
  resolvedAt?: Date;
  resolvedBy?: string;                  // User ID who resolved

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckpointApproval {
  checkpointId: string;
  approved: boolean;
  feedback: string;
  userId: string;
}
```

### 3.3 Service Implementation

```typescript
// server/services/checkpoint-service.ts

import { db } from '../db';
import { checkpoints } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { SocketManager } from '../socket-manager';

export class CheckpointService {

  /**
   * Create a checkpoint - ALWAYS goes to DB first
   */
  async createCheckpoint(checkpoint: Omit<Checkpoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<Checkpoint> {
    const id = `cp_${nanoid(10)}`;
    const now = new Date();

    const record = {
      id,
      ...checkpoint,
      createdAt: now,
      updatedAt: now
    };

    // DB-first: Insert before anything else
    await db.insert(checkpoints).values(record as any);

    console.log(`✅ Created checkpoint ${id} for project ${checkpoint.projectId}`);

    // Notify frontend via WebSocket (after DB commit)
    this.notifyCheckpointCreated(checkpoint.projectId, record as Checkpoint);

    return record as Checkpoint;
  }

  /**
   * Get all checkpoints for a project
   */
  async getProjectCheckpoints(projectId: string): Promise<Checkpoint[]> {
    const rows = await db.select()
      .from(checkpoints)
      .where(eq(checkpoints.projectId, projectId))
      .orderBy(desc(checkpoints.createdAt));

    return rows as Checkpoint[];
  }

  /**
   * Get pending checkpoints that require user action
   */
  async getPendingCheckpoints(projectId: string): Promise<Checkpoint[]> {
    const rows = await db.select()
      .from(checkpoints)
      .where(and(
        eq(checkpoints.projectId, projectId),
        eq(checkpoints.status, 'waiting_approval'),
        eq(checkpoints.requiresUserInput, true)
      ))
      .orderBy(checkpoints.createdAt);

    return rows as Checkpoint[];
  }

  /**
   * Approve a checkpoint - atomic operation
   */
  async approveCheckpoint(approval: CheckpointApproval): Promise<Checkpoint> {
    const { checkpointId, feedback, userId } = approval;
    const now = new Date();

    // Atomic update
    const [updated] = await db.update(checkpoints)
      .set({
        status: 'approved',
        userFeedback: feedback,
        resolvedAt: now,
        resolvedBy: userId,
        updatedAt: now
      })
      .where(eq(checkpoints.id, checkpointId))
      .returning();

    if (!updated) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    console.log(`✅ Approved checkpoint ${checkpointId}`);

    // Notify frontend
    this.notifyCheckpointUpdated(updated.projectId, updated as Checkpoint);

    return updated as Checkpoint;
  }

  /**
   * Reject a checkpoint - creates revision checkpoint in same transaction
   */
  async rejectCheckpoint(
    approval: CheckpointApproval,
    revisionMessage: string
  ): Promise<{ rejected: Checkpoint; revision: Checkpoint }> {
    const { checkpointId, feedback, userId } = approval;
    const now = new Date();

    // Get original checkpoint
    const [original] = await db.select()
      .from(checkpoints)
      .where(eq(checkpoints.id, checkpointId));

    if (!original) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    // Count existing revisions to prevent infinite loop
    const existingRevisions = await db.select()
      .from(checkpoints)
      .where(and(
        eq(checkpoints.projectId, original.projectId),
        eq(checkpoints.stepId, original.stepId)
      ));

    if (existingRevisions.length >= 5) {
      throw new Error('Maximum revision attempts reached. Please contact support.');
    }

    // Transaction: reject original + create revision
    const [rejected] = await db.update(checkpoints)
      .set({
        status: 'rejected',
        userFeedback: feedback,
        resolvedAt: now,
        resolvedBy: userId,
        updatedAt: now
      })
      .where(eq(checkpoints.id, checkpointId))
      .returning();

    const revision = await this.createCheckpoint({
      projectId: original.projectId,
      agentType: original.agentType as any,
      stepId: original.stepId,
      status: 'waiting_approval',
      requiresUserInput: true,
      title: `Revised: ${original.title}`,
      message: revisionMessage,
      data: {
        previousCheckpointId: checkpointId,
        revisionNumber: existingRevisions.length,
        userFeedback: feedback
      }
    });

    console.log(`✅ Rejected checkpoint ${checkpointId}, created revision ${revision.id}`);

    return {
      rejected: rejected as Checkpoint,
      revision
    };
  }

  /**
   * Clear all checkpoints for a project (used on journey restart)
   */
  async clearProjectCheckpoints(projectId: string): Promise<number> {
    const result = await db.delete(checkpoints)
      .where(eq(checkpoints.projectId, projectId));

    console.log(`🗑️ Cleared checkpoints for project ${projectId}`);

    return result.rowCount || 0;
  }

  /**
   * Check if project has pending approvals blocking progress
   */
  async hasBlockingCheckpoints(projectId: string): Promise<boolean> {
    const pending = await this.getPendingCheckpoints(projectId);
    return pending.length > 0;
  }

  // WebSocket notifications
  private notifyCheckpointCreated(projectId: string, checkpoint: Checkpoint): void {
    SocketManager.getInstance().emitToProject(projectId, 'checkpoint_created', {
      checkpoint
    });
  }

  private notifyCheckpointUpdated(projectId: string, checkpoint: Checkpoint): void {
    SocketManager.getInstance().emitToProject(projectId, 'checkpoint_updated', {
      checkpoint
    });
  }
}

export const checkpointService = new CheckpointService();
```

---

## 4. Component 3: Journey State Management

### 4.1 Current vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Locations | 5 different representations | 1 unified model |
| Step model | Template-based + phase-based + lifecycle | Single phase-based model |
| Blocking | Manual checks scattered | Centralized blocking logic |

### 4.2 Data Models

```typescript
// shared/types/journey-state.ts

export type JourneyPhase =
  | 'setup'           // Project creation
  | 'prepare'         // Goals & questions
  | 'data_upload'     // File upload
  | 'data_verify'     // Data verification
  | 'transform'       // Data transformation
  | 'analyze'         // Analysis execution
  | 'results'         // View results
  | 'complete';       // Journey finished

export type JourneyStatus = 'active' | 'paused' | 'blocked' | 'completed' | 'cancelled';

export interface JourneyState {
  projectId: string;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';

  // Current position
  currentPhase: JourneyPhase;
  status: JourneyStatus;

  // Progress tracking
  completedPhases: JourneyPhase[];
  phaseCompletedAt: Partial<Record<JourneyPhase, Date>>;

  // Blocking state
  blockedBy?: {
    type: 'approval' | 'error' | 'validation';
    checkpointId?: string;
    message: string;
  };

  // Timestamps
  startedAt: Date;
  lastActivityAt: Date;
  completedAt?: Date;

  // Computed
  percentComplete: number;              // Calculated from completedPhases
  estimatedTimeRemaining?: string;      // Calculated from remaining phases
}

// Phase order for navigation
export const JOURNEY_PHASE_ORDER: JourneyPhase[] = [
  'setup',
  'prepare',
  'data_upload',
  'data_verify',
  'transform',
  'analyze',
  'results',
  'complete'
];

// Phase display names
export const JOURNEY_PHASE_NAMES: Record<JourneyPhase, string> = {
  setup: 'Project Setup',
  prepare: 'Define Goals',
  data_upload: 'Upload Data',
  data_verify: 'Verify Data',
  transform: 'Transform Data',
  analyze: 'Run Analysis',
  results: 'View Results',
  complete: 'Complete'
};
```

### 4.3 Service Implementation

```typescript
// server/services/journey-state-service.ts

import { db } from '../db';
import { projects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { checkpointService } from './checkpoint-service';
import {
  JourneyState,
  JourneyPhase,
  JourneyStatus,
  JOURNEY_PHASE_ORDER
} from '@shared/types/journey-state';

export class JourneyStateService {

  /**
   * Initialize journey state for a new project
   */
  async initializeJourney(
    projectId: string,
    journeyType: JourneyState['journeyType']
  ): Promise<JourneyState> {
    const now = new Date();

    const state: JourneyState = {
      projectId,
      journeyType,
      currentPhase: 'setup',
      status: 'active',
      completedPhases: [],
      phaseCompletedAt: {},
      startedAt: now,
      lastActivityAt: now,
      percentComplete: 0
    };

    await db.update(projects)
      .set({
        journeyState: state as any,
        updatedAt: now
      })
      .where(eq(projects.id, projectId));

    console.log(`✅ Initialized journey for project ${projectId}`);
    return state;
  }

  /**
   * Get current journey state
   */
  async getJourneyState(projectId: string): Promise<JourneyState | null> {
    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) return null;

    const state = (project as any).journeyState as JourneyState;
    if (!state) return null;

    // Calculate percent complete
    state.percentComplete = this.calculatePercentComplete(state.completedPhases);

    // Check for blocking checkpoints
    const hasBlocking = await checkpointService.hasBlockingCheckpoints(projectId);
    if (hasBlocking && state.status !== 'blocked') {
      state.status = 'blocked';
      const pending = await checkpointService.getPendingCheckpoints(projectId);
      if (pending.length > 0) {
        state.blockedBy = {
          type: 'approval',
          checkpointId: pending[0].id,
          message: `Waiting for approval: ${pending[0].title}`
        };
      }
    }

    return state;
  }

  /**
   * Complete a phase and advance to next
   */
  async completePhase(projectId: string, phase: JourneyPhase): Promise<JourneyState> {
    const state = await this.getJourneyState(projectId);
    if (!state) {
      throw new Error(`Journey state not found for project ${projectId}`);
    }

    const now = new Date();

    // Add to completed phases if not already
    if (!state.completedPhases.includes(phase)) {
      state.completedPhases.push(phase);
      state.phaseCompletedAt[phase] = now;
    }

    // Determine next phase
    const currentIndex = JOURNEY_PHASE_ORDER.indexOf(phase);
    const nextIndex = currentIndex + 1;

    if (nextIndex < JOURNEY_PHASE_ORDER.length) {
      state.currentPhase = JOURNEY_PHASE_ORDER[nextIndex];
    } else {
      state.currentPhase = 'complete';
      state.status = 'completed';
      state.completedAt = now;
    }

    state.lastActivityAt = now;
    state.percentComplete = this.calculatePercentComplete(state.completedPhases);

    // Check if next phase is blocked
    const hasBlocking = await checkpointService.hasBlockingCheckpoints(projectId);
    if (hasBlocking) {
      state.status = 'blocked';
    } else {
      state.status = state.currentPhase === 'complete' ? 'completed' : 'active';
      state.blockedBy = undefined;
    }

    await this.saveState(projectId, state);

    console.log(`✅ Completed phase ${phase} for project ${projectId}, now at ${state.currentPhase}`);
    return state;
  }

  /**
   * Reset journey to start fresh
   */
  async resetJourney(projectId: string): Promise<JourneyState> {
    // Clear all checkpoints
    await checkpointService.clearProjectCheckpoints(projectId);

    // Get project to preserve journey type
    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId));

    const journeyType = (project as any)?.journeyType || 'non-tech';

    // Re-initialize
    return this.initializeJourney(projectId, journeyType);
  }

  /**
   * Unblock journey (after approval resolved)
   */
  async unblockJourney(projectId: string): Promise<JourneyState> {
    const state = await this.getJourneyState(projectId);
    if (!state) {
      throw new Error(`Journey state not found for project ${projectId}`);
    }

    // Check if still blocked
    const hasBlocking = await checkpointService.hasBlockingCheckpoints(projectId);

    if (!hasBlocking) {
      state.status = 'active';
      state.blockedBy = undefined;
      state.lastActivityAt = new Date();
      await this.saveState(projectId, state);
    }

    return state;
  }

  /**
   * Get next phase URL for navigation
   */
  getPhaseUrl(phase: JourneyPhase, projectId: string, journeyType: string): string {
    const phaseUrls: Record<JourneyPhase, string> = {
      setup: `/journeys/${journeyType}/project-setup`,
      prepare: `/journeys/${journeyType}/prepare`,
      data_upload: `/journeys/${journeyType}/data`,
      data_verify: `/journeys/${journeyType}/data-verification`,
      transform: `/journeys/${journeyType}/data-transformation`,
      analyze: `/journeys/${journeyType}/execute`,
      results: `/journeys/${journeyType}/results`,
      complete: `/project/${projectId}`
    };

    const url = phaseUrls[phase];
    return `${url}?projectId=${projectId}`;
  }

  // Private helpers
  private calculatePercentComplete(completedPhases: JourneyPhase[]): number {
    const totalPhases = JOURNEY_PHASE_ORDER.length - 1; // Exclude 'complete'
    return Math.round((completedPhases.length / totalPhases) * 100);
  }

  private async saveState(projectId: string, state: JourneyState): Promise<void> {
    await db.update(projects)
      .set({
        journeyState: state as any,
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));
  }
}

export const journeyStateService = new JourneyStateService();
```

---

## 5. Component 4: Data Storage Consolidation

### 5.1 Current vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Data locations | 8 different places | 2 clear locations |
| Priority logic | Complex fallback chain | Explicit activeVersion flag |
| Schema | Multiple copies | Single source per dataset |

### 5.2 Data Models

```typescript
// shared/types/dataset.ts

export interface Dataset {
  id: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;

  // Original data (immutable after upload)
  original: {
    data: any[];
    schema: ColumnSchema[];
    rowCount: number;
  };

  // Transformed data (mutable)
  transformed?: {
    data: any[];
    schema: ColumnSchema[];
    rowCount: number;
    transformations: TransformationConfig[];
    transformedAt: Date;
  };

  // Which version to use
  activeVersion: 'original' | 'transformed';

  // Quality metrics
  qualityScore?: number;
  qualityIssues?: QualityIssue[];
}

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  nullable: boolean;
  uniqueValues?: number;
  sampleValues?: any[];
}

export interface TransformationConfig {
  id: string;
  type: string;
  sourceColumns: string[];
  targetColumn: string;
  params: Record<string, any>;
  appliedAt: Date;
}

export interface QualityIssue {
  type: 'missing' | 'duplicate' | 'invalid' | 'outlier';
  column: string;
  severity: 'low' | 'medium' | 'high';
  count: number;
  description: string;
}
```

### 5.3 Service Implementation

```typescript
// server/services/dataset-service.ts

import { db } from '../db';
import { datasets } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { Dataset, ColumnSchema, TransformationConfig } from '@shared/types/dataset';

export class DatasetService {

  /**
   * Create dataset with original data
   */
  async createDataset(
    projectId: string,
    fileName: string,
    data: any[],
    schema: ColumnSchema[],
    fileSize: number,
    mimeType: string
  ): Promise<Dataset> {
    const id = `ds_${nanoid(10)}`;
    const now = new Date();

    const dataset: Dataset = {
      id,
      projectId,
      fileName,
      fileSize,
      mimeType,
      uploadedAt: now,
      original: {
        data,
        schema,
        rowCount: data.length
      },
      activeVersion: 'original'
    };

    await db.insert(datasets).values({
      id: dataset.id,
      projectId: dataset.projectId,
      fileName: dataset.fileName,
      fileSize: dataset.fileSize,
      mimeType: dataset.mimeType,
      uploadedAt: dataset.uploadedAt,
      originalData: dataset.original.data,
      originalSchema: dataset.original.schema,
      originalRowCount: dataset.original.rowCount,
      transformedData: null,
      transformedSchema: null,
      transformations: null,
      activeVersion: dataset.activeVersion
    } as any);

    console.log(`✅ Created dataset ${id} for project ${projectId}`);
    return dataset;
  }

  /**
   * Get dataset by ID
   */
  async getDataset(datasetId: string): Promise<Dataset | null> {
    const [row] = await db.select()
      .from(datasets)
      .where(eq(datasets.id, datasetId));

    if (!row) return null;

    return this.rowToDataset(row);
  }

  /**
   * Get all datasets for a project
   */
  async getProjectDatasets(projectId: string): Promise<Dataset[]> {
    const rows = await db.select()
      .from(datasets)
      .where(eq(datasets.projectId, projectId));

    return rows.map(row => this.rowToDataset(row));
  }

  /**
   * Apply transformations to dataset
   */
  async applyTransformations(
    datasetId: string,
    transformedData: any[],
    transformedSchema: ColumnSchema[],
    transformations: TransformationConfig[]
  ): Promise<Dataset> {
    const now = new Date();

    await db.update(datasets)
      .set({
        transformedData,
        transformedSchema,
        transformations,
        transformedAt: now,
        activeVersion: 'transformed',
        updatedAt: now
      } as any)
      .where(eq(datasets.id, datasetId));

    console.log(`✅ Applied ${transformations.length} transformations to dataset ${datasetId}`);

    return this.getDataset(datasetId) as Promise<Dataset>;
  }

  /**
   * Get active data for analysis (respects activeVersion)
   */
  async getActiveData(datasetId: string): Promise<{ data: any[]; schema: ColumnSchema[] }> {
    const dataset = await this.getDataset(datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    if (dataset.activeVersion === 'transformed' && dataset.transformed) {
      return {
        data: dataset.transformed.data,
        schema: dataset.transformed.schema
      };
    }

    return {
      data: dataset.original.data,
      schema: dataset.original.schema
    };
  }

  /**
   * Set which version to use
   */
  async setActiveVersion(
    datasetId: string,
    version: 'original' | 'transformed'
  ): Promise<void> {
    const dataset = await this.getDataset(datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    if (version === 'transformed' && !dataset.transformed) {
      throw new Error('Cannot set active version to transformed: no transformed data exists');
    }

    await db.update(datasets)
      .set({ activeVersion: version, updatedAt: new Date() } as any)
      .where(eq(datasets.id, datasetId));

    console.log(`✅ Set active version to ${version} for dataset ${datasetId}`);
  }

  // Convert DB row to Dataset object
  private rowToDataset(row: any): Dataset {
    return {
      id: row.id,
      projectId: row.projectId,
      fileName: row.fileName,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      uploadedAt: row.uploadedAt,
      original: {
        data: row.originalData || [],
        schema: row.originalSchema || [],
        rowCount: row.originalRowCount || 0
      },
      transformed: row.transformedData ? {
        data: row.transformedData,
        schema: row.transformedSchema || [],
        rowCount: row.transformedData?.length || 0,
        transformations: row.transformations || [],
        transformedAt: row.transformedAt
      } : undefined,
      activeVersion: row.activeVersion || 'original',
      qualityScore: row.qualityScore,
      qualityIssues: row.qualityIssues
    };
  }
}

export const datasetService = new DatasetService();
```

---

## 6. Database Schema Changes

### 6.1 New Tables

```sql
-- Migration: Add project_questions table
CREATE TABLE IF NOT EXISTS project_questions (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  requirements JSONB,
  transformation JSONB,
  analysis JSONB,
  answer JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_questions_project ON project_questions(project_id);

-- Migration: Update checkpoints table
ALTER TABLE agent_checkpoints
  ADD COLUMN IF NOT EXISTS step_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(50);

CREATE INDEX idx_checkpoints_project_status ON agent_checkpoints(project_id, status);

-- Migration: Update datasets table
ALTER TABLE datasets
  ADD COLUMN IF NOT EXISTS original_data JSONB,
  ADD COLUMN IF NOT EXISTS original_schema JSONB,
  ADD COLUMN IF NOT EXISTS original_row_count INTEGER,
  ADD COLUMN IF NOT EXISTS transformed_data JSONB,
  ADD COLUMN IF NOT EXISTS transformed_schema JSONB,
  ADD COLUMN IF NOT EXISTS transformations JSONB,
  ADD COLUMN IF NOT EXISTS transformed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS active_version VARCHAR(20) DEFAULT 'original';

-- Migration: Add journey_state to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS journey_state JSONB;

-- Clean up old columns (after data migration)
-- ALTER TABLE projects DROP COLUMN IF EXISTS journey_progress;
-- ALTER TABLE projects DROP COLUMN IF EXISTS step_completion_status;
-- ALTER TABLE projects DROP COLUMN IF EXISTS journey_status;
```

### 6.2 Data Migration Script

```typescript
// scripts/migrate-to-new-schema.ts

import { db } from '../server/db';
import { projects, datasets } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function migrateProjects() {
  console.log('Migrating projects to new journey_state format...');

  const allProjects = await db.select().from(projects);

  for (const project of allProjects) {
    const oldProgress = (project as any).journeyProgress;
    const oldStatus = (project as any).journeyStatus;

    if (!oldProgress) continue;

    // Convert old format to new
    const newState = {
      projectId: project.id,
      journeyType: (project as any).journeyType || 'non-tech',
      currentPhase: mapOldStepToPhase(oldProgress.currentStepId),
      status: oldStatus || 'active',
      completedPhases: (oldProgress.completedSteps || []).map(mapOldStepToPhase),
      phaseCompletedAt: {},
      startedAt: (project as any).journeyStartedAt || project.createdAt,
      lastActivityAt: project.updatedAt,
      percentComplete: oldProgress.percentComplete || 0
    };

    await db.update(projects)
      .set({ journeyState: newState as any })
      .where(eq(projects.id, project.id));

    console.log(`  Migrated project ${project.id}`);
  }

  console.log('Project migration complete.');
}

function mapOldStepToPhase(stepId: string): string {
  const mapping: Record<string, string> = {
    'data-upload': 'data_upload',
    'data-verification': 'data_verify',
    'data-transformation': 'transform',
    'analysis-execution': 'analyze',
    'results-preview': 'results'
  };
  return mapping[stepId] || stepId;
}

async function migrateDatasets() {
  console.log('Migrating datasets to new schema...');

  const allDatasets = await db.select().from(datasets);

  for (const dataset of allDatasets) {
    const oldData = (dataset as any).data;
    const oldSchema = (dataset as any).schema;
    const oldMetadata = (dataset as any).ingestionMetadata || {};

    const updates: any = {
      originalData: oldData,
      originalSchema: oldSchema,
      originalRowCount: Array.isArray(oldData) ? oldData.length : 0
    };

    if (oldMetadata.transformedData) {
      updates.transformedData = oldMetadata.transformedData;
      updates.transformedSchema = oldMetadata.transformedSchema;
      updates.transformations = oldMetadata.transformations;
      updates.activeVersion = 'transformed';
    } else {
      updates.activeVersion = 'original';
    }

    await db.update(datasets)
      .set(updates)
      .where(eq(datasets.id, dataset.id));

    console.log(`  Migrated dataset ${dataset.id}`);
  }

  console.log('Dataset migration complete.');
}

// Run migrations
migrateProjects()
  .then(() => migrateDatasets())
  .then(() => console.log('All migrations complete!'))
  .catch(console.error);
```

---

## 7. API Contract Changes

### 7.1 New Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/projects/:id/questions` | Create questions with IDs |
| GET | `/api/projects/:id/questions` | Get questions with full context |
| GET | `/api/projects/:id/questions/:qid/evidence` | Get evidence chain |
| GET | `/api/projects/:id/journey-state` | Get unified journey state |
| POST | `/api/projects/:id/journey-state/complete-phase` | Complete a phase |
| POST | `/api/projects/:id/journey-state/reset` | Reset journey |
| POST | `/api/checkpoints/:id/approve` | Approve checkpoint |
| POST | `/api/checkpoints/:id/reject` | Reject checkpoint |
| GET | `/api/datasets/:id/active-data` | Get active data version |

### 7.2 Deprecated Endpoints

| Endpoint | Replacement |
|----------|-------------|
| `PUT /api/project-sessions/:id/update-step` | Direct API calls per component |
| `GET /api/projects/:id/checkpoints` | `GET /api/projects/:id/checkpoints` (new implementation) |
| `POST /api/projects/:id/restart-journey` | `POST /api/projects/:id/journey-state/reset` |

---

## 8. Migration Strategy

### 8.1 Phased Rollout

**Phase 1: Database Changes (Day 1)**
- Run schema migrations
- Add new tables/columns
- Keep old columns for fallback

**Phase 2: Backend Services (Days 2-5)**
- Deploy new services alongside old
- Route new requests to new services
- Old services remain for in-flight requests

**Phase 3: Frontend Updates (Days 6-8)**
- Update hooks to use new APIs
- Remove localStorage dependencies
- Update components

**Phase 4: Data Migration (Day 9)**
- Run migration scripts
- Verify data integrity
- Monitor for issues

**Phase 5: Cleanup (Day 10+)**
- Remove old services
- Drop deprecated columns
- Update documentation

### 8.2 Rollback Plan

If issues arise:
1. Revert frontend to old hooks
2. Route traffic back to old services
3. Old data still in original columns
4. No data loss possible

---

## 9. Testing Plan

### 9.1 Unit Tests

```typescript
// tests/unit/services/question-context.test.ts

describe('QuestionContextService', () => {
  test('creates questions with stable IDs', async () => {
    const questions = await questionContextService.createQuestions(
      'project_123',
      ['What drives sales?', 'Who are top customers?']
    );

    expect(questions).toHaveLength(2);
    expect(questions[0].id).toBe('q_project_123_1');
    expect(questions[1].id).toBe('q_project_123_2');
  });

  test('builds complete evidence chain', async () => {
    // Setup question with all phases populated
    const evidence = await questionContextService.buildEvidenceChain('q_123_1');

    expect(evidence).toContainEqual(expect.objectContaining({
      type: 'data_element'
    }));
    expect(evidence).toContainEqual(expect.objectContaining({
      type: 'transformation'
    }));
    expect(evidence).toContainEqual(expect.objectContaining({
      type: 'insight'
    }));
  });
});
```

### 9.2 Integration Tests

```typescript
// tests/integration/question-to-answer-flow.test.ts

describe('Question-to-Answer Flow', () => {
  test('complete flow from question to answer', async () => {
    // 1. Create project and questions
    const project = await createTestProject();
    const questions = await api.post(`/api/projects/${project.id}/questions`, {
      questions: ['What drives revenue?']
    });

    expect(questions.body.questions[0].id).toBeTruthy();
    const questionId = questions.body.questions[0].id;

    // 2. Upload data
    await uploadTestData(project.id);

    // 3. Execute analysis
    await api.post(`/api/analysis-execution/execute`, {
      projectId: project.id
    });

    // 4. Verify answer exists with evidence
    const result = await api.get(`/api/projects/${project.id}/questions`);
    const question = result.body.questions[0];

    expect(question.answer).toBeTruthy();
    expect(question.answer.evidenceChain).toHaveLength(> 0);
    expect(question.answer.confidence).toBeGreaterThan(0);
  });
});
```

### 9.3 E2E Tests

```typescript
// tests/e2e/user-journey.spec.ts

test('complete user journey with questions answered', async ({ page }) => {
  // Login
  await loginAsTestUser(page);

  // Start journey
  await page.goto('/journeys/business/prepare');

  // Enter questions
  await page.fill('[data-testid="business-questions"]',
    'What drives sales?\nWho are our best customers?');
  await page.click('[data-testid="continue-btn"]');

  // Upload data
  await uploadFile(page, 'test-data.csv');
  await page.click('[data-testid="continue-btn"]');

  // Execute analysis
  await page.click('[data-testid="execute-btn"]');
  await page.waitForSelector('[data-testid="analysis-complete"]');

  // Verify answers displayed
  await page.goto('/project/' + projectId);
  await page.click('[data-testid="insights-tab"]');

  const answers = await page.locator('[data-testid="question-answer"]').count();
  expect(answers).toBe(2);

  // Verify evidence chain
  await page.click('[data-testid="view-evidence"]');
  const evidence = await page.locator('[data-testid="evidence-item"]').count();
  expect(evidence).toBeGreaterThan(0);
});
```

---

## 10. Implementation Schedule

### Week 1: Question-to-Answer Pipeline

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1 | Create `project_questions` table, types | DB migration, TypeScript types |
| 2 | Implement `QuestionContextService` | Backend service |
| 3 | Create API routes for questions | REST endpoints |
| 4 | Update `prepare-step.tsx` to use new API | Frontend integration |
| 5 | Update analysis-execution to use question IDs | End-to-end flow |

### Week 2: Agent Checkpoint System

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1 | Update checkpoints table schema | DB migration |
| 2 | Implement `CheckpointService` (DB-first) | Backend service |
| 3 | Remove in-memory checkpoint storage | Cleanup old code |
| 4 | Update approval UI components | Frontend updates |
| 5 | Test checkpoint workflow end-to-end | Integration tests |

### Week 3: Journey State Management

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1 | Add `journey_state` column | DB migration |
| 2 | Implement `JourneyStateService` | Backend service |
| 3 | Create data migration script | Migration tool |
| 4 | Update journey hooks and components | Frontend updates |
| 5 | Remove old state fields | Cleanup |

### Week 4: Data Storage & Testing

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1 | Update datasets table schema | DB migration |
| 2 | Implement `DatasetService` | Backend service |
| 3 | Run full data migration | Migrated data |
| 4 | End-to-end testing | Test results |
| 5 | Bug fixes and documentation | Stable release |

---

## Appendix A: File Changes Summary

### New Files to Create

```
shared/types/
├── question-context.ts
├── journey-state.ts
├── checkpoint.ts
└── dataset.ts

server/services/
├── question-context-service.ts
├── checkpoint-service.ts
├── journey-state-service.ts
└── dataset-service.ts

server/routes/
├── question-context.ts
└── journey-state.ts

client/src/hooks/
├── useQuestionContext.ts
└── useJourneyState.ts (updated)

migrations/
├── 005_add_project_questions.sql
├── 006_update_checkpoints.sql
├── 007_add_journey_state.sql
└── 008_update_datasets.sql

scripts/
└── migrate-to-new-schema.ts
```

### Files to Modify

```
server/routes/index.ts           # Add new route imports
server/services/analysis-execution.ts  # Use question IDs
client/src/pages/prepare-step.tsx      # Use new question API
client/src/pages/project-page.tsx      # Use new journey state
client/src/components/UserQuestionAnswers.tsx  # Display evidence
```

### Files to Eventually Remove

```
server/services/journey-state-manager.ts  # Replace with new service
(After migration complete and verified)
```

---

## Appendix B: Success Criteria

The refactoring is complete when:

1. **Questions flow end-to-end with IDs**
   - [ ] Questions created with stable IDs in prepare step
   - [ ] IDs preserved through requirements, transformation, analysis
   - [ ] Answers include evidence chain back to questions

2. **Checkpoints are reliable**
   - [ ] Server restart doesn't lose checkpoint state
   - [ ] Approvals are atomic (no race conditions)
   - [ ] Rejection creates tracked revision

3. **Journey state is unified**
   - [ ] Single `journey_state` field tracks all progress
   - [ ] Blocking checkpoints automatically detected
   - [ ] Phase transitions are explicit

4. **Data locations are clear**
   - [ ] `activeVersion` determines which data is used
   - [ ] No more 8-location fallback chain
   - [ ] Transformations stored with dataset

5. **Tests pass**
   - [ ] Unit tests for all new services
   - [ ] Integration tests for flows
   - [ ] E2E tests for user journeys
   - [ ] Existing tests still pass

---

## 11. End-to-End Agentic Workflow Design

### 11.1 Agent Architecture Overview

The platform uses 6 specialized agents that collaborate through a message broker and tool registry:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT ORCHESTRATION LAYER                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    PROJECT MANAGER AGENT                                 ││
│  │                  (End-to-End Orchestrator)                               ││
│  │                                                                          ││
│  │  Responsibilities:                                                       ││
│  │  • Journey planning and step sequencing                                  ││
│  │  • Agent task delegation and coordination                                ││
│  │  • User clarification requests                                           ││
│  │  • Checkpoint creation and approval tracking                             ││
│  │  • Artifact dependency management                                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│         ┌────────────────────┼────────────────────┐                         │
│         ▼                    ▼                    ▼                         │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                 │
│  │    DATA     │      │    DATA     │      │  BUSINESS   │                 │
│  │  ENGINEER   │      │  SCIENTIST  │      │    AGENT    │                 │
│  │    AGENT    │      │    AGENT    │      │             │                 │
│  │             │      │             │      │             │                 │
│  │ • Quality   │      │ • Analysis  │      │ • Industry  │                 │
│  │ • Schema    │      │ • ML Models │      │   expertise │                 │
│  │ • ETL       │      │ • Stats     │      │ • Compliance│                 │
│  │ • Transforms│      │ • Insights  │      │ • Templates │                 │
│  └─────────────┘      └─────────────┘      └─────────────┘                 │
│         │                    │                    │                         │
│         └────────────────────┴────────────────────┘                         │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         TOOL REGISTRY                                    ││
│  │           (Permission-Controlled Service Access)                         ││
│  │                                                                          ││
│  │  Tools: file_processor, schema_generator, data_transformer,             ││
│  │         statistical_analyzer, ml_pipeline, visualization_engine,         ││
│  │         business_templates, project_coordinator, decision_auditor        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               ▼
              ┌────────────────────────────────┐
              │     PYTHON BRIDGE + AI APIs    │
              │   (Gemini, OpenAI, Claude)     │
              └────────────────────────────────┘
```

### 11.2 Agent Responsibilities Matrix

| Agent | When Triggered | Tools Used | User Interaction |
|-------|---------------|------------|------------------|
| **Project Manager** | Journey start, step transitions, clarification needed | project_coordinator, decision_auditor | Clarification dialogs, checkpoint approvals |
| **Data Engineer** | Data upload, verification, transformation | file_processor, schema_generator, data_transformer | Schema approval, quality report review |
| **Data Scientist** | Analysis planning, execution, insights | statistical_analyzer, ml_pipeline, visualization_engine | Analysis plan approval, insight review |
| **Business Agent** | Requirements gathering, template selection | business_templates, decision_auditor | Industry-specific recommendations |
| **Template Research** | Journey type selection, best practices | business_templates, knowledge_graph | Template suggestions |
| **Customer Support** | User questions, billing issues, troubleshooting | knowledge_graph, billing_service | Chat support (if enabled) |

### 11.3 U2A2A2U (User-to-Agent-to-Agent-to-User) Workflow

**Current Issue**: Agents operate independently without seeing each other's results.

**Target Workflow**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        U2A2A2U WORKFLOW                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  PHASE 1: User Input                                                      │
│  ─────────────────────                                                    │
│  User → Project Manager                                                   │
│         ├─ Goals: "Understand customer churn"                            │
│         ├─ Questions: ["What drives churn?", "Who is at risk?"]          │
│         └─ Data: customer_data.csv                                        │
│                                                                           │
│  PHASE 2: Agent Analysis (Coordinated)                                    │
│  ─────────────────────────────────────                                    │
│  PM → Data Engineer                                                       │
│       └─ Task: Assess data quality, identify schema                       │
│       └─ Output: quality_report, schema_definition                        │
│                  ↓ (stored in agent_results table)                        │
│  PM → Data Scientist (receives DE output)                                 │
│       └─ Task: Plan analysis based on questions + schema                  │
│       └─ Input: user_questions + quality_report + schema                  │
│       └─ Output: analysis_plan, technique_recommendations                 │
│                  ↓                                                        │
│  PM → Business Agent (receives DS + DE outputs)                           │
│       └─ Task: Validate plan against industry best practices              │
│       └─ Input: analysis_plan + quality_report + industry_context         │
│       └─ Output: validated_plan, compliance_notes                         │
│                                                                           │
│  PHASE 3: Synthesis                                                       │
│  ─────────────────                                                        │
│  PM synthesizes all agent results:                                        │
│       ├─ Merge: quality_report + analysis_plan + compliance_notes         │
│       ├─ Resolve conflicts between agents                                 │
│       └─ Create unified checkpoint for user                               │
│                                                                           │
│  PHASE 4: User Checkpoint                                                 │
│  ─────────────────────────                                                │
│  PM → User: "Here's my recommendation based on all agent inputs..."       │
│       ├─ Shows: Data quality score, proposed analysis, industry notes     │
│       ├─ Options: Approve, Reject with feedback, Ask for clarification    │
│       └─ User decision stored in checkpoints table                        │
│                                                                           │
│  PHASE 5: Execution (after approval)                                      │
│  ────────────────────────────────────                                     │
│  PM → Data Scientist: Execute approved analysis plan                      │
│       └─ Uses: transformed_data + approved_plan                           │
│       └─ Generates: insights, visualizations, answers                     │
│                                                                           │
│  PHASE 6: Results to User                                                 │
│  ─────────────────────────                                                │
│  PM → User: Final results with evidence chain                             │
│       ├─ Answers to original questions                                    │
│       ├─ Evidence: data → transformation → analysis → insight → answer    │
│       └─ Artifacts: PDF report, visualizations, exported data             │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 11.4 Agent Result Storage (New)

```typescript
// shared/types/agent-result.ts

export interface AgentResult {
  id: string;
  projectId: string;
  agentType: 'project_manager' | 'data_engineer' | 'data_scientist' | 'business';
  taskType: string;                    // e.g., 'quality_assessment', 'analysis_plan'

  // Input context (what the agent received)
  input: {
    userContext: {
      goals: string[];
      questions: string[];
    };
    previousAgentResults?: string[];   // IDs of prior agent results used
    dataContext?: {
      datasetId: string;
      schema: any;
    };
  };

  // Output (what the agent produced)
  output: {
    status: 'success' | 'partial' | 'failed';
    result: any;                       // Agent-specific result structure
    confidence: number;                // 0-100
    recommendations: string[];
    warnings: string[];
  };

  // Metadata
  executionTimeMs: number;
  tokensUsed?: number;
  modelUsed?: string;
  createdAt: Date;
}

// Database table
CREATE TABLE agent_results (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type VARCHAR(50) NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  input JSONB NOT NULL,
  output JSONB NOT NULL,
  execution_time_ms INTEGER,
  tokens_used INTEGER,
  model_used VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_results_project ON agent_results(project_id);
CREATE INDEX idx_agent_results_agent ON agent_results(project_id, agent_type);
```

### 11.5 Agent Tool Registry

Each agent has specific tools they can use, enforced by the Tool Registry:

```typescript
// server/services/agent-tool-permissions.ts

export const AGENT_TOOL_PERMISSIONS: Record<string, string[]> = {
  project_manager: [
    'project_coordinator',
    'decision_auditor',
    'checkpoint_manager',
    'agent_delegator'
  ],

  data_engineer: [
    'file_processor',
    'schema_generator',
    'data_transformer',
    'data_quality_monitor',
    'pii_detector'
  ],

  data_scientist: [
    'statistical_analyzer',
    'ml_pipeline',
    'visualization_engine',
    'insight_generator',
    'prediction_engine'
  ],

  business_agent: [
    'business_templates',
    'compliance_checker',
    'industry_research',
    'recommendation_engine'
  ],

  template_research: [
    'template_search',
    'knowledge_graph',
    'best_practices'
  ],

  customer_support: [
    'knowledge_base',
    'billing_service',
    'diagnostics_tools',
    'ticket_manager'
  ]
};

// Tool execution with permission check
export async function executeTool(
  toolName: string,
  agentType: string,
  input: any,
  context: { userId: string; projectId: string }
): Promise<ToolResult> {

  // Check permission
  const allowedTools = AGENT_TOOL_PERMISSIONS[agentType] || [];
  if (!allowedTools.includes(toolName)) {
    throw new Error(`Agent ${agentType} does not have permission to use tool ${toolName}`);
  }

  // Log tool usage for billing
  await trackToolUsage(context.userId, context.projectId, toolName, agentType);

  // Execute tool
  const tool = getRegisteredTool(toolName);
  const result = await tool.execute(input, context);

  // Log result for audit
  await logToolExecution(toolName, agentType, input, result, context);

  return result;
}
```

### 11.6 Checkpoint Flow Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CHECKPOINT FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   AGENT     │───▶│ CHECKPOINT  │───▶│    USER     │───▶│   AGENT     │  │
│  │  WORKING    │    │   CREATED   │    │   REVIEW    │    │  CONTINUES  │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                               │                             │
│                            ┌──────────────────┼──────────────────┐          │
│                            ▼                  ▼                  ▼          │
│                     ┌───────────┐      ┌───────────┐      ┌───────────┐    │
│                     │  APPROVE  │      │  REJECT   │      │  CLARIFY  │    │
│                     └─────┬─────┘      └─────┬─────┘      └─────┬─────┘    │
│                           │                  │                  │          │
│                           ▼                  ▼                  ▼          │
│                     Continue to        Create revision     PM asks user    │
│                     next step          checkpoint           for more info  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Checkpoint Types by Journey Phase:

| Phase | Checkpoint | Agent | What User Reviews |
|-------|------------|-------|-------------------|
| Prepare | Data Requirements | PM + DE | Required data elements, analysis path |
| Data | Schema Definition | DE | Column types, relationships, quality |
| Data | Quality Report | DE | Data issues, PII detection, completeness |
| Transform | Transformation Plan | DE + DS | Proposed transformations, mappings |
| Analyze | Analysis Plan | DS + BA | Techniques, expected outputs, timeline |
| Results | Insights Review | DS | Generated insights before final report |
```

---

## 12. Project Dashboard Design

### 12.1 Dashboard Information Architecture

The project dashboard is the user's primary view into their analysis results. It should prioritize **business outcomes** over technical details.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROJECT DASHBOARD                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  PROJECT HEADER                                                          ││
│  │  ─────────────                                                           ││
│  │  • Project Name & Description                                            ││
│  │  • Journey Progress Indicator (e.g., "Analysis Complete")                ││
│  │  • Last Activity: "Updated 2 hours ago"                                  ││
│  │  • Quick Actions: [Resume Journey] [Export Report] [Share]               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  PRIMARY: YOUR QUESTIONS ANSWERED                                        ││
│  │  ───────────────────────────────────                                     ││
│  │  For each user question:                                                 ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Q: "What factors drive customer churn?"                              │││
│  │  │ A: "Based on analysis of 10,000 customer records, the top 3         │││
│  │  │    factors driving churn are: (1) Support ticket frequency          │││
│  │  │    (r=0.72), (2) Days since last purchase (r=0.68), (3) Contract    │││
│  │  │    type - monthly plans have 3x higher churn than annual."          │││
│  │  │                                                                      │││
│  │  │ [View Evidence Chain] [View Visualization] [Export]                  │││
│  │  │ Confidence: 87% | Based on: regression analysis, cohort comparison  │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  SECONDARY: KEY INSIGHTS SUMMARY                                         ││
│  │  ───────────────────────────────                                         ││
│  │  • Insight 1: "High-value customers (top 20%) generate 65% of revenue"  ││
│  │  • Insight 2: "Seasonal pattern: Q4 sales are 40% higher than Q1"       ││
│  │  • Insight 3: "Product category A has highest margin but lowest volume" ││
│  │                                                                          ││
│  │  [View All Insights] [Download Summary PDF]                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐       │
│  │  TAB: Overview     │ │  TAB: Agents       │ │  TAB: Data         │       │
│  │  (Current view)    │ │  Activity/Approvals│ │  Datasets/Schema   │       │
│  └────────────────────┘ └────────────────────┘ └────────────────────┘       │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐       │
│  │  TAB: Timeline     │ │  TAB: Analysis     │ │  TAB: Insights     │       │
│  │  Artifact history  │ │  Visualizations    │ │  Detailed results  │       │
│  └────────────────────┘ └────────────────────┘ └────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Tab Structure & Content

| Tab | Purpose | Components | Priority |
|-----|---------|------------|----------|
| **Overview** | Primary results view | Questions Answered, Key Insights, Quick Stats | **HIGH** - Default view |
| **Insights** | Detailed analysis | AudienceTranslatedResults, UserQuestionAnswers, AIInsights | **HIGH** |
| **Agents** | Agent activity & approvals | AgentActivityOverview, AgentCheckpoints | **MEDIUM** |
| **Data** | Dataset management | EnhancedDataWorkflow, Dataset list | **MEDIUM** |
| **Timeline** | Project history | ProjectArtifactTimeline | **MEDIUM** |
| **Analysis** | Visualization builder | DashboardBuilder | **MEDIUM** |
| **Schema** | Data structure | SchemaEditor | **LOW** - Technical users |
| **Transform** | Data transformations | DataTransformation | **LOW** - Technical users |

### 12.3 User-Facing Components

**Component 1: AudienceTranslatedResults** (PRIMARY)
```typescript
// client/src/components/AudienceTranslatedResults.tsx

interface AudienceTranslatedResultsProps {
  project: Project;
  journeyType: string;
}

/**
 * Translates technical analysis results into audience-appropriate language.
 *
 * For non-tech users: Plain language, focus on actions
 * For business users: Business metrics, ROI implications
 * For technical users: Statistical details, methodology
 */
export function AudienceTranslatedResults({ project, journeyType }: Props) {
  const audience = mapJourneyToAudience(journeyType);

  // Get raw insights from project
  const rawInsights = project.analysisResults?.insights || [];

  // Translate based on audience
  const translatedInsights = rawInsights.map(insight =>
    translateForAudience(insight, audience)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Findings</CardTitle>
        <CardDescription>
          Analysis results tailored for {audience} audience
        </CardDescription>
      </CardHeader>
      <CardContent>
        {translatedInsights.map(insight => (
          <InsightCard
            key={insight.id}
            title={insight.title}
            summary={insight.summary}
            details={insight.details}
            evidence={insight.evidenceChain}
          />
        ))}
      </CardContent>
    </Card>
  );
}
```

**Component 2: UserQuestionAnswers** (SECONDARY)
```typescript
// client/src/components/UserQuestionAnswers.tsx

interface UserQuestionAnswersProps {
  project: Project;
}

/**
 * Displays the user's original questions with their AI-generated answers.
 * Shows evidence chain for each answer.
 */
export function UserQuestionAnswers({ project }: Props) {
  // Load questions with context from new API
  const { questions } = useQuestionContext(project.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Questions Answered</CardTitle>
      </CardHeader>
      <CardContent>
        {questions.map(question => (
          <QuestionAnswerCard
            key={question.id}
            question={question.text}
            answer={question.answer?.text}
            confidence={question.answer?.confidence}
            status={question.answer?.status}
            evidenceChain={question.answer?.evidenceChain}
            onViewEvidence={() => showEvidenceModal(question.id)}
          />
        ))}

        {questions.length === 0 && (
          <EmptyState message="No questions were defined for this project." />
        )}
      </CardContent>
    </Card>
  );
}
```

**Component 3: AgentActivityOverview** (AGENT TAB)
```typescript
// client/src/components/agent-activity-overview.tsx

interface AgentActivityOverviewProps {
  project: Project;
  journeyState: JourneyState;
  onNavigateToInsights: () => void;
}

/**
 * Shows agent activity during the journey.
 * Displays which agents worked on the project and their status.
 */
export function AgentActivityOverview({ project, journeyState, onNavigateToInsights }: Props) {
  const agents = [
    { type: 'project_manager', name: 'Project Manager', icon: ClipboardList },
    { type: 'data_engineer', name: 'Data Engineer', icon: Database },
    { type: 'data_scientist', name: 'Data Scientist', icon: Brain },
    { type: 'business', name: 'Business Analyst', icon: Briefcase }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Agent Activity</CardTitle>
        <CardDescription>
          Agents that contributed to your analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {agents.map(agent => (
            <AgentCard
              key={agent.type}
              name={agent.name}
              icon={agent.icon}
              status={getAgentStatus(project, agent.type)}
              tasksCompleted={getAgentTasks(project, agent.type)}
            />
          ))}
        </div>

        <div className="mt-4">
          <Button onClick={onNavigateToInsights}>
            View Analysis Results
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 12.4 Dashboard State Sources

**Current Problem**: Dashboard reads from multiple inconsistent sources.

**Target State**: Dashboard reads from unified sources:

| Data | Source | API Endpoint |
|------|--------|--------------|
| Project metadata | `projects` table | `GET /api/projects/:id` |
| Questions & Answers | `project_questions` table | `GET /api/projects/:id/questions` |
| Journey state | `projects.journey_state` | `GET /api/projects/:id/journey-state` |
| Agent results | `agent_results` table | `GET /api/projects/:id/agent-results` |
| Checkpoints | `checkpoints` table | `GET /api/projects/:id/checkpoints` |
| Datasets | `datasets` table | `GET /api/projects/:id/datasets` |
| Artifacts | `project_artifacts` table | `GET /api/projects/:id/artifacts` |

---

## 13. Admin Components Design

### 13.1 Admin Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ADMIN DASHBOARD                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  QUICK STATS                                                             ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     ││
│  │  │ Total Users │  │  Active     │  │   System    │  │  Monthly    │     ││
│  │  │     1,234   │  │  Subs: 567  │  │  Health: OK │  │  Rev: $12K  │     ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ADMIN SECTIONS                                                          ││
│  │                                                                          ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          ││
│  │  │ User Management │  │ Subscriptions   │  │ Agent Management│          ││
│  │  │ /admin/users    │  │ /admin/subs     │  │ /admin/agents   │          ││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          ││
│  │                                                                          ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          ││
│  │  │ Tools Management│  │ Pricing Config  │  │ Consultations   │          ││
│  │  │ /admin/tools    │  │ /admin/pricing  │  │ /admin/consult  │          ││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Admin Pages Structure

| Page | Path | Purpose | Key Features |
|------|------|---------|--------------|
| **Dashboard** | `/admin` | Overview & navigation | Stats, quick actions, system health |
| **User Management** | `/admin/users` | Manage users | Search, roles, suspend, impersonate |
| **Subscriptions** | `/admin/subscription-management` | Billing management | Tiers, change plans, refunds |
| **Agent Management** | `/admin/agent-management` | AI agent config | Status, enable/disable, performance |
| **Tools Management** | `/admin/tools-management` | Tool registry | Enable/disable, permissions, usage |
| **Pricing Services** | `/admin/pricing-services` | Pricing config | Per-service pricing, tiers |
| **Consultations** | `/admin/consultations` | Consultation queue | Assign, status, reports |
| **Consultation Pricing** | `/admin/consultation-pricing` | Consult pricing | Hourly rates, packages |

### 13.3 Admin API Endpoints

```typescript
// server/routes/admin.ts - Core admin endpoints

// User Management
GET    /api/admin/users                    // List all users with filters
GET    /api/admin/users/:id                // Get user details
PUT    /api/admin/users/:id/role           // Change user role
PUT    /api/admin/users/:id/admin          // Toggle admin status
PUT    /api/admin/users/:id/suspend        // Suspend/unsuspend user
DELETE /api/admin/users/:id                // Delete user (soft delete)
POST   /api/admin/users/:id/impersonate    // Act as user (consultant mode)

// Subscription Management
GET    /api/admin/subscriptions            // All subscriptions
GET    /api/admin/subscriptions/stats      // Subscription analytics
PUT    /api/admin/subscriptions/:id/tier   // Change tier
POST   /api/admin/subscriptions/:id/refund // Process refund

// Agent Management
GET    /api/admin/agents                   // List all agents
GET    /api/admin/agents/:type/status      // Agent health status
PUT    /api/admin/agents/:type/enable      // Enable/disable agent
GET    /api/admin/agents/:type/metrics     // Agent performance metrics
PUT    /api/admin/agents/:type/config      // Update agent configuration

// Tool Management
GET    /api/admin/tools                    // List all tools
PUT    /api/admin/tools/:name/enable       // Enable/disable tool
PUT    /api/admin/tools/:name/permissions  // Update tool permissions
GET    /api/admin/tools/:name/usage        // Tool usage analytics

// System
GET    /api/admin/system/health            // System health check
GET    /api/admin/system/metrics           // Platform metrics
GET    /api/admin/system/logs              // Recent system logs
```

### 13.4 Billing & Subscription Management

```typescript
// server/routes/admin-billing.ts

/**
 * Subscription Tier Management
 */
interface SubscriptionTier {
  id: string;
  name: 'trial' | 'starter' | 'professional' | 'enterprise';
  price: number;                          // Monthly price in cents
  features: {
    dataUploadMB: number;
    aiQueriesPerMonth: number;
    analysisComponents: number;
    visualizations: number;
    supportLevel: 'email' | 'priority' | 'dedicated';
  };
  stripePriceId: string;
}

/**
 * Admin Billing Endpoints
 */

// GET /api/admin/billing/overview
// Returns: { mrr, arr, activeSubscriptions, churnRate, revenueByTier }

// GET /api/admin/billing/subscriptions
// Returns: List of all subscriptions with user info

// POST /api/admin/billing/change-tier
// Body: { userId, newTier, reason }
// Changes user's subscription tier (syncs with Stripe)

// POST /api/admin/billing/apply-discount
// Body: { userId, discountPercent, duration, reason }
// Applies discount to user's subscription

// POST /api/admin/billing/refund
// Body: { subscriptionId, amount, reason }
// Processes refund through Stripe

// GET /api/admin/billing/invoices/:userId
// Returns: User's invoice history from Stripe
```

### 13.5 Agent Management Interface

```typescript
// client/src/pages/admin/agent-management.tsx

interface AgentInfo {
  id: string;
  name: string;
  type: 'project_manager' | 'data_engineer' | 'data_scientist' | 'business';
  status: 'active' | 'inactive' | 'error' | 'maintenance';

  // Health metrics
  healthStatus: {
    lastHealthCheck: Date;
    responseTime: number;              // ms
    memoryUsage: number;               // percentage
    cpuUsage: number;                  // percentage
    isHealthy: boolean;
    errorCount: number;
  };

  // Performance metrics
  performance: {
    tasksCompleted: number;
    successRate: number;               // percentage
    averageResponseTime: number;       // ms
    uptime: number;                    // percentage
  };

  // Configuration
  configuration: {
    maxConcurrentTasks: number;
    priority: number;
    timeout: number;                   // ms
    retryAttempts: number;
    model: string;                     // AI model used
  };

  // Tools this agent can use
  allowedTools: string[];
}

// Admin can:
// 1. View agent health and performance
// 2. Enable/disable agents
// 3. Configure agent parameters
// 4. View agent logs and task history
// 5. Restart agents if needed
```

### 13.6 Tools Management Interface

```typescript
// client/src/pages/admin/tools-management.tsx

interface ToolInfo {
  name: string;
  category: 'data' | 'analysis' | 'visualization' | 'ml' | 'business' | 'utility';
  description: string;
  status: 'active' | 'disabled' | 'error';

  // Usage metrics
  usage: {
    totalInvocations: number;
    successRate: number;
    averageExecutionTime: number;
    lastUsed: Date;
    usageByAgent: Record<string, number>;
  };

  // Permissions
  permissions: {
    allowedAgents: string[];
    requiresApproval: boolean;
    costPerUse: number;
  };

  // Configuration
  config: {
    timeout: number;
    maxRetries: number;
    queuePriority: number;
  };
}

// Admin can:
// 1. Enable/disable tools
// 2. Configure tool permissions (which agents can use)
// 3. Set tool pricing
// 4. View usage analytics
// 5. Configure tool parameters
```

### 13.7 Customer Management (Consultant Mode)

```typescript
// Consultant mode allows admins to act on behalf of customers

interface ConsultantContext {
  isConsultantMode: boolean;
  adminUserId: string;                 // The admin's user ID
  selectedCustomer: {
    id: string;
    name: string;
    email: string;
    subscriptionTier: string;
  } | null;
}

// Usage in components
const { isConsultantMode, selectedCustomer, setConsultantMode, clearConsultantMode } = useConsultant();

// When in consultant mode:
// - Admin sees customer's projects
// - Admin can make changes on customer's behalf
// - All actions are logged with admin attribution
// - Customer receives notification of admin actions
```

### 13.8 Admin Security Model

```typescript
// server/middleware/admin-auth.ts

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Log admin action
  logAdminAction(user.id, req.method, req.path, req.body);

  next();
}

// Audit log for admin actions
interface AdminAuditLog {
  id: string;
  adminUserId: string;
  action: string;
  targetType: 'user' | 'subscription' | 'agent' | 'tool' | 'system';
  targetId: string;
  details: any;
  timestamp: Date;
  ipAddress: string;
}

// Database table
CREATE TABLE admin_audit_logs (
  id VARCHAR(50) PRIMARY KEY,
  admin_user_id VARCHAR(50) NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(50),
  details JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(45)
);

CREATE INDEX idx_admin_audit_admin ON admin_audit_logs(admin_user_id);
CREATE INDEX idx_admin_audit_target ON admin_audit_logs(target_type, target_id);
```

---

## 14. Implementation Priority (Updated)

### Week 1: Question-to-Answer Pipeline
*As previously documented*

### Week 2: Agent Checkpoint System
*As previously documented*

### Week 3: Journey State + Agent Coordination
- Days 1-2: Journey state consolidation
- Days 3-4: Agent result storage table + service
- Day 5: U2A2A2U workflow implementation

### Week 4: Data Storage + Dashboard
- Days 1-2: Data storage consolidation
- Days 3-4: Project dashboard updates (prioritize Insights tab)
- Day 5: Testing & bug fixes

### Week 5: Admin Components
- Days 1-2: Agent management page (real data, not mock)
- Days 3-4: Tools management page
- Day 5: Admin billing integration

### Week 6: Polish & Testing
- Days 1-2: End-to-end testing
- Days 3-4: Performance optimization
- Day 5: Documentation & release

---

## Appendix C: Component Inventory

### Frontend Components to Create/Update

| Component | Location | Priority | Description |
|-----------|----------|----------|-------------|
| `AudienceTranslatedResults` | `client/src/components/` | HIGH | Audience-aware results display |
| `UserQuestionAnswers` | `client/src/components/` | HIGH | Q&A with evidence chain |
| `EvidenceChainViewer` | `client/src/components/` | HIGH | Visual evidence trail |
| `AgentActivityOverview` | `client/src/components/` | MEDIUM | Agent status display |
| `AgentCheckpoints` | `client/src/components/` | MEDIUM | Checkpoint approval UI |
| `AdminAgentManagement` | `client/src/pages/admin/` | MEDIUM | Real agent data (not mock) |
| `AdminToolsManagement` | `client/src/pages/admin/` | MEDIUM | Real tool data (not mock) |

### Backend Services to Create/Update

| Service | Location | Priority | Description |
|---------|----------|----------|-------------|
| `QuestionContextService` | `server/services/` | HIGH | Question tracking |
| `CheckpointService` | `server/services/` | HIGH | DB-first checkpoints |
| `JourneyStateService` | `server/services/` | HIGH | Unified journey state |
| `DatasetService` | `server/services/` | HIGH | Consolidated data storage |
| `AgentResultService` | `server/services/` | MEDIUM | Agent result storage |
| `AgentCoordinationService` | `server/services/` | MEDIUM | U2A2A2U workflow |
| `AdminAgentService` | `server/services/` | MEDIUM | Agent management |
| `AdminToolService` | `server/services/` | MEDIUM | Tool management |

---

**Ready to begin implementation?**

## 15. Implementation Status Log

### Dec 13, 2025
- **BA Agent Integration**: Auto-translation logic in `AnalysisExecutionService` has been successfully restored and verified safe.
- **Compilation Fixes**: Addressed 5 critical type safety and syntax issues across backend services and routes.

