/**
 * Required Data Elements Tool
 *
 * Progressive artifact that maps user goals → analysis requirements → data transformations
 *
 * Flow:
 * 1. Data Scientist analyzes goals/questions → defines analysis path & required data elements
 * 2. Data Engineer (when dataset available) → adds transformation logic to meet requirements
 * 3. Tool outputs mapping document that updates progressively
 */

import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import { TransformationValidator } from '../transformation-validator';
import { normalizeQuestions } from '../../utils/question-normalizer';

/**
 * Required data element specification
 */
export interface RequiredDataElement {
    elementId: string;
    elementName: string;
    description: string;
    dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean' | 'geospatial';
    purpose: string; // Why this element is needed for the analysis
    analysisUsage: string[]; // Which analyses use this element
    required: boolean;

    // Question linkage (CRITICAL for traceability)
    relatedQuestions: string[]; // The business questions this element helps answer
    questionIds?: string[]; // Optional: IDs of related questions for tracking

    // Source mapping (populated when dataset available)
    sourceField?: string;
    sourceDataType?: string;
    sourceAvailable: boolean;

    // Transformation logic (populated by Data Engineer)
    transformationRequired: boolean;
    transformationLogic?: {
        operation: string;
        description: string;
        code?: string; // Python/SQL code for transformation
        dependencies?: string[]; // Other fields needed for transformation
        validationRules?: string[];
    };

    // Quality checks
    qualityRequirements?: {
        completeness: number; // % non-null required
        uniqueness?: boolean;
        validRange?: { min?: number; max?: number };
        allowedValues?: any[];
        format?: string; // e.g., "YYYY-MM-DD" for dates
    };

    // Alternatives (if primary source not available)
    alternatives?: Array<{
        sourceField: string;
        transformationLogic: string;
        confidence: number; // How well this alternative meets the need
    }>;
}

/**
 * Analysis path specification from Data Scientist
 */
export interface AnalysisPath {
    analysisId: string;
    analysisName: string;
    analysisType: 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';
    description: string;
    techniques: string[]; // e.g., ["regression", "time-series", "clustering"]
    requiredDataElements: string[]; // References to elementIds
    expectedArtifacts: Array<{
        artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
        description: string;
    }>;
    estimatedDuration: string;
    dependencies: string[]; // Other analysis IDs that must complete first
}

/**
 * Complete mapping document (progressive artifact)
 */
export interface DataRequirementsMappingDocument {
    documentId: string;
    projectId: string;
    version: number;
    status: 'draft' | 'data_scientist_complete' | 'data_engineer_complete' | 'validated' | 'approved';
    createdAt: Date;
    updatedAt: Date;

    // Input context
    userGoals: string[];
    userQuestions: string[];
    datasetAvailable: boolean;
    datasetMetadata?: {
        fileName: string;
        rowCount: number;
        columnCount: number;
        schema: Record<string, any>;
    };

    // Data Scientist contributions
    analysisPath: AnalysisPath[];
    requiredDataElements: RequiredDataElement[];

    // Data Engineer contributions (when dataset available)
    transformationPlan?: {
        transformationSteps: Array<{
            stepId: string;
            stepName: string;
            description: string;
            affectedElements: string[]; // elementIds
            code: string;
            estimatedDuration: string;
        }>;
        dataQualityChecks: Array<{
            checkName: string;
            description: string;
            targetElements: string[];
            validationCode: string;
        }>;
    };

    // Progress tracking
    completeness: {
        totalElements: number;
        elementsMapped: number;
        elementsWithTransformation: number;
        readyForExecution: boolean;
    };

    // Gaps and recommendations
    gaps: Array<{
        type: 'missing_data' | 'transformation_needed' | 'quality_issue';
        description: string;
        affectedElements: string[];
        recommendation: string;
        severity: 'high' | 'medium' | 'low';
    }>;

    // Question-to-Answer Mapping (NEW - Phase 1)
    questionAnswerMapping?: Array<{
        questionId: string;
        questionText: string;
        requiredDataElements: string[]; // elementIds
        recommendedAnalyses: string[]; // analysisIds
        transformationsNeeded: string[]; // elementIds that need transformation
        expectedArtifacts: Array<{
            artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
            description: string;
        }>;
    }>;
}

/**
 * Required Data Elements Tool
 */
export class RequiredDataElementsTool {

    /**
     * Phase 1: Data Scientist defines analysis path and required data elements
     * (Called before dataset is uploaded)
     */
    async defineRequirements(input: {
        projectId: string;
        userGoals: string[];
        userQuestions: string[];
        datasetMetadata?: any;
    }): Promise<DataRequirementsMappingDocument> {
        console.log('📋 [Data Elements Tool] Phase 1: Defining requirements from goals and questions');

        // Normalize questions to handle object/string mix (fixes: question.toLowerCase crash)
        const normalizedQuestions = normalizeQuestions(input.userQuestions);
        const normalizedGoals = normalizeQuestions(input.userGoals);

        // Use Data Scientist Agent to properly infer analysis types and required data elements
        const analysisPath = await this.inferAnalysisPathWithDataScientist(
            normalizedGoals,
            normalizedQuestions,
            input.datasetMetadata
        );

        // FIX: ALWAYS generate analysis-based elements first (what data is NEEDED)
        // These represent the conceptual data requirements based on goals/questions
        // NOT just listing existing columns - that defeats the purpose of verification!
        //
        // The verification step is where users MAP these requirements TO their columns
        // So we must show meaningful analysis-based elements like:
        //   - "Employee Engagement Score" (conceptual need)
        //   - "Survey Response Rate" (derived metric)
        //   - "Temporal Trend Indicator" (analysis requirement)
        //
        // NOT column names like "Q1_Workload" or "Q2_Growth" - those come from the DATASET
        console.log(`🎯 [Data Elements Tool] Generating analysis-based requirements (NOT column-based)`);
        let requiredDataElements: RequiredDataElement[] = await this.inferRequiredDataElementsFromAnalyses(
            analysisPath,
            normalizedGoals,
            normalizedQuestions
        );

        // If dataset is available, ENHANCE (not replace) with column mapping suggestions
        // This helps pre-fill sourceField suggestions, but keeps the conceptual elements
        if (input.datasetMetadata?.columns && input.datasetMetadata.columns.length > 0) {
            console.log(`📊 [Data Elements Tool] Dataset available - enhancing with column mapping hints`);
            requiredDataElements = await this.enhanceElementsWithColumnMapping(
                requiredDataElements,
                input.datasetMetadata,
                normalizedGoals,
                normalizedQuestions
            );
        }

        // Generate question-to-answer mapping (Phase 1 enhancement)
        // Pass projectId to generate stable question IDs matching those in project_questions table
        const questionAnswerMapping = this.generateQuestionAnswerMapping(
            normalizedQuestions,
            analysisPath,
            requiredDataElements,
            input.projectId
        );

        const document: DataRequirementsMappingDocument = {
            documentId: `req-doc-${nanoid()}`,
            projectId: input.projectId,
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date(),
            userGoals: input.userGoals,
            userQuestions: input.userQuestions,
            datasetAvailable: false,
            analysisPath,
            requiredDataElements,
            questionAnswerMapping,
            completeness: {
                totalElements: requiredDataElements.length,
                elementsMapped: 0,
                elementsWithTransformation: 0,
                readyForExecution: false
            },
            gaps: []
        };

        console.log(`✅ [Data Elements Tool] Defined ${analysisPath.length} analyses requiring ${requiredDataElements.length} data elements`);
        return document;
    }

