# pgvector + Strict Validation Architecture

**Date**: December 10, 2025
**Status**: Design Document
**Goal**: Eliminate runtime errors, improve performance, enable semantic search

---

## 0. Dec 14, 2025 Validation Status

- **Multi-dataset ingestion still unverified** – `client/src/pages/data-step.tsx` and `data-verification-step.tsx` only surface the first dataset, so we have no assurance that joined tables respect the schema expected by pgvector-backed indices.
- **PII stripping not enforced server-side** – `filterDataPreviewColumns()` mutates UI state only, while every backend entry point (datasets, verification, transformation) continues to return raw columns; vector embeddings would therefore capture sensitive fields.
- **Transformation endpoint absent** – the React step posts to `/api/projects/:id/execute-transformations`, but the server only exposes `/api/transform-data/:projectId`, leaving joins/transforms unapplied and preventing normalized vectors from being generated.

Until these gaps close, the validation architecture below cannot be exercised end-to-end, because the upstream data contract is still unstable.

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Request → Zod.parse() → Validated Type → Handler → Zod.parse() → Response │
│                 ▲                                           │                │
│                 │ FAIL FAST                                 │                │
│                 │ (400 Bad Request)                         ▼                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SERVICE LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │ AgentService    │    │ AnalysisService │    │ QuestionService │        │
│   │                 │    │                 │    │                 │        │
│   │ Typed inputs    │    │ Typed inputs    │    │ Typed inputs    │        │
│   │ Typed outputs   │    │ Typed outputs   │    │ Typed outputs   │        │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│            │                      │                      │                  │
│            └──────────────────────┴──────────────────────┘                  │
│                                   │                                          │
│                                   ▼                                          │
│                    ┌─────────────────────────────┐                          │
│                    │    EmbeddingService         │                          │
│                    │                             │                          │
│                    │  embedText(text) → vector   │                          │
│                    │  embedBatch(texts) → vectors│                          │
│                    └─────────────────────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER (PostgreSQL + pgvector)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    NORMALIZED TABLES                                 │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  projects              questions              datasets               │   │
│  │  ├─ id (PK)            ├─ id (PK)             ├─ id (PK)            │   │
│  │  ├─ user_id (FK)       ├─ project_id (FK)     ├─ project_id (FK)    │   │
│  │  ├─ name               ├─ text                ├─ name               │   │
│  │  ├─ status (ENUM)      ├─ embedding (vector)  ├─ row_count          │   │
│  │  └─ created_at         ├─ complexity (ENUM)   ├─ column_count       │   │
│  │                        └─ created_at          └─ schema_id (FK)     │   │
│  │                                                                      │   │
│  │  agent_executions      analysis_results       insights              │   │
│  │  ├─ id (PK)            ├─ id (PK)             ├─ id (PK)            │   │
│  │  ├─ project_id (FK)    ├─ execution_id (FK)   ├─ result_id (FK)     │   │
│  │  ├─ agent_type (ENUM)  ├─ question_id (FK)    ├─ finding            │   │
│  │  ├─ status (ENUM)      ├─ analysis_type (ENUM)├─ embedding (vector) │   │
│  │  ├─ started_at         ├─ p_value             ├─ confidence         │   │
│  │  ├─ completed_at       ├─ coefficient         ├─ evidence_json      │   │
│  │  ├─ error_message      ├─ r_squared           └─ created_at         │   │
│  │  └─ tokens_used        ├─ confidence                                │   │
│  │                        └─ raw_output_json                           │   │
│  │                                                                      │   │
│  │  question_answers      evidence_chains                              │   │
│  │  ├─ id (PK)            ├─ id (PK)                                   │   │
│  │  ├─ question_id (FK)   ├─ answer_id (FK)                            │   │
│  │  ├─ answer_text        ├─ step_order                                │   │
│  │  ├─ embedding (vector) ├─ source_type (ENUM)                        │   │
│  │  ├─ confidence         ├─ source_id                                 │   │
│  │  ├─ sources[]          ├─ transformation                            │   │
│  │  └─ created_at         └─ output_summary                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    VECTOR INDEXES                                    │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  CREATE INDEX idx_questions_embedding ON questions                   │   │
│  │    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);  │   │
│  │                                                                      │   │
│  │  CREATE INDEX idx_insights_embedding ON insights                     │   │
│  │    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);  │   │
│  │                                                                      │   │
│  │  CREATE INDEX idx_answers_embedding ON question_answers              │   │
│  │    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Zod Validation Schemas

