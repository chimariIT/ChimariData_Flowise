/**
 * Unit Tests for U2A2A2U (User-to-Agent-to-Agent-to-User) Flow
 *
 * Tests the complete data flow pipeline:
 * 1. User → PM Agent (questions/goals)
 * 2. PM Agent → DS Agent (requirements generation)
 * 3. DS Agent → DE Agent (data validation/transformation)
 * 4. DE Agent → BA Agent (business translation)
 * 5. BA Agent → User (translated results)
 *
 * Also tests artifact passing, evidence chain, and checkpoint flows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('U2A2A2U Flow - User to Agent to Agent to User', () => {

  describe('Phase 1: User Input → PM Agent', () => {
    /**
     * PM Agent receives user questions and orchestrates the workflow
     */

    interface UserInput {
      projectId: string;
      questions: string[];
      goals: string[];
      industry?: string;
      datasetInfo: {
        fileName: string;
        rowCount: number;
        columns: string[];
        schema: Record<string, { type: string }>;
      };
    }

    interface PMAgentOutput {
      coordinationId: string;
      projectId: string;
      userQuestions: string[];
      assignedAgents: string[];
      workflow: Array<{
        step: number;
        agent: string;
        task: string;
        dependsOn?: number[];
      }>;
    }

    const pmAgentProcessUserInput = (input: UserInput): PMAgentOutput => {
      const workflow = [];

      // DS Agent analyzes questions first
      workflow.push({
        step: 1,
        agent: 'data_scientist',
        task: 'generate_requirements_document',
        dependsOn: []
      });

      // DE Agent validates data quality
      workflow.push({
        step: 2,
        agent: 'data_engineer',
        task: 'validate_data_quality',
        dependsOn: [1]
      });

      // DS Agent performs analysis
      workflow.push({
        step: 3,
        agent: 'data_scientist',
        task: 'execute_analysis',
        dependsOn: [2]
      });

      // BA Agent translates results
      workflow.push({
        step: 4,
        agent: 'business_agent',
        task: 'translate_results',
        dependsOn: [3]
      });

      return {
        coordinationId: `coord_${Date.now()}`,
        projectId: input.projectId,
        userQuestions: input.questions,
        assignedAgents: ['data_scientist', 'data_engineer', 'business_agent'],
        workflow
      };
    };

    it('should create workflow for user questions', () => {
      const userInput: UserInput = {
        projectId: 'proj_123',
        questions: ['What factors drive employee engagement?', 'How can we reduce turnover?'],
        goals: ['Improve employee retention'],
        industry: 'hr',
        datasetInfo: {
          fileName: 'hr_data.csv',
          rowCount: 5000,
          columns: ['employee_id', 'department', 'tenure', 'satisfaction_score', 'turnover'],
          schema: {
            employee_id: { type: 'string' },
            department: { type: 'string' },
            tenure: { type: 'number' },
            satisfaction_score: { type: 'number' },
            turnover: { type: 'boolean' }
          }
        }
      };

      const result = pmAgentProcessUserInput(userInput);

      expect(result.coordinationId).toBeDefined();
      expect(result.userQuestions).toHaveLength(2);
      expect(result.assignedAgents).toContain('data_scientist');
      expect(result.assignedAgents).toContain('data_engineer');
      expect(result.assignedAgents).toContain('business_agent');
      expect(result.workflow).toHaveLength(4);
    });

    it('should establish correct workflow dependencies', () => {
      const userInput: UserInput = {
        projectId: 'proj_456',
        questions: ['What is our customer churn rate?'],
        goals: ['Reduce churn'],
        datasetInfo: {
          fileName: 'customers.csv',
          rowCount: 10000,
          columns: ['customer_id', 'tenure', 'churn'],
          schema: {
            customer_id: { type: 'string' },
            tenure: { type: 'number' },
            churn: { type: 'boolean' }
          }
        }
      };

      const result = pmAgentProcessUserInput(userInput);

      // DE validation depends on DS requirements
      const deStep = result.workflow.find(w => w.agent === 'data_engineer');
      expect(deStep?.dependsOn).toContain(1);

      // Analysis depends on DE validation
      const analysisStep = result.workflow.find(w => w.task === 'execute_analysis');
      expect(analysisStep?.dependsOn).toContain(2);

      // BA translation depends on analysis
      const baStep = result.workflow.find(w => w.agent === 'business_agent');
      expect(baStep?.dependsOn).toContain(3);
    });
  });

  describe('Phase 2: PM Agent → DS Agent (Requirements)', () => {
    /**
     * DS Agent generates requirements document from user questions
     */

    interface RequirementsInput {
      questions: string[];
      dataSchema: Record<string, { type: string }>;
      availableColumns: string[];
    }

    interface RequirementOutput {
      requirementsDocument: {
        questionAnswerMapping: Array<{
          questionId: string;
          question: string;
          requiredDataElements: string[];
          suggestedAnalyses: string[];
          transformationsNeeded: string[];
        }>;
        analysisPath: string[];
        dataElementDefinitions: Array<{
          elementId: string;
          name: string;
          sourceColumns: string[];
          calculationType: string;
        }>;
      };
      confidence: number;
    }

    const dsAgentGenerateRequirements = (input: RequirementsInput): RequirementOutput => {
      const questionMappings = input.questions.map((q, i) => {
        const questionId = `q_${i + 1}`;
        const suggestedAnalyses: string[] = [];
        const requiredElements: string[] = [];
        const transformations: string[] = [];

        // Determine required analyses based on question content
        if (q.toLowerCase().includes('factor') || q.toLowerCase().includes('drive')) {
          suggestedAnalyses.push('correlation');
          suggestedAnalyses.push('regression');
          requiredElements.push('engagement_score', 'satisfaction_score');
        }
        if (q.toLowerCase().includes('predict') || q.toLowerCase().includes('forecast')) {
          suggestedAnalyses.push('regression');
          suggestedAnalyses.push('time_series');
        }
        if (q.toLowerCase().includes('segment') || q.toLowerCase().includes('group')) {
          suggestedAnalyses.push('clustering');
        }
        if (q.toLowerCase().includes('churn') || q.toLowerCase().includes('turnover')) {
          suggestedAnalyses.push('classification');
          requiredElements.push('turnover_indicator');
          transformations.push('encode_boolean');
        }

        // Default to descriptive if no specific analysis detected
        if (suggestedAnalyses.length === 0) {
          suggestedAnalyses.push('descriptive');
        }

        return {
          questionId,
          question: q,
          requiredDataElements: requiredElements.length > 0 ? requiredElements : ['all_numeric'],
          suggestedAnalyses: [...new Set(suggestedAnalyses)],
          transformationsNeeded: transformations
        };
      });

      // Build unique analysis path
      const analysisPath = [...new Set(questionMappings.flatMap(m => m.suggestedAnalyses))];

      // Build data element definitions
      const elementDefinitions = questionMappings.flatMap(m =>
        m.requiredDataElements.map(el => ({
          elementId: `el_${el}`,
          name: el,
          sourceColumns: input.availableColumns.filter(c =>
            c.toLowerCase().includes(el.replace('_', '')) ||
            el.includes('all')
          ),
          calculationType: 'direct'
        }))
      );

      return {
        requirementsDocument: {
          questionAnswerMapping: questionMappings,
          analysisPath,
          dataElementDefinitions: elementDefinitions
        },
        confidence: 0.85
      };
    };

    it('should generate question-answer mappings', () => {
      const input: RequirementsInput = {
        questions: ['What factors drive engagement?', 'Can we predict turnover?'],
        dataSchema: {
          employee_id: { type: 'string' },
          engagement_score: { type: 'number' },
          turnover: { type: 'boolean' }
        },
        availableColumns: ['employee_id', 'engagement_score', 'turnover', 'department', 'tenure']
      };

      const result = dsAgentGenerateRequirements(input);

      expect(result.requirementsDocument.questionAnswerMapping).toHaveLength(2);
      expect(result.requirementsDocument.questionAnswerMapping[0].questionId).toBe('q_1');
      expect(result.requirementsDocument.questionAnswerMapping[0].suggestedAnalyses).toContain('correlation');
    });

    it('should build analysis path from all questions', () => {
      const input: RequirementsInput = {
        questions: ['What factors drive engagement?', 'Segment our employees'],
        dataSchema: {},
        availableColumns: ['engagement_score', 'department']
      };

      const result = dsAgentGenerateRequirements(input);

      expect(result.requirementsDocument.analysisPath).toContain('correlation');
      expect(result.requirementsDocument.analysisPath).toContain('clustering');
    });

    it('should map required data elements to source columns', () => {
      const input: RequirementsInput = {
        questions: ['What factors drive engagement?'],
        dataSchema: {},
        availableColumns: ['engagement_score', 'satisfaction_score', 'tenure']
      };

      const result = dsAgentGenerateRequirements(input);

      // The question contains 'factor' and 'drive', so it adds engagement_score element
      const engagementMapping = result.requirementsDocument.questionAnswerMapping[0];
      expect(engagementMapping.requiredDataElements).toContain('engagement_score');

      // Check that element definitions include the required elements
      const elementDefs = result.requirementsDocument.dataElementDefinitions;
      const engagementElement = elementDefs.find(el => el.name === 'engagement_score');
      expect(engagementElement).toBeDefined();
      expect(engagementElement?.elementId).toBe('el_engagement_score');
    });
  });

  describe('Phase 3: DS Agent → DE Agent (Data Validation)', () => {
    /**
     * DE Agent validates data quality and suggests transformations
     */

    interface ValidationInput {
      requirements: {
        requiredDataElements: string[];
        analysisPath: string[];
      };
      datasetInfo: {
        columns: string[];
        rowCount: number;
        sampleData: any[];
      };
    }

    interface ValidationOutput {
      dataQuality: {
        completeness: number;
        uniqueness: number;
        validity: number;
        overallScore: number;
      };
      columnMappings: Array<{
        required: string;
        mapped: string | null;
        confidence: number;
      }>;
      suggestedTransformations: Array<{
        type: string;
        sourceColumn: string;
        targetColumn: string;
        reason: string;
      }>;
      readyForAnalysis: boolean;
    }

    const deAgentValidateData = (input: ValidationInput): ValidationOutput => {
      const { requirements, datasetInfo } = input;

      // Calculate completeness from sample data
      let nullCount = 0;
      let totalCells = 0;
      for (const row of datasetInfo.sampleData) {
        for (const value of Object.values(row)) {
          totalCells++;
          if (value === null || value === undefined || value === '') {
            nullCount++;
          }
        }
      }
      const completeness = totalCells > 0 ? (totalCells - nullCount) / totalCells : 1;

      // Check for duplicates
      const rowStrings = datasetInfo.sampleData.map(r => JSON.stringify(r));
      const uniqueRows = new Set(rowStrings).size;
      const uniqueness = datasetInfo.sampleData.length > 0
        ? uniqueRows / datasetInfo.sampleData.length
        : 1;

      // Map required elements to available columns
      const columnMappings = requirements.requiredDataElements.map(required => {
        const normalizedRequired = required.toLowerCase().replace(/_/g, '');
        const matchedColumn = datasetInfo.columns.find(col => {
          const normalizedCol = col.toLowerCase().replace(/_/g, '');
          return normalizedCol.includes(normalizedRequired) || normalizedRequired.includes(normalizedCol);
        });

        return {
          required,
          mapped: matchedColumn || null,
          confidence: matchedColumn ? 0.9 : 0
        };
      });

      // Suggest transformations for unmapped columns
      const transformations = columnMappings
        .filter(m => !m.mapped)
        .map(m => ({
          type: 'derive',
          sourceColumn: 'multiple',
          targetColumn: m.required,
          reason: `Required element '${m.required}' not found in data. Consider creating a derived column.`
        }));

      const overallScore = (completeness + uniqueness + 0.9) / 3; // 0.9 is assumed validity
      const readyForAnalysis = overallScore > 0.7 && columnMappings.every(m => m.mapped !== null);

      return {
        dataQuality: {
          completeness,
          uniqueness,
          validity: 0.9,
          overallScore
        },
        columnMappings,
        suggestedTransformations: transformations,
        readyForAnalysis
      };
    };

    it('should calculate data quality metrics', () => {
      const input: ValidationInput = {
        requirements: {
          requiredDataElements: ['engagement_score'],
          analysisPath: ['descriptive']
        },
        datasetInfo: {
          columns: ['engagement_score', 'department'],
          rowCount: 100,
          sampleData: [
            { engagement_score: 8, department: 'Sales' },
            { engagement_score: 7, department: 'HR' },
            { engagement_score: null, department: 'IT' }
          ]
        }
      };

      const result = deAgentValidateData(input);

      expect(result.dataQuality.completeness).toBeCloseTo(0.833, 2);
      expect(result.dataQuality.uniqueness).toBe(1);
      expect(result.dataQuality.overallScore).toBeGreaterThan(0.7);
    });

    it('should map required elements to columns', () => {
      const input: ValidationInput = {
        requirements: {
          requiredDataElements: ['engagement_score', 'turnover'],
          analysisPath: ['correlation']
        },
        datasetInfo: {
          columns: ['employee_engagement_score', 'turnover_flag', 'name'],
          rowCount: 100,
          sampleData: []
        }
      };

      const result = deAgentValidateData(input);

      const engagementMapping = result.columnMappings.find(m => m.required === 'engagement_score');
      expect(engagementMapping?.mapped).toBe('employee_engagement_score');
      expect(engagementMapping?.confidence).toBeGreaterThan(0.8);
    });

    it('should suggest transformations for unmapped elements', () => {
      const input: ValidationInput = {
        requirements: {
          requiredDataElements: ['composite_score'],
          analysisPath: ['descriptive']
        },
        datasetInfo: {
          columns: ['score_a', 'score_b'],
          rowCount: 100,
          sampleData: []
        }
      };

      const result = deAgentValidateData(input);

      expect(result.suggestedTransformations).toHaveLength(1);
      expect(result.suggestedTransformations[0].type).toBe('derive');
      expect(result.suggestedTransformations[0].targetColumn).toBe('composite_score');
      expect(result.readyForAnalysis).toBe(false);
    });
  });

  describe('Phase 4: DE Agent → Analysis Execution → BA Agent', () => {
    /**
     * Analysis results flow to BA Agent for translation
     */

    interface AnalysisResult {
      analysisType: string;
      findings: Array<{
        metric: string;
        value: number;
        interpretation: string;
      }>;
      recommendations: string[];
      confidence: number;
    }

    interface TranslationInput {
      analysisResults: AnalysisResult[];
      targetAudience: 'executive' | 'technical' | 'general';
      industry: string;
      originalQuestions: string[];
    }

    interface TranslatedOutput {
      summary: string;
      keyInsights: Array<{
        insight: string;
        businessImpact: string;
        priority: 'high' | 'medium' | 'low';
      }>;
      questionAnswers: Array<{
        question: string;
        answer: string;
        confidence: number;
        evidenceChain: string[];
      }>;
      actionItems: string[];
      kpis: Array<{
        name: string;
        currentValue: string;
        target?: string;
      }>;
    }

    const baAgentTranslateResults = (input: TranslationInput): TranslatedOutput => {
      const { analysisResults, targetAudience, originalQuestions } = input;

      // Generate key insights from analysis findings
      const keyInsights = analysisResults.flatMap(ar =>
        ar.findings.map(f => ({
          insight: f.interpretation,
          businessImpact: `This affects ${f.metric} performance`,
          priority: f.value > 0.7 ? 'high' as const : f.value > 0.4 ? 'medium' as const : 'low' as const
        }))
      );

      // Generate question answers with evidence chain
      const questionAnswers = originalQuestions.map((q, i) => {
        const relevantFindings = analysisResults.flatMap(ar =>
          ar.findings.filter(f =>
            q.toLowerCase().includes(f.metric.toLowerCase().split('_')[0])
          )
        );

        const answer = relevantFindings.length > 0
          ? `Based on our analysis, ${relevantFindings[0].interpretation}`
          : `The analysis shows general patterns that address this question.`;

        return {
          question: q,
          answer,
          confidence: relevantFindings.length > 0 ? 0.85 : 0.6,
          evidenceChain: [
            `Data element: ${relevantFindings[0]?.metric || 'multiple columns'}`,
            `Analysis: ${analysisResults[0]?.analysisType || 'descriptive'}`,
            `Finding: ${relevantFindings[0]?.interpretation || 'Pattern detected'}`
          ]
        };
      });

      // Adjust language based on audience
      const summaryPrefix = targetAudience === 'executive'
        ? 'Executive Summary: '
        : targetAudience === 'technical'
          ? 'Technical Analysis Report: '
          : 'Analysis Summary: ';

      return {
        summary: `${summaryPrefix}Analysis of ${originalQuestions.length} questions completed with ${analysisResults.length} analysis types.`,
        keyInsights,
        questionAnswers,
        actionItems: analysisResults.flatMap(ar => ar.recommendations),
        kpis: analysisResults.flatMap(ar =>
          ar.findings.map(f => ({
            name: f.metric,
            currentValue: `${(f.value * 100).toFixed(1)}%`
          }))
        )
      };
    };

    it('should translate analysis results for target audience', () => {
      const input: TranslationInput = {
        analysisResults: [{
          analysisType: 'correlation',
          findings: [
            { metric: 'engagement_satisfaction_correlation', value: 0.75, interpretation: 'Strong positive correlation between engagement and satisfaction' }
          ],
          recommendations: ['Focus on satisfaction improvement programs'],
          confidence: 0.85
        }],
        targetAudience: 'executive',
        industry: 'hr',
        originalQuestions: ['What factors drive engagement?']
      };

      const result = baAgentTranslateResults(input);

      expect(result.summary).toContain('Executive Summary');
      expect(result.keyInsights).toHaveLength(1);
      expect(result.keyInsights[0].priority).toBe('high');
    });

    it('should generate question answers with evidence chain', () => {
      const input: TranslationInput = {
        analysisResults: [{
          analysisType: 'regression',
          findings: [
            { metric: 'turnover_prediction', value: 0.82, interpretation: 'Tenure and satisfaction are key predictors of turnover' }
          ],
          recommendations: ['Implement retention programs'],
          confidence: 0.9
        }],
        targetAudience: 'general',
        industry: 'hr',
        originalQuestions: ['Can we predict turnover?']
      };

      const result = baAgentTranslateResults(input);

      expect(result.questionAnswers).toHaveLength(1);
      expect(result.questionAnswers[0].question).toBe('Can we predict turnover?');
      expect(result.questionAnswers[0].evidenceChain).toHaveLength(3);
      expect(result.questionAnswers[0].confidence).toBeGreaterThan(0.8);
    });

    it('should extract KPIs from findings', () => {
      const input: TranslationInput = {
        analysisResults: [{
          analysisType: 'descriptive',
          findings: [
            { metric: 'engagement_score', value: 0.72, interpretation: 'Average engagement is 72%' },
            { metric: 'turnover_rate', value: 0.15, interpretation: 'Turnover rate is 15%' }
          ],
          recommendations: [],
          confidence: 0.95
        }],
        targetAudience: 'executive',
        industry: 'hr',
        originalQuestions: []
      };

      const result = baAgentTranslateResults(input);

      expect(result.kpis).toHaveLength(2);
      expect(result.kpis.find(k => k.name === 'engagement_score')?.currentValue).toBe('72.0%');
      expect(result.kpis.find(k => k.name === 'turnover_rate')?.currentValue).toBe('15.0%');
    });
  });

  describe('Phase 5: BA Agent → User (Final Results)', () => {
    /**
     * Tests the final output structure delivered to the user
     */

    interface FinalUserOutput {
      projectId: string;
      status: 'complete' | 'partial' | 'failed';
      translatedResults: {
        summary: string;
        keyInsights: any[];
        questionAnswers: any[];
        actionItems: string[];
        kpis: any[];
      };
      artifacts: Array<{
        type: string;
        path: string;
        name: string;
      }>;
      evidenceChain: {
        questions: string[];
        dataElements: string[];
        transformations: string[];
        analyses: string[];
        confidenceScore: number;
      };
      processingMetadata: {
        agentsInvolved: string[];
        totalDuration: number;
        checkpointsCompleted: number;
      };
    }

    const buildFinalOutput = (params: {
      projectId: string;
      questions: string[];
      translatedResults: any;
      analysisTypes: string[];
      dataElements: string[];
      transformations: string[];
      artifacts: any[];
      duration: number;
    }): FinalUserOutput => {
      return {
        projectId: params.projectId,
        status: 'complete',
        translatedResults: params.translatedResults,
        artifacts: params.artifacts,
        evidenceChain: {
          questions: params.questions,
          dataElements: params.dataElements,
          transformations: params.transformations,
          analyses: params.analysisTypes,
          confidenceScore: 0.85
        },
        processingMetadata: {
          agentsInvolved: ['project_manager', 'data_scientist', 'data_engineer', 'business_agent'],
          totalDuration: params.duration,
          checkpointsCompleted: 3
        }
      };
    };

    it('should build complete user output with evidence chain', () => {
      const result = buildFinalOutput({
        projectId: 'proj_123',
        questions: ['What factors drive engagement?'],
        translatedResults: {
          summary: 'Analysis complete',
          keyInsights: [{ insight: 'Satisfaction correlates with engagement', priority: 'high' }],
          questionAnswers: [{ question: 'What factors drive engagement?', answer: 'Satisfaction and tenure' }],
          actionItems: ['Improve satisfaction programs'],
          kpis: [{ name: 'Engagement Score', currentValue: '72%' }]
        },
        analysisTypes: ['correlation', 'regression'],
        dataElements: ['engagement_score', 'satisfaction_score', 'tenure'],
        transformations: ['normalize_scores'],
        artifacts: [
          { type: 'report', path: '/artifacts/report.pdf', name: 'Analysis Report' }
        ],
        duration: 45000
      });

      expect(result.status).toBe('complete');
      expect(result.evidenceChain.questions).toHaveLength(1);
      expect(result.evidenceChain.analyses).toContain('correlation');
      expect(result.processingMetadata.agentsInvolved).toContain('business_agent');
      expect(result.artifacts).toHaveLength(1);
    });

    it('should track all agents involved in processing', () => {
      const result = buildFinalOutput({
        projectId: 'proj_456',
        questions: [],
        translatedResults: {},
        analysisTypes: [],
        dataElements: [],
        transformations: [],
        artifacts: [],
        duration: 10000
      });

      expect(result.processingMetadata.agentsInvolved).toContain('project_manager');
      expect(result.processingMetadata.agentsInvolved).toContain('data_scientist');
      expect(result.processingMetadata.agentsInvolved).toContain('data_engineer');
      expect(result.processingMetadata.agentsInvolved).toContain('business_agent');
    });
  });

  describe('Artifact Passing Between Agents', () => {
    /**
     * Tests that artifacts are correctly passed between agents
     */

    interface AgentArtifact {
      id: string;
      type: string;
      createdBy: string;
      data: any;
      chainedFrom?: string;
    }

    class ArtifactChain {
      private artifacts: Map<string, AgentArtifact> = new Map();

      addArtifact(artifact: AgentArtifact): string {
        this.artifacts.set(artifact.id, artifact);
        return artifact.id;
      }

      getArtifact(id: string): AgentArtifact | undefined {
        return this.artifacts.get(id);
      }

      getArtifactsByAgent(agentId: string): AgentArtifact[] {
        return Array.from(this.artifacts.values())
          .filter(a => a.createdBy === agentId);
      }

      getChain(artifactId: string): AgentArtifact[] {
        const chain: AgentArtifact[] = [];
        let currentId: string | undefined = artifactId;

        while (currentId) {
          const artifact = this.artifacts.get(currentId);
          if (artifact) {
            chain.unshift(artifact);
            currentId = artifact.chainedFrom;
          } else {
            break;
          }
        }

        return chain;
      }
    }

    it('should track artifact chain through agents', () => {
      const chain = new ArtifactChain();

      // DS Agent creates requirements document
      const reqId = chain.addArtifact({
        id: 'art_req_1',
        type: 'requirements_document',
        createdBy: 'data_scientist',
        data: { analysisPath: ['correlation'] }
      });

      // DE Agent creates validation report
      const valId = chain.addArtifact({
        id: 'art_val_1',
        type: 'validation_report',
        createdBy: 'data_engineer',
        data: { dataQuality: { score: 0.85 } },
        chainedFrom: reqId
      });

      // DS Agent creates analysis results
      const analysisId = chain.addArtifact({
        id: 'art_analysis_1',
        type: 'analysis_results',
        createdBy: 'data_scientist',
        data: { correlations: [] },
        chainedFrom: valId
      });

      // BA Agent creates translated results
      chain.addArtifact({
        id: 'art_translated_1',
        type: 'translated_results',
        createdBy: 'business_agent',
        data: { summary: 'Analysis complete' },
        chainedFrom: analysisId
      });

      const fullChain = chain.getChain('art_translated_1');

      expect(fullChain).toHaveLength(4);
      expect(fullChain[0].createdBy).toBe('data_scientist');
      expect(fullChain[1].createdBy).toBe('data_engineer');
      expect(fullChain[2].createdBy).toBe('data_scientist');
      expect(fullChain[3].createdBy).toBe('business_agent');
    });

    it('should retrieve artifacts by agent', () => {
      const chain = new ArtifactChain();

      chain.addArtifact({ id: 'a1', type: 'req', createdBy: 'data_scientist', data: {} });
      chain.addArtifact({ id: 'a2', type: 'val', createdBy: 'data_engineer', data: {} });
      chain.addArtifact({ id: 'a3', type: 'analysis', createdBy: 'data_scientist', data: {} });

      const dsArtifacts = chain.getArtifactsByAgent('data_scientist');
      expect(dsArtifacts).toHaveLength(2);

      const deArtifacts = chain.getArtifactsByAgent('data_engineer');
      expect(deArtifacts).toHaveLength(1);
    });
  });

  describe('Checkpoint Flow (User Approval Points)', () => {
    /**
     * Tests checkpoint handling where agents pause for user approval
     */

    interface Checkpoint {
      checkpointId: string;
      agentId: string;
      step: string;
      question: string;
      options: string[];
      artifacts: any[];
      status: 'pending' | 'approved' | 'rejected' | 'modified';
      userResponse?: {
        approved: boolean;
        feedback?: string;
        modifications?: any;
      };
    }

    class CheckpointManager {
      private checkpoints: Map<string, Checkpoint> = new Map();

      createCheckpoint(checkpoint: Omit<Checkpoint, 'status'>): string {
        const cp: Checkpoint = { ...checkpoint, status: 'pending' };
        this.checkpoints.set(checkpoint.checkpointId, cp);
        return checkpoint.checkpointId;
      }

      respondToCheckpoint(
        checkpointId: string,
        response: { approved: boolean; feedback?: string; modifications?: any }
      ): boolean {
        const cp = this.checkpoints.get(checkpointId);
        if (!cp) return false;

        cp.userResponse = response;
        cp.status = response.approved
          ? (response.modifications ? 'modified' : 'approved')
          : 'rejected';

        return true;
      }

      getCheckpoint(id: string): Checkpoint | undefined {
        return this.checkpoints.get(id);
      }

      getPendingCheckpoints(): Checkpoint[] {
        return Array.from(this.checkpoints.values())
          .filter(cp => cp.status === 'pending');
      }
    }

    it('should create and track checkpoints', () => {
      const manager = new CheckpointManager();

      const cpId = manager.createCheckpoint({
        checkpointId: 'cp_schema_1',
        agentId: 'data_scientist',
        step: 'schema_validation',
        question: 'Approve detected schema?',
        options: ['Approve', 'Modify', 'Reject'],
        artifacts: [{ type: 'schema', data: { columns: ['id', 'name'] } }]
      });

      const checkpoint = manager.getCheckpoint(cpId);
      expect(checkpoint?.status).toBe('pending');
      expect(checkpoint?.agentId).toBe('data_scientist');
    });

    it('should handle user approval', () => {
      const manager = new CheckpointManager();

      manager.createCheckpoint({
        checkpointId: 'cp_1',
        agentId: 'data_engineer',
        step: 'data_quality',
        question: 'Proceed with analysis?',
        options: ['Yes', 'No'],
        artifacts: []
      });

      manager.respondToCheckpoint('cp_1', {
        approved: true,
        feedback: 'Looks good'
      });

      const checkpoint = manager.getCheckpoint('cp_1');
      expect(checkpoint?.status).toBe('approved');
      expect(checkpoint?.userResponse?.feedback).toBe('Looks good');
    });

    it('should handle user modifications', () => {
      const manager = new CheckpointManager();

      manager.createCheckpoint({
        checkpointId: 'cp_2',
        agentId: 'data_scientist',
        step: 'analysis_plan',
        question: 'Approve analysis approach?',
        options: ['Approve', 'Modify'],
        artifacts: [{ analysisTypes: ['descriptive'] }]
      });

      manager.respondToCheckpoint('cp_2', {
        approved: true,
        modifications: { addAnalysis: 'correlation' }
      });

      const checkpoint = manager.getCheckpoint('cp_2');
      expect(checkpoint?.status).toBe('modified');
      expect(checkpoint?.userResponse?.modifications?.addAnalysis).toBe('correlation');
    });

    it('should track pending checkpoints', () => {
      const manager = new CheckpointManager();

      manager.createCheckpoint({
        checkpointId: 'cp_a',
        agentId: 'agent_a',
        step: 'step_1',
        question: 'Q1?',
        options: ['Yes', 'No'],
        artifacts: []
      });

      manager.createCheckpoint({
        checkpointId: 'cp_b',
        agentId: 'agent_b',
        step: 'step_2',
        question: 'Q2?',
        options: ['Yes', 'No'],
        artifacts: []
      });

      manager.respondToCheckpoint('cp_a', { approved: true });

      const pending = manager.getPendingCheckpoints();
      expect(pending).toHaveLength(1);
      expect(pending[0].checkpointId).toBe('cp_b');
    });
  });

  describe('Error Recovery in U2A2A2U Flow', () => {
    /**
     * Tests error handling and recovery at each phase
     */

    interface AgentError {
      agentId: string;
      phase: string;
      error: string;
      recoverable: boolean;
      fallback?: any;
    }

    const handleAgentError = (error: AgentError): {
      action: 'retry' | 'skip' | 'abort';
      fallbackResult?: any;
      message: string;
    } => {
      if (error.recoverable && error.fallback) {
        return {
          action: 'skip',
          fallbackResult: error.fallback,
          message: `Agent ${error.agentId} failed at ${error.phase}, using fallback`
        };
      }

      if (error.phase === 'translation') {
        // BA translation failure is recoverable - return raw results
        return {
          action: 'skip',
          fallbackResult: { summary: 'Raw analysis results (translation unavailable)' },
          message: 'Business translation failed, returning raw results'
        };
      }

      if (error.phase === 'requirements' || error.phase === 'validation') {
        return {
          action: 'abort',
          message: `Critical failure in ${error.phase}: ${error.error}`
        };
      }

      return {
        action: 'retry',
        message: `Retrying ${error.agentId} at ${error.phase}`
      };
    };

    it('should use fallback when available', () => {
      const error: AgentError = {
        agentId: 'data_engineer',
        phase: 'validation',
        error: 'API timeout',
        recoverable: true,
        fallback: { dataQuality: { score: 0.7, note: 'estimated' } }
      };

      const result = handleAgentError(error);

      expect(result.action).toBe('skip');
      expect(result.fallbackResult).toBeDefined();
      expect(result.fallbackResult.dataQuality.note).toBe('estimated');
    });

    it('should abort on critical phase failures', () => {
      const error: AgentError = {
        agentId: 'data_scientist',
        phase: 'requirements',
        error: 'Unable to parse questions',
        recoverable: false
      };

      const result = handleAgentError(error);

      expect(result.action).toBe('abort');
      expect(result.message).toContain('Critical failure');
    });

    it('should provide raw results when BA fails', () => {
      const error: AgentError = {
        agentId: 'business_agent',
        phase: 'translation',
        error: 'Translation service unavailable',
        recoverable: false
      };

      const result = handleAgentError(error);

      expect(result.action).toBe('skip');
      expect(result.fallbackResult).toBeDefined();
      expect(result.message).toContain('raw results');
    });
  });
});