    /**
     * Phase 2: Data Engineer maps dataset to requirements and adds transformation logic
     * (Called after dataset is uploaded)
     */
    async mapDatasetToRequirements(
        document: DataRequirementsMappingDocument,
        dataset: {
            fileName: string;
            rowCount: number;
            schema: Record<string, any>;
            preview: any[];
            piiFields?: string[]; // Optional PII field list
        }
    ): Promise<DataRequirementsMappingDocument> {
        console.log('🔧 [Data Elements Tool] Phase 2: Mapping dataset to requirements');

        // Sanitize preview data before any AI analysis
        const sanitizedPreview = this.sanitizeForAI(dataset.preview, dataset.piiFields || []);

        // Update document with dataset metadata
        document.datasetAvailable = true;
        document.datasetMetadata = {
            fileName: dataset.fileName,
            rowCount: dataset.rowCount,
            columnCount: Object.keys(dataset.schema).length,
            schema: dataset.schema
        };

        // Map each required element to dataset fields
        const availableFields = Object.keys(dataset.schema);
        let mappedCount = 0;
        let transformationCount = 0;
        const gaps: typeof document.gaps = [];

        for (const element of document.requiredDataElements) {
            // Get question context for this element to improve matching
            const questionContext = element.relatedQuestions || [];
            const mapping = await this.findBestMatch(
                element, 
                availableFields, 
                dataset.schema, 
                sanitizedPreview,
                questionContext
            );

            if (mapping.found) {
                element.sourceField = mapping.sourceField;
                element.sourceDataType = mapping.sourceDataType;
                element.sourceAvailable = true;
                // CRITICAL: Normalize confidence to 0-1 range (UI expects 0-1, findBestMatch returns 0-100)
                (element as any).confidence = (mapping.confidence || 0) / 100;
                mappedCount++;

                if (mapping.transformationNeeded) {
                    element.transformationRequired = true;

                    // Validate transformation code before storing
                    if (mapping.transformationLogic?.code) {
                        const validation = TransformationValidator.validate(mapping.transformationLogic.code);
                        if (!validation.valid) {
                            console.warn(`⚠️  Invalid transformation code for ${element.elementName}: ${validation.error}`);
                            // Store error but don't fail the mapping
                            mapping.transformationLogic.validationError = validation.error;
                        } else if (validation.warnings) {
                            mapping.transformationLogic.warnings = validation.warnings;
                        }
                    }

                    element.transformationLogic = mapping.transformationLogic;
                    transformationCount++;
                } else {
                    element.transformationRequired = false;
                }
            } else {
                element.sourceAvailable = false;
                element.transformationRequired = false;

                // Add gap
                gaps.push({
                    type: 'missing_data',
                    description: `Required element "${element.elementName}" not found in dataset`,
                    affectedElements: [element.elementId],
                    recommendation: mapping.alternatives.length > 0
                        ? `Consider using alternative fields: ${mapping.alternatives.join(', ')}`
                        : 'User must provide this data or revise analysis goals',
                    severity: element.required ? 'high' : 'medium'
                });
            }
        }

        // Generate transformation plan
        document.transformationPlan = this.generateTransformationPlan(document.requiredDataElements);

        // Update questionAnswerMapping with transformation information (Phase 1 enhancement)
        if (document.questionAnswerMapping) {
            document.questionAnswerMapping = document.questionAnswerMapping.map(qaMap => {
                // Update transformationsNeeded based on actual transformation status
                const questionElements = qaMap.requiredDataElements
                    .map(elemId => document.requiredDataElements.find(el => el.elementId === elemId))
                    .filter(Boolean) as RequiredDataElement[];

                const transformationsNeeded = questionElements
                    .filter(el => el.transformationRequired)
                    .map(el => el.elementId);

                return {
                    ...qaMap,
                    transformationsNeeded
                };
            });
        }

        // Update status and completeness
        document.version += 1;
        document.status = 'data_engineer_complete';
        document.updatedAt = new Date();
        document.completeness = {
            totalElements: document.requiredDataElements.length,
            elementsMapped: mappedCount,
            elementsWithTransformation: transformationCount,
            readyForExecution: mappedCount === document.requiredDataElements.filter(e => e.required).length
        };
        document.gaps = gaps;

        console.log(`✅ [Data Elements Tool] Mapped ${mappedCount}/${document.requiredDataElements.length} elements, ${transformationCount} need transformation`);
        return document;
    }

    /**
     * Sanitize data for AI analysis - remove PII
     */
    private sanitizeForAI(preview: any[], piiFields: string[]): any[] {
        if (!piiFields || piiFields.length === 0) {
            // Return first 10 rows for analysis
            return preview.slice(0, 10);
        }

        console.log(`🔒 [Data Elements Tool] Sanitizing ${piiFields.length} PII fields for AI analysis`);

        return preview.slice(0, 10).map(row => {
            const sanitized = { ...row };
            piiFields.forEach(field => {
                if (sanitized[field] !== undefined) {
                    // Replace PII with placeholder
                    sanitized[field] = `[REDACTED_${field.toUpperCase()}]`;
                }
            });
            return sanitized;
        });
    }

