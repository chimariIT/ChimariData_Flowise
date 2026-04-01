// server/services/supervisor-readiness-validator.ts
/**
 * FIX #9: Supervisor Readiness Validator
 *
 * Ensures each step's outputs are validated against expected inputs
 * before the pipeline advances to the next step.
 *
 * Per-Step Validation Contracts:
 * - Data Upload: dataset rows, schema, PII scan
 * - Goals + Questions: alignment, stable IDs
 * - Business Definitions: industry/context alignment, missing definitions flagged
 * - Mappings: required elements mapped, PII exclusions applied
 * - Transformations: formulas align, data persisted
 * - Analysis: filtered types applied, required columns present, result shape validated
 * - Artifacts: correct payloads, PII exclusions enforced
 */

import { db } from '../db';
import { projects } from '../../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Step context captured after each pipeline step
 */
export interface StepContext {
  stepId: string;
  stepName: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  readinessFlags: {
    ready: boolean;
    issues: string[];
  };
  nextContext?: Record<string, any>;
  validationNotes?: string[];
  timestamp: Date;
}

/**
 * Validation result for a single step
 */
export interface ValidationResult {
  ready: boolean;
  issues: string[];
  nextContext: Record<string, any>;
  validationNotes?: string[];
}

/**
 * Per-step validator function signature
 */
export type StepValidator = (context: StepContext) => ValidationResult;

/**
 * Per-step readiness checks to store in journeyProgress
 */
export interface ReadinessChecks {
  steps: Record<string, StepContext>;
  validationHistory: ValidationResult[];
  lastValidatedAt: Date;
}

export class SupervisorReadinessValidator {
  /**
   * Validate a single step against its expected inputs and outputs
   */
  validateStep(stepId: string, context: StepContext): ValidationResult {
    const stepType = this.getStepType(stepId);
    const issues: string[] = [];
    const validationNotes: string[] = [];

    switch (stepType) {
      case 'data_upload':
        return this.validateDataUpload(context, issues, validationNotes);
      case 'goals_questions':
        return this.validateGoalsAndQuestions(context, issues, validationNotes);
      case 'business_definitions':
        return this.validateBusinessDefinitions(context, issues, validationNotes);
      case 'mappings':
        return this.validateMappings(context, issues, validationNotes);
      case 'transformations':
        return this.validateTransformations(context, issues, validationNotes);
      case 'analysis_execution':
        return this.validateAnalysisExecution(context, issues, validationNotes);
      case 'artifacts':
        return this.validateArtifacts(context, issues, validationNotes);
      default:
        return {
          ready: true,
          issues: [],
          nextContext: context.inputs,
          validationNotes: [`Unknown step type: ${stepId}`]
        };
    }
  }