### 2.1 Core Enums (No Magic Strings)

```typescript
// shared/schemas/enums.ts

import { z } from 'zod';

export const AgentTypeEnum = z.enum([
  'project_manager',
  'data_engineer',
  'data_scientist',
  'business_agent',
  'template_research',
  'customer_support'
]);

export const ExecutionStatusEnum = z.enum([
  'pending',
  'running',
  'success',
  'partial',
  'failed',
  'cancelled'
]);

export const AnalysisTypeEnum = z.enum([
  'descriptive',
  'correlation',
  'regression',
  'classification',
  'clustering',
  'time_series',
  'hypothesis_test',
  'anomaly_detection'
]);

export const AudienceTypeEnum = z.enum([
  'non-tech',
  'business',
  'technical',
  'executive',
  'marketing'
]);

export const ComplexityEnum = z.enum(['low', 'medium', 'high']);

export const JourneyStepEnum = z.enum([
  'setup',
  'data',
  'verify',
  'transform',
  'plan',
  'execute',
  'results'
]);
```

### 2.2 Question Schema (with Embedding)

```typescript
// shared/schemas/question.ts

import { z } from 'zod';
import { ComplexityEnum, AnalysisTypeEnum } from './enums';

// Input validation (what API receives)
export const CreateQuestionInput = z.object({
  projectId: z.string().min(1).max(50),
  text: z.string().min(5).max(1000),
  context: z.string().max(2000).optional()
});

// Database record (what gets stored)
export const QuestionRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  text: z.string(),
  embedding: z.array(z.number()).length(1536).optional(), // OpenAI ada-002 dimension
  complexity: ComplexityEnum.optional(),
  recommendedAnalyses: z.array(AnalysisTypeEnum).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// API response (what gets returned)
export const QuestionResponse = QuestionRecord.omit({ embedding: true });

// Type exports
export type CreateQuestionInput = z.infer<typeof CreateQuestionInput>;
export type QuestionRecord = z.infer<typeof QuestionRecord>;
export type QuestionResponse = z.infer<typeof QuestionResponse>;
```

### 2.3 Agent Execution Schema

```typescript
// shared/schemas/agent-execution.ts

import { z } from 'zod';
import { AgentTypeEnum, ExecutionStatusEnum } from './enums';

// Discriminated union for agent-specific inputs
const DataEngineerInput = z.object({
  agentType: z.literal('data_engineer'),
  datasetIds: z.array(z.string()).min(1),
  validateSchema: z.boolean().default(true),
  detectPII: z.boolean().default(true)
});

const DataScientistInput = z.object({
  agentType: z.literal('data_scientist'),
  analysisTypes: z.array(z.string()).min(1),
  questions: z.array(z.string()),
  priorResultIds: z.array(z.string()).optional()
});

const BusinessAgentInput = z.object({
  agentType: z.literal('business_agent'),
  industryContext: z.string().optional(),
  complianceRequirements: z.array(z.string()).optional(),
  priorResultIds: z.array(z.string()).optional()
});

// Union type - TypeScript will narrow based on agentType
export const AgentExecutionInput = z.discriminatedUnion('agentType', [
  DataEngineerInput,
  DataScientistInput,
  BusinessAgentInput
]);

// Output schemas per agent type
const DataEngineerOutput = z.object({
  qualityScore: z.number().min(0).max(100),
  rowCount: z.number().int().positive(),
  columnCount: z.number().int().positive(),
  missingValuePercent: z.number().min(0).max(100),
  schemaIssues: z.array(z.object({
    column: z.string(),
    issue: z.string(),
    severity: z.enum(['low', 'medium', 'high'])
  })),
  piiDetected: z.array(z.object({
    column: z.string(),
    piiType: z.string(),
    confidence: z.number()
  }))
});

const DataScientistOutput = z.object({
  insights: z.array(z.object({
    id: z.string(),
    finding: z.string(),
    analysisType: z.string(),
    confidence: z.number().min(0).max(100),
    pValue: z.number().optional(),
    coefficient: z.number().optional(),
    rSquared: z.number().optional()
  })),
  visualizations: z.array(z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.unknown())
  })),
  modelArtifacts: z.array(z.object({
    id: z.string(),
    modelType: z.string(),
    metrics: z.record(z.number())
  })).optional()
});

const BusinessAgentOutput = z.object({
  validationPassed: z.boolean(),
  industryInsights: z.array(z.string()),
  complianceNotes: z.array(z.string()),
  recommendations: z.array(z.object({
    text: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
    category: z.string()
  }))
});

// Execution record
export const AgentExecutionRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  agentType: AgentTypeEnum,
  status: ExecutionStatusEnum,
  input: AgentExecutionInput,
  output: z.union([DataEngineerOutput, DataScientistOutput, BusinessAgentOutput]).nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  executionTimeMs: z.number().int().nullable(),
  tokensUsed: z.number().int().nullable()
});

export type AgentExecutionInput = z.infer<typeof AgentExecutionInput>;
export type AgentExecutionRecord = z.infer<typeof AgentExecutionRecord>;
export type DataEngineerOutput = z.infer<typeof DataEngineerOutput>;
export type DataScientistOutput = z.infer<typeof DataScientistOutput>;
export type BusinessAgentOutput = z.infer<typeof BusinessAgentOutput>;
```

