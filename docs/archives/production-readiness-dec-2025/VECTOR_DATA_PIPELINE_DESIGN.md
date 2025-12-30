# Vector-Based Data Pipeline Design

**Date**: December 11, 2025
**Status**: Design Document
**Goal**: Create semantic linkage from questions → data elements → transformations → analysis

---

## 1. The Problem

Currently, the data pipeline suffers from:

1. **Disconnected mappings**: Questions, data elements, and transformations exist in separate silos
2. **Keyword-based matching**: `relatedQuestions` relies on brittle string matching
3. **Lost context**: When multiple datasets are uploaded, join relationships aren't semantically inferred
4. **No traceability**: Hard to answer "which transformations are needed for this question?"

## 2. Solution: Vector-Based Semantic Pipeline

Use embeddings to create semantic linkages throughout the data pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         VECTOR-BASED DATA PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐              │
│  │  User Question │     │  Data Element  │     │ Transformation │              │
│  │  "What is the  │     │  "employee_id" │     │  "Join on      │              │
│  │   engagement   │     │  Purpose: Link │     │   employee_id" │              │
│  │   by dept?"    │     │  employees to  │     │                │              │
│  │                │     │  departments   │     │                │              │
│  │  embedding:    │     │  embedding:    │     │  embedding:    │              │
│  │  [0.12, 0.45]  │     │  [0.15, 0.42]  │     │  [0.14, 0.44]  │              │
│  └───────┬────────┘     └───────┬────────┘     └───────┬────────┘              │
│          │                      │                      │                        │
│          └──────────────────────┴──────────────────────┘                        │
│                                 │                                                │
│                    ┌────────────▼────────────┐                                  │
│                    │   COSINE SIMILARITY     │                                  │
│                    │                         │                                  │
│                    │   Q → E: 0.89 (HIGH)    │                                  │
│                    │   E → T: 0.92 (HIGH)    │                                  │
│                    │   Q → T: 0.87 (HIGH)    │                                  │
│                    └────────────┬────────────┘                                  │
│                                 │                                                │
│                    ┌────────────▼────────────┐                                  │
│                    │   SEMANTIC EVIDENCE     │                                  │
│                    │        CHAIN            │                                  │
│                    │                         │                                  │
│                    │   Question → Element    │                                  │
│                    │   → Transform → Result  │                                  │
│                    └─────────────────────────┘                                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 3. New Database Tables

### 3.1 data_elements (Semantic Registry)

```sql
CREATE TABLE IF NOT EXISTS data_elements (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,

  -- Element identity
  element_name VARCHAR(255) NOT NULL,
  element_type VARCHAR(50) NOT NULL, -- 'dimension', 'measure', 'key', 'attribute'
  data_type VARCHAR(50) NOT NULL,    -- 'string', 'number', 'date', 'boolean'

  -- Semantic description (for embedding)
  semantic_description TEXT NOT NULL,
  embedding JSONB,  -- vector(1536) stored as JSONB for compatibility

  -- Source mapping
  source_dataset_id VARCHAR(50) REFERENCES datasets(id),
  source_column VARCHAR(255),
  is_available BOOLEAN DEFAULT FALSE,

  -- Analysis context
  analysis_roles TEXT[],  -- ['grouping', 'aggregation', 'filtering']

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_data_elements_project ON data_elements(project_id);
CREATE INDEX idx_data_elements_type ON data_elements(element_type);
```

### 3.2 transformation_definitions (Semantic Registry)

```sql
CREATE TABLE IF NOT EXISTS transformation_definitions (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,

  -- Transformation identity
  transformation_name VARCHAR(255) NOT NULL,
  transformation_type VARCHAR(50) NOT NULL, -- 'join', 'aggregate', 'filter', 'derive', 'clean'

  -- Semantic description (for embedding)
  semantic_description TEXT NOT NULL,
  embedding JSONB,

  -- Configuration
  source_elements TEXT[],  -- element IDs this transformation uses
  target_elements TEXT[],  -- element IDs this transformation produces
  config JSONB,            -- transformation-specific configuration

  -- Execution order
  execution_order INTEGER,
  depends_on TEXT[],       -- transformation IDs that must run first

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'ready', 'applied', 'failed'

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transformations_project ON transformation_definitions(project_id);
CREATE INDEX idx_transformations_type ON transformation_definitions(transformation_type);
```