  /**
   * Validate data upload step
   */
  private validateDataUpload(context: StepContext, issues: string[], notes: string[]): ValidationResult {
    const { inputs, outputs, readinessFlags } = context;
    const projectId = inputs.projectId;

    // Check: dataset rows present
    if (!outputs.datasetIds || outputs.datasetIds.length === 0) {
      issues.push('No datasets loaded or dataset has no rows');
      notes.push('Expected: at least one dataset with row data > 0');
    }

    // Check: schema inferred and file metadata stored
    if (!outputs.schemaSummary || Object.keys(outputs.schemaSummary || {}).length === 0) {
      issues.push('No schema inference or file metadata stored');
      notes.push('Expected: schema summary with at least column');
    }

    // Check: PII scan completed
    if (inputs.multiDataset && !outputs.piiAnalysisCompleted) {
      issues.push('PII scan not completed for multi-dataset join');
      notes.push('Required: piiAnalysisCompleted = true when joinConfig.foreignKeys > 0');
    }

    // Check: join plan/join completion recorded for multi-dataset
    if (inputs.multiDataset && !outputs.joinConfig) {
      issues.push('Join configuration not recorded for multi-dataset');
      notes.push('Expected: joinConfig stored');
    }

    // Build output context with validated dataset references
    const nextContext: Record<string, any> = {
      datasetIds: outputs.datasetIds,
      schemaSummary: outputs.schemaSummary,
      piiAnalysisCompleted: outputs.piiAnalysisCompleted,
      joinConfig: outputs.joinConfig
    };

    return {
      ready: issues.length === 0,
      issues,
      nextContext,
      validationNotes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Validate goals and questions step
   */
  private validateGoalsAndQuestions(context: StepContext, issues: string[], notes: string[]): ValidationResult {
    const { inputs, outputs, readinessFlags } = context;

    // Check: user goals and questions captured
    if (!inputs.userGoals || !inputs.userQuestions) {
      issues.push('User goals or questions not captured');
    }

    // Check: questions align to stated goal (no off-topic questions)
    if (inputs.userQuestions && inputs.userGoals) {
      const goalsText = inputs.userGoals.join(' ').toLowerCase();
      const questionTexts = inputs.userQuestions.map((q: any) => (q.questionText || q).toString()).toLowerCase();
      const combinedText = `${goalsText} ${questionTexts}`;

      // Simple heuristic: if question text doesn't contain any goal keywords
      const goalKeywords = inputs.userGoals.map(g => g.toLowerCase());
      const hasGoalAlignment = questionTexts.some(qt => goalKeywords.some(gk => qt.includes(gk)));

      if (!hasGoalAlignment) {
        issues.push('Some questions appear unrelated to stated goals');
        notes.push('Consider reviewing question-goal alignment');
      }
    }

    // Build output context
    const nextContext: Record<string, any> = {
      normalizedQuestions: inputs.userQuestions?.map((q: any, idx) => ({
        id: `q_${idx}`,
        text: q.questionText,
        originalOrder: idx
      })),
      goalSummary: inputs.userGoals?.join(', ')
    };

    return {
      ready: issues.length === 0,
      issues,
      nextContext,
      validationNotes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Validate business definitions step
   */
  private validateBusinessDefinitions(context: StepContext, issues: string[], notes: string[]): ValidationResult {
    const { inputs, outputs } = context;

    // Check: definitions resolved for required concepts
    if (!outputs.definitions || Object.keys(outputs.definitions).length === 0) {
      issues.push('No business definitions resolved');
      notes.push('Expected: definitions map with at least one entry');
    }

    // Check: definitions match industry + data context
    let missingDefs: string[] = [];
    if (inputs.industryContext && outputs.definitions) {
      missingDefs = this.findMissingDefinitions(inputs.industryContext, outputs.definitions);
      if (missingDefs.length > 0) {
        issues.push(`Missing definitions for industry: ${missingDefs.join(', ')}`);
        notes.push('Expected: definitions for concepts: ' + missingDefs.join(', '));
      }
    }

    // Build output context
    const nextContext: Record<string, any> = {
      definitions: outputs.definitions || {},
      missingDefinitions: missingDefs.length > 0 ? missingDefs : undefined
    };

    return {
      ready: issues.length === 0,
      issues,
      nextContext,
      validationNotes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Validate mappings step
   */
  private validateMappings(context: StepContext, issues: string[], notes: string[]): ValidationResult {
    const { inputs, outputs } = context;

    // Check: required elements mapped to columns (or flagged as missing)
    if (!outputs.elementColumnMap || Object.keys(outputs.elementColumnMap).length === 0) {
      issues.push('No element-to-column mappings created');
      notes.push('Expected: elementColumnMap with at least one entry');
    }

    // Check: PII exclusions applied
    if (outputs.piiExclusionsApplied && outputs.elementColumnMap) {
      const excludedColumns = new Set(Object.keys(outputs.piiExclusionsApplied).map(c => c.toLowerCase()));
      const mappingsHaveExcluded = Object.values(outputs.elementColumnMap).some((m: any) => {
        const mappedColumns = Array.isArray(m.columns) ? m.columns : [m.columnName];
        return mappedColumns.some(col => excludedColumns.has(col.toLowerCase()));
      });

      if (mappingsHaveExcluded) {
        issues.push('PII exclusions not applied to some mappings');
        notes.push('Required: All element-column mappings should have PII exclusions applied');
      }
    }

    // Build output context
    const nextContext: Record<string, any> = {
      elementColumnMap: outputs.elementColumnMap || {},
      missingElements: inputs.requiredElements ? this.findMissingElements(inputs.requiredElements, outputs.elementColumnMap) : undefined,
      piiExclusionsApplied: outputs.piiExclusionsApplied
    };

    return {
      ready: issues.length === 0,
      issues,
      nextContext,
      validationNotes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Validate transformations step
   */
  private validateTransformations(context: StepContext, issues: string[], notes: string[]): ValidationResult {
    const { inputs, outputs } = context;

    // Check: transformation plan exists
    if (!outputs.transformationPlan || Object.keys(outputs.transformationPlan).length === 0) {
      issues.push('No transformation plan generated');
      notes.push('Expected: transformationPlan with at least one entry');
    }

    // Check: transformed data persisted
    if (!outputs.transformedDataPersisted) {
      issues.push('Transformed data not persisted');
      notes.push('Expected: transformedDataPersisted = true after transformations applied');
    }

    // Build output context
    const nextContext: Record<string, any> = {
      transformationPlan: outputs.transformationPlan || {},
      transformedDataPersisted: outputs.transformedDataPersisted
    };

    return {
      ready: issues.length === 0,
      issues,
      nextContext,
      validationNotes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Validate analysis execution step
   */
  private validateAnalysisExecution(context: StepContext, issues: string[], notes: string[]): ValidationResult {
    const { inputs, outputs } = context;

    // Check: filtered analysis types applied
    if (!outputs.filteredAnalysisTypes) {
      issues.push('Analysis type filtering not applied');
      notes.push('Expected: filteredAnalysisTypes to be set');
    }

    // Check: required columns present for analysis
    if (!outputs.requiredColumnsPresent) {
      issues.push('Required columns not present in analysis data');
      notes.push('Expected: requiredColumnsPresent = true after filtering');
    }

    // Check: Python outputs shape validated
    if (!outputs.resultShapeValid) {
      issues.push('Python result shape not validated');
      notes.push('Expected: resultShapeValid = true after analysis execution');
    }

    // Build output context
    const nextContext: Record<string, any> = {
      filteredAnalysisTypes: outputs.filteredAnalysisTypes,
      requiredColumnsPresent: outputs.requiredColumnsPresent,
      resultShapeValid: outputs.resultShapeValid
    };

    return {
      ready: issues.length === 0,
      issues,
      nextContext,
      validationNotes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Validate artifacts step
   */
  private validateArtifacts(context: StepContext, issues: string[], notes: string[]): ValidationResult {
    const { inputs, outputs } = context;

    // Check: insights + visualizations present
    if (!outputs.insights || !outputs.visualizations) {
      issues.push('Insights or visualizations missing');
      notes.push('Expected: both insights and visualizations to be present');
    }

    // Check: artifact inputs (rows vs insights) match generator expectations
    if (outputs.artifactPayloadMismatch) {
      issues.push('Artifact payload mismatch detected');
      notes.push('Review artifact export configuration');
    }

    // Check: PII exclusions enforced in exports
    if (!outputs.piiExclusionsEnforced) {
      issues.push('PII exclusions not enforced in artifact exports');
      notes.push('Required: piiExclusionsEnforced = true for artifact generation');
    }

    // Build output context
    const nextContext: Record<string, any> = {
      insights: outputs.insights || {},
      visualizations: outputs.visualizations || {},
      piiExclusionsEnforced: outputs.piiExclusionsEnforced
    };

    return {
      ready: issues.length === 0,
      issues,
      nextContext,
      validationNotes: notes.length > 0 ? notes : undefined
    };
  }

  /**
   * Get step type from step ID
   */
  private getStepType(stepId: string): string {
    const stepMapping: Record<string, string> = {
      'data_upload': 'data_upload',
      'goals_questions': 'goals_questions',
      'business_definitions': 'business_definitions',
      'mappings': 'mappings',
      'transformations': 'transformations',
      'analysis_execution': 'analysis_execution',
      'artifacts': 'artifacts'
    };

    return stepMapping[stepId] || stepId;
  }

  /**
   * Find missing definitions for current industry
   */
  private findMissingDefinitions(industryContext: string, definitions: Record<string, any>): string[] {
    const expectedConcepts = this.getExpectedConceptsForIndustry(industryContext);
    const missingConcepts = expectedConcepts.filter(concept => !(concept in definitions));
    return missingConcepts;
  }

  /**
   * Get expected concept definitions for each industry
   */
  private getExpectedConceptsForIndustry(industry: string): string[] {
    const industryConcepts: Record<string, string[]> = {
      'hr': ['employee_id', 'department', 'role', 'tenure', 'performance_rating', 'satisfaction_score'],
      'retail': ['product_id', 'sku', 'price', 'inventory', 'sales'],
      'finance': ['revenue', 'profit', 'cost', 'budget', 'expenses'],
      'manufacturing': ['production_line', 'product_quality', 'yield_rate', 'downtime'],
      'healthcare': ['patient_id', 'diagnosis', 'treatment', 'outcome'],
      'education': ['student_id', 'course', 'grade', 'enrollment', 'graduation']
    };

    return industryConcepts[industry] || [];
  }

  /**
   * Find missing elements from required elements list
   */
  private findMissingElements(requiredElements: string[], elementColumnMap: Record<string, any>): string[] {
    const missingElements: string[] = [];
    const mappedElements = new Set<string>();

    // Collect all mapped element names
    for (const [elementId, mapping] of Object.entries(elementColumnMap)) {
      const elementName = Array.isArray(mapping.columns) ? mapping.columns[0] : mapping.columnName;
      if (elementName) {
        mappedElements.add(elementName);
      }
    }

    // Find which required elements are not mapped
    for (const reqElement of requiredElements) {
      if (!mappedElements.has(reqElement)) {
        missingElements.push(reqElement);
      }
    }

    return missingElements;
  }

  /**
   * Load current readiness checks from journeyProgress
   */
  async getReadinessChecks(projectId: string): Promise<ReadinessChecks> {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      return {
        steps: {},
        validationHistory: [],
        lastValidatedAt: new Date()
      };
    }

    const journeyProgress = project.journeyProgress as any;
    const steps = journeyProgress?.stepContext || {};
    const validationHistory = journeyProgress?.readinessChecks?.validationHistory || [];

    return {
      steps: steps || {},
      validationHistory: validationHistory || [],
      lastValidatedAt: new Date()
    };
  }

  /**
   * Store step context into journeyProgress
   */
  async storeStepContext(projectId: string, stepContext: StepContext): Promise<void> {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      console.warn(`⚠️ [STORE-CONTEXT] Project ${projectId} not found`);
      return;
    }

    const existingJourneyProgress = (project.journeyProgress as any) || {};
    const existingStepContext = existingJourneyProgress.stepContext || {};

    await db.update(projects)
      .set({
        journeyProgress: {
          ...existingJourneyProgress,
          stepContext: {
            ...existingStepContext,
            [stepContext.stepId]: stepContext
          }
        }
      })
      .where(eq(projects.id, projectId));

    console.log(`✅ [STORE-CONTEXT] Stored step context for ${stepContext.stepId}`);
  }

  /**
   * Store validation result into journeyProgress readiness checks
   */
  async storeValidationResult(projectId: string, stepId: string, result: ValidationResult): Promise<void> {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const existingJourneyProgress = (project.journeyProgress as any) || {};
    const existingReadinessChecks = (existingJourneyProgress.readinessChecks as any) || {};
    const existingValidationHistory = existingReadinessChecks.validationHistory || [];

    await db.update(projects)
      .set({
        journeyProgress: {
          ...existingJourneyProgress,
          readinessChecks: {
            ...existingReadinessChecks,
            validationHistory: [
              ...existingValidationHistory,
              {
                stepId,
                timestamp: new Date(),
                ready: result.ready,
                issues: result.issues,
                nextContext: result.nextContext,
                validationNotes: result.validationNotes
              }
            ],
            lastValidatedAt: new Date()
          }
        }
      })
      .where(eq(projects.id, projectId));

    console.log(`✅ [STORE-VALIDATION] Stored validation result for ${stepId}: ready=${result.ready}`);
  }

  /**
   * Get the latest step context for a project
   */
  async getLatestStepContext(projectId: string, stepId: string): Promise<StepContext | null> {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      return null;
    }

    const journeyProgress = project.journeyProgress as any;
    const steps = journeyProgress?.stepContext || {};

    return steps[stepId] || null;
  }
}

// Singleton instance
export const supervisorReadinessValidator = new SupervisorReadinessValidator();