### 2.4 Analysis Result Schema

```typescript
// shared/schemas/analysis-result.ts

import { z } from 'zod';
import { AnalysisTypeEnum } from './enums';

export const AnalysisResultRecord = z.object({
  id: z.string(),
  executionId: z.string(),
  questionId: z.string().nullable(), // Which question this answers
  analysisType: AnalysisTypeEnum,

  // Normalized statistical fields (not JSONB!)
  pValue: z.number().nullable(),
  coefficient: z.number().nullable(),
  rSquared: z.number().nullable(),
  confidenceIntervalLow: z.number().nullable(),
  confidenceIntervalHigh: z.number().nullable(),
  effectSize: z.number().nullable(),
  sampleSize: z.number().int().nullable(),

  // Confidence in result
  confidence: z.number().min(0).max(100),

  // Only use JSONB for truly variable data
  rawOutput: z.record(z.unknown()).optional(),

  createdAt: z.date()
});

export type AnalysisResultRecord = z.infer<typeof AnalysisResultRecord>;
```

### 2.5 Question Answer Schema

```typescript
// shared/schemas/question-answer.ts

import { z } from 'zod';

export const QuestionAnswerRecord = z.object({
  id: z.string(),
  questionId: z.string(),

  // The answer
  answerText: z.string().min(1).max(5000),
  embedding: z.array(z.number()).length(1536).optional(),

  // Quality metrics
  confidence: z.number().min(0).max(100),

  // Evidence chain references (proper FKs, not embedded JSON)
  sourceInsightIds: z.array(z.string()),
  sourceAnalysisIds: z.array(z.string()),

  // Metadata
  generatedBy: z.enum(['ai', 'template', 'manual']),
  modelUsed: z.string().optional(),

  createdAt: z.date(),
  updatedAt: z.date()
});

// Evidence chain entry
export const EvidenceChainEntry = z.object({
  id: z.string(),
  answerId: z.string(),
  stepOrder: z.number().int().min(1),
  sourceType: z.enum(['dataset', 'transformation', 'analysis', 'insight']),
  sourceId: z.string(),
  transformation: z.string().optional(), // What was done
  outputSummary: z.string() // Human-readable description
});

export type QuestionAnswerRecord = z.infer<typeof QuestionAnswerRecord>;
export type EvidenceChainEntry = z.infer<typeof EvidenceChainEntry>;
```

---

## 3. Database Schema (Normalized + pgvector)

### 3.1 Migration: Enable pgvector

```sql
-- migrations/010_enable_pgvector.sql

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 3.2 Migration: Normalized Tables

```sql
-- migrations/011_normalized_schema.sql

-- ============================================
-- QUESTIONS TABLE (normalized, with embedding)
-- ============================================
CREATE TABLE IF NOT EXISTS project_questions (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) >= 5 AND char_length(text) <= 1000),
  embedding vector(1536),  -- OpenAI ada-002 dimension
  complexity VARCHAR(10) CHECK (complexity IN ('low', 'medium', 'high')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_question_per_project UNIQUE (project_id, text)
);