### 3.3 question_element_links (Semantic Mapping)

```sql
CREATE TABLE IF NOT EXISTS question_element_links (
  id VARCHAR(50) PRIMARY KEY,
  question_id VARCHAR(50) REFERENCES project_questions(id) ON DELETE CASCADE,
  element_id VARCHAR(50) REFERENCES data_elements(id) ON DELETE CASCADE,

  -- Semantic similarity score
  similarity_score NUMERIC(5,4) NOT NULL,

  -- Link type
  link_type VARCHAR(50) NOT NULL, -- 'requires', 'aggregates', 'filters_by', 'groups_by'

  -- AI reasoning
  reasoning TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_question_element UNIQUE (question_id, element_id)
);

CREATE INDEX idx_qel_question ON question_element_links(question_id);
CREATE INDEX idx_qel_element ON question_element_links(element_id);
CREATE INDEX idx_qel_similarity ON question_element_links(similarity_score DESC);
```

### 3.4 element_transformation_links (Semantic Mapping)

```sql
CREATE TABLE IF NOT EXISTS element_transformation_links (
  id VARCHAR(50) PRIMARY KEY,
  element_id VARCHAR(50) REFERENCES data_elements(id) ON DELETE CASCADE,
  transformation_id VARCHAR(50) REFERENCES transformation_definitions(id) ON DELETE CASCADE,

  -- Semantic similarity score
  similarity_score NUMERIC(5,4) NOT NULL,

  -- Link type
  link_type VARCHAR(50) NOT NULL, -- 'input', 'output', 'condition'

  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_element_transformation UNIQUE (element_id, transformation_id, link_type)
);
```

## 4. Semantic Pipeline Service

### 4.1 Core Service