    /**
     * Use Data Scientist Agent to infer analysis types from goals and questions
     */
    private async inferAnalysisPathWithDataScientist(
        userGoals: string[],
        userQuestions: string[],
        datasetMetadata?: any
    ): Promise<AnalysisPath[]> {
        const { DataScientistAgent } = await import('../data-scientist-agent');
        const dataScientist = new DataScientistAgent();

        console.log('🔬 [Data Elements Tool] Consulting Data Scientist Agent for analysis inference');

        // Get analysis recommendations from Data Scientist
        // Get analysis recommendations from Data Scientist
        const config = await dataScientist.recommendAnalysisConfig({
            userQuestions,
            analysisGoal: userGoals.join('; '),
            datasetMetadata,
            dataAnalysis: {
                estimatedRows: datasetMetadata?.rowCount || 1000,
                dataCharacteristics: {
                    hasTimeSeries: userQuestions.some(q => /time|trend|forecast|date|temporal|seasonal/i.test(q)),
                    hasCategories: true,
                    hasNumeric: true,
                    hasText: false
                }
            }
        });

        const recommendedAnalyses = config.recommendedAnalyses || config.analyses || [];
        const complexity = config.complexity || 'medium';

        console.log(`✅ [Data Scientist] Recommended ${recommendedAnalyses.length} analyses with ${complexity} complexity`);
        console.log('   Analyses:', recommendedAnalyses);
        console.log('   Estimated time:', config.estimatedProcessingTime);

        // Map Data Scientist recommendations to AnalysisPath format
        const analysisPath: AnalysisPath[] = recommendedAnalyses.map((analysisName, index) => {
            const analysisType = this.mapAnalysisNameToType(analysisName);
            const techniques = this.inferTechniquesFromName(analysisName);

            return {
                analysisId: `analysis-${nanoid(6)}`,
                analysisName,
                analysisType,
                description: this.generateAnalysisDescription(analysisName, userGoals),
                techniques,
                requiredDataElements: [], // Will be populated next
                expectedArtifacts: this.inferArtifactsFromAnalysis(analysisName),
                estimatedDuration: config.estimatedProcessingTime || '5-10 minutes',
                dependencies: [] // Will be set after array is built
            };
        });

        // Set dependencies after all analyses are created
        analysisPath.forEach((analysis, index) => {
            if (index > 0 && analysisPath[0]) {
                analysis.dependencies = [analysisPath[0].analysisId]; // Depend on first analysis
            }
        });

        // Ensure we always have at least descriptive analysis
        if (analysisPath.length === 0) {
            analysisPath.push({
                analysisId: `analysis-${nanoid(6)}`,
                analysisName: 'Exploratory Data Analysis',
                analysisType: 'descriptive',
                description: 'Understand data distributions, patterns, and basic statistics',
                techniques: ['summary_statistics', 'distribution_analysis', 'correlation_analysis'],
                requiredDataElements: [],
                expectedArtifacts: [
                    { artifactType: 'visualization', description: 'Distribution charts and correlation heatmap' },
                    { artifactType: 'report', description: 'Statistical summary report' }
                ],
                estimatedDuration: '5-10 minutes',
                dependencies: []
            });
        }

        return analysisPath;
    }