CREATE INDEX idx_questions_project ON project_questions(project_id);
CREATE INDEX idx_questions_embedding ON project_questions
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- AGENT EXECUTIONS TABLE (replaces agent_results JSONB)
-- ============================================
CREATE TABLE IF NOT EXISTS agent_executions (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_type VARCHAR(30) NOT NULL CHECK (agent_type IN (
    'project_manager', 'data_engineer', 'data_scientist',
    'business_agent', 'template_research', 'customer_support'
  )),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'success', 'partial', 'failed', 'cancelled'
  )),

  -- Timestamps
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  execution_time_ms INTEGER,

  -- Resource tracking
  tokens_used INTEGER,
  model_used VARCHAR(100),

  -- Error handling
  error_message TEXT,
  error_code VARCHAR(50),

  -- References to prior executions this depends on
  depends_on_ids VARCHAR(50)[] DEFAULT '{}',

  CONSTRAINT valid_completion CHECK (
    (status IN ('pending', 'running') AND completed_at IS NULL) OR
    (status NOT IN ('pending', 'running') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_executions_project ON agent_executions(project_id);
CREATE INDEX idx_executions_project_agent ON agent_executions(project_id, agent_type);
CREATE INDEX idx_executions_status ON agent_executions(status) WHERE status = 'running';

-- ============================================
-- DATA ENGINEER OUTPUTS (normalized, not JSONB)
-- ============================================
CREATE TABLE IF NOT EXISTS de_quality_reports (
  id VARCHAR(50) PRIMARY KEY,
  execution_id VARCHAR(50) NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  dataset_id VARCHAR(50) NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,

  -- Quality metrics (queryable columns, not JSONB)
  quality_score NUMERIC(5,2) NOT NULL CHECK (quality_score >= 0 AND quality_score <= 100),
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  column_count INTEGER NOT NULL CHECK (column_count > 0),
  missing_value_percent NUMERIC(5,2) CHECK (missing_value_percent >= 0 AND missing_value_percent <= 100),
  duplicate_row_percent NUMERIC(5,2),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT one_report_per_execution_dataset UNIQUE (execution_id, dataset_id)
);

CREATE TABLE IF NOT EXISTS de_schema_issues (
  id VARCHAR(50) PRIMARY KEY,
  report_id VARCHAR(50) NOT NULL REFERENCES de_quality_reports(id) ON DELETE CASCADE,
  column_name VARCHAR(255) NOT NULL,
  issue_type VARCHAR(50) NOT NULL,
  issue_description TEXT NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  suggested_fix TEXT
);

CREATE TABLE IF NOT EXISTS de_pii_detections (
  id VARCHAR(50) PRIMARY KEY,
  report_id VARCHAR(50) NOT NULL REFERENCES de_quality_reports(id) ON DELETE CASCADE,
  column_name VARCHAR(255) NOT NULL,
  pii_type VARCHAR(50) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  sample_count INTEGER,
  handling_recommendation VARCHAR(50) CHECK (handling_recommendation IN ('mask', 'remove', 'encrypt', 'review'))
);

-- ============================================
-- DATA SCIENTIST OUTPUTS (normalized)
-- ============================================
CREATE TABLE IF NOT EXISTS ds_analysis_results (
  id VARCHAR(50) PRIMARY KEY,
  execution_id VARCHAR(50) NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,
  question_id VARCHAR(50) REFERENCES project_questions(id) ON DELETE SET NULL,

  -- Analysis metadata
  analysis_type VARCHAR(30) NOT NULL CHECK (analysis_type IN (
    'descriptive', 'correlation', 'regression', 'classification',
    'clustering', 'time_series', 'hypothesis_test', 'anomaly_detection'
  )),

  -- Statistical results (normalized columns, not JSONB!)
  p_value NUMERIC(10,8),
  coefficient NUMERIC(15,8),
  r_squared NUMERIC(5,4),
  confidence_interval_low NUMERIC(15,8),
  confidence_interval_high NUMERIC(15,8),
  effect_size NUMERIC(10,6),
  sample_size INTEGER,
  degrees_of_freedom INTEGER,

  -- Quality
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),

  -- Only truly variable data in JSONB
  additional_metrics JSONB DEFAULT '{}',

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analysis_execution ON ds_analysis_results(execution_id);
CREATE INDEX idx_analysis_question ON ds_analysis_results(question_id);
CREATE INDEX idx_analysis_type ON ds_analysis_results(analysis_type);
CREATE INDEX idx_analysis_confidence ON ds_analysis_results(confidence);

-- ============================================
-- INSIGHTS TABLE (with embeddings for semantic search)
-- ============================================
CREATE TABLE IF NOT EXISTS insights (
  id VARCHAR(50) PRIMARY KEY,
  analysis_result_id VARCHAR(50) NOT NULL REFERENCES ds_analysis_results(id) ON DELETE CASCADE,

  -- The insight text
  finding TEXT NOT NULL,
  embedding vector(1536),  -- For semantic search

  -- Quality
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  impact VARCHAR(10) CHECK (impact IN ('low', 'medium', 'high')),

  -- Categorization
  category VARCHAR(50),
  tags TEXT[],

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insights_result ON insights(analysis_result_id);
CREATE INDEX idx_insights_embedding ON insights
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_insights_confidence ON insights(confidence DESC);

-- ============================================
-- QUESTION ANSWERS (with embeddings)
-- ============================================
CREATE TABLE IF NOT EXISTS question_answers (
  id VARCHAR(50) PRIMARY KEY,
  question_id VARCHAR(50) NOT NULL REFERENCES project_questions(id) ON DELETE CASCADE,

  -- Answer content
  answer_text TEXT NOT NULL,
  embedding vector(1536),

  -- Quality
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),

  -- Generation metadata
  generated_by VARCHAR(20) NOT NULL CHECK (generated_by IN ('ai', 'template', 'manual')),
  model_used VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT one_answer_per_question UNIQUE (question_id)
);

CREATE INDEX idx_answers_question ON question_answers(question_id);
CREATE INDEX idx_answers_embedding ON question_answers
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- EVIDENCE CHAIN (proper relational, not embedded JSON)
-- ============================================
CREATE TABLE IF NOT EXISTS evidence_chain (
  id VARCHAR(50) PRIMARY KEY,
  answer_id VARCHAR(50) NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),

  -- What type of source
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN (
    'dataset', 'transformation', 'analysis', 'insight', 'model'
  )),
  source_id VARCHAR(50) NOT NULL,

  -- What happened at this step
  transformation_description TEXT,
  output_summary TEXT NOT NULL,

  CONSTRAINT unique_step_per_answer UNIQUE (answer_id, step_order)
);