```typescript
// server/services/semantic-data-pipeline.ts

import { embeddingService } from './embedding-service';
import { semanticSearchService } from './semantic-search-service';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

interface DataElement {
  id: string;
  elementName: string;
  elementType: 'dimension' | 'measure' | 'key' | 'attribute';
  dataType: string;
  semanticDescription: string;
  sourceDatasetId?: string;
  sourceColumn?: string;
  analysisRoles: string[];
}

interface TransformationDefinition {
  id: string;
  transformationName: string;
  transformationType: 'join' | 'aggregate' | 'filter' | 'derive' | 'clean';
  semanticDescription: string;
  sourceElements: string[];
  targetElements: string[];
  config: any;
}

export class SemanticDataPipelineService {

  /**
   * Phase 1: Extract semantic data elements from datasets
   * Creates embeddings for each column based on name + inferred purpose
   */
  async extractDataElements(
    projectId: string,
    datasets: Array<{ id: string; schema: Record<string, any>; preview: any[] }>
  ): Promise<DataElement[]> {
    const elements: DataElement[] = [];

    for (const dataset of datasets) {
      for (const [columnName, columnType] of Object.entries(dataset.schema)) {
        // Generate semantic description
        const semanticDesc = await this.generateElementDescription(
          columnName,
          columnType,
          dataset.preview
        );

        const element: DataElement = {
          id: `elem_${nanoid(10)}`,
          elementName: columnName,
          elementType: this.inferElementType(columnName, columnType),
          dataType: this.normalizeDataType(columnType),
          semanticDescription: semanticDesc,
          sourceDatasetId: dataset.id,
          sourceColumn: columnName,
          analysisRoles: this.inferAnalysisRoles(columnName, columnType)
        };

        elements.push(element);
      }
    }

    // Generate embeddings for all elements
    const descriptions = elements.map(e => e.semanticDescription);
    const embeddings = await embeddingService.embedBatch(descriptions);

    // Store elements with embeddings
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const embedding = embeddings[i].embedding;

      await db.execute(sql`
        INSERT INTO data_elements (
          id, project_id, element_name, element_type, data_type,
          semantic_description, embedding, source_dataset_id, source_column,
          is_available, analysis_roles
        ) VALUES (
          ${element.id}, ${projectId}, ${element.elementName},
          ${element.elementType}, ${element.dataType},
          ${element.semanticDescription}, ${JSON.stringify(embedding)},
          ${element.sourceDatasetId}, ${element.sourceColumn},
          true, ${element.analysisRoles}
        )
        ON CONFLICT (id) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          updated_at = NOW()
      `);
    }

    return elements;
  }

  /**
   * Phase 2: Link questions to data elements semantically
   */
  async linkQuestionsToElements(
    projectId: string,
    questions: Array<{ id: string; text: string; embedding?: number[] }>
  ): Promise<void> {
    // Get all data elements for this project
    const elements = await db.execute(sql`
      SELECT id, element_name, semantic_description, embedding
      FROM data_elements
      WHERE project_id = ${projectId}
    `);

    for (const question of questions) {
      // Generate embedding if not present
      let questionEmbedding = question.embedding;
      if (!questionEmbedding) {
        const result = await embeddingService.embedText(question.text);
        questionEmbedding = result.embedding;

        // Store the embedding
        await db.execute(sql`
          UPDATE project_questions
          SET embedding = ${JSON.stringify(questionEmbedding)}
          WHERE id = ${question.id}
        `);
      }

      // Calculate similarity with each element
      for (const element of elements.rows || []) {
        const elementEmbedding = JSON.parse(element.embedding as string);
        const similarity = this.cosineSimilarity(questionEmbedding, elementEmbedding);

        // Only link if similarity is above threshold
        if (similarity >= 0.6) {
          const linkType = this.inferLinkType(question.text, element.element_name as string);

          await db.execute(sql`
            INSERT INTO question_element_links (
              id, question_id, element_id, similarity_score, link_type
            ) VALUES (
              ${nanoid()}, ${question.id}, ${element.id}, ${similarity}, ${linkType}
            )
            ON CONFLICT (question_id, element_id) DO UPDATE SET
              similarity_score = EXCLUDED.similarity_score,
              link_type = EXCLUDED.link_type
          `);
        }
      }
    }
  }

  /**
   * Phase 3: Infer required transformations from elements and questions
   */
  async inferTransformations(
    projectId: string,
    questions: Array<{ id: string; text: string }>
  ): Promise<TransformationDefinition[]> {
    const transformations: TransformationDefinition[] = [];

    // Get linked elements for each question
    const questionElements = await db.execute(sql`
      SELECT
        q.id as question_id,
        q.question_text,
        de.id as element_id,
        de.element_name,
        de.source_dataset_id,
        de.element_type,
        qel.link_type,
        qel.similarity_score
      FROM project_questions q
      JOIN question_element_links qel ON q.id = qel.question_id
      JOIN data_elements de ON qel.element_id = de.id
      WHERE q.project_id = ${projectId}
      ORDER BY q.id, qel.similarity_score DESC
    `);

    // Group by question to analyze transformation needs
    const questionGroups = this.groupBy(questionElements.rows || [], 'question_id');

    for (const [questionId, elements] of Object.entries(questionGroups)) {
      const question = questions.find(q => q.id === questionId);
      if (!question) continue;

      // Check if elements span multiple datasets (need join)
      const datasetIds = new Set((elements as any[]).map(e => e.source_dataset_id));
      if (datasetIds.size > 1) {
        const joinTransform = await this.createJoinTransformation(
          projectId,
          elements as any[],
          question.text
        );
        if (joinTransform) transformations.push(joinTransform);
      }

      // Check if aggregation is needed based on question text
      if (this.needsAggregation(question.text)) {
        const aggTransform = await this.createAggregationTransformation(
          projectId,
          elements as any[],
          question.text
        );
        if (aggTransform) transformations.push(aggTransform);
      }

      // Check if filtering is needed
      if (this.needsFiltering(question.text)) {
        const filterTransform = await this.createFilterTransformation(
          projectId,
          elements as any[],
          question.text
        );
        if (filterTransform) transformations.push(filterTransform);
      }
    }

    // Store transformations with embeddings
    for (const transform of transformations) {
      const { embedding } = await embeddingService.embedText(transform.semanticDescription);

      await db.execute(sql`
        INSERT INTO transformation_definitions (
          id, project_id, transformation_name, transformation_type,
          semantic_description, embedding, source_elements, target_elements,
          config, status
        ) VALUES (
          ${transform.id}, ${projectId}, ${transform.transformationName},
          ${transform.transformationType}, ${transform.semanticDescription},
          ${JSON.stringify(embedding)}, ${transform.sourceElements},
          ${transform.targetElements}, ${JSON.stringify(transform.config)}, 'pending'
        )
        ON CONFLICT (id) DO NOTHING
      `);

      // Link elements to transformation
      for (const elemId of transform.sourceElements) {
        await db.execute(sql`
          INSERT INTO element_transformation_links (
            id, element_id, transformation_id, similarity_score, link_type
          ) VALUES (${nanoid()}, ${elemId}, ${transform.id}, 1.0, 'input')
          ON CONFLICT DO NOTHING
        `);
      }
    }

    return transformations;
  }

  /**
   * Phase 4: Build complete evidence chain
   */
  async buildEvidenceChain(projectId: string, questionId: string): Promise<any> {
    const chain = await db.execute(sql`
      WITH question_data AS (
        SELECT id, question_text FROM project_questions WHERE id = ${questionId}
      ),
      linked_elements AS (
        SELECT
          de.id as element_id,
          de.element_name,
          de.source_dataset_id,
          de.source_column,
          qel.similarity_score as element_relevance,
          qel.link_type
        FROM question_element_links qel
        JOIN data_elements de ON qel.element_id = de.id
        WHERE qel.question_id = ${questionId}
        ORDER BY qel.similarity_score DESC
      ),
      required_transforms AS (
        SELECT
          td.id as transformation_id,
          td.transformation_name,
          td.transformation_type,
          td.config,
          td.status,
          etl.element_id as linked_element_id,
          etl.similarity_score as transform_relevance
        FROM element_transformation_links etl
        JOIN transformation_definitions td ON etl.transformation_id = td.id
        WHERE etl.element_id IN (SELECT element_id FROM linked_elements)
          AND td.project_id = ${projectId}
      )
      SELECT
        (SELECT json_build_object('id', id, 'text', question_text) FROM question_data) as question,
        json_agg(DISTINCT jsonb_build_object(
          'elementId', le.element_id,
          'elementName', le.element_name,
          'sourceDataset', le.source_dataset_id,
          'sourceColumn', le.source_column,
          'relevance', le.element_relevance,
          'linkType', le.link_type
        )) as elements,
        json_agg(DISTINCT jsonb_build_object(
          'transformationId', rt.transformation_id,
          'name', rt.transformation_name,
          'type', rt.transformation_type,
          'config', rt.config,
          'status', rt.status
        )) FILTER (WHERE rt.transformation_id IS NOT NULL) as transformations
      FROM linked_elements le
      LEFT JOIN required_transforms rt ON le.element_id = rt.linked_element_id
    `);

    return chain.rows?.[0] || null;
  }

  /**
   * Get transformation plan for entire project
   */
  async getTransformationPlan(projectId: string): Promise<any> {
    const plan = await db.execute(sql`
      SELECT
        td.id,
        td.transformation_name,
        td.transformation_type,
        td.semantic_description,
        td.source_elements,
        td.target_elements,
        td.config,
        td.status,
        td.execution_order,
        td.depends_on,
        -- Get linked questions
        array_agg(DISTINCT pq.question_text) FILTER (WHERE pq.id IS NOT NULL) as related_questions
      FROM transformation_definitions td
      LEFT JOIN element_transformation_links etl ON td.id = etl.transformation_id
      LEFT JOIN question_element_links qel ON etl.element_id = qel.element_id
      LEFT JOIN project_questions pq ON qel.question_id = pq.id
      WHERE td.project_id = ${projectId}
      GROUP BY td.id
      ORDER BY td.execution_order NULLS LAST
    `);

    return plan.rows || [];
  }

  // ============ Helper Methods ============

  private async generateElementDescription(
    columnName: string,
    columnType: any,
    preview: any[]
  ): Promise<string> {
    // Build semantic description from column name, type, and sample values
    const typeName = typeof columnType === 'string' ? columnType : columnType?.type || 'unknown';
    const sampleValues = preview
      .slice(0, 5)
      .map(row => row?.[columnName])
      .filter(v => v !== null && v !== undefined)
      .slice(0, 3);

    // Convert column name to readable format
    const readableName = columnName
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();

    let description = `Data column "${readableName}" of type ${typeName}`;

    // Add context based on name patterns
    if (columnName.toLowerCase().includes('id')) {
      description += '. This is likely a unique identifier or foreign key for linking records.';
    } else if (columnName.toLowerCase().includes('date') || columnName.toLowerCase().includes('time')) {
      description += '. This represents temporal data for time-based analysis.';
    } else if (columnName.toLowerCase().includes('amount') || columnName.toLowerCase().includes('price') || columnName.toLowerCase().includes('cost')) {
      description += '. This is a monetary or quantity measure suitable for aggregation.';
    } else if (columnName.toLowerCase().includes('name') || columnName.toLowerCase().includes('title')) {
      description += '. This is a descriptive text field for labeling or categorization.';
    } else if (sampleValues.length > 0) {
      const uniqueSamples = [...new Set(sampleValues)];
      if (uniqueSamples.length <= 5 && typeof sampleValues[0] === 'string') {
        description += `. Sample values: ${uniqueSamples.join(', ')}.`;
      }
    }

    return description;
  }

  private inferElementType(columnName: string, columnType: any): 'dimension' | 'measure' | 'key' | 'attribute' {
    const name = columnName.toLowerCase();
    const type = typeof columnType === 'string' ? columnType : columnType?.type || '';

    if (name.includes('id') || name.endsWith('_id') || name.includes('key')) {
      return 'key';
    }

    if (type.includes('number') || type.includes('int') || type.includes('float') ||
        name.includes('amount') || name.includes('count') || name.includes('total') ||
        name.includes('sum') || name.includes('avg') || name.includes('score')) {
      return 'measure';
    }

    if (name.includes('category') || name.includes('type') || name.includes('status') ||
        name.includes('department') || name.includes('region')) {
      return 'dimension';
    }

    return 'attribute';
  }

  private normalizeDataType(columnType: any): string {
    const type = typeof columnType === 'string' ? columnType : columnType?.type || 'string';

    if (type.includes('int') || type.includes('float') || type.includes('number') || type.includes('decimal')) {
      return 'number';
    }
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'date';
    }
    if (type.includes('bool')) {
      return 'boolean';
    }
    return 'string';
  }

  private inferAnalysisRoles(columnName: string, columnType: any): string[] {
    const roles: string[] = [];
    const name = columnName.toLowerCase();
    const type = typeof columnType === 'string' ? columnType : columnType?.type || '';

    if (name.includes('id') || name.endsWith('_id')) {
      roles.push('joining');
    }

    if (type.includes('number') || name.includes('amount') || name.includes('count')) {
      roles.push('aggregation');
    }

    if (name.includes('category') || name.includes('type') || name.includes('department')) {
      roles.push('grouping');
    }

    if (name.includes('date') || name.includes('time')) {
      roles.push('time_series');
    }

    if (roles.length === 0) {
      roles.push('filtering');
    }

    return roles;
  }

  private inferLinkType(questionText: string, elementName: string): string {
    const q = questionText.toLowerCase();
    const e = elementName.toLowerCase();

    if (q.includes('by ' + e) || q.includes('per ' + e) || q.includes('for each ' + e)) {
      return 'groups_by';
    }

    if (q.includes('total') || q.includes('average') || q.includes('sum') || q.includes('count')) {
      if (e.includes('amount') || e.includes('count') || e.includes('score')) {
        return 'aggregates';
      }
    }

    if (q.includes('where') || q.includes('only') || q.includes('filter')) {
      return 'filters_by';
    }

    return 'requires';
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private needsAggregation(questionText: string): boolean {
    const aggregationKeywords = [
      'total', 'average', 'mean', 'sum', 'count', 'how many',
      'highest', 'lowest', 'maximum', 'minimum', 'percent', 'percentage'
    ];
    const q = questionText.toLowerCase();
    return aggregationKeywords.some(kw => q.includes(kw));
  }

  private needsFiltering(questionText: string): boolean {
    const filterKeywords = [
      'where', 'when', 'only', 'specific', 'particular', 'just',
      'between', 'greater than', 'less than', 'equal to'
    ];
    const q = questionText.toLowerCase();
    return filterKeywords.some(kw => q.includes(kw));
  }

  private groupBy(array: any[], key: string): Record<string, any[]> {
    return array.reduce((result, item) => {
      const keyValue = item[key];
      if (!result[keyValue]) {
        result[keyValue] = [];
      }
      result[keyValue].push(item);
      return result;
    }, {} as Record<string, any[]>);
  }

  private async createJoinTransformation(
    projectId: string,
    elements: any[],
    questionText: string
  ): Promise<TransformationDefinition | null> {
    // Group elements by dataset
    const byDataset = this.groupBy(elements, 'source_dataset_id');
    const datasetIds = Object.keys(byDataset);

    if (datasetIds.length < 2) return null;

    // Find potential join keys (elements with 'key' type or similar names across datasets)
    const potentialJoinKeys: Array<{ leftElement: any; rightElement: any }> = [];

    const datasets = Object.values(byDataset);
    for (let i = 0; i < datasets.length - 1; i++) {
      for (let j = i + 1; j < datasets.length; j++) {
        for (const leftElem of datasets[i] as any[]) {
          for (const rightElem of datasets[j] as any[]) {
            // Check if names are similar (potential join key)
            if (this.areJoinKeyCandidates(leftElem.element_name, rightElem.element_name)) {
              potentialJoinKeys.push({ leftElement: leftElem, rightElement: rightElem });
            }
          }
        }
      }
    }

    if (potentialJoinKeys.length === 0) return null;

    const primaryJoin = potentialJoinKeys[0];

    return {
      id: `transform_${nanoid(10)}`,
      transformationName: `Join ${primaryJoin.leftElement.element_name}`,
      transformationType: 'join',
      semanticDescription: `Join datasets using ${primaryJoin.leftElement.element_name} to combine data for analysis: "${questionText.slice(0, 100)}"`,
      sourceElements: [primaryJoin.leftElement.element_id, primaryJoin.rightElement.element_id],
      targetElements: elements.map(e => e.element_id),
      config: {
        joinType: 'left',
        leftDataset: primaryJoin.leftElement.source_dataset_id,
        leftKey: primaryJoin.leftElement.source_column,
        rightDataset: primaryJoin.rightElement.source_dataset_id,
        rightKey: primaryJoin.rightElement.source_column
      }
    };
  }

  private async createAggregationTransformation(
    projectId: string,
    elements: any[],
    questionText: string
  ): Promise<TransformationDefinition | null> {
    // Find measure elements (for aggregation)
    const measures = elements.filter(e => e.element_type === 'measure');
    // Find dimension elements (for grouping)
    const dimensions = elements.filter(e =>
      e.element_type === 'dimension' || e.link_type === 'groups_by'
    );

    if (measures.length === 0) return null;

    // Infer aggregation type from question
    const q = questionText.toLowerCase();
    let aggType = 'sum';
    if (q.includes('average') || q.includes('mean')) aggType = 'avg';
    if (q.includes('count') || q.includes('how many')) aggType = 'count';
    if (q.includes('max') || q.includes('highest')) aggType = 'max';
    if (q.includes('min') || q.includes('lowest')) aggType = 'min';

    return {
      id: `transform_${nanoid(10)}`,
      transformationName: `Aggregate ${measures[0].element_name}`,
      transformationType: 'aggregate',
      semanticDescription: `Calculate ${aggType} of ${measures.map(m => m.element_name).join(', ')}${dimensions.length > 0 ? ` grouped by ${dimensions.map(d => d.element_name).join(', ')}` : ''} for question: "${questionText.slice(0, 100)}"`,
      sourceElements: [...measures.map(m => m.element_id), ...dimensions.map(d => d.element_id)],
      targetElements: [],
      config: {
        aggregationType: aggType,
        measureColumns: measures.map(m => m.source_column),
        groupByColumns: dimensions.map(d => d.source_column)
      }
    };
  }

  private async createFilterTransformation(
    projectId: string,
    elements: any[],
    questionText: string
  ): Promise<TransformationDefinition | null> {
    // Look for filter-related elements
    const filterElements = elements.filter(e => e.link_type === 'filters_by');

    if (filterElements.length === 0) return null;

    return {
      id: `transform_${nanoid(10)}`,
      transformationName: `Filter by ${filterElements[0].element_name}`,
      transformationType: 'filter',
      semanticDescription: `Filter data based on ${filterElements.map(e => e.element_name).join(', ')} for question: "${questionText.slice(0, 100)}"`,
      sourceElements: filterElements.map(e => e.element_id),
      targetElements: [],
      config: {
        filterColumns: filterElements.map(e => ({
          column: e.source_column,
          operator: 'equals', // Default - could be inferred from question
          value: null // To be filled by user
        }))
      }
    };
  }

  private areJoinKeyCandidates(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase().replace(/[_-]/g, '');
    const n2 = name2.toLowerCase().replace(/[_-]/g, '');

    // Exact match
    if (n1 === n2) return true;

    // Common ID patterns
    const idPatterns = ['id', 'key', 'code'];
    for (const pattern of idPatterns) {
      if (n1.includes(pattern) && n2.includes(pattern)) {
        // Remove pattern and compare base names
        const base1 = n1.replace(pattern, '');
        const base2 = n2.replace(pattern, '');
        if (base1 === base2 || base1.includes(base2) || base2.includes(base1)) {
          return true;
        }
      }
    }

    // Check if one contains the other
    if (n1.includes(n2) || n2.includes(n1)) {
      return true;
    }

    return false;
  }
}

export const semanticDataPipeline = new SemanticDataPipelineService();
```