    /**
     * Map analysis name from Data Scientist to analysis type
     */
    private mapAnalysisNameToType(analysisName: string): 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive' {
        const lower = analysisName.toLowerCase();
        if (/predict|forecast|time.*series/i.test(lower)) return 'predictive';
        if (/segment|cluster|correlation|compar/i.test(lower)) return 'diagnostic';
        if (/optimi[zs]|recommend|prescri/i.test(lower)) return 'prescriptive';
        return 'descriptive';
    }

    /**
     * Infer techniques from analysis name
     */
    private inferTechniquesFromName(analysisName: string): string[] {
        const lower = analysisName.toLowerCase();
        const techniques: string[] = [];

        if (/time.*series|trend/i.test(lower)) techniques.push('trend_analysis', 'seasonality_detection');
        if (/forecast|predict/i.test(lower)) techniques.push('forecasting', 'predictive_modeling');
        if (/cluster|segment/i.test(lower)) techniques.push('clustering', 'segmentation');
        if (/correlation|relationship/i.test(lower)) techniques.push('correlation_analysis');
        if (/compar/i.test(lower)) techniques.push('comparative_analysis');
        if (/regress/i.test(lower)) techniques.push('regression');
        if (/classif/i.test(lower)) techniques.push('classification');
        if (/descriptive|explorator/i.test(lower)) techniques.push('summary_statistics', 'distribution_analysis');

        return techniques.length > 0 ? techniques : ['statistical_analysis'];
    }

    /**
     * Generate description for analysis based on user goals
     */
    private generateAnalysisDescription(analysisName: string, userGoals: string[]): string {
        const primaryGoal = userGoals[0] || 'the stated objectives';
        const lower = analysisName.toLowerCase();

        if (/predict|forecast/i.test(lower)) {
            return `Develop predictive models to support ${primaryGoal.toLowerCase()} and quantify forecast confidence`;
        }
        if (/segment|cluster/i.test(lower)) {
            return `Identify natural groupings and patterns to address ${primaryGoal.toLowerCase()}`;
        }
        if (/correlation|relationship/i.test(lower)) {
            return `Surface statistically significant relationships that influence ${primaryGoal.toLowerCase()}`;
        }
        if (/trend|time/i.test(lower)) {
            return `Analyze temporal patterns and trends related to ${primaryGoal.toLowerCase()}`;
        }
        if (/compar/i.test(lower)) {
            return `Compare different segments and groups to inform ${primaryGoal.toLowerCase()}`;
        }
        return `Analyze data to support ${primaryGoal.toLowerCase()}`;
    }

    /**
     * Infer expected artifacts from analysis type
     */
    private inferArtifactsFromAnalysis(analysisName: string): Array<{
        artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
        description: string;
    }> {
        const lower = analysisName.toLowerCase();
        const artifacts: Array<any> = [];

        if (/predict|forecast/i.test(lower)) {
            artifacts.push(
                { artifactType: 'model', description: 'Trained predictive model' },
                { artifactType: 'metric', description: 'Model performance metrics' },
                { artifactType: 'visualization', description: 'Forecast visualizations' }
            );
        } else if (/cluster|segment/i.test(lower)) {
            artifacts.push(
                { artifactType: 'visualization', description: 'Cluster visualization' },
                { artifactType: 'dashboard', description: 'Segment comparison dashboard' },
                { artifactType: 'report', description: 'Segment profiles' }
            );
        } else if (/correlation/i.test(lower)) {
            artifacts.push(
                { artifactType: 'visualization', description: 'Correlation heatmap' },
                { artifactType: 'report', description: 'Statistical significance tests' }
            );
        } else {
            artifacts.push(
                { artifactType: 'visualization', description: 'Statistical charts' },
                { artifactType: 'report', description: 'Analysis report' }
            );
        }

        return artifacts;
    }

    /**
     * DEPRECATED: Old keyword-based analysis path inference
     * Kept for backward compatibility but no longer used in Phase 1
     */
    private inferAnalysisPath(userGoals: string[], userQuestions: string[]): AnalysisPath[] {
        const goalsText = userGoals.join(' ').toLowerCase();
        const questionsText = userQuestions.join(' ').toLowerCase();
        const combined = `${goalsText} ${questionsText}`;

        const analysisPath: AnalysisPath[] = [];

        // Descriptive analysis (always needed)
        analysisPath.push({
            analysisId: `analysis-${nanoid(6)}`,
            analysisName: 'Exploratory Data Analysis',
            analysisType: 'descriptive',
            description: 'Understand data distributions, patterns, and basic statistics',
            techniques: ['summary_statistics', 'distribution_analysis', 'correlation_analysis'],
            requiredDataElements: [], // Will be populated
            expectedArtifacts: [
                { artifactType: 'visualization', description: 'Distribution charts and correlation heatmap' },
                { artifactType: 'report', description: 'Statistical summary report' }
            ],
            estimatedDuration: '5-10 minutes',
            dependencies: []
        });

        // Time-series analysis
        if (/trend|time|forecast|predict.*future|temporal|seasonal/i.test(combined)) {
            analysisPath.push({
                analysisId: `analysis-${nanoid(6)}`,
                analysisName: 'Time-Series Analysis',
                analysisType: 'predictive',
                description: 'Analyze temporal patterns, trends, and forecasting',
                techniques: ['trend_analysis', 'seasonality_detection', 'forecasting'],
                requiredDataElements: [],
                expectedArtifacts: [
                    { artifactType: 'visualization', description: 'Time-series plot with trend lines' },
                    { artifactType: 'model', description: 'Forecasting model' },
                    { artifactType: 'metric', description: 'Forecast accuracy metrics' }
                ],
                estimatedDuration: '15-20 minutes',
                dependencies: [analysisPath[0].analysisId]
            });
        }

        // Segmentation/clustering analysis
        if (/segment|cluster|group|customer.*type|pattern.*recognition/i.test(combined)) {
            analysisPath.push({
                analysisId: `analysis-${nanoid(6)}`,
                analysisName: 'Segmentation Analysis',
                analysisType: 'diagnostic',
                description: 'Identify natural groupings and customer segments',
                techniques: ['clustering', 'pca', 'segmentation'],
                requiredDataElements: [],
                expectedArtifacts: [
                    { artifactType: 'visualization', description: 'Cluster visualization and profiles' },
                    { artifactType: 'dashboard', description: 'Segment comparison dashboard' },
                    { artifactType: 'report', description: 'Segment characteristics report' }
                ],
                estimatedDuration: '15-25 minutes',
                dependencies: [analysisPath[0].analysisId]
            });
        }

        // Predictive modeling
        if (/predict|model|machine.*learning|classify|regression|churn|conversion/i.test(combined)) {
            analysisPath.push({
                analysisId: `analysis-${nanoid(6)}`,
                analysisName: 'Predictive Modeling',
                analysisType: 'predictive',
                description: 'Build models to predict outcomes or behaviors',
                techniques: ['regression', 'classification', 'feature_engineering', 'model_validation'],
                requiredDataElements: [],
                expectedArtifacts: [
                    { artifactType: 'model', description: 'Trained predictive model' },
                    { artifactType: 'metric', description: 'Model performance metrics (accuracy, precision, recall)' },
                    { artifactType: 'visualization', description: 'Feature importance chart' }
                ],
                estimatedDuration: '20-30 minutes',
                dependencies: [analysisPath[0].analysisId]
            });
        }

        // Prescriptive/optimization analysis
        if (/optimi[zs]e|recommend|what.*should|action|prescribe|improve/i.test(combined)) {
            analysisPath.push({
                analysisId: `analysis-${nanoid(6)}`,
                analysisName: 'Prescriptive Analysis',
                analysisType: 'prescriptive',
                description: 'Generate actionable recommendations and optimization strategies',
                techniques: ['optimization', 'simulation', 'recommendation_engine'],
                requiredDataElements: [],
                expectedArtifacts: [
                    { artifactType: 'dashboard', description: 'Recommendation dashboard' },
                    { artifactType: 'report', description: 'Action plan report' }
                ],
                estimatedDuration: '15-20 minutes',
                dependencies: analysisPath.slice(0, 2).map(a => a.analysisId)
            });
        }

        return analysisPath;
    }

    /**
     * Infer required data elements from analysis path and user questions
     * Uses Data Scientist Agent to answer: "What data do I need to answer these questions and achieve these goals?"
     */
    private async inferRequiredDataElementsFromAnalyses(
        analysisPath: AnalysisPath[],
        userGoals: string[],
        userQuestions: string[]
    ): Promise<RequiredDataElement[]> {
        const elements: RequiredDataElement[] = [];

        console.log(`📊 [Data Elements Tool] Inferring data elements from ${analysisPath.length} analyses and ${userQuestions.length} questions`);
        console.log(`   User Goals: ${userGoals.join('; ')}`);
        console.log(`   User Questions: ${userQuestions.join('; ')}`);

        try {
            // Call Data Scientist Agent to infer required data elements
            const { DataScientistAgent } = await import('../data-scientist-agent');
            const dataScientist = new DataScientistAgent();

            const analysisTypes = analysisPath.map(a => a.analysisName);
            console.log(`   Analysis Types: ${analysisTypes.join(', ')}`);

            const inferredElements = await dataScientist.inferRequiredDataElements({
                userQuestions,
                userGoals,
                analysisTypes
            });

            console.log(`🔬 [Data Scientist] Returned ${inferredElements.length} inferred data elements:`);
            inferredElements.forEach((el, idx) => {
                console.log(`   ${idx + 1}. ${el.elementName} (${el.dataType}) - ${el.required ? 'Required' : 'Optional'}`);
            });

            // Convert Data Scientist's inferred elements to RequiredDataElement format
            for (const inferredEl of inferredElements) {
                // Find which analyses use this element
                const relevantAnalyses = analysisPath.filter(a =>
                    inferredEl.relatedQuestions.some(q =>
                        a.description.toLowerCase().includes(q.toLowerCase().slice(0, 20))
                    )
                ).map(a => a.analysisId);

                // CRITICAL: Preserve the question linkage for traceability
                // This allows us to show which questions each data element helps answer
                elements.push({
                    elementId: `elem-${nanoid(6)}`,
                    elementName: inferredEl.elementName,
                    description: inferredEl.description,
                    dataType: inferredEl.dataType,
                    purpose: inferredEl.purpose,
                    analysisUsage: relevantAnalyses.length > 0 ? relevantAnalyses : analysisPath.slice(0, 1).map(a => a.analysisId),
                    required: inferredEl.required,
                    // PRESERVE QUESTION LINKAGE - this is the key fix
                    relatedQuestions: inferredEl.relatedQuestions || [],
                    questionIds: inferredEl.relatedQuestions?.map((q, idx) => `q-${idx}`),
                    sourceAvailable: false,
                    transformationRequired: false,
                    qualityRequirements: inferredEl.elementName.toLowerCase().includes('identifier') || inferredEl.elementName.toLowerCase().includes('id')
                        ? { completeness: 100, uniqueness: true }
                        : { completeness: inferredEl.required ? 90 : 70 }
                });
            }

            console.log(`✅ [Data Elements Tool] Generated ${elements.length} required data elements`);

        } catch (error) {
            console.error('❌ [Data Elements Tool] Error inferring data elements:', error);
            // Fallback: Add at least a basic identifier
            elements.push({
                elementId: `elem-${nanoid(6)}`,
                elementName: 'Record Identifier',
                description: 'Unique identifier for each record',
                dataType: 'text',
                purpose: 'Track and reference individual records throughout analysis',
                analysisUsage: analysisPath.map(a => a.analysisId),
                required: true,
                relatedQuestions: userQuestions, // Link to all questions as fallback
                sourceAvailable: false,
                transformationRequired: false,
                qualityRequirements: {
                    completeness: 100,
                    uniqueness: true
                }
            });
        }

        // Ensure we always have at least one element
        if (elements.length === 0) {
            console.warn('⚠️ [Data Elements Tool] No elements inferred, adding default identifier');
            elements.push({
                elementId: `elem-${nanoid(6)}`,
                elementName: 'Record Identifier',
                description: 'Unique identifier for each record',
                dataType: 'text',
                purpose: 'Track and reference individual records throughout analysis',
                analysisUsage: analysisPath.map(a => a.analysisId),
                required: true,
                relatedQuestions: userQuestions, // Link to all questions as fallback
                sourceAvailable: false,
                transformationRequired: false,
                qualityRequirements: {
                    completeness: 100,
                    uniqueness: true
                }
            });
        }

        return elements;
    }

    /**
     * Find best matching field in dataset for a required element
     * ENHANCED: Uses question context and semantic matching to improve mapping accuracy
     */
    private async findBestMatch(
        element: RequiredDataElement,
        availableFields: string[],
        schema: Record<string, any>,
        preview: any[],
        questionContext?: string[] // NEW: Questions this element helps answer
    ): Promise<{
        found: boolean;
        sourceField?: string;
        sourceDataType?: string;
        transformationNeeded: boolean;
        transformationLogic?: any;
        alternatives: string[];
        confidence?: number; // NEW: Confidence score for the match
    }> {
        // Try exact name match first
        const exactMatch = availableFields.find(f =>
            f.toLowerCase() === element.elementName.toLowerCase()
        );

        if (exactMatch) {
            const fieldType = schema[exactMatch]?.type;
            const needsTransform = !this.typesMatch(element.dataType, fieldType);

            return {
                found: true,
                sourceField: exactMatch,
                sourceDataType: fieldType,
                transformationNeeded: needsTransform,
                confidence: 100, // Exact match = 100% confidence
                transformationLogic: needsTransform ? {
                    operation: `convert_to_${element.dataType}`,
                    description: `Convert ${fieldType} to ${element.dataType}`,
                    code: this.generateTransformationCode(exactMatch, fieldType, element.dataType)
                } : undefined,
                alternatives: []
            };
        }

        // ENHANCED: Try semantic matching using question context and AI
        const candidates = await this.findCandidateFieldsEnhanced(
            element, 
            availableFields, 
            schema, 
            preview,
            questionContext
        );

        if (candidates.length > 0 && candidates[0].score >= 30) { // Lower threshold to catch more matches
            const best = candidates[0];
            const fieldType = schema[best.field]?.type;
            const needsTransform = !this.typesMatch(element.dataType, fieldType);

            return {
                found: true,
                sourceField: best.field,
                sourceDataType: fieldType,
                transformationNeeded: needsTransform,
                confidence: best.score, // Use calculated confidence
                transformationLogic: needsTransform ? {
                    operation: `convert_to_${element.dataType}`,
                    description: `Convert ${fieldType} to ${element.dataType}`,
                    code: this.generateTransformationCode(best.field, fieldType, element.dataType),
                    validationRules: element.qualityRequirements?.format ? [
                        `Validate format: ${element.qualityRequirements.format}`
                    ] : []
                } : undefined,
                alternatives: candidates.slice(1).map(c => c.field)
            };
        }

        return {
            found: false,
            transformationNeeded: false,
            alternatives: candidates.map(c => c.field),
            confidence: candidates.length > 0 ? candidates[0].score : 0
        };
    }

    /**
     * ENHANCED: Find candidate fields using semantic matching with question context
     */
    private async findCandidateFieldsEnhanced(
        element: RequiredDataElement, 
        fields: string[], 
        schema: Record<string, any>,
        preview: any[],
        questionContext?: string[]
    ): Promise<Array<{ field: string; score: number; reason?: string }>> {
        const candidates: Array<{ field: string; score: number; reason?: string }> = [];

        // Build context for AI matching
        const elementContext = {
            elementName: element.elementName,
            description: element.description,
            purpose: element.purpose,
            dataType: element.dataType,
            relatedQuestions: questionContext || []
        };

        for (const field of fields) {
            let score = 0;
            const reasons: string[] = [];
            const fieldLower = field.toLowerCase();
            const elementLower = element.elementName.toLowerCase();

            // 1. Exact or near-exact name match (highest priority)
            if (fieldLower === elementLower) {
                score += 100;
                reasons.push('exact name match');
            } else if (fieldLower.includes(elementLower) || elementLower.includes(fieldLower)) {
                score += 50;
                reasons.push('partial name match');
            }

            // 2. Type compatibility
            if (this.typesMatch(element.dataType, schema[field]?.type)) {
                score += 30;
                reasons.push('type compatible');
            }

            // 3. Keyword matching based on purpose
            const purposeKeywords = element.purpose.toLowerCase().split(' ').filter(w => w.length > 3);
            for (const keyword of purposeKeywords) {
                if (fieldLower.includes(keyword)) {
                    score += 15;
                    reasons.push(`purpose keyword: ${keyword}`);
                }
            }

            // 4. ENHANCED: Question context matching
            if (questionContext && questionContext.length > 0) {
                const questionText = questionContext.join(' ').toLowerCase();
                const questionKeywords = questionText.split(' ').filter(w => w.length > 3);
                
                // Check if field name appears in questions
                for (const keyword of questionKeywords) {
                    if (fieldLower.includes(keyword)) {
                        score += 20;
                        reasons.push(`mentioned in question: ${keyword}`);
                    }
                }

                // Check if field values relate to question topics
                if (preview.length > 0) {
                    const sampleValues = preview.slice(0, 5).map(row => String(row[field] || '')).join(' ').toLowerCase();
                    const questionWords = questionText.split(' ').filter(w => w.length > 4);
                    const matchingWords = questionWords.filter(qw => sampleValues.includes(qw));
                    if (matchingWords.length > 0) {
                        score += 10 * matchingWords.length;
                        reasons.push(`field values relate to question topics`);
                    }
                }
            }

            // 5. Description matching
            if (element.description) {
                const descKeywords = element.description.toLowerCase().split(' ').filter(w => w.length > 3);
                for (const keyword of descKeywords) {
                    if (fieldLower.includes(keyword)) {
                        score += 10;
                        reasons.push(`description keyword: ${keyword}`);
                    }
                }
            }

            // 6. Common patterns (ID fields, date fields, etc.)
            if (element.elementName.toLowerCase().includes('id') && 
                (fieldLower.includes('id') || fieldLower.includes('key') || fieldLower.includes('code'))) {
                score += 25;
                reasons.push('ID pattern match');
            }
            if (element.elementName.toLowerCase().includes('date') && 
                (fieldLower.includes('date') || fieldLower.includes('time') || fieldLower.includes('timestamp'))) {
                score += 25;
                reasons.push('date pattern match');
            }

            // Lower threshold to catch more potential matches
            if (score >= 20) {
                candidates.push({ 
                    field, 
                    score: Math.min(score, 100), // Cap at 100
                    reason: reasons.join(', ')
                });
            }
        }

        return candidates.sort((a, b) => b.score - a.score);
    }

    /**
     * LEGACY: Basic candidate field finder (kept for backward compatibility)
     */
    private findCandidateFields(element: RequiredDataElement, fields: string[], schema: Record<string, any>): string[] {
        const candidates: Array<{ field: string; score: number }> = [];

        for (const field of fields) {
            let score = 0;
            const fieldLower = field.toLowerCase();
            const elementLower = element.elementName.toLowerCase();

            // Name similarity
            if (fieldLower.includes(elementLower) || elementLower.includes(fieldLower)) {
                score += 50;
            }

            // Type compatibility
            if (this.typesMatch(element.dataType, schema[field]?.type)) {
                score += 30;
            }

            // Keyword matching based on purpose
            const purposeKeywords = element.purpose.toLowerCase().split(' ');
            for (const keyword of purposeKeywords) {
                if (fieldLower.includes(keyword)) {
                    score += 10;
                }
            }

            if (score > 20) {
                candidates.push({ field, score });
            }
        }

        return candidates.sort((a, b) => b.score - a.score).map(c => c.field);
    }

    private typesMatch(requiredType: string, sourceType: string): boolean {
        const typeMap: Record<string, string[]> = {
            numeric: ['number', 'integer', 'float', 'decimal'],
            categorical: ['string', 'text', 'varchar'],
            datetime: ['date', 'datetime', 'timestamp'],
            text: ['string', 'text', 'varchar'],
            boolean: ['boolean', 'bool', 'bit'],
            geospatial: ['geometry', 'geography', 'point', 'polygon']
        };

        return typeMap[requiredType]?.includes(sourceType?.toLowerCase()) || false;
    }

    private generateTransformationCode(sourceField: string, sourceType: string, targetType: string): string {
        if (targetType === 'datetime' && sourceType === 'string') {
            return `pd.to_datetime(df['${sourceField}'], errors='coerce')`;
        } else if (targetType === 'numeric' && sourceType === 'string') {
            return `pd.to_numeric(df['${sourceField}'], errors='coerce')`;
        } else if (targetType === 'categorical') {
            return `df['${sourceField}'].astype('category')`;
        }
        return `# Transform ${sourceField} from ${sourceType} to ${targetType}`;
    }

    private generateTransformationPlan(elements: RequiredDataElement[]): DataRequirementsMappingDocument['transformationPlan'] {
        const transformationSteps: any[] = [];
        const dataQualityChecks: any[] = [];

        // Group transformations by type
        const elementsNeedingTransform = elements.filter(e => e.transformationRequired && e.transformationLogic);

        for (const element of elementsNeedingTransform) {
            transformationSteps.push({
                stepId: `transform-${nanoid(6)}`,
                stepName: `Transform ${element.elementName}`,
                description: element.transformationLogic!.description,
                affectedElements: [element.elementId],
                code: element.transformationLogic!.code || '',
                estimatedDuration: '2-5 minutes'
            });
        }

        // Generate quality checks
        for (const element of elements) {
            if (element.qualityRequirements) {
                dataQualityChecks.push({
                    checkName: `Validate ${element.elementName}`,
                    description: `Ensure ${element.elementName} meets quality requirements`,
                    targetElements: [element.elementId],
                    validationCode: `
# Check completeness
completeness = (df['${element.sourceField}'].notna().sum() / len(df)) * 100
assert completeness >= ${element.qualityRequirements.completeness}, f"Completeness {completeness}% below threshold ${element.qualityRequirements.completeness}%"
${element.qualityRequirements.uniqueness ? `
# Check uniqueness
assert df['${element.sourceField}'].nunique() == len(df), "Field must have unique values"
` : ''}`.trim()
                });
            }
        }

        return {
            transformationSteps,
            dataQualityChecks
        };
    }

    /**
     * Extract common domain entities from combined goals and questions
     */
    private extractDomainEntities(text: string): Array<{
        name: string;
        type: string;
        dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean';
        required: boolean;
    }> {
        const entities: Array<any> = [];
        const lower = text.toLowerCase();

        // Common business entities
        const entityPatterns = [
            { pattern: /customer|client|buyer|purchaser/i, name: 'Customer', type: 'Entity', dataType: 'categorical' as const, required: false },
            { pattern: /user|member|subscriber/i, name: 'User', type: 'Entity', dataType: 'categorical' as const, required: false },
            { pattern: /employee|staff|worker|teacher|instructor/i, name: 'Employee', type: 'Entity', dataType: 'categorical' as const, required: false },
            { pattern: /product|item|good|service/i, name: 'Product', type: 'Entity', dataType: 'categorical' as const, required: false },
            { pattern: /transaction|purchase|order|sale/i, name: 'Transaction', type: 'Event', dataType: 'categorical' as const, required: false },
            { pattern: /location|region|area|geography|city|state/i, name: 'Location', type: 'Dimension', dataType: 'categorical' as const, required: false },
            { pattern: /department|division|unit|team/i, name: 'Department', type: 'Dimension', dataType: 'categorical' as const, required: false },
            { pattern: /category|class|type|segment/i, name: 'Category', type: 'Dimension', dataType: 'categorical' as const, required: false },
        ];

        // Common metrics
        const metricPatterns = [
            { pattern: /revenue|sales|income|earnings/i, name: 'Revenue', type: 'Metric', dataType: 'numeric' as const, required: false },
            { pattern: /cost|expense|spend|spending/i, name: 'Cost', type: 'Metric', dataType: 'numeric' as const, required: false },
            { pattern: /profit|margin|earnings/i, name: 'Profit', type: 'Metric', dataType: 'numeric' as const, required: false },
            { pattern: /price|pricing|rate/i, name: 'Price', type: 'Metric', dataType: 'numeric' as const, required: false },
            { pattern: /quantity|volume|count|number/i, name: 'Quantity', type: 'Metric', dataType: 'numeric' as const, required: false },
            { pattern: /rating|score|satisfaction|rank/i, name: 'Rating', type: 'Metric', dataType: 'numeric' as const, required: false },
        ];

        // Time-related
        if (/date|time|when|period|month|year|day|week|timestamp/i.test(lower)) {
            entities.push({
                name: 'Date/Time',
                type: 'Temporal',
                dataType: 'datetime' as const,
                required: true
            });
        }

        // Add matching entities (avoiding duplicates)
        const added = new Set<string>();
        [...entityPatterns, ...metricPatterns].forEach(({ pattern, name, type, dataType, required }) => {
            if (pattern.test(lower) && !added.has(name)) {
                entities.push({ name, type, dataType, required });
                added.add(name);
            }
        });

        return entities;
    }

    /**
     * Extract entity name from question
     */
    private extractEntityFromQuestion(question: string, defaultEntity: string): string {
        // Try to find the subject after "who", "which", etc.
        const whoMatch = question.match(/who\s+(?:are|is|were|was)?\s*(?:the|our|my)?\s*([a-z\s]+?)(?:\?|that|with|have|had)/i);
        if (whoMatch) {
            const entity = whoMatch[1].trim().replace(/\?/g, '').replace(/\s+/g, ' ');
            if (entity.length > 2 && entity.length < 30) return this.capitalizeWords(entity);
        }

        const whichMatch = question.match(/which\s+([a-z\s]+?)(?:\s+(?:are|is|were|was|have|had|did|do|does|can|could|would|should)|\?)/i);
        if (whichMatch) {
            const entity = whichMatch[1].trim().replace(/\?/g, '').replace(/\s+/g, ' ');
            if (entity.length > 2 && entity.length < 30) return this.capitalizeWords(entity);
        }

        // Try to extract noun phrases
        const nounMatch = question.match(/(?:the|our|my|each|every)\s+([a-z\s]+?)(?:\s+(?:are|is|were|was|have|had|did|that|which)|\?)/i);
        if (nounMatch) {
            const entity = nounMatch[1].trim().replace(/\?/g, '').replace(/\s+/g, ' ');
            if (entity.length > 2 && entity.length < 30) return this.capitalizeWords(entity);
        }

        return this.capitalizeWords(defaultEntity);
    }

    /**
     * Extract metric name from question
     */
    private extractMetricFromQuestion(question: string, defaultMetric: string): string {
        // Try to find what's being measured
        const howManyMatch = question.match(/how\s+many\s+([a-z\s]+?)(?:\s+(?:are|is|were|was|have|had|did|do|does)|\?)/i);
        if (howManyMatch) {
            const metric = howManyMatch[1].trim().replace(/\?/g, '').replace(/\s+/g, ' ');
            if (metric.length > 2 && metric.length < 30) return this.capitalizeWords(metric);
        }

        const whatCountMatch = question.match(/what\s+(?:is|are)?\s*(?:the)?\s*(?:count|number|total)\s+(?:of)?\s*([a-z\s]+?)(?:\?|$)/i);
        if (whatCountMatch) {
            const metric = whatCountMatch[1].trim().replace(/\?/g, '').replace(/\s+/g, ' ');
            if (metric.length > 2 && metric.length < 30) return this.capitalizeWords(metric);
        }

        const howMuchMatch = question.match(/how\s+much\s+([a-z\s]+?)(?:\s+(?:are|is|were|was|did|do|does)|\?)/i);
        if (howMuchMatch) {
            const metric = howMuchMatch[1].trim().replace(/\?/g, '').replace(/\s+/g, ' ');
            if (metric.length > 2 && metric.length < 30) return this.capitalizeWords(metric);
        }

        const whatAmountMatch = question.match(/what\s+(?:is|are)?\s*(?:the)?\s*(?:amount|value)\s+(?:of)?\s*([a-z\s]+?)(?:\?|$)/i);
        if (whatAmountMatch) {
            const metric = whatAmountMatch[1].trim().replace(/\?/g, '').replace(/\s+/g, ' ');
            if (metric.length > 2 && metric.length < 30) return this.capitalizeWords(metric);
        }

        return defaultMetric;
    }

    /**
     * Generate question-to-answer mapping (Phase 1 enhancement)
     * Maps each user question to required data elements, analyses, and transformations
     * Uses stable question IDs that match those stored in project_questions table
     */
    private generateQuestionAnswerMapping(
        userQuestions: string[],
        analysisPath: AnalysisPath[],
        requiredDataElements: RequiredDataElement[],
        projectId?: string
    ): Array<{
        questionId: string;
        questionText: string;
        requiredDataElements: string[];
        recommendedAnalyses: string[];
        transformationsNeeded: string[];
        expectedArtifacts: Array<{
            artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
            description: string;
        }>;
    }> {
        const mapping: Array<any> = [];

        for (let idx = 0; idx < userQuestions.length; idx++) {
            const question = userQuestions[idx];
            // Generate stable question ID matching QuestionAnswerService.saveProjectQuestions
            const questionHash = crypto.createHash('sha256')
                .update(question.toLowerCase().trim())
                .digest('hex')
                .substring(0, 8);
            const questionId = projectId
                ? `q_${projectId.substring(0, 8)}_${idx}_${questionHash}`
                : `q-${idx}`;

            // Find data elements related to this question
            const relatedElements = requiredDataElements.filter(el =>
                el.relatedQuestions && el.relatedQuestions.some(q =>
                    q.toLowerCase().includes(question.toLowerCase().slice(0, 20)) ||
                    question.toLowerCase().includes(q.toLowerCase().slice(0, 20))
                )
            );

            // Find analyses that can answer this question
            const relatedAnalyses = analysisPath.filter(analysis => {
                const questionLower = question.toLowerCase();
                const analysisLower = analysis.description.toLowerCase();
                return questionLower.split(' ').some(word =>
                    word.length > 3 && analysisLower.includes(word)
                );
            });

            // Find elements that need transformation
            const elementsNeedingTransform = relatedElements
                .filter(el => el.transformationRequired)
                .map(el => el.elementId);

            // Aggregate expected artifacts from related analyses
            const expectedArtifacts: Array<any> = [];
            relatedAnalyses.forEach(analysis => {
                analysis.expectedArtifacts.forEach(artifact => {
                    if (!expectedArtifacts.find(a => a.artifactType === artifact.artifactType)) {
                        expectedArtifacts.push(artifact);
                    }
                });
            });

            mapping.push({
                questionId,
                questionText: question,
                requiredDataElements: relatedElements.map(el => el.elementId),
                recommendedAnalyses: relatedAnalyses.map(a => a.analysisId),
                transformationsNeeded: elementsNeedingTransform,
                expectedArtifacts: expectedArtifacts.length > 0 ? expectedArtifacts : [
                    { artifactType: 'visualization', description: 'Charts and graphs' },
                    { artifactType: 'report', description: 'Analysis report' }
                ]
            });
        }

        return mapping;
    }

    /**
     * Generate data-column-based requirements when dataset is available
     * This creates requirements based on ACTUAL data columns instead of generic placeholders
     */
    private async generateDataColumnBasedRequirements(
        datasetMetadata: { columns: string[]; columnTypes: Record<string, string>; schema: Record<string, any> },
        userGoals: string[],
        userQuestions: string[],
        analysisPath: AnalysisPath[]
    ): Promise<RequiredDataElement[]> {
        const elements: RequiredDataElement[] = [];
        const combinedText = [...userGoals, ...userQuestions].join(' ').toLowerCase();

        console.log(`📊 [Data Elements Tool] Generating requirements from ${datasetMetadata.columns.length} actual columns`);

        // Map each column to a RequiredDataElement based on relevance to questions
        for (const column of datasetMetadata.columns) {
            const columnLower = column.toLowerCase();
            const columnType = datasetMetadata.columnTypes[column] || 'text';
            const schemaInfo = datasetMetadata.schema[column] || {};

            // Find which questions this column might help answer
            const relatedQuestions = userQuestions.filter(q => {
                const qLower = q.toLowerCase();
                // Check if column name appears in question (with some flexibility)
                const columnWords = columnLower.replace(/[_-]/g, ' ').split(' ');
                return columnWords.some(word => word.length > 2 && qLower.includes(word)) ||
                       qLower.includes(columnLower);
            });

            // Determine element data type from schema
            let dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean' = 'text';
            const ctLower = (columnType || '').toLowerCase();
            if (/number|integer|float|decimal|numeric|int/i.test(ctLower)) {
                dataType = 'numeric';
            } else if (/date|time|timestamp/i.test(ctLower)) {
                dataType = 'datetime';
            } else if (/bool/i.test(ctLower)) {
                dataType = 'boolean';
            } else if (schemaInfo.uniqueValues && schemaInfo.uniqueValues < 50) {
                dataType = 'categorical';
            }

            // Determine purpose based on column name and questions
            let purpose = `Data from column "${column}"`;
            if (relatedQuestions.length > 0) {
                purpose = `Helps answer: ${relatedQuestions[0].substring(0, 60)}${relatedQuestions[0].length > 60 ? '...' : ''}`;
            } else if (/id$|_id|identifier|key/i.test(columnLower)) {
                purpose = 'Unique identifier for tracking records';
            } else if (/date|time|created|updated/i.test(columnLower)) {
                purpose = 'Temporal data for time-based analysis';
            } else if (/score|rating|satisfaction/i.test(columnLower)) {
                purpose = 'Metric for measuring performance or satisfaction';
            } else if (/name|title|description/i.test(columnLower)) {
                purpose = 'Descriptive information for labeling';
            }

            // Determine if this column is required based on relevance to questions/goals
            const isRequired = relatedQuestions.length > 0 ||
                               /id$|_id|key/i.test(columnLower) ||
                               combinedText.includes(columnLower);

            // Find relevant analyses for this column
            const relevantAnalyses = analysisPath.filter(a => {
                const analysisLower = a.description.toLowerCase();
                return columnLower.split(/[_-\s]/).some(word =>
                    word.length > 2 && analysisLower.includes(word)
                );
            });

            elements.push({
                elementId: `elem-${nanoid(6)}`,
                elementName: this.formatColumnName(column),
                description: schemaInfo.description || `Data column: ${column}`,
                dataType,
                purpose,
                analysisUsage: relevantAnalyses.length > 0
                    ? relevantAnalyses.map(a => a.analysisId)
                    : analysisPath.slice(0, 1).map(a => a.analysisId),
                required: isRequired,
                relatedQuestions,
                // Pre-fill source mapping since we know the column
                sourceField: column,
                sourceDataType: columnType,
                sourceAvailable: true,
                transformationRequired: false,
                qualityRequirements: /id$|_id|key/i.test(columnLower)
                    ? { completeness: 100, uniqueness: true }
                    : { completeness: isRequired ? 90 : 70 }
            });
        }

        // Sort: required elements first, then by question relevance
        elements.sort((a, b) => {
            if (a.required !== b.required) return a.required ? -1 : 1;
            return (b.relatedQuestions?.length || 0) - (a.relatedQuestions?.length || 0);
        });

        console.log(`✅ [Data Elements Tool] Generated ${elements.length} column-based requirements`);
        console.log(`   Required: ${elements.filter(e => e.required).length}, Question-linked: ${elements.filter(e => e.relatedQuestions?.length).length}`);

        return elements;
    }

    /**
     * ENHANCE analysis-based elements with column mapping suggestions
     * This adds sourceField hints without replacing the conceptual element names
     *
     * Key difference from generateDataColumnBasedRequirements:
     * - KEEPS the analysis-based element names (e.g., "Employee Engagement Score")
     * - ADDS suggested column mappings (e.g., sourceField: "Q1_Satisfaction")
     * - Allows verification step to show meaningful elements that users map to columns
     */
    private async enhanceElementsWithColumnMapping(
        elements: RequiredDataElement[],
        datasetMetadata: { columns: string[]; columnTypes?: Record<string, string>; schema?: Record<string, any> },
        userGoals: string[],
        userQuestions: string[]
    ): Promise<RequiredDataElement[]> {
        console.log(`🔗 [Data Elements Tool] Enhancing ${elements.length} analysis elements with column mapping hints`);

        const columns = datasetMetadata.columns || [];
        const schema = datasetMetadata.schema || {};
        const columnTypes = datasetMetadata.columnTypes || {};

        for (const element of elements) {
            // Skip if already has a confirmed source mapping
            if (element.sourceAvailable && element.sourceField) {
                continue;
            }

            // Find best matching column(s) for this conceptual element
            const candidates = await this.findCandidateFieldsEnhanced(
                element,
                columns,
                schema,
                [], // No preview needed for hint generation
                element.relatedQuestions
            );

            if (candidates.length > 0 && candidates[0].score >= 25) {
                // Add as a SUGGESTION, not a confirmed mapping
                // User needs to verify in Verification step
                element.sourceField = candidates[0].field;
                element.sourceDataType = columnTypes[candidates[0].field] || schema[candidates[0].field]?.type || 'unknown';
                element.sourceAvailable = false; // NOT confirmed - needs user verification
                // CRITICAL FIX: Normalize confidence to 0-1 range (UI expects 0-1, score is 0-100)
                (element as any).confidence = candidates[0].score / 100;

                // Store alternatives for user to choose from
                if (candidates.length > 1) {
                    element.alternatives = candidates.slice(1, 4).map(c => ({
                        sourceField: c.field,
                        transformationLogic: '',
                        confidence: c.score / 100
                    }));
                }

                console.log(`   📍 "${element.elementName}" → suggested: "${element.sourceField}" (confidence: ${candidates[0].score}%)`);
            } else {
                // No good match found - element needs manual mapping
                element.sourceAvailable = false;
                element.sourceField = undefined;
                console.log(`   ⚠️ "${element.elementName}" → no column match found, requires manual mapping`);
            }
        }

        console.log(`✅ [Data Elements Tool] Enhanced ${elements.length} elements with mapping hints`);
        return elements;
    }

    /**
     * Format a column name for display (e.g., "employee_id" -> "Employee ID")
     */
    private formatColumnName(column: string): string {
        return column
            .replace(/[_-]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => {
                if (['id', 'ID'].includes(word.toUpperCase())) return 'ID';
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
    }

    /**
     * Capitalize words for display
     */
    private capitalizeWords(text: string): string {
        return text
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
}

// Export singleton instance
export const requiredDataElementsTool = new RequiredDataElementsTool();