CREATE INDEX idx_evidence_answer ON evidence_chain(answer_id);

-- Link insights to answers (many-to-many)
CREATE TABLE IF NOT EXISTS answer_insights (
  answer_id VARCHAR(50) NOT NULL REFERENCES question_answers(id) ON DELETE CASCADE,
  insight_id VARCHAR(50) NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  relevance_score NUMERIC(5,4),
  PRIMARY KEY (answer_id, insight_id)
);
```

---

## 4. Embedding Service

### 4.1 Service Implementation

```typescript
// server/services/embedding-service.ts

import { z } from 'zod';

// Validate embedding dimensions
const EmbeddingVector = z.array(z.number()).length(1536);

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokensUsed: number;
}

class EmbeddingService {
  private model = 'text-embedding-ada-002';
  private dimension = 1536;

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string): Promise<EmbeddingResult> {
    // Validate input
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Truncate if too long (ada-002 has 8191 token limit)
    const truncatedText = text.slice(0, 30000);

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          input: truncatedText
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;

      // Validate embedding dimension
      EmbeddingVector.parse(embedding);

      return {
        text: truncatedText,
        embedding,
        model: this.model,
        tokensUsed: data.usage.total_tokens
      };
    } catch (error) {
      console.error('Embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    // OpenAI allows up to 2048 texts per batch
    const batchSize = 100;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const truncatedBatch = batch.map(t => t.slice(0, 30000));

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          input: truncatedBatch
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();

      for (let j = 0; j < data.data.length; j++) {
        results.push({
          text: truncatedBatch[j],
          embedding: data.data[j].embedding,
          model: this.model,
          tokensUsed: Math.ceil(data.usage.total_tokens / truncatedBatch.length)
        });
      }
    }

    return results;
  }
}

export const embeddingService = new EmbeddingService();
```

### 4.2 Semantic Search Functions

```typescript
// server/services/semantic-search.ts

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { embeddingService } from './embedding-service';

export interface SemanticSearchResult {
  id: string;
  text: string;
  similarity: number;
  metadata?: Record<string, any>;
}

class SemanticSearchService {