## 5. Integration into User Journey

### Step 1: Data Upload (data-step.tsx)
```typescript
// After files are uploaded and schemas detected
await semanticDataPipeline.extractDataElements(projectId, datasets);
```

### Step 2: Analysis Preparation (prepare-step.tsx)
```typescript
// After user enters questions
const questions = await apiClient.getProjectQuestions(projectId);
await semanticDataPipeline.linkQuestionsToElements(projectId, questions);
```

### Step 3: Data Transformation (data-transformation-step.tsx)
```typescript
// Load semantic transformation plan
const transformationPlan = await apiClient.get(`/api/projects/${projectId}/semantic-transformation-plan`);

// Display with evidence chains
for (const question of questions) {
  const evidence = await apiClient.get(`/api/projects/${projectId}/evidence-chain/${question.id}`);
  // Shows: Question → Elements → Transformations needed
}
```

### Step 4: Execution (execute-step.tsx)
```typescript
// Execute transformations in semantic order
await apiClient.post(`/api/projects/${projectId}/execute-semantic-transformations`);
```

## 6. API Endpoints

```typescript
// server/routes/semantic-pipeline.ts

router.post('/:projectId/extract-elements', ensureAuthenticated, async (req, res) => {
  const datasets = await storage.getProjectDatasets(projectId);
  const elements = await semanticDataPipeline.extractDataElements(projectId, datasets);
  res.json({ success: true, elements });
});

router.post('/:projectId/link-questions', ensureAuthenticated, async (req, res) => {
  const questions = await db.select().from(projectQuestions).where(eq(projectQuestions.projectId, projectId));
  await semanticDataPipeline.linkQuestionsToElements(projectId, questions);
  res.json({ success: true });
});

router.post('/:projectId/infer-transformations', ensureAuthenticated, async (req, res) => {
  const questions = await db.select().from(projectQuestions).where(eq(projectQuestions.projectId, projectId));
  const transformations = await semanticDataPipeline.inferTransformations(projectId, questions);
  res.json({ success: true, transformations });
});

router.get('/:projectId/semantic-transformation-plan', ensureAuthenticated, async (req, res) => {
  const plan = await semanticDataPipeline.getTransformationPlan(projectId);
  res.json({ success: true, plan });
});

router.get('/:projectId/evidence-chain/:questionId', ensureAuthenticated, async (req, res) => {
  const chain = await semanticDataPipeline.buildEvidenceChain(projectId, questionId);
  res.json({ success: true, chain });
});
```