  /**
   * Find questions similar to a query
   */
  async findSimilarQuestions(
    query: string,
    projectId: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    // Generate embedding for query
    const { embedding } = await embeddingService.embedText(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    // Query with cosine similarity
    const results = await db.execute(sql`
      SELECT
        id,
        text,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM project_questions
      WHERE project_id = ${projectId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);

    return (results.rows || []).map(row => ({
      id: row.id as string,
      text: row.text as string,
      similarity: row.similarity as number
    }));
  }

  /**
   * Find insights relevant to a question
   */
  async findRelevantInsights(
    question: string,
    projectId: string,
    limit: number = 10
  ): Promise<SemanticSearchResult[]> {
    const { embedding } = await embeddingService.embedText(question);
    const embeddingStr = `[${embedding.join(',')}]`;

    const results = await db.execute(sql`
      SELECT
        i.id,
        i.finding as text,
        1 - (i.embedding <=> ${embeddingStr}::vector) as similarity,
        i.confidence,
        ar.analysis_type
      FROM insights i
      JOIN ds_analysis_results ar ON i.analysis_result_id = ar.id
      JOIN agent_executions ae ON ar.execution_id = ae.id
      WHERE ae.project_id = ${projectId}
        AND i.embedding IS NOT NULL
      ORDER BY i.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);

    return (results.rows || []).map(row => ({
      id: row.id as string,
      text: row.text as string,
      similarity: row.similarity as number,
      metadata: {
        confidence: row.confidence,
        analysisType: row.analysis_type
      }
    }));
  }

  /**
   * Find similar past analyses (for reuse/reference)
   */
  async findSimilarAnalyses(
    description: string,
    excludeProjectId?: string,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    const { embedding } = await embeddingService.embedText(description);
    const embeddingStr = `[${embedding.join(',')}]`;

    let whereClause = sql`i.embedding IS NOT NULL`;
    if (excludeProjectId) {
      whereClause = sql`${whereClause} AND ae.project_id != ${excludeProjectId}`;
    }

    const results = await db.execute(sql`
      SELECT DISTINCT ON (ae.project_id)
        i.id,
        i.finding as text,
        1 - (i.embedding <=> ${embeddingStr}::vector) as similarity,
        ae.project_id
      FROM insights i
      JOIN ds_analysis_results ar ON i.analysis_result_id = ar.id
      JOIN agent_executions ae ON ar.execution_id = ae.id
      WHERE ${whereClause}
      ORDER BY ae.project_id, i.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);

    return (results.rows || []).map(row => ({
      id: row.id as string,
      text: row.text as string,
      similarity: row.similarity as number,
      metadata: {
        projectId: row.project_id
      }
    }));
  }
}

export const semanticSearchService = new SemanticSearchService();
```

---

## 5. Validation Middleware

### 5.1 Request Validation Middleware

```typescript
// server/middleware/validate.ts

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validate request body against Zod schema
 * Fails fast with detailed error messages
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse will throw if invalid
      const validated = schema.parse(req.body);

      // Replace body with validated (and potentially transformed) data
      req.body = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
            code: e.code
          }))
        });
      }

      next(error);
    }
  };
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
}

/**
 * Validate route parameters
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid route parameters',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
}
```

### 5.2 Response Validation (Optional but Recommended)

```typescript
// server/middleware/validate-response.ts

import { Response } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Wrap res.json to validate outgoing data
 * Catches bugs where we send malformed responses
 */
export function validateResponse<T>(schema: ZodSchema<T>, res: Response, data: unknown): void {
  try {
    const validated = schema.parse(data);
    res.json({ success: true, data: validated });
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('Response validation failed:', error.errors);
      // In production, you might want to send a generic error
      // In development, send the validation details
      if (process.env.NODE_ENV === 'development') {
        res.status(500).json({
          success: false,
          error: 'Internal error: Response validation failed',
          details: error.errors
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    } else {
      throw error;
    }
  }
}
```

---

## 6. Updated Agent Coordination Service

```typescript
// server/services/agent-coordination-service-v2.ts

import { z } from 'zod';
import { db } from '../db';
import { nanoid } from 'nanoid';
import { embeddingService } from './embedding-service';
import { semanticSearchService } from './semantic-search';
import {
  AgentExecutionInput,
  AgentExecutionRecord,
  DataEngineerOutput,
  DataScientistOutput
} from '@shared/schemas/agent-execution';
import { sql } from 'drizzle-orm';

// Strict input validation
const WorkflowStartInput = z.object({
  projectId: z.string().min(1).max(50),
  userId: z.string().min(1).max(50),
  goals: z.array(z.string().min(1).max(500)).min(1).max(10),
  questions: z.array(z.string().min(5).max(1000)).max(20),
  analysisTypes: z.array(z.string()).min(1),
  audience: z.enum(['non-tech', 'business', 'technical', 'executive']).optional()
});

type WorkflowStartInput = z.infer<typeof WorkflowStartInput>;

class AgentCoordinationServiceV2 {

  /**
   * Start workflow with strict validation
   */
  async startWorkflow(input: unknown): Promise<{ workflowId: string; status: string }> {
    // FAIL FAST: Validate input immediately
    const validated = WorkflowStartInput.parse(input);

    const workflowId = nanoid();

    // Store questions with embeddings
    await this.storeQuestionsWithEmbeddings(validated.projectId, validated.questions);

    // Start execution chain
    const deExecution = await this.startDataEngineerExecution(validated);

    return { workflowId, status: 'started' };
  }

  /**
   * Store questions and generate embeddings
   */
  private async storeQuestionsWithEmbeddings(projectId: string, questions: string[]): Promise<void> {
    // Generate embeddings in batch
    const embeddings = await embeddingService.embedBatch(questions);

    // Insert with embeddings
    for (let i = 0; i < questions.length; i++) {
      const id = `q_${projectId}_${i}`;
      const embeddingStr = `[${embeddings[i].embedding.join(',')}]`;

      await db.execute(sql`
        INSERT INTO project_questions (id, project_id, text, embedding, created_at, updated_at)
        VALUES (${id}, ${projectId}, ${questions[i]}, ${embeddingStr}::vector, NOW(), NOW())
        ON CONFLICT (project_id, text) DO UPDATE SET updated_at = NOW()
      `);
    }
  }

  /**
   * Start Data Engineer execution with typed output
   */
  private async startDataEngineerExecution(input: WorkflowStartInput): Promise<string> {
    const executionId = nanoid();

    // Create execution record
    await db.execute(sql`
      INSERT INTO agent_executions (id, project_id, agent_type, status, started_at)
      VALUES (${executionId}, ${input.projectId}, 'data_engineer', 'running', NOW())
    `);

    try {
      // Run DE analysis...
      const deOutput: DataEngineerOutput = await this.runDataEngineerAnalysis(input.projectId);

      // Validate output before storing
      const validatedOutput = z.object({
        qualityScore: z.number(),
        rowCount: z.number(),
        columnCount: z.number(),
        missingValuePercent: z.number(),
        schemaIssues: z.array(z.any()),
        piiDetected: z.array(z.any())
      }).parse(deOutput);

      // Store in normalized tables (not JSONB!)
      await this.storeDataEngineerResults(executionId, input.projectId, validatedOutput);

      // Mark complete
      await db.execute(sql`
        UPDATE agent_executions
        SET status = 'success', completed_at = NOW()
        WHERE id = ${executionId}
      `);

      return executionId;

    } catch (error: any) {
      // Store error
      await db.execute(sql`
        UPDATE agent_executions
        SET status = 'failed', completed_at = NOW(), error_message = ${error.message}
        WHERE id = ${executionId}
      `);
      throw error;
    }
  }

  /**
   * Find relevant insights for answering a question using semantic search
   */
  async findInsightsForQuestion(projectId: string, questionText: string): Promise<any[]> {
    // Use vector similarity to find relevant insights
    const relevantInsights = await semanticSearchService.findRelevantInsights(
      questionText,
      projectId,
      10
    );

    // Filter by similarity threshold
    return relevantInsights.filter(i => i.similarity > 0.7);
  }

  // ... implementation methods

  private async runDataEngineerAnalysis(projectId: string): Promise<DataEngineerOutput> {
    // Actual implementation...
    return {
      qualityScore: 85,
      rowCount: 1000,
      columnCount: 15,
      missingValuePercent: 5.2,
      schemaIssues: [],
      piiDetected: []
    };
  }

  private async storeDataEngineerResults(
    executionId: string,
    projectId: string,
    output: any
  ): Promise<void> {
    // Get dataset ID
    const datasets = await db.execute(sql`
      SELECT d.id FROM datasets d
      JOIN project_datasets pd ON d.id = pd.dataset_id
      WHERE pd.project_id = ${projectId}
      LIMIT 1
    `);

    const datasetId = datasets.rows?.[0]?.id;
    if (!datasetId) return;

    // Insert into normalized table
    await db.execute(sql`
      INSERT INTO de_quality_reports (
        id, execution_id, dataset_id, quality_score, row_count,
        column_count, missing_value_percent, created_at
      ) VALUES (
        ${nanoid()}, ${executionId}, ${datasetId}, ${output.qualityScore},
        ${output.rowCount}, ${output.columnCount}, ${output.missingValuePercent}, NOW()
      )
    `);

    // Insert schema issues into separate table
    for (const issue of output.schemaIssues) {
      await db.execute(sql`
        INSERT INTO de_schema_issues (id, report_id, column_name, issue_type, issue_description, severity)
        VALUES (${nanoid()}, ${executionId}, ${issue.column}, ${issue.issue}, ${issue.issue}, ${issue.severity})
      `);
    }

    // Insert PII detections into separate table
    for (const pii of output.piiDetected) {
      await db.execute(sql`
        INSERT INTO de_pii_detections (id, report_id, column_name, pii_type, confidence)
        VALUES (${nanoid()}, ${executionId}, ${pii.column}, ${pii.piiType}, ${pii.confidence})
      `);
    }
  }
}

export const agentCoordinationServiceV2 = new AgentCoordinationServiceV2();
```

---

## 7. Performance Comparison

| Operation | Current (JSONB) | New (Normalized + pgvector) |
|-----------|-----------------|------------------------------|
| Find question by text | Full table scan | Index lookup |
| Find similar questions | N/A | Vector index O(log n) |
| Get agent results | Parse entire JSONB | Direct column read |
| Query by p-value | Parse all JSONB, filter | Index scan on column |
| Find relevant insights | Keyword match | Semantic similarity |
| Update single field | Rewrite entire JSONB | Update single column |
| Validate data | Runtime (maybe) | Write-time constraint |

---

## 8. Migration Plan

### Phase 1: Enable pgvector (Day 1)
```bash
# Run in production PostgreSQL
psql -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Phase 2: Create New Tables (Day 1-2)
```bash
npm run db:migrate -- --file=011_normalized_schema.sql
```

### Phase 3: Add Zod Validation (Day 2-3)
- Create schema files in `shared/schemas/`
- Add validation middleware to all routes
- Run type check: `npm run check`

### Phase 4: Migrate Existing Data (Day 3-4)
```typescript
// scripts/migrate-to-normalized.ts
async function migrateAgentResults() {
  const oldResults = await db.query('SELECT * FROM agent_results');

  for (const old of oldResults) {
    // Parse JSONB
    const input = JSON.parse(old.input);
    const output = JSON.parse(old.output);

    // Insert into new tables
    await insertAgentExecution(old, input);
    await insertTypedOutput(old.agent_type, output);
  }
}
```

### Phase 5: Generate Embeddings (Day 4-5)
```typescript
// scripts/generate-embeddings.ts
async function generateAllEmbeddings() {
  // Questions
  const questions = await db.query('SELECT id, text FROM project_questions WHERE embedding IS NULL');
  for (const q of questions) {
    const { embedding } = await embeddingService.embedText(q.text);
    await db.query('UPDATE project_questions SET embedding = $1 WHERE id = $2', [embedding, q.id]);
  }

  // Insights
  const insights = await db.query('SELECT id, finding FROM insights WHERE embedding IS NULL');
  // ... same pattern
}
```

### Phase 6: Switch Services (Day 5-6)
- Update AgentCoordinationService to V2
- Update routes to use validation middleware
- Run full test suite

### Phase 7: Remove Old Tables (Day 7)
```sql
-- After confirming everything works
DROP TABLE IF EXISTS agent_results;
```

---

## 9. Cost Estimate

| Item | Cost |
|------|------|
| pgvector extension | Free (PostgreSQL extension) |
| OpenAI Embeddings | ~$0.0001 per 1K tokens |
| Estimated embeddings for 10K questions | ~$1-2 |
| Estimated embeddings for 50K insights | ~$5-10 |
| Development time | 5-7 days |

---

## 10. Summary

**What This Gives You:**

1. **Fail-fast validation** - Bad data rejected at API boundary
2. **Type safety** - Discriminated unions ensure correct data shapes
3. **Queryable data** - p-values, confidence in columns, not buried in JSON
4. **Semantic search** - Find relevant insights by meaning, not keywords
5. **Evidence chains** - Proper FK relationships, not embedded arrays
6. **Performance** - Vector indexes for similarity, B-tree for equality

**What This Requires:**

1. pgvector extension enabled
2. OpenAI API key for embeddings
3. Migration of existing data
4. Updated services to use new schemas

Ready to proceed with implementation?