## 7. Benefits of This Approach

| Problem | Solution |
|---------|----------|
| Questions not linked to data | Semantic embedding similarity (0.6+ threshold) |
| Multi-dataset join not inferred | Automatic join key detection via name similarity |
| Transformation order unclear | Dependency graph via element relationships |
| Evidence chain missing | Full Q→E→T→R chain stored in DB |
| Keyword matching unreliable | Vector similarity is meaning-based |

## 8. Implementation Plan

### Phase 1: Database Setup (1-2 hours)
- Add new tables (data_elements, transformation_definitions, etc.)
- Run migration

### Phase 2: Service Implementation (4-6 hours)
- Create SemanticDataPipelineService
- Integrate with existing embedding service

### Phase 3: API Integration (2-3 hours)
- Add new endpoints
- Update frontend to use semantic plan

### Phase 4: Frontend Updates (3-4 hours)
- Display evidence chains in transformation step
- Show semantic mappings in execute step

### Phase 5: Testing (2-3 hours)
- Test with multi-dataset scenarios
- Verify transformation ordering

**Total Estimated Time**: 12-18 hours

---

## 9. Next Steps

1. Create database migration for new tables
2. Implement SemanticDataPipelineService
3. Add API endpoints
4. Update data-transformation-step.tsx to use semantic plan
5. Test with real multi-dataset scenario

Ready to proceed with implementation?
