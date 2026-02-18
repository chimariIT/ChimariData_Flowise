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
import { generateStableQuestionId } from '../../constants';
import { chimaridataAI } from '../../chimaridata-ai';
import { sourceColumnMapper } from '../source-column-mapper';

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
    sourceColumn?: string;  // FIX: Alias for frontend compatibility (frontend expects sourceColumn)
    sourceDataType?: string;
    sourceAvailable: boolean;

    // =======================================================================
    // DATA SCIENTIST CALCULATION DEFINITION (NEW - Enhanced Agentic Mapping)
    // =======================================================================
    // The DS agent defines HOW this element should be calculated/derived
    // This is the "what we need" specification that the DE agent implements
    calculationDefinition?: {
        // Type of calculation: direct (1:1 mapping), derived (computed), aggregated, grouped
        calculationType: 'direct' | 'derived' | 'aggregated' | 'grouped' | 'composite';

        // For comparative analysis: what groups to compare
        comparisonGroups?: {
            groupingField?: string; // e.g., "Department", "Region"
            groupValues?: string[]; // e.g., ["Sales", "Marketing", "Engineering"]
            comparisonType: 'between_groups' | 'within_group' | 'time_series' | 'group_vs_baseline';

            // Phase 5: Hierarchical aggregation levels
            levels?: Array<{
                name: string;           // e.g., "leader", "company"
                groupByFields: string[]; // e.g., ["Manager_ID"] or [] for overall
                role: 'detail' | 'baseline';
                label?: string;         // Human-readable label
            }>;
            baseline?: {
                type: 'overall' | 'specific_group';
                groupByFields: string[]; // [] for overall, or specific grouping columns
                label: string;           // e.g., "Company Average"
            };
        };

        // For derived metrics like "Engagement Score"
        formula?: {
            // Business-level description: "Average of Q1, Q2, Q3 survey scores"
            businessDescription: string;
            // Component fields needed: ["Q1_Score", "Q2_Score", "Q3_Score"]
            componentFields?: string[];
            // Aggregation method: "average", "sum", "count", "weighted_average", "custom"
            aggregationMethod?: 'average' | 'sum' | 'count' | 'min' | 'max' | 'median' | 'weighted_average' | 'custom';
            // Weight field for weighted averages
            weightField?: string;
            // Custom formula in pseudo-code if needed
            pseudoCode?: string;
        };

        // For categorical groupings
        categorization?: {
            // How to categorize: e.g., "High/Medium/Low based on score ranges"
            categoryDescription: string;
            // Categories and their rules
            categories?: Array<{
                name: string;
                rule: string; // e.g., "score >= 80" or "contains 'Senior'"
            }>;
        };

        // Confidence level in the calculation definition (0-1)
        definitionConfidence?: number;

        // Notes from DS agent about calculation approach
        notes?: string;
    };

    // User's natural language transformation description
    // Users can describe in plain English how they want the transformation done
    userTransformationDescription?: string;

    // Transformation logic (populated by Data Engineer based on calculationDefinition)
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
    analysisType: string; // Fine-grained types: descriptive, classification, regression, clustering, correlation, comparative, group_analysis, text_analysis, time_series, etc.
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

    // Phase 1C: Structured question intents from QuestionIntentAnalyzer
    questionIntents?: Array<{
        originalQuestion: string;
        intentType: string;
        subjectConcept?: string;
        conceptNeedsResolution?: boolean;
        recommendedAnalysisTypes: string[];
        confidence: number;
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
        /** P0-8 FIX: Structured questions with stable IDs from project_questions table */
        structuredQuestions?: Array<{ id: string; text: string; order?: number }>;
        datasetMetadata?: any;
        /** Industry/domain context from project or user profile (e.g., 'marketing', 'hr', 'finance') */
        industry?: string;
        /** Target audience description from journey progress */
        audience?: string;
    }): Promise<DataRequirementsMappingDocument> {
        console.log('📋 [Data Elements Tool] Phase 1: Defining requirements from goals and questions');

        // STEP 1: Spell check and grammar correction BEFORE data element extraction
        // This ensures accuracy in element name extraction and matching
        console.log('✏️ [Data Elements Tool] Step 1: Spell checking and grammar correcting goals/questions...');
        const normalizedQuestions = normalizeQuestions(input.userQuestions, true); // Enable logging
        const normalizedGoals = normalizeQuestions(input.userGoals, true); // Enable logging
        console.log(`✅ [Data Elements Tool] Normalized ${normalizedGoals.length} goals and ${normalizedQuestions.length} questions`);

        // ========================================================================
        // Analyze question intents for structured analysis type selection
        // This drives both analysis path and data element role assignment
        // ========================================================================
        let questionIntents: any[] = [];
        try {
            const { QuestionIntentAnalyzer } = await import('../question-intent-analyzer');
            const intentAnalyzer = new QuestionIntentAnalyzer();
            const columnNames = Array.isArray(input.datasetMetadata?.columns)
                ? input.datasetMetadata.columns.map((c: any) => typeof c === 'string' ? c : c.name || c.column || '')
                : (input.datasetMetadata && typeof input.datasetMetadata === 'object' && !Array.isArray(input.datasetMetadata))
                    ? Object.keys(input.datasetMetadata)
                    : [];
            questionIntents = intentAnalyzer.analyzeQuestions(normalizedQuestions, {
                hasTimeSeries: false, // Will be refined when dataset is loaded
                hasText: false,
                hasCategories: true,
                hasNumeric: true,
                columnNames,
            }, input.projectId);
            console.log(`🎯 [Data Elements Tool] Question intents: ${questionIntents.length} analyzed`);
            for (const qi of questionIntents) {
                console.log(`   - "${qi.questionText.substring(0, 50)}..." → ${qi.intentType} [${qi.recommendedAnalysisTypes.join(', ')}]${qi.subjectConcept ? ` concept="${qi.subjectConcept}"` : ''}`);
            }
        } catch (intentErr: any) {
            console.warn(`⚠️ [Data Elements Tool] Intent analysis failed (non-blocking): ${intentErr.message}`);
        }

        // Use Data Scientist Agent to properly infer analysis types and required data elements
        const analysisPath = await this.inferAnalysisPathWithDataScientist(
            normalizedGoals,
            normalizedQuestions,
            input.datasetMetadata
        );

        // FIX: ALWAYS generate analysis-based elements first (what data is NEEDED)
        // FIX: Resolve industry from DATA SIGNALS first, before element generation
        // This ensures the DS Agent AI receives the data-inferred industry, not the
        // user-profile industry which may not match the uploaded dataset
        const resolvedIndustry = this.resolveIndustryFromData(
            input.datasetMetadata, normalizedGoals, normalizedQuestions, input.industry
        );
        console.log(`🏭 [Data Elements Tool] Resolved industry for element generation: ${resolvedIndustry}`);

        // Generate analysis-based requirements with actual dataset context
        // When schema is available, elements should reference actual column names
        // The verification step is where users confirm/adjust these mappings
        console.log(`🎯 [Data Elements Tool] Generating analysis-based requirements${input.datasetMetadata ? ' (with dataset schema context)' : ' (no dataset schema)'}`);
        let requiredDataElements: RequiredDataElement[] = await this.inferRequiredDataElementsFromAnalyses(
            analysisPath,
            normalizedGoals,
            normalizedQuestions,
            input.datasetMetadata,
            input.structuredQuestions,
            resolvedIndustry  // Use data-inferred industry, not raw input.industry
        );

        // ========================================================================
        // PHASE 1 FIX: Enrich elements with business definitions from registry
        // This enables agents to have formulas and calculation definitions EARLY
        // so DE agent can create accurate transformation logic without guessing
        // ========================================================================
        console.log(`📚 [Data Elements Tool] Enriching ${requiredDataElements.length} elements with business definitions...`);
        try {
            const { businessDefinitionRegistry } = await import('../business-definition-registry');

            // Reuse the industry resolved above (before element generation)
            const industryContext = resolvedIndustry;

            // Run all lookups in parallel with a 10s overall timeout to prevent blocking
            const ENRICHMENT_TIMEOUT_MS = 10000;
            const enrichmentPromise = Promise.allSettled(
                requiredDataElements.map(async (element) => {
                    const lookupResult = await businessDefinitionRegistry.lookupDefinition(
                        element.elementName,
                        {
                            industry: industryContext,
                            projectId: input.projectId,
                            includeGlobal: true,
                            datasetSchema: input.datasetMetadata?.schema
                        }
                    );
                    return { element, lookupResult };
                })
            );
            const timeoutPromise = new Promise<PromiseSettledResult<any>[]>((resolve) =>
                setTimeout(() => {
                    console.warn(`⏱️ [Data Elements Tool] Enrichment timed out after ${ENRICHMENT_TIMEOUT_MS}ms - proceeding without full enrichment`);
                    resolve([]);
                }, ENRICHMENT_TIMEOUT_MS)
            );

            const results = await Promise.race([enrichmentPromise, timeoutPromise]);

            let enrichedCount = 0;
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    const { element, lookupResult } = result.value;
                    if (lookupResult.found && lookupResult.definition) {
                        const def = lookupResult.definition;
                        element.calculationDefinition = {
                            calculationType: (def.calculationType as any) || 'derived',
                            formula: {
                                businessDescription: def.businessDescription || '',
                                componentFields: (def.componentFields as string[]) || [],
                                aggregationMethod: ((def.aggregationMethod || 'custom') as any)
                            },
                            definitionConfidence: lookupResult.confidence,
                            notes: `From registry: ${lookupResult.source} (${Math.round(lookupResult.confidence * 100)}% confidence)`
                        };
                        enrichedCount++;
                        console.log(`   ✅ Enriched: "${element.elementName}" with ${def.calculationType} definition (${lookupResult.source})`);
                    } else {
                        console.log(`   ⚠️ No definition found for: "${element.elementName}"`);
                    }
                } else if (result.status === 'rejected') {
                    console.warn(`   ⚠️ Enrichment failed for an element:`, result.reason?.message || result.reason);
                }
            }
            console.log(`📚 [Data Elements Tool] Enriched ${enrichedCount}/${requiredDataElements.length} elements with business definitions`);
        } catch (enrichError) {
            console.warn(`⚠️ [Data Elements Tool] Business definition enrichment failed (non-blocking):`, enrichError);
            // Continue without enrichment - non-blocking error
        }

        // ========================================================================
        // Link question intents to data elements for role assignment
        // Sets analysisRole: 'target' for elements that are the subject of
        // probability/causal questions (enables correct target column assignment)
        // ========================================================================
        if (questionIntents.length > 0) {
            console.log(`🎯 [Data Elements Tool] Linking ${questionIntents.length} intents to ${requiredDataElements.length} elements...`);
            for (const element of requiredDataElements) {
                const elementNameLower = element.elementName.toLowerCase();
                const purposeLower = (element.purpose || '').toLowerCase();

                for (const intent of questionIntents) {
                    if (!intent.subjectConcept) continue;
                    const conceptLower = intent.subjectConcept.toLowerCase();

                    // Check if this element relates to the intent's subject concept
                    const isConceptMatch = elementNameLower.includes(conceptLower) ||
                        purposeLower.includes(conceptLower) ||
                        (element.relatedQuestions || []).some((rq: string) =>
                            rq.toLowerCase().includes(conceptLower));

                    if (!isConceptMatch) continue;

                    // Set analysis role based on intent type
                    if (intent.intentType === 'probability' || intent.intentType === 'causal') {
                        (element as any).analysisRole = 'target';
                        (element as any).intendedAnalysisType = intent.intentType === 'probability' ? 'classification' : 'regression';
                        console.log(`   📌 Element "${element.elementName}" → analysisRole: target (${intent.intentType} intent for "${intent.subjectConcept}")`);
                    } else if (intent.intentType === 'relationship') {
                        (element as any).analysisRole = 'target';
                        (element as any).intendedAnalysisType = 'correlation';
                        console.log(`   📌 Element "${element.elementName}" → analysisRole: target (relationship intent for "${intent.subjectConcept}")`);
                    } else if (intent.intentType === 'segmentation') {
                        (element as any).analysisRole = 'feature';
                        (element as any).intendedAnalysisType = 'clustering';
                    }

                    // Link question ID to element
                    if (!element.questionIds) element.questionIds = [];
                    if (!element.questionIds.includes(intent.questionId)) {
                        element.questionIds.push(intent.questionId);
                    }
                    break; // One intent per element
                }
            }
        }

        // Entity extraction: Decompose formula fields into operational data fields
        // e.g. "Number of Employees Who Left" → needs employee_id, termination_date, employment_status
        for (const element of requiredDataElements) {
            const formula = element.calculationDefinition?.formula;
            const componentFields = formula?.componentFields;
            if (componentFields && componentFields.length > 0) {
                const expandedFields = this.extractOperationalFields(
                    formula.businessDescription || '',
                    componentFields,
                    element.elementName
                );
                if (expandedFields.length > 0) {
                    (formula as any).operationalFields = expandedFields;
                    // Also set as sourceColumn hint for the transformation step
                    if (!element.sourceColumn) {
                        element.sourceColumn = expandedFields.map((f: { fieldName: string }) => f.fieldName).join(', ');
                    }
                    console.log(`   🔬 Entity extraction for "${element.elementName}": ${expandedFields.map((f: { fieldName: string }) => f.fieldName).join(', ')}`);
                }
            }
        }

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

        // ========================================================================
        // CRITICAL FIX: Link requiredDataElements back to analysisPath items
        // The analysisPath was created with empty requiredDataElements[]
        // Now we populate it based on the generated elements
        // ========================================================================
        // PHASE 6 FIX (ROOT CAUSE #5): Improved analysisUsage matching with multiple strategies
        console.log(`🔗 [Data Elements Tool] Linking ${requiredDataElements.length} elements to ${analysisPath.length} analyses...`);
        for (const analysis of analysisPath) {
            // Build comprehensive keywords for matching
            const analysisTypeKeywords = [
                analysis.analysisType?.toLowerCase(),
                analysis.analysisName?.toLowerCase(),
                ...analysis.techniques.map(t => typeof t === 'string' ? t.toLowerCase() : (t as any).name?.toLowerCase() || '')
            ].filter(Boolean);

            const linkedElements = requiredDataElements.filter(el => {
                // MATCH 1: analysisUsage field (DS Agent populated) - more robust matching
                if (el.analysisUsage?.length > 0) {
                    const matches = el.analysisUsage.some((au: string) =>
                        analysisTypeKeywords.some(keyword =>
                            au.toLowerCase().includes(keyword) ||
                            keyword.includes(au.toLowerCase()) ||
                            // Partial word matching for analysis types
                            au.toLowerCase().split(/[\s_-]/).some(word =>
                                keyword.includes(word) || word.length > 3 && keyword.includes(word.slice(0, 4))
                            )
                        )
                    );
                    if (matches) return true;
                }

                // MATCH 2: Element purpose/description matches analysis keywords
                if (el.purpose || el.description) {
                    const purposeText = ((el.purpose || '') + ' ' + (el.description || '')).toLowerCase();
                    if (analysisTypeKeywords.some(kw => purposeText.includes(kw))) {
                        return true;
                    }
                }

                // MATCH 3: dataType relevance for common analysis patterns
                const numericTypes = ['integer', 'float', 'number', 'numeric', 'decimal'];
                const isNumeric = numericTypes.includes(el.dataType?.toLowerCase());
                const categoricalTypes = ['categorical', 'string', 'text', 'category'];
                const isCategorical = categoricalTypes.includes(el.dataType?.toLowerCase());

                // Descriptive analysis needs numeric data
                if (analysis.analysisType === 'descriptive' && isNumeric) {
                    return true;
                }
                // Diagnostic/comparative analysis needs categorical or numeric
                if (['diagnostic', 'comparative', 'correlation'].includes(analysis.analysisType) && (isNumeric || isCategorical)) {
                    return true;
                }
                // Regression/predictive needs numeric
                if (['regression', 'predictive', 'time-series'].includes(analysis.analysisType) && isNumeric) {
                    return true;
                }
                // Clustering/segmentation needs numeric
                if (['clustering', 'segmentation'].includes(analysis.analysisType) && isNumeric) {
                    return true;
                }

                return false;
            });

            // P1-7 FIX: Type-specific fallback instead of "all numeric" dumping
            if (linkedElements.length === 0) {
                const analysisType = (analysis.analysisType || '').toLowerCase();
                const numericElements = requiredDataElements.filter(el =>
                    ['integer', 'float', 'number', 'numeric', 'decimal'].includes(el.dataType?.toLowerCase())
                );
                const categoricalElements = requiredDataElements.filter(el =>
                    ['string', 'categorical', 'text', 'varchar'].includes(el.dataType?.toLowerCase())
                );

                let fallbackElements: typeof requiredDataElements = [];
                if (['descriptive', 'descriptive_stats', 'summary'].includes(analysisType)) {
                    // Descriptive: all numeric + categorical dimensions (capped at 15)
                    fallbackElements = [...numericElements, ...categoricalElements].slice(0, 15);
                    console.warn(`   ⚠️ [P1-7] Descriptive fallback: ${fallbackElements.length} elements (numeric + categorical)`);
                } else if (['correlation', 'correlation_analysis'].includes(analysisType)) {
                    // Correlation: numeric only (capped at 10)
                    fallbackElements = numericElements.slice(0, 10);
                    console.warn(`   ⚠️ [P1-7] Correlation fallback: ${fallbackElements.length} numeric elements`);
                } else if (['regression', 'predictive', 'linear_regression'].includes(analysisType)) {
                    // Regression: numeric target + predictors (capped at 12)
                    fallbackElements = numericElements.slice(0, 12);
                    console.warn(`   ⚠️ [P1-7] Regression fallback: ${fallbackElements.length} numeric elements`);
                } else if (['clustering', 'segmentation', 'cluster_analysis'].includes(analysisType)) {
                    // Clustering: numeric features only (capped at 8)
                    fallbackElements = numericElements.slice(0, 8);
                    console.warn(`   ⚠️ [P1-7] Clustering fallback: ${fallbackElements.length} numeric features`);
                } else if (['time_series', 'time-series', 'forecasting'].includes(analysisType)) {
                    // Time series: date/temporal + numeric (capped at 6)
                    const dateElements = requiredDataElements.filter(el =>
                        ['date', 'datetime', 'timestamp', 'time'].includes(el.dataType?.toLowerCase())
                    );
                    fallbackElements = [...dateElements, ...numericElements].slice(0, 6);
                    console.warn(`   ⚠️ [P1-7] Time series fallback: ${fallbackElements.length} elements`);
                } else {
                    // Unknown type: cautious subset of numeric (capped at 8)
                    fallbackElements = numericElements.slice(0, 8);
                    console.warn(`   ⚠️ [P1-7] Generic fallback for "${analysisType}": ${fallbackElements.length} numeric elements`);
                }
                analysis.requiredDataElements = fallbackElements.map(el => el.elementId || el.elementName);
            } else {
                analysis.requiredDataElements = linkedElements.map(el => el.elementId || el.elementName);
            }
            console.log(`   ✅ Analysis "${analysis.analysisName}": ${analysis.requiredDataElements.length} required elements linked`);
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
            questionIntents: questionIntents.length > 0 ? questionIntents : undefined,
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
     *
     * Agent Responsibility: DATA_ENGINEER
     * - Maps source fields to required data elements
     * - Identifies transformation requirements
     * - Generates transformation code
     */
    async mapDatasetToRequirements(
        document: DataRequirementsMappingDocument,
        dataset: {
            fileName: string;
            rowCount: number;
            schema: Record<string, any>;
            preview: any[];
            piiFields?: string[]; // Optional PII field list
            businessDefinitions?: any[]; // BA/DS definitions for guided mapping
        },
        /** Industry/domain context from project or user profile */
        industry?: string,
        /** Project ID for RAG-based matching using pre-computed column embeddings */
        projectId?: string
    ): Promise<DataRequirementsMappingDocument> {
        console.log('🔧 [DATA_ENGINEER] Phase 2: Mapping dataset to requirements');
        console.log('🔧 [DATA_ENGINEER] Using tools: data_quality_monitor, schema_evolution_manager');

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

        // ✅ FIX 10B: Ensure industry context propagates to AI mapping via document
        if (industry && !(document as any).industryDomain) {
            (document as any).industryDomain = industry;
            console.log(`🏭 [Map Elements] Set industryDomain on document: ${industry}`);
        }

        // Map each required element to dataset fields
        const availableFields = Object.keys(dataset.schema);
        let mappedCount = 0;
        let transformationCount = 0;
        const gaps: typeof document.gaps = [];

        // ========================================================================
        // ENRICHMENT: Resolve abstract component fields against actual dataset
        // For derived/composite/aggregated elements (e.g., Turnover Rate, Engagement Score),
        // use the business definition registry to map abstract fields like "employees_left"
        // to actual dataset columns like "Termination_Date" with semantic role assignments.
        // ========================================================================
        try {
            const { businessDefinitionRegistry } = await import('../business-definition-registry');

            // Detect industry context: explicit > dataset schema columns > keyword inference
            let enrichmentIndustry = 'general';
            if (industry && industry !== 'general' && industry !== 'other') {
                enrichmentIndustry = industry.toLowerCase();
            } else {
                const columnCtx = Object.keys(dataset.schema).join(' ').toLowerCase();
                const combinedCtx = `${columnCtx} ${[...(document.userGoals || []), ...(document.userQuestions || [])].join(' ').toLowerCase()}`;
                if (/\b(campaign|impression|click.?rate|ad.?spend|ctr|cpc|cpm|marketing|seo|lead.?gen)\b/i.test(combinedCtx)) enrichmentIndustry = 'marketing';
                else if (/\b(employee|hr\b|human.?resource|turnover|headcount|attrition|hire|onboard|payroll)\b/i.test(combinedCtx)) enrichmentIndustry = 'hr';
                else if (/\b(sales.?pipeline|deal|quota|close.?rate|sales.?rep|opportunity)\b/i.test(combinedCtx)) enrichmentIndustry = 'sales';
                else if (/\b(profit|loss|balance.?sheet|p&l|ledger|accounts.?payable|budget)\b/i.test(combinedCtx)) enrichmentIndustry = 'finance';
            }
            console.log(`   Enrichment industry context: ${enrichmentIndustry}`);

            let enrichedCount = 0;
            for (const element of document.requiredDataElements) {
                const calcType = element.calculationDefinition?.calculationType;
                if (calcType && ['derived', 'composite', 'aggregated', 'grouped'].includes(calcType)) {
                    const lookupResult = await businessDefinitionRegistry.lookupDefinition(
                        element.elementName,
                        { industry: enrichmentIndustry, projectId: document.projectId, includeGlobal: true, datasetSchema: dataset.schema }
                    );

                    if (lookupResult.found && lookupResult.definition) {
                        const enriched = await businessDefinitionRegistry.enrichDefinitionWithDatasetContext(
                            lookupResult.definition,
                            dataset.schema,
                            sanitizedPreview,
                            { industry: enrichmentIndustry }
                        );

                        // Replace abstract componentFields with resolved actual columns
                        const resolved = enriched.resolvedComponentFields.filter(f => f.resolvedColumn);
                        if (resolved.length > 0 && element.calculationDefinition?.formula) {
                            element.calculationDefinition.formula.componentFields =
                                resolved.map(f => f.resolvedColumn!);
                            element.calculationDefinition.notes =
                                `Dataset-enriched: ${resolved.map(f => `${f.abstractName}→${f.resolvedColumn} (${f.role})`).join(', ')}`;
                            enrichedCount++;
                            console.log(`✅ [DE Phase 2] Enriched "${element.elementName}": ${resolved.length} fields resolved`);
                        }
                    }
                }
            }
            if (enrichedCount > 0) {
                console.log(`📚 [DE Phase 2] Dataset-enriched ${enrichedCount} elements with actual column mappings`);
            }
        } catch (enrichError) {
            console.warn('⚠️ [DE Phase 2] Dataset enrichment failed (non-blocking):', (enrichError as Error).message);
        }

        for (const element of document.requiredDataElements) {
            // Get question context for this element to improve matching
            const questionContext = element.relatedQuestions || [];

            // Determine if this is a composite element that needs the legacy findBestMatch
            const calcDef = element.calculationDefinition;
            const componentFields = calcDef?.formula?.componentFields || [];
            const isCompositeElement = componentFields.length > 0 &&
                ['derived', 'aggregated', 'composite'].includes(calcDef?.calculationType || '');

            // For composite elements: use legacy findBestMatch (handles multi-field matching)
            // For non-composite elements: delegate to RAG-first sourceColumnMapper
            let mapping: Awaited<ReturnType<typeof this.findBestMatch>>;
            if (isCompositeElement) {
                mapping = await this.findBestMatch(
                    element,
                    availableFields,
                    dataset.schema,
                    sanitizedPreview,
                    questionContext
                );
            } else {
                // RAG-first matching via source-column-mapper
                const scmResult = await sourceColumnMapper.mapSingleElement(element, {
                    projectId,
                    availableColumns: availableFields,
                    schema: dataset.schema,
                    preview: sanitizedPreview,
                    questionContext,
                    industry
                });
                // Convert to findBestMatch return format for compatibility
                mapping = {
                    found: scmResult.found,
                    sourceField: scmResult.sourceField,
                    sourceDataType: scmResult.sourceDataType,
                    transformationNeeded: scmResult.transformationNeeded,
                    confidence: scmResult.confidence,
                    alternatives: scmResult.alternatives,
                    transformationLogic: undefined,
                    sourceColumns: undefined,
                    isComposite: false
                };
            }

            if (mapping.found) {
                element.sourceField = mapping.sourceField;
                element.sourceColumn = mapping.sourceField;  // FIX: Set both field names for frontend compatibility
                element.sourceDataType = mapping.sourceDataType;
                element.sourceAvailable = true;
                // CRITICAL: Normalize confidence to 0-1 range (UI expects 0-1, findBestMatch returns 0-100)
                (element as any).confidence = (mapping.confidence || 0) / 100;
                mappedCount++;

                // FIX: Store sourceColumns for composite/derived elements with multiple source fields
                if (mapping.sourceColumns && mapping.sourceColumns.length > 0) {
                    (element as any).sourceColumns = mapping.sourceColumns;
                    (element as any).isComposite = mapping.isComposite || false;

                    // Log composite element mapping details
                    const matchedCount = mapping.sourceColumns.filter((sc: any) => sc.matched).length;
                    console.log(`🔗 [Composite Mapping] "${element.elementName}": ${matchedCount}/${mapping.sourceColumns.length} component fields mapped`);
                }

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
                } else if (element.calculationDefinition?.calculationType &&
                           ['derived', 'aggregated', 'grouped', 'composite'].includes(element.calculationDefinition.calculationType)) {
                    // FIX A2: DS agent specified a non-direct calculationType but pattern matching
                    // didn't detect the need for transformation. Honor the DS recommendation.
                    element.transformationRequired = true;
                    element.transformationLogic = this.buildTransformationLogicFromDefinition(
                        element, mapping.sourceField!, mapping.sourceDataType || 'unknown'
                    );
                    transformationCount++;
                    console.log(`📊 [DS Override] "${element.elementName}" requires transformation: calculationType=${element.calculationDefinition.calculationType}`);
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

        // AI-DRIVEN MAPPING: Use LLM for ALL elements to achieve comprehensive mapping
        // This is the primary mapping strategy - agents should achieve 100% mapping
        console.log(`🤖 [Data Elements Tool] Running AI mapping for ALL ${document.requiredDataElements.length} elements...`);

        // Get analysis context from the document
        const analysisTypes = document.analysisPath?.map(a => a.analysisType || a.analysisName) || [];
        const userQuestions = document.userQuestions || [];

        try {
            const aiMappings = await this.mapElementsWithAI(
                document.requiredDataElements,
                availableFields,
                dataset.schema,
                sanitizedPreview,
                {
                    analysisTypes,
                    userQuestions,
                    industryDomain: (document as any).industryDomain || industry,  // ✅ FIX 10A: Fallback to explicit industry param
                    businessDefinitions: dataset.businessDefinitions || []
                }
            );

            // Apply AI mappings - prefer AI over pattern matching for better accuracy
            for (const element of document.requiredDataElements) {
                const aiMapping = aiMappings.get(element.elementName);
                if (aiMapping) {
                    // If AI found a mapping, use it (may override pattern matching)
                    const aiConfidence = aiMapping.confidence;
                    const existingConfidence = (element as any).confidence || 0;

                    // FIX A3: Use AI mapping if it has similar-or-higher confidence OR element wasn't mapped.
                    // AI mapping uses full semantic context (descriptions, sample data, questions)
                    // so it should be preferred when confidence is close (within 10%).
                    if (!element.sourceAvailable || aiConfidence >= existingConfidence * 0.9) {
                        const wasUnmapped = !element.sourceAvailable;

                        element.sourceField = aiMapping.sourceField;
                        element.sourceColumn = aiMapping.sourceField;  // FIX: Set both field names for frontend
                        element.sourceDataType = dataset.schema[aiMapping.sourceField]?.type;
                        element.sourceAvailable = true;
                        (element as any).confidence = aiConfidence;
                        (element as any).aiMappingReasoning = aiMapping.reasoning;
                        (element as any).mappingSource = 'ai';

                        // ENHANCED: Store derived field metadata for multi-agent coordination
                        if (aiMapping.derivationType) {
                            (element as any).derivationType = aiMapping.derivationType;
                        }
                        if (aiMapping.componentFields && aiMapping.componentFields.length > 0) {
                            (element as any).componentFields = aiMapping.componentFields;
                        }
                        if (aiMapping.businessDefinition) {
                            (element as any).businessDefinition = aiMapping.businessDefinition;
                        }
                        if (aiMapping.aggregationMethod && aiMapping.aggregationMethod !== 'none') {
                            (element as any).aggregationMethod = aiMapping.aggregationMethod;
                        }

                        // ENHANCED: Update calculationDefinition with AI-derived info
                        if (aiMapping.derivationType === 'derived' || aiMapping.derivationType === 'aggregated' || aiMapping.derivationType === 'composite') {
                            element.calculationDefinition = {
                                calculationType: aiMapping.derivationType === 'aggregated' ? 'aggregated' :
                                                  aiMapping.derivationType === 'composite' ? 'composite' : 'derived',
                                formula: {
                                    businessDescription: aiMapping.businessDefinition || aiMapping.reasoning,
                                    componentFields: aiMapping.componentFields || [],
                                    aggregationMethod: (aiMapping.aggregationMethod as any) || 'custom',
                                    pseudoCode: aiMapping.transformationCode
                                },
                                definitionConfidence: aiMapping.confidence,
                                notes: `AI-derived: ${aiMapping.reasoning}`
                            };
                            // Non-direct derivationType always requires transformation
                            element.transformationRequired = true;

                            // FIX: Rebuild sourceColumns from AI-provided componentFields
                            // This is CRITICAL for composite elements - the initial mapping used placeholder names
                            // but now we have actual column names from AI, so rebuild the sourceColumns array
                            if (aiMapping.componentFields && aiMapping.componentFields.length > 0) {
                                // FIX A4: Normalize AI-provided component field names to match exact dataset column names.
                                // AI may return slightly different casing or formatting (e.g., "Q1_Score" vs "q1_score").
                                const normalizedComponentFields = aiMapping.componentFields.map((cf: string) => {
                                    const exactMatch = availableFields.find(af => af.toLowerCase() === cf.toLowerCase());
                                    return exactMatch || cf;
                                });

                                const rebuiltSourceColumns = await this.matchComponentFields(
                                    normalizedComponentFields,
                                    availableFields,
                                    dataset.schema
                                );

                                const matchedCount = rebuiltSourceColumns.filter(sc => sc.matched).length;
                                if (matchedCount > 0) {
                                    (element as any).sourceColumns = rebuiltSourceColumns;
                                    (element as any).isComposite = aiMapping.componentFields.length > 1;

                                    // Update transformation logic with rebuilt source columns
                                    element.transformationLogic = this.buildCompositeTransformationLogic(element, rebuiltSourceColumns);

                                    console.log(`   🔗 [Composite Fix] "${element.elementName}": rebuilt sourceColumns with ${matchedCount}/${aiMapping.componentFields.length} matched`);
                                    rebuiltSourceColumns.forEach(sc => {
                                        console.log(`      - ${sc.componentField}: ${sc.matched ? `→ ${sc.matchedColumn} (${sc.matchConfidence}%)` : '❌ No match'}`);
                                    });
                                }
                            }
                        }

                        if (wasUnmapped) {
                            mappedCount++;
                        }

                        if (aiMapping.transformationCode) {
                            element.transformationRequired = true;
                            element.transformationLogic = {
                                operation: aiMapping.derivationType === 'derived' ? 'derived_calculation' : 'ai_generated',
                                description: aiMapping.businessDefinition || aiMapping.reasoning,
                                code: aiMapping.transformationCode,
                                dependencies: aiMapping.componentFields
                            };
                            if (wasUnmapped) {
                                transformationCount++;
                            }
                        }

                        // Remove from gaps if was in gaps
                        const gapIndex = gaps.findIndex(g => g.affectedElements?.includes(element.elementId));
                        if (gapIndex !== -1) {
                            gaps.splice(gapIndex, 1);
                        }

                        const derivedInfo = aiMapping.derivationType === 'derived'
                            ? ` [DERIVED from ${aiMapping.componentFields?.join(', ')}]`
                            : '';
                        console.log(`   ✅ AI mapped: ${element.elementName} → ${aiMapping.sourceField} (${Math.round(aiConfidence * 100)}%)${derivedInfo}`);
                    }
                }
            }

            console.log(`✅ [AI Mapping] Complete - ${mappedCount}/${document.requiredDataElements.length} elements mapped`);
        } catch (aiError) {
            // FIX 1E: Make AI mapping failure visible instead of silently swallowing
            console.error('❌ [AI Mapping] FAILED — 0 elements will be AI-mapped. Error:', aiError);
            (document as any).aiMappingFailed = true;
            (document as any).aiMappingError = aiError instanceof Error ? aiError.message : String(aiError);
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
     * Map analysis name from Data Scientist to fine-grained analysis type
     * that matches Python script routing keys in data-science-orchestrator.ts
     * and normalizeAnalysisType() in analysis-data-preparer.ts.
     *
     * ORDER MATTERS: more specific patterns (classification, clustering) must
     * come before broader patterns (predict) to avoid misclassification.
     */
    private mapAnalysisNameToType(analysisName: string): string {
        const lower = analysisName.toLowerCase();
        // Fine-grained: specific analysis types first
        if (/classif/i.test(lower)) return 'classification';
        if (/cluster|segment/i.test(lower)) return 'clustering';
        if (/regress/i.test(lower)) return 'regression';
        if (/time.*series|trend|forecast/i.test(lower)) return 'time_series';
        if (/correlat/i.test(lower)) return 'correlation';
        if (/compar/i.test(lower)) return 'comparative';
        if (/group/i.test(lower)) return 'group_analysis';
        if (/text|sentiment|nlp/i.test(lower)) return 'text_analysis';
        if (/frequen/i.test(lower)) return 'descriptive';
        if (/aggregat/i.test(lower)) return 'descriptive';
        // Broad: predictive defaults to regression unless techniques refine it
        if (/predict/i.test(lower)) return 'regression';
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
        userQuestions: string[],
        datasetSchema?: Record<string, any>,
        structuredQuestions?: Array<{ id: string; text: string; order?: number }>,
        industry?: string
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

            // FIX: datasetSchema may be structured { columns, columnTypes, schema } or flat Record<string, any>
            // The DS agent expects a flat Record<string, any> (column names as keys)
            const flatSchema = datasetSchema?.schema || datasetSchema;

            const inferredElements = await dataScientist.inferRequiredDataElements({
                userQuestions,
                userGoals,
                analysisTypes,
                datasetSchema: flatSchema,
                industry
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
                    // P0-8 FIX: Use stable question IDs from structuredQuestions when available
                    relatedQuestions: inferredEl.relatedQuestions || [],
                    questionIds: (() => {
                        const structuredQs = structuredQuestions;
                        if (structuredQs && structuredQs.length > 0 && inferredEl.relatedQuestions) {
                            // Match question text to structured IDs using fuzzy text matching
                            return inferredEl.relatedQuestions.map(qText => {
                                const qTextLower = qText.toLowerCase().trim();
                                // Try exact match first
                                const exactMatch = structuredQs.find(sq => sq.text.toLowerCase().trim() === qTextLower);
                                if (exactMatch) return exactMatch.id;
                                // Try substring match (question text may be truncated by AI)
                                const partialMatch = structuredQs.find(sq =>
                                    sq.text.toLowerCase().includes(qTextLower.slice(0, 30)) ||
                                    qTextLower.includes(sq.text.toLowerCase().slice(0, 30))
                                );
                                if (partialMatch) return partialMatch.id;
                                // Bug #9 fix: Use hash-based ID instead of index-based.
                                // projectId may not be available here, so use a text-only hash
                                // that can still be matched by analysis-execution.ts.
                                const hash = crypto.createHash('sha256')
                                    .update(qText.toLowerCase().trim())
                                    .digest('hex')
                                    .substring(0, 8);
                                return `q_txt_${hash}`;
                            }).filter(Boolean);
                        }
                        // Fallback: generate hash-based IDs (Bug #9 fix - avoid index-based IDs)
                        return inferredEl.relatedQuestions?.map(q => {
                            const hash = crypto.createHash('sha256')
                                .update(q.toLowerCase().trim())
                                .digest('hex')
                                .substring(0, 8);
                            return `q_txt_${hash}`;
                        }) || [];
                    })(),
                    sourceAvailable: false,
                    // FIX: Derive transformationRequired from DS agent's calculationType
                    // If calculationType is NOT 'direct', transformation IS required
                    transformationRequired: (() => {
                        const calcType = inferredEl.calculationDefinition?.calculationType;
                        const needsTransform = calcType && ['derived', 'aggregated', 'grouped', 'composite'].includes(calcType);
                        if (needsTransform) {
                            console.log(`📊 [Data Elements Tool] Element "${inferredEl.elementName}" requires transformation (calculationType: ${calcType})`);
                        }
                        return needsTransform || false;
                    })(),
                    // NEW: Copy calculationDefinition from DS agent - tells DE how to derive this element
                    calculationDefinition: inferredEl.calculationDefinition || {
                        calculationType: 'direct' as const,
                        formula: {
                            businessDescription: `Map ${inferredEl.elementName} from source column`,
                            pseudoCode: `source_column AS ${inferredEl.elementName.toLowerCase().replace(/\s+/g, '_')}`
                        },
                        notes: 'Default direct mapping - update based on actual data'
                    },
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

        // P1-7 FIX: Post-process element names to ensure clean metric/dimension naming
        for (const el of elements) {
            // Clean sentence-like element names (e.g., "Company Is Turnover Rate" → "Turnover Rate")
            if (el.elementName && el.elementName.split(/\s+/).length > 4) {
                // Remove common prefixes that make names too long
                const cleaned = el.elementName
                    .replace(/^(the|a|an|company|organization|org|department|dept)\s+(is|has|with|for)\s+/i, '')
                    .replace(/^(total|overall|average|mean|sum of|count of|number of)\s+/i, (match: string) => match.trim() + ' ')
                    .trim();
                if (cleaned !== el.elementName && cleaned.length >= 3) {
                    console.log(`   📝 [P1-7] Cleaned element name: "${el.elementName}" → "${cleaned}"`);
                    el.elementName = cleaned;
                }
            }
            // Ensure calculationType is set (Issue 1.1 from pipeline analysis)
            if (!el.calculationDefinition?.calculationType) {
                el.calculationDefinition = {
                    ...el.calculationDefinition,
                    calculationType: el.transformationRequired ? 'derived' : 'direct'
                } as RequiredDataElement['calculationDefinition'] & {};
            }
        }

        return elements;
    }

    // ========================================================================
    // Phase 4: Date-Aware Calculations
    // ========================================================================

    /**
     * Resolve date context from available schema and sample data.
     * Identifies date columns, their semantic roles, and null semantics.
     *
     * Returns a DateContext object that can be used by compileMultiStepKPI()
     * to generate date-aware transformations.
     */
    resolveDateContext(
        availableFields: string[],
        schema: Record<string, any>,
        preview: any[],
        descriptors?: any[] // ComponentFieldDescriptor[]
    ): {
        periodColumn: string | null;
        periodGranularity: 'day' | 'month' | 'quarter' | 'year' | null;
        dateColumns: Array<{
            columnName: string;
            semanticRole: 'period_indicator' | 'event_date' | 'start_date' | 'end_date';
            nullMeaning: string;
            presenceMeaning: string;
        }>;
    } {
        const dateColumns: Array<{
            columnName: string;
            semanticRole: 'period_indicator' | 'event_date' | 'start_date' | 'end_date';
            nullMeaning: string;
            presenceMeaning: string;
        }> = [];

        let periodColumn: string | null = null;
        let periodGranularity: 'day' | 'month' | 'quarter' | 'year' | null = null;

        for (const field of availableFields) {
            const fieldLower = field.toLowerCase();
            const colType = schema[field]?.type?.toLowerCase() || '';
            const isDateType = /date|time|timestamp/i.test(colType);

            // Check sample values for date-like patterns
            const sampleValues = preview.slice(0, 10).map(row => row[field]).filter(Boolean);
            const isDateLike = isDateType || sampleValues.some((v: any) => {
                if (typeof v !== 'string') return false;
                return /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v);
            });

            if (!isDateLike) continue;

            // Count null values
            const nullCount = preview.filter(row => row[field] === null || row[field] === undefined || row[field] === '').length;
            const nullRatio = preview.length > 0 ? nullCount / preview.length : 0;

            // Check if descriptors provide semantic hints
            const descriptor = descriptors?.find((d: any) =>
                d.columnMatchPatterns?.some((p: string) => fieldLower.includes(p.toLowerCase()))
            );

            // Determine semantic role
            let role: 'period_indicator' | 'event_date' | 'start_date' | 'end_date' = 'event_date';
            let nullMeaning = 'No date recorded';
            let presenceMeaning = 'Date is recorded';

            if (descriptor) {
                // Use descriptor hints
                if (descriptor.columnMatchType === 'date_presence_indicator') {
                    role = 'event_date';
                    nullMeaning = descriptor.nullMeaning || 'Event has not occurred';
                    presenceMeaning = descriptor.presenceMeaning || 'Event has occurred';
                } else if (descriptor.columnMatchType === 'date_range_filter') {
                    role = 'period_indicator';
                }
            } else {
                // Infer from column name
                if (/roster|report|period|snapshot|as_of|effective/i.test(fieldLower)) {
                    role = 'period_indicator';
                    nullMeaning = 'No period recorded';
                    presenceMeaning = 'Period date recorded';
                } else if (/termination|separation|exit|end|departure|leave/i.test(fieldLower)) {
                    role = 'end_date';
                    nullMeaning = 'Employee is still active';
                    presenceMeaning = 'Employee has separated';
                } else if (/hire|start|join|onboard|begin/i.test(fieldLower)) {
                    role = 'start_date';
                    nullMeaning = 'Start date not recorded';
                    presenceMeaning = 'Employee hire date';
                } else if (nullRatio > 0.3) {
                    // Many nulls in a date column → likely an event column
                    role = 'event_date';
                    nullMeaning = 'Event has not occurred (null = still active/ongoing)';
                    presenceMeaning = 'Event has occurred';
                }
            }

            dateColumns.push({
                columnName: field,
                semanticRole: role,
                nullMeaning,
                presenceMeaning
            });

            // Identify the period column
            if (role === 'period_indicator' && !periodColumn) {
                periodColumn = field;
                // Determine granularity from sample data
                const uniqueCount = new Set(sampleValues.map((v: any) => String(v).substring(0, 10))).size;
                if (uniqueCount <= 12) periodGranularity = 'month';
                else if (uniqueCount <= 4) periodGranularity = 'quarter';
                else if (uniqueCount <= 1) periodGranularity = 'year';
                else periodGranularity = 'day';
            }
        }

        console.log(`📅 [DateContext] Found ${dateColumns.length} date columns, period: ${periodColumn || 'none'}`);
        return { periodColumn, periodGranularity, dateColumns };
    }

    /**
     * Find best matching field in dataset for a required element
     * ENHANCED: Uses question context, semantic matching, and calculationDefinition from DS agent
     * For composite/derived elements, matches ALL componentFields to dataset columns
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
        // NEW: For composite/derived elements - multiple source columns
        sourceColumns?: Array<{
            componentField: string;      // Expected field name from DS definition
            matchedColumn?: string;       // Actual column in dataset
            matchConfidence: number;      // 0-100
            matched: boolean;
        }>;
        isComposite?: boolean;  // True if element requires multiple source columns
    }> {
        // FIX: Check if this is a composite/derived element that needs multiple source columns
        const calcDef = element.calculationDefinition;
        const componentFields = calcDef?.formula?.componentFields || [];
        const isCompositeElement = componentFields.length > 0 &&
            ['derived', 'aggregated', 'composite'].includes(calcDef?.calculationType || '');

        // For composite elements, match ALL componentFields to dataset columns
        if (isCompositeElement) {
            console.log(`🔗 [DE Mapping] Composite element "${element.elementName}" has ${componentFields.length} component fields: ${componentFields.join(', ')}`);

            // Phase 2C: Try to resolve descriptors for enhanced matching
            // Check if the element's notes reference a registry key
            let descriptors: any[] | undefined;
            const registryKeyMatch = calcDef?.notes?.match(/Registry-matched KPI:\s*(\S+)/);
            if (registryKeyMatch) {
                try {
                    const { businessDefinitionRegistry } = await import('../business-definition-registry');
                    const lookupResult = await businessDefinitionRegistry.lookupDefinition(registryKeyMatch[1]);
                    if (lookupResult.found && lookupResult.definition) {
                        descriptors = (lookupResult.definition.componentFieldDescriptors as any[]) || undefined;
                        if (descriptors?.length) {
                            console.log(`   📋 [DE Mapping] Found ${descriptors.length} component field descriptors from registry for "${registryKeyMatch[1]}"`);
                        }
                    }
                } catch (regErr) {
                    console.warn(`   ⚠️ [DE Mapping] Failed to load descriptors from registry:`, regErr);
                }
            }

            const sourceColumns = await this.matchComponentFields(componentFields, availableFields, schema, descriptors);
            const matchedCount = sourceColumns.filter(sc => sc.matched).length;
            const avgConfidence = sourceColumns.length > 0
                ? sourceColumns.reduce((sum, sc) => sum + sc.matchConfidence, 0) / sourceColumns.length
                : 0;

            // Element is "found" if at least one component field is matched
            const found = matchedCount > 0;

            // Primary source field is the first matched column (for backward compatibility)
            const primaryMatch = sourceColumns.find(sc => sc.matched);

            console.log(`   ✅ Matched ${matchedCount}/${componentFields.length} component fields (avg confidence: ${Math.round(avgConfidence)}%)`);
            sourceColumns.forEach(sc => {
                console.log(`      - ${sc.componentField}: ${sc.matched ? `→ ${sc.matchedColumn} (${sc.matchConfidence}%)` : '❌ No match'}`);
            });

            return {
                found,
                sourceField: primaryMatch?.matchedColumn,
                sourceDataType: primaryMatch?.matchedColumn ? schema[primaryMatch.matchedColumn]?.type : undefined,
                transformationNeeded: true, // Composite elements always need transformation
                confidence: avgConfidence,
                transformationLogic: this.buildCompositeTransformationLogic(element, sourceColumns),
                alternatives: [],
                sourceColumns,
                isComposite: true
            };
        }

        // Try exact name match first (for direct mapping elements)
        const exactMatch = availableFields.find(f =>
            f.toLowerCase() === element.elementName.toLowerCase()
        );

        if (exactMatch) {
            const fieldType = schema[exactMatch]?.type;
            // FIX A1: Honor DS calculationType even on exact name matches.
            // If the DS agent specified a non-direct calculationType (derived, aggregated, grouped, composite),
            // transformation IS required regardless of type matching.
            const calcType = element.calculationDefinition?.calculationType;
            const needsTransform = !this.typesMatch(element.dataType, fieldType) ||
                (calcType != null && calcType !== 'direct');

            return {
                found: true,
                sourceField: exactMatch,
                sourceDataType: fieldType,
                transformationNeeded: needsTransform,
                confidence: 100, // Exact match = 100% confidence
                transformationLogic: needsTransform
                    ? this.buildTransformationLogicFromDefinition(element, exactMatch, fieldType)
                    : undefined,
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
            const needsTransform = !this.typesMatch(element.dataType, fieldType) ||
                                   element.calculationDefinition?.calculationType !== 'direct';

            return {
                found: true,
                sourceField: best.field,
                sourceDataType: fieldType,
                transformationNeeded: needsTransform,
                confidence: best.score, // Use calculated confidence
                transformationLogic: needsTransform
                    ? this.buildTransformationLogicFromDefinition(element, best.field, fieldType)
                    : undefined,
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
     * Match componentFields from DS definition to actual dataset columns
     * Uses fuzzy matching to find best column for each expected component field
     */
    private async matchComponentFields(
        componentFields: string[],
        availableFields: string[],
        schema: Record<string, any>,
        descriptors?: any[] // ComponentFieldDescriptor[] from business definition
    ): Promise<Array<{
        componentField: string;
        matchedColumn?: string;
        matchConfidence: number;
        matched: boolean;
        isIntermediate?: boolean; // Flag from descriptor: needs further derivation
        matchType?: string;      // How match was made (descriptor, fuzzy, semantic)
    }>> {
        const results: Array<{
            componentField: string;
            matchedColumn?: string;
            matchConfidence: number;
            matched: boolean;
            isIntermediate?: boolean;
            matchType?: string;
        }> = [];

        for (const componentField of componentFields) {
            const normalizedComponent = componentField.toLowerCase().replace(/[_\s-]+/g, '');

            // ── DESCRIPTOR-BASED MATCHING (Phase 2C) ──
            // If descriptors are provided, use them for high-confidence matching first
            const descriptor = descriptors?.find(d =>
                d.abstractName?.toLowerCase() === componentField.toLowerCase() ||
                d.abstractName?.toLowerCase().replace(/_/g, '') === normalizedComponent
            );

            if (descriptor && descriptor.columnMatchPatterns?.length > 0) {
                let descriptorBestMatch: { column: string; score: number } | null = null;

                for (const availableField of availableFields) {
                    const fieldLower = availableField.toLowerCase();
                    const fieldNormalized = fieldLower.replace(/[_\s-]+/g, '');

                    for (const pattern of descriptor.columnMatchPatterns) {
                        const patternLower = pattern.toLowerCase();

                        // Exact pattern match against column name
                        if (fieldLower === patternLower || fieldNormalized === patternLower.replace(/[_\s-]+/g, '')) {
                            descriptorBestMatch = { column: availableField, score: 95 };
                            break;
                        }

                        // Column name contains pattern or pattern contains column
                        if (fieldLower.includes(patternLower) || patternLower.includes(fieldLower.replace(/[_\s-]+/g, ''))) {
                            const score = 85;
                            if (!descriptorBestMatch || score > descriptorBestMatch.score) {
                                descriptorBestMatch = { column: availableField, score };
                            }
                        }

                        // Word overlap between pattern parts and column name parts
                        const patternParts = patternLower.split(/[_\s-]+/);
                        const fieldParts = fieldLower.split(/[_\s-]+/);
                        const overlap = patternParts.filter((pp: string) =>
                            pp.length > 2 && fieldParts.some((fp: string) => fp.includes(pp) || pp.includes(fp))
                        );
                        if (overlap.length > 0 && overlap.length >= patternParts.length * 0.5) {
                            const overlapScore = 75 + (overlap.length / patternParts.length) * 10;
                            if (!descriptorBestMatch || overlapScore > descriptorBestMatch.score) {
                                descriptorBestMatch = { column: availableField, score: overlapScore };
                            }
                        }
                    }

                    if (descriptorBestMatch?.score === 95) break; // Perfect match, no need to continue
                }

                // Validate matched column's data type against descriptor expectation
                if (descriptorBestMatch && descriptor.dataTypeExpected) {
                    const colType = schema[descriptorBestMatch.column]?.type?.toLowerCase() || '';
                    const expectedType = descriptor.dataTypeExpected;

                    const typeMatches =
                        (expectedType === 'date' && /date|time|timestamp/i.test(colType)) ||
                        (expectedType === 'numeric' && /int|float|numeric|number|decimal/i.test(colType)) ||
                        (expectedType === 'identifier' && /varchar|text|char|string/i.test(colType)) ||
                        (expectedType === 'categorical' && /varchar|text|char|string|enum/i.test(colType)) ||
                        !colType; // If no type info, don't penalize

                    if (!typeMatches && colType) {
                        // Reduce confidence for type mismatch
                        descriptorBestMatch.score = Math.max(descriptorBestMatch.score - 20, 40);
                    }
                }

                // For date_presence_indicator: prefer date columns with many null values
                if (descriptor.columnMatchType === 'date_presence_indicator' && descriptorBestMatch) {
                    // The column should be a date type — boost if it matches
                    const colType = schema[descriptorBestMatch.column]?.type?.toLowerCase() || '';
                    if (/date|time|timestamp/i.test(colType)) {
                        descriptorBestMatch.score = Math.min(descriptorBestMatch.score + 5, 98);
                    }
                }

                if (descriptorBestMatch && descriptorBestMatch.score >= 50) {
                    results.push({
                        componentField,
                        matchedColumn: descriptorBestMatch.column,
                        matchConfidence: descriptorBestMatch.score,
                        matched: true,
                        isIntermediate: descriptor.isIntermediate || false,
                        matchType: 'descriptor'
                    });
                    console.log(`🔍 [matchComponentFields] Descriptor match: "${componentField}" → "${descriptorBestMatch.column}" (score: ${descriptorBestMatch.score}, type: ${descriptor.columnMatchType})`);
                    continue; // Skip fuzzy matching since descriptor gave a result
                }
            }

            // Try exact match first
            let bestMatch: { column: string; score: number } | null = null;

            for (const availableField of availableFields) {
                const normalizedAvailable = availableField.toLowerCase().replace(/[_\s-]+/g, '');

                // Exact match
                if (normalizedComponent === normalizedAvailable) {
                    bestMatch = { column: availableField, score: 100 };
                    break;
                }

                // Contains match
                if (normalizedAvailable.includes(normalizedComponent) || normalizedComponent.includes(normalizedAvailable)) {
                    const score = Math.max(
                        (normalizedComponent.length / normalizedAvailable.length) * 80,
                        (normalizedAvailable.length / normalizedComponent.length) * 80
                    );
                    if (!bestMatch || score > bestMatch.score) {
                        bestMatch = { column: availableField, score: Math.min(score, 90) };
                    }
                }

                // Word overlap match (e.g., "engagement_score" matches "EngagementScore")
                const componentWords = componentField.toLowerCase().split(/[_\s-]+/);
                const availableWords = availableField.toLowerCase().split(/[_\s-]+/);
                const overlap = componentWords.filter(w => availableWords.some(aw => aw.includes(w) || w.includes(aw)));

                if (overlap.length > 0) {
                    const overlapScore = (overlap.length / Math.max(componentWords.length, availableWords.length)) * 70;
                    if (!bestMatch || overlapScore > bestMatch.score) {
                        bestMatch = { column: availableField, score: overlapScore };
                    }
                }

                // Abbreviation match (e.g., "Q1" matches "Question1" or "q1_score")
                if (componentField.length <= 3) {
                    const abbrevPattern = new RegExp(componentField.split('').join('.*'), 'i');
                    if (abbrevPattern.test(availableField)) {
                        const abbrevScore = 60;
                        if (!bestMatch || abbrevScore > bestMatch.score) {
                            bestMatch = { column: availableField, score: abbrevScore };
                        }
                    }
                }

                // FIX: Semantic pattern matching for placeholder names like "survey_scores", "engagement_questions"
                // These are conceptual placeholders that should match based on column patterns/types
                const semanticPatterns: Record<string, RegExp[]> = {
                    'survey_scores': [/q\d+|score|rating|response|likert|survey/i],
                    'survey_responses': [/q\d+|response|answer|feedback|survey/i],
                    'engagement_questions': [/engagement|satisfaction|q\d+.*score|motivation|commitment/i],
                    'engagement_score': [/engagement|satisfaction|motivation|morale|commitment/i],
                    'satisfaction_score': [/satisfaction|happy|content|pleased|rate/i],
                    'numeric_columns': [/score|rating|count|amount|total|number|value|avg|sum/i],
                    'date_columns': [/date|time|timestamp|day|month|year|created|updated/i],
                    'id_columns': [/id|key|code|identifier|number$/i],
                    'category_columns': [/department|team|group|type|category|status|level/i],
                };

                const normalizedComponentLower = componentField.toLowerCase().replace(/[_\s-]+/g, '_');
                const patterns = semanticPatterns[normalizedComponentLower] || semanticPatterns[componentField.toLowerCase()];

                if (patterns) {
                    for (const pattern of patterns) {
                        if (pattern.test(availableField)) {
                            // Check if this column is numeric (for score-based patterns)
                            const colType = schema[availableField]?.type?.toLowerCase() || '';
                            const isNumericCol = /int|float|numeric|number|decimal/i.test(colType);
                            const isScorePattern = /score|rating|numeric/i.test(normalizedComponentLower);

                            // Higher confidence for type match
                            let semanticScore = 55;
                            if (isScorePattern && isNumericCol) {
                                semanticScore = 70;
                            }

                            if (!bestMatch || semanticScore > bestMatch.score) {
                                bestMatch = { column: availableField, score: semanticScore };
                            }
                        }
                    }
                }
            }

            // FIX A4: Type-aware fallback — when fuzzy matching fails for generic placeholders
            // (e.g., "survey_scores"), fall back to matching against ALL numeric columns
            // that haven't been claimed by a higher-confidence match yet.
            if (!bestMatch || bestMatch.score < 50) {
                const componentLower = componentField.toLowerCase();
                const isNumericExpected = /score|rating|metric|value|amount|count|average|sum|index|level|numeric/i.test(componentLower);

                if (isNumericExpected) {
                    // Find all unmatched numeric columns as candidates
                    const alreadyMatched = new Set(results.filter(r => r.matched).map(r => r.matchedColumn));
                    for (const availableField of availableFields) {
                        if (alreadyMatched.has(availableField)) continue;
                        const colType = schema[availableField]?.type?.toLowerCase() || '';
                        const isNumeric = /int|float|numeric|number|decimal/i.test(colType);
                        if (isNumeric) {
                            const fallbackScore = 35;
                            if (!bestMatch || fallbackScore > bestMatch.score) {
                                bestMatch = { column: availableField, score: fallbackScore };
                            }
                        }
                    }
                }
            }

            results.push({
                componentField,
                matchedColumn: bestMatch?.column,
                matchConfidence: bestMatch?.score || 0,
                matched: bestMatch !== null && bestMatch.score >= 30, // FIX A4: Lower threshold from 50 to 30 for fallback matches
                isIntermediate: descriptor?.isIntermediate || false,
                matchType: bestMatch ? 'fuzzy' : 'none'
            });
        }

        return results;
    }

    /**
     * Build transformation logic for composite elements with multiple source columns
     */
    private buildCompositeTransformationLogic(
        element: RequiredDataElement,
        sourceColumns: Array<{
            componentField: string;
            matchedColumn?: string;
            matchConfidence: number;
            matched: boolean;
        }>
    ): { operation: string; description: string; code: string; dependencies?: string[]; sourceColumns?: any[]; validationRules?: string[] } {
        const calcDef = element.calculationDefinition;
        const matchedColumns = sourceColumns.filter(sc => sc.matched).map(sc => sc.matchedColumn!);
        const unmatchedFields = sourceColumns.filter(sc => !sc.matched).map(sc => sc.componentField);

        // Build description showing the mapping
        let description = calcDef?.formula?.businessDescription || `Composite calculation for ${element.elementName}`;
        if (unmatchedFields.length > 0) {
            description += `\n⚠️ UNMAPPED FIELDS: ${unmatchedFields.join(', ')} - Please map these manually`;
        }

        // Build code using matched columns
        let code = '';
        const aggMethod = calcDef?.formula?.aggregationMethod;

        if (calcDef?.formula?.pseudoCode) {
            // Use provided pseudoCode, substituting matched columns
            code = calcDef.formula.pseudoCode;
            sourceColumns.forEach(sc => {
                if (sc.matched && sc.matchedColumn) {
                    // Replace component field references with actual column names
                    const patterns = [
                        new RegExp(`\\b${sc.componentField}\\b`, 'gi'),
                        new RegExp(`'${sc.componentField}'`, 'gi'),
                        new RegExp(`"${sc.componentField}"`, 'gi')
                    ];
                    patterns.forEach(pattern => {
                        code = code.replace(pattern, `df['${sc.matchedColumn}']`);
                    });
                }
            });
        } else if (aggMethod && matchedColumns.length > 0) {
            // Generate aggregation code
            switch (aggMethod) {
                case 'average':
                    code = `(${matchedColumns.map(c => `df['${c}']`).join(' + ')}) / ${matchedColumns.length}`;
                    break;
                case 'sum':
                    code = matchedColumns.map(c => `df['${c}']`).join(' + ');
                    break;
                case 'weighted_average':
                    code = `# Weighted average - adjust weights as needed\n(${matchedColumns.map((c, i) => `df['${c}'] * weight_${i}`).join(' + ')}) / sum(weights)`;
                    break;
                default:
                    code = `# ${aggMethod}: ${matchedColumns.map(c => `df['${c}']`).join(', ')}`;
            }
        } else {
            code = `# Composite: ${element.elementName}\n# Source columns: ${matchedColumns.join(', ')}\n# TODO: Define transformation logic`;
        }

        return {
            operation: 'composite_calculation',
            description,
            code,
            dependencies: matchedColumns,
            sourceColumns: sourceColumns,
            validationRules: unmatchedFields.length > 0
                ? [`⚠️ ${unmatchedFields.length} component field(s) not mapped: ${unmatchedFields.join(', ')}`]
                : [`All ${matchedColumns.length} component fields mapped successfully`]
        };
    }

    /**
     * Build transformation logic based on the calculationDefinition from Data Scientist agent
     * This ensures the DE follows the DS recommendations for how to derive each element
     */
    private buildTransformationLogicFromDefinition(
        element: RequiredDataElement,
        sourceField: string,
        sourceType: string
    ): { operation: string; description: string; code: string; dependencies?: string[]; validationRules?: string[] } {
        const calcDef = element.calculationDefinition;

        // If no calculation definition, use basic type conversion
        if (!calcDef) {
            return {
                operation: `convert_to_${element.dataType}`,
                description: `Convert ${sourceType} to ${element.dataType}`,
                code: this.generateTransformationCode(sourceField, sourceType, element.dataType)
            };
        }

        console.log(`🔧 [DE Agent] Using DS calculation definition for "${element.elementName}": ${calcDef.calculationType}`);

        // Build transformation based on calculation type
        switch (calcDef.calculationType) {
            case 'aggregated':
                const aggMethod = calcDef.formula?.aggregationMethod || 'sum';
                return {
                    operation: `aggregate_${aggMethod}`,
                    description: calcDef.formula?.businessDescription || `Calculate ${aggMethod} of ${element.elementName}`,
                    code: this.generateAggregationCode(sourceField, aggMethod, calcDef.formula?.pseudoCode),
                    dependencies: calcDef.formula?.componentFields,
                    validationRules: [`Result should be ${element.dataType} type`]
                };

            case 'derived':
                return {
                    operation: 'derive_value',
                    description: calcDef.formula?.businessDescription || `Derive ${element.elementName} value`,
                    code: calcDef.formula?.pseudoCode
                        ? this.convertPseudoCodeToPython(calcDef.formula.pseudoCode, sourceField)
                        : this.generateTransformationCode(sourceField, sourceType, element.dataType),
                    dependencies: calcDef.formula?.componentFields,
                    validationRules: calcDef.notes ? [calcDef.notes] : []
                };

            case 'grouped':
                return {
                    operation: 'group_by',
                    description: calcDef.formula?.businessDescription || `Group by ${element.elementName}`,
                    code: `df.groupby('${sourceField}')`,
                    validationRules: calcDef.categorization?.categories?.map(c => `Category: ${c.name} - ${c.rule}`) || []
                };

            case 'composite':
                return {
                    operation: 'composite_calculation',
                    description: calcDef.formula?.businessDescription || `Composite calculation for ${element.elementName}`,
                    code: calcDef.formula?.pseudoCode
                        ? this.convertPseudoCodeToPython(calcDef.formula.pseudoCode, sourceField)
                        : `# Composite: ${element.elementName}\n# Components: ${calcDef.formula?.componentFields?.join(', ') || sourceField}`,
                    dependencies: calcDef.formula?.componentFields,
                    validationRules: [`Verify all component fields are available`]
                };

            case 'direct':
            default:
                return {
                    operation: `convert_to_${element.dataType}`,
                    description: calcDef.formula?.businessDescription || `Direct mapping from ${sourceField}`,
                    code: this.generateTransformationCode(sourceField, sourceType, element.dataType),
                    validationRules: element.qualityRequirements?.format ? [`Format: ${element.qualityRequirements.format}`] : []
                };
        }
    }

    /**
     * Generate aggregation code based on method
     */
    private generateAggregationCode(sourceField: string, method: string, pseudoCode?: string): string {
        if (pseudoCode) {
            return this.convertPseudoCodeToPython(pseudoCode, sourceField);
        }

        switch (method) {
            case 'average':
                return `df['${sourceField}'].mean()`;
            case 'sum':
                return `df['${sourceField}'].sum()`;
            case 'count':
                return `df['${sourceField}'].count()`;
            case 'min':
                return `df['${sourceField}'].min()`;
            case 'max':
                return `df['${sourceField}'].max()`;
            case 'median':
                return `df['${sourceField}'].median()`;
            case 'weighted_average':
                return `# Weighted average - requires weight column\n(df['${sourceField}'] * df['weight']).sum() / df['weight'].sum()`;
            default:
                return `df['${sourceField}'].agg('${method}')`;
        }
    }

    /**
     * Convert pseudo-code from DS agent to Python
     */
    private convertPseudoCodeToPython(pseudoCode: string, sourceField: string): string {
        // Replace common SQL-like patterns with pandas equivalents
        let pythonCode = pseudoCode
            .replace(/SELECT\s+/gi, "# SELECT: ")
            .replace(/\bAS\b/gi, " # alias:")
            .replace(/\bAVG\s*\(/gi, "df['").replace(/\)\s*#\s*alias/gi, "'].mean() #")
            .replace(/\bSUM\s*\(/gi, "df['").replace(/\)\s*#\s*alias/gi, "'].sum() #")
            .replace(/\bCOUNT\s*\(/gi, "df['").replace(/\)\s*#\s*alias/gi, "'].count() #")
            .replace(/\bCOALESCE\s*\(/gi, "np.where(pd.notna(df['")
            .replace(/,\s*computed_value\)/gi, "']), df['" + sourceField + "'], computed_value)")
            .replace(/\bCAST\s*\(/gi, "pd.to_numeric(df['")
            .replace(/\s+AS\s+NUMERIC\)/gi, "'], errors='coerce')")
            .replace(/\bGROUP\s+BY\b/gi, "# Group by:")
            .replace(/\bPARSE_DATE\s*\(/gi, "pd.to_datetime(df['");

        // If minimal transformation, return the pseudo-code as a comment + basic transform
        if (pythonCode === pseudoCode) {
            return `# ${pseudoCode}\ndf['${sourceField}']`;
        }

        return pythonCode;
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

        // Extract hints from calculationDefinition if available
        const calcDef = (element as any).calculationDefinition;
        const groupingFieldHint = calcDef?.comparisonGroups?.groupingField;
        const componentFieldHints = calcDef?.formula?.componentFields || [];
        const calcNotes = (calcDef?.notes || '').toLowerCase();

        for (const field of fields) {
            let score = 0;
            const reasons: string[] = [];
            const fieldLower = field.toLowerCase();
            const elementLower = element.elementName.toLowerCase();

            // Split compound element names (e.g., "Team/Department" -> ["team", "department"])
            const elementParts = elementLower.split(/[\/\s\-_]+/).filter(p => p.length > 2);
            // Also split field name for matching
            const fieldParts = fieldLower.split(/[\/\s\-_]+/).filter(p => p.length > 2);

            // 1. Exact or near-exact name match (highest priority)
            if (fieldLower === elementLower) {
                score += 100;
                reasons.push('exact name match');
            } else if (fieldLower.includes(elementLower) || elementLower.includes(fieldLower)) {
                score += 50;
                reasons.push('partial name match');
            }

            // 1b. Check compound element parts (e.g., "Team/Department" matches "Department")
            for (const part of elementParts) {
                if (fieldLower === part) {
                    score += 80;
                    reasons.push(`compound part exact: ${part}`);
                } else if (fieldLower.includes(part) || part.includes(fieldLower)) {
                    score += 40;
                    reasons.push(`compound part partial: ${part}`);
                }
            }

            // 1c. Check DS agent calculationDefinition hints
            if (groupingFieldHint && fieldLower.includes(groupingFieldHint.toLowerCase())) {
                score += 60;
                reasons.push(`DS agent groupingField hint: ${groupingFieldHint}`);
            }
            for (const componentField of componentFieldHints) {
                if (fieldLower.includes(componentField.toLowerCase())) {
                    score += 50;
                    reasons.push(`DS agent componentField hint: ${componentField}`);
                }
            }
            if (calcNotes && calcNotes.includes(fieldLower)) {
                score += 30;
                reasons.push('mentioned in calculation notes');
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

            // 7. Universal domain patterns (works across HR, Sales, Finance, Healthcare, Education, etc.)
            // ENHANCED: More comprehensive patterns with common abbreviations and variations
            const universalPatterns: Record<string, string[]> = {
                // === UNIVERSAL ANALYSIS PATTERNS ===
                'metric': ['score', 'rating', 'value', 'count', 'total', 'average', 'mean', 'amount', 'quantity', 'level', 'index', 'rate', 'pct', 'percentage'],
                'grouping': ['category', 'type', 'segment', 'group', 'class', 'tier', 'classification', 'division', 'bucket', 'cluster'],
                'primary': ['main', 'primary', 'key', 'major', 'first', 'core', 'principal', 'lead'],
                'secondary': ['secondary', 'other', 'additional', 'alt', 'supplementary', 'minor', 'backup'],
                'text': ['comment', 'feedback', 'notes', 'description', 'remarks', 'text', 'content', 'narrative', 'summary'],
                'identifier': ['id', 'key', 'code', 'number', 'ref', 'identifier', 'uuid', 'pk', 'unique'],
                'unique': ['unique', 'id', 'key', 'code', 'identifier', 'pk', 'uid', 'record', 'row'],

                // === HR/EMPLOYEE PATTERNS (ENHANCED) ===
                'engagement': ['engagement', 'eng_score', 'engagement_score', 'satisfaction', 'morale', 'commitment', 'engaged', 'involvement', 'enthusiasm'],
                'performance': ['performance', 'rating', 'kpi', 'evaluation', 'review', 'assessment', 'productivity', 'perf', 'performancescore', 'perform'],
                'department': ['department', 'dept', 'division', 'unit', 'team', 'group', 'org_unit', 'organizational_unit', 'business_unit'],
                'team': ['team', 'group', 'squad', 'department', 'unit', 'crew', 'workgroup', 'team_name', 'teamid'],
                'retention': ['retention', 'turnover', 'attrition', 'tenure', 'years_of_service', 'churn', 'leaving', 'exit', 'departure'],
                'employee': ['employee', 'emp', 'staff', 'worker', 'personnel', 'member', 'associate', 'emp_id', 'employeeid', 'staff_id', 'workerid'],
                'turnover': ['turnover', 'attrition', 'churn', 'exit', 'leave', 'departure', 'termination', 'separation', 'turnover_rate'],
                'manager': ['manager', 'supervisor', 'lead', 'boss', 'mgr', 'team_lead', 'reports_to', 'direct_manager'],
                'hire': ['hire', 'hired', 'hire_date', 'start_date', 'join_date', 'onboard', 'joining', 'employment_date'],
                'salary': ['salary', 'wage', 'pay', 'compensation', 'income', 'earnings', 'remuneration', 'base_pay'],
                'tenure': ['tenure', 'years', 'months', 'service', 'experience', 'seniority', 'years_employed', 'length_of_service'],

                // === SURVEY/QUESTIONNAIRE PATTERNS (ENHANCED) ===
                'survey': ['survey', 'questionnaire', 'poll', 'feedback', 'assessment', 'form', 'evaluation'],
                'question': ['question', 'item', 'query', 'q1', 'q2', 'q3', 'q4', 'q5', 'survey_item', 'ques', 'qstn'],
                'response': ['response', 'answer', 'reply', 'feedback', 'input', 'result', 'choice', 'selection'],
                'satisfaction': ['satisfaction', 'rating', 'score', 'nps', 'csat', 'ces', 'sentiment', 'happy', 'content'],
                'likert': ['likert', 'scale', 'rating', 'agree', 'disagree', 'strongly', 'neutral', 'score'],
                'open': ['open', 'text', 'comment', 'feedback', 'verbatim', 'freetext', 'open_ended', 'narrative'],

                // === CUSTOMER/SALES PATTERNS ===
                'customer': ['customer', 'client', 'buyer', 'purchaser', 'account', 'consumer', 'user', 'cust', 'customer_id'],
                'revenue': ['revenue', 'sales', 'income', 'earnings', 'gross', 'amount', 'value', 'total_sales', 'gmv'],
                'order': ['order', 'transaction', 'purchase', 'sale', 'booking', 'deal', 'order_id', 'ordernum'],
                'product': ['product', 'item', 'sku', 'article', 'goods', 'merchandise', 'prod', 'product_id'],
                'price': ['price', 'cost', 'rate', 'fee', 'charge', 'amount', 'value', 'unit_price', 'total_price'],

                // === FINANCIAL PATTERNS ===
                'amount': ['amount', 'value', 'sum', 'total', 'balance', 'figure', 'amt', 'val'],
                'account': ['account', 'acct', 'ledger', 'fund', 'budget', 'account_num', 'acc'],
                'transaction': ['transaction', 'txn', 'payment', 'transfer', 'entry', 'trans', 'trx'],

                // === GEOGRAPHIC/LOCATION PATTERNS ===
                'region': ['region', 'area', 'zone', 'territory', 'district', 'locale', 'geo', 'geography'],
                'location': ['location', 'place', 'site', 'address', 'city', 'country', 'state', 'loc', 'office'],

                // === TIME/TEMPORAL PATTERNS ===
                'period': ['period', 'quarter', 'month', 'year', 'week', 'fiscal', 'term', 'fy', 'qtr'],
                'timestamp': ['timestamp', 'datetime', 'date', 'time', 'created', 'updated', 'at', 'dt', 'ts'],
                'date': ['date', 'day', 'month', 'year', 'created', 'modified', 'dt', 'dob', 'start_date', 'end_date'],

                // === STATUS/STATE PATTERNS ===
                'status': ['status', 'state', 'condition', 'phase', 'stage', 'level', 'stat', 'sts'],
                'active': ['active', 'enabled', 'live', 'current', 'valid', 'in_progress', 'ongoing', 'running'],

                // === DERIVED/CALCULATED PATTERNS ===
                'score': ['score', 'rating', 'index', 'level', 'grade', 'rank', 'percentile', 'pct'],
                'rate': ['rate', 'ratio', 'percentage', 'pct', 'fraction', 'proportion', 'percent'],
                'count': ['count', 'total', 'num', 'number', 'qty', 'quantity', 'n', 'cnt'],
                'average': ['average', 'avg', 'mean', 'median', 'mode', 'typical'],
                'aggregate': ['sum', 'total', 'aggregate', 'cumulative', 'running', 'subtotal'],

                // === EDUCATIONAL PATTERNS ===
                'student': ['student', 'learner', 'pupil', 'enrollee', 'participant', 'attendee'],
                'grade': ['grade', 'mark', 'score', 'result', 'gpa', 'cgpa', 'letter_grade'],
                'course': ['course', 'class', 'subject', 'module', 'program', 'curriculum'],
                'attendance': ['attendance', 'present', 'absent', 'absent_days', 'present_days'],

                // === HEALTHCARE PATTERNS ===
                'patient': ['patient', 'client', 'member', 'beneficiary', 'insured', 'patient_id'],
                'diagnosis': ['diagnosis', 'dx', 'condition', 'illness', 'disease', 'icd'],
                'treatment': ['treatment', 'procedure', 'therapy', 'medication', 'rx'],
            };

            // Additional compound pattern matching - for multi-word element names
            const compoundMappings: Record<string, string[]> = {
                'unique identifier': ['id', 'key', 'code', 'identifier', 'pk', 'uid', 'employee_id', 'emp_id', 'record_id'],
                'engagement score': ['engagement', 'eng_score', 'engagement_score', 'engagement_level', 'engaged', 'satisfaction_score'],
                'employee identifier': ['employee_id', 'emp_id', 'emp', 'employee', 'staff_id', 'worker_id', 'id'],
                'department': ['department', 'dept', 'team', 'division', 'unit', 'group'],
                'turnover rate': ['turnover', 'attrition', 'churn', 'exit_rate', 'turnover_rate', 'leaving'],
                'survey response': ['response', 'answer', 'survey', 'feedback', 'result'],
                'satisfaction score': ['satisfaction', 'csat', 'nps', 'rating', 'score', 'happy'],
                'performance rating': ['performance', 'rating', 'perf_score', 'evaluation', 'review_score'],
            };

            // Check compound mappings first (higher priority)
            for (const [compound, synonyms] of Object.entries(compoundMappings)) {
                if (elementLower.includes(compound.replace(/ /g, '')) ||
                    elementLower.split(' ').every(word => compound.includes(word))) {
                    for (const syn of synonyms) {
                        if (fieldLower.includes(syn) || syn.includes(fieldLower)) {
                            score += 50;
                            reasons.push(`compound match: ${compound} ↔ ${syn}`);
                            break;
                        }
                    }
                }
            }

            for (const [pattern, synonyms] of Object.entries(universalPatterns)) {
                if (elementLower.includes(pattern)) {
                    for (const syn of synonyms) {
                        if (fieldLower.includes(syn)) {
                            score += 35;
                            reasons.push(`domain pattern: ${pattern} ↔ ${syn}`);
                            break;
                        }
                    }
                }
            }

            // 8. Numeric metric patterns (for analysis elements)
            if ((elementLower.includes('metric') || elementLower.includes('score') || elementLower.includes('value')) &&
                (schema[field]?.type === 'numeric' || schema[field]?.type === 'integer' || schema[field]?.type === 'number')) {
                score += 20;
                reasons.push('numeric metric pattern');
            }

            // 9. DEFINITION-BASED SEMANTIC MATCHING (NEW - Jan 2026)
            // Use full definition semantics, not just keywords
            const definitionLower = (element.description || '').toLowerCase();

            // 9a. Uniqueness-related definitions → find columns with high uniqueness
            if (definitionLower.includes('unique identifier') ||
                definitionLower.includes('primary key') ||
                definitionLower.includes('record identifier') ||
                definitionLower.includes('primary identifier') ||
                definitionLower.includes('unique key')) {
                // Check if this field has unique values in the preview
                if (preview.length > 0) {
                    const uniqueValues = new Set(preview.map(row => row[field]));
                    const uniquenessRatio = uniqueValues.size / preview.length;
                    // High uniqueness + ID-like naming pattern = strong match
                    if (uniquenessRatio > 0.95 &&
                        (fieldLower.includes('id') || fieldLower.includes('key') ||
                         fieldLower.includes('code') || fieldLower.includes('num') ||
                         fieldLower.includes('employee') || fieldLower.includes('record'))) {
                        score += 70;
                        reasons.push(`matches unique identifier definition (${Math.round(uniquenessRatio * 100)}% unique + ID pattern)`);
                    } else if (uniquenessRatio > 0.95) {
                        // High uniqueness alone is still a good indicator
                        score += 40;
                        reasons.push(`high uniqueness ratio (${Math.round(uniquenessRatio * 100)}%)`);
                    }
                }
            }

            // 9b. Grouping/segmentation definitions → find low-cardinality columns
            if (definitionLower.includes('group') || definitionLower.includes('segment') ||
                definitionLower.includes('category') || definitionLower.includes('classify') ||
                definitionLower.includes('grouping') || definitionLower.includes('bucket') ||
                definitionLower.includes('cluster')) {
                if (preview.length > 0) {
                    const uniqueValues = new Set(preview.map(row => row[field]));
                    const cardinalityRatio = uniqueValues.size / preview.length;
                    // Low cardinality = good for grouping (e.g., Department with 5-10 values)
                    if (cardinalityRatio < 0.3 && uniqueValues.size >= 2 && uniqueValues.size <= 50) {
                        score += 55;
                        reasons.push(`low-cardinality field ideal for grouping (${uniqueValues.size} unique values)`);
                    }
                }
            }

            // 9c. Aggregation-related definitions → find numeric columns
            if (definitionLower.includes('average') || definitionLower.includes('mean') ||
                definitionLower.includes('sum') || definitionLower.includes('total') ||
                definitionLower.includes('aggregate') || definitionLower.includes('computed')) {
                if (schema[field]?.type === 'number' || schema[field]?.type === 'integer' ||
                    schema[field]?.type === 'numeric' || schema[field]?.type === 'float') {
                    score += 45;
                    reasons.push('numeric field matches aggregation definition');
                }
            }

            // 9d. Metric/measure definitions → find numeric columns with variance
            if (definitionLower.includes('metric') || definitionLower.includes('measure') ||
                definitionLower.includes('kpi') || definitionLower.includes('indicator')) {
                if (schema[field]?.type === 'number' || schema[field]?.type === 'integer' ||
                    schema[field]?.type === 'numeric') {
                    // Check if values have reasonable variance (not all the same)
                    if (preview.length > 0) {
                        const numericValues = preview.map(row => parseFloat(row[field])).filter(v => !isNaN(v));
                        if (numericValues.length > 0) {
                            const uniqueNumeric = new Set(numericValues);
                            if (uniqueNumeric.size > 1) {
                                score += 40;
                                reasons.push('numeric metric with variance');
                            }
                        }
                    }
                }
            }

            // 9e. Text/feedback definitions → find string columns with text content
            if (definitionLower.includes('comment') || definitionLower.includes('feedback') ||
                definitionLower.includes('notes') || definitionLower.includes('verbatim') ||
                definitionLower.includes('free text') || definitionLower.includes('open-ended')) {
                if (schema[field]?.type === 'string' || schema[field]?.type === 'text') {
                    // Check if values have reasonable text length
                    if (preview.length > 0) {
                        const avgLength = preview
                            .map(row => String(row[field] || '').length)
                            .reduce((a, b) => a + b, 0) / preview.length;
                        if (avgLength > 20) {  // Average text longer than 20 chars
                            score += 45;
                            reasons.push(`text field matches feedback definition (avg ${Math.round(avgLength)} chars)`);
                        }
                    }
                }
            }

            // 9f. Date/temporal definitions → find date-like columns
            if (definitionLower.includes('when') || definitionLower.includes('date') ||
                definitionLower.includes('timestamp') || definitionLower.includes('time period') ||
                definitionLower.includes('temporal')) {
                if (schema[field]?.type === 'date' || schema[field]?.type === 'datetime' ||
                    schema[field]?.type === 'timestamp' ||
                    fieldLower.includes('date') || fieldLower.includes('time') ||
                    fieldLower.includes('at') || fieldLower.includes('created')) {
                    score += 50;
                    reasons.push('date/temporal field matches time definition');
                }
            }

            // 9g. FIX A3: Business definition matching — use BA Agent's enriched businessDescription
            // This captures semantic meaning that name-based matching misses
            const bizDef = (element as any).businessDefinition;
            if (bizDef?.businessDescription) {
                const bizDescKeywords = bizDef.businessDescription.toLowerCase()
                    .split(/[\s,;:.]+/)
                    .filter((w: string) => w.length > 3);
                let bizDescMatchCount = 0;
                for (const keyword of bizDescKeywords) {
                    if (fieldLower.includes(keyword)) {
                        bizDescMatchCount++;
                    }
                }
                if (bizDescMatchCount > 0) {
                    score += Math.min(bizDescMatchCount * 15, 45); // Up to +45 for business definition match
                    reasons.push(`business definition match (${bizDescMatchCount} keywords)`);
                }
            }

            // 9h. FIX A3: Sample value semantic matching — check if field values contain words from element description
            if (preview.length > 0 && element.description) {
                const descWords = element.description.toLowerCase().split(/[\s,;:.]+/).filter(w => w.length > 4);
                const sampleValues = preview.slice(0, 5).map(row => String(row[field] || '')).join(' ').toLowerCase();
                const descMatchCount = descWords.filter(w => sampleValues.includes(w)).length;
                if (descMatchCount > 0) {
                    score += Math.min(descMatchCount * 10, 30); // Up to +30 for sample value matches
                    reasons.push(`sample values match description (${descMatchCount} words)`);
                }
            }

            console.log(`🔍 [DE Auto-Map] ${element.elementName} ↔ ${field}: score=${score}, reasons=[${reasons.join('; ')}]`);

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

    /**
     * AI-DRIVEN MAPPING: Use LLM to intelligently map elements when pattern matching fails
     * This method understands industry patterns, analysis requirements, and data semantics
     */
    private async mapElementsWithAI(
        elements: RequiredDataElement[],
        availableFields: string[],
        schema: Record<string, any>,
        preview: any[],
        analysisContext: {
            analysisTypes: string[];
            userQuestions: string[];
            industryDomain?: string;
            businessDefinitions?: any[];
        }
    ): Promise<Map<string, {
        sourceField: string;
        transformationCode?: string;
        confidence: number;
        reasoning: string;
        derivationType?: 'direct' | 'derived' | 'aggregated' | 'composite';
        componentFields?: string[];
        aggregationMethod?: 'none' | 'average' | 'sum' | 'count' | 'min' | 'max' | 'count_ratio' | string;
        businessDefinition?: string;
    }>> {
        console.log(`🤖 [AI Mapping] Using LLM to map ${elements.length} elements to ${availableFields.length} fields`);

        // Build context for AI
        const schemaDescription = availableFields.map(f => {
            const fieldType = schema[f]?.type || 'unknown';
            const sampleValues = preview.slice(0, 3).map(row => row[f]).filter(Boolean).join(', ');
            return `- ${f} (${fieldType}): samples: ${sampleValues || 'N/A'}`;
        }).join('\n');

        // ENHANCED: Include FULL element definitions for better semantic matching
        const elementsDescription = elements.map((e, idx) => {
            const calcDef = (e as any).calculationDefinition;
            let desc = `${idx + 1}. "${e.elementName}"`;
            desc += `\n   - DEFINITION: ${e.description || 'No definition provided'}`;
            desc += `\n   - PURPOSE: ${e.purpose || 'General analysis'}`;
            desc += `\n   - DATA TYPE: ${e.dataType}`;
            if ((e as any).relatedQuestions?.length > 0) {
                desc += `\n   - RELATED QUESTIONS: ${(e as any).relatedQuestions.join('; ')}`;
            }
            if (calcDef) {
                desc += `\n   - CALCULATION TYPE: ${calcDef.calculationType}`;
                if (calcDef.formula?.businessDescription) {
                    desc += `\n   - BUSINESS LOGIC: ${calcDef.formula.businessDescription}`;
                }
                if (calcDef.comparisonGroups?.groupingField) {
                    desc += `\n   - GROUPING BY: ${calcDef.comparisonGroups.groupingField}`;
                }
                if (calcDef.formula?.componentFields?.length > 0) {
                    desc += `\n   - COMPONENT FIELDS: ${calcDef.formula.componentFields.join(', ')}`;
                }
            }
            return desc;
        }).join('\n\n');

        // Build business definitions context for the AI prompt
        const businessDefsContext = (analysisContext.businessDefinitions && analysisContext.businessDefinitions.length > 0)
            ? analysisContext.businessDefinitions.map((bd: any, idx: number) => {
                const def = bd.definition || bd;
                const concept = bd.concept || def.conceptName || bd.name || 'Unknown';
                let defStr = `${idx + 1}. "${concept}"`;
                if (def.businessDescription) defStr += `\n   - Business Description: ${def.businessDescription}`;
                if (def.formula) {
                    try {
                        const formulaStr = typeof def.formula === 'string' ? def.formula : (def.formula.businessDescription || JSON.stringify(def.formula));
                        defStr += `\n   - Formula: ${formulaStr}`;
                    } catch { defStr += `\n   - Formula: (complex)`; }
                }
                if (def.componentFields?.length) defStr += `\n   - Component Fields: ${def.componentFields.join(', ')}`;
                if (def.aggregationMethod) defStr += `\n   - Aggregation: ${def.aggregationMethod}`;
                if (def.calculationType) defStr += `\n   - Calculation Type: ${def.calculationType}`;

                // Phase 2D: Include component field descriptors for enhanced AI mapping
                const descriptors = (def.componentFieldDescriptors as any[]) || [];
                if (descriptors.length > 0) {
                    defStr += `\n   - COMPONENT FIELD DESCRIPTORS (use these to map abstract terms to actual columns):`;
                    for (const d of descriptors) {
                        defStr += `\n     * "${d.abstractName}" means: ${d.semanticMeaning}`;
                        if (d.columnMatchPatterns?.length) {
                            defStr += `\n       Look for columns matching: ${d.columnMatchPatterns.join(', ')}`;
                        }
                        if (d.columnMatchType === 'date_presence_indicator') {
                            defStr += `\n       This is derived from a date column — match to columns with dates or null values indicating an event.`;
                            if (d.nullMeaning) defStr += ` NULL means: ${d.nullMeaning}.`;
                            if (d.presenceMeaning) defStr += ` Non-NULL means: ${d.presenceMeaning}.`;
                        } else if (d.columnMatchType === 'count_distinct') {
                            defStr += `\n       Count distinct values of this column to get the metric.`;
                        } else if (d.columnMatchType === 'status_filter') {
                            defStr += `\n       Filter by status values: ${d.statusValues?.join(', ') || 'check column values'}.`;
                        }
                    }
                }

                return defStr;
            }).join('\n\n')
            : '';

        const prompt = `You are a Data Analysis Expert (combining Business Analyst, Data Scientist, and Data Engineer roles) working on a data analysis project. Your task is to map required data elements to available dataset columns using INTELLIGENT SEMANTIC MATCHING and DERIVED FIELD CALCULATION.

ANALYSIS CONTEXT:
- Analysis Types: ${analysisContext.analysisTypes.join(', ')}
- Business Questions: ${analysisContext.userQuestions.slice(0, 3).join('; ')}
${analysisContext.industryDomain ? `- Industry Domain: ${analysisContext.industryDomain}` : ''}
${businessDefsContext ? `
BUSINESS ANALYST / DATA SCIENTIST DEFINITIONS:
These definitions are the AUTHORITATIVE source for how each element should be calculated and transformed.
CRITICAL: When mapping elements, ALWAYS use the formulas, component fields, and aggregation methods from these definitions instead of generic pattern matching.

${businessDefsContext}
` : ''}
AVAILABLE DATASET COLUMNS (with sample values):
${schemaDescription}

REQUIRED DATA ELEMENTS WITH FULL DEFINITIONS:
${elementsDescription}

CRITICAL INSTRUCTION: Match based on the DEFINITION meaning, not just element name keywords!
Example: "Unique identifier for the data" should match a column with unique values like "Employee_ID", "RecordNum", "Serial_Number" - even if the element is just named "Unique Identifier".

FOR EACH ELEMENT, FOLLOW THIS COMPREHENSIVE PROCESS:

STEP 1 - BUSINESS ANALYST PERSPECTIVE (What does this element mean?):
- READ THE DEFINITION CAREFULLY - it explains what the element represents
- What type of data is expected (numeric metric, category, date, etc.)?
- How will it be used in the analysis based on the PURPOSE?
- IMPORTANT: The DEFINITION and PURPOSE describe the real meaning - use these to find the right column!

STEP 2 - DATA SCIENTIST PERSPECTIVE (How should this be calculated?):
- Can this be directly mapped from a single column? (direct)
- Does it require calculation from multiple columns? (derived)
- Does it need aggregation? (aggregated)
- What statistical method applies? (average, sum, count, etc.)
- IMPORTANT: For scores/metrics, identify ALL component columns!

STEP 3 - DATA ENGINEER PERSPECTIVE (Create the mapping):
- Select the best source column(s)
- Write JavaScript transformation code if needed
- Assign confidence based on semantic match quality

SEMANTIC MATCHING RULES:
- "Unique Identifier" → any column with "id", "key", "code", "identifier"
- "Employee Identifier" → "emp_id", "employee_id", "Employee ID", "Staff_ID"
- "Engagement Score" → average of Q1, Q2, Q3... columns or "engagement" column
- "Department/Team" → "dept", "department", "team", "division", "group"
- "Turnover Rate" → "turnover", "attrition", "churn", "exit_rate"
- "Survey Response" → any Q1, Q2, Q3... columns or "response" columns
- Look for PARTIAL matches, abbreviations, and synonyms!

EXAMPLES OF INTELLIGENT MAPPINGS:

1. Element "Unique Identifier" → Find any ID column:
   {
     "elementName": "Unique Identifier",
     "sourceField": "Employee ID",
     "derivationType": "direct",
     "componentFields": [],
     "transformationCode": "return row['Employee ID'];",
     "confidence": 0.95,
     "reasoning": "Direct mapping to unique employee identifier column"
   }

2. Element "Engagement Score" (DERIVED - average of survey questions):
   {
     "elementName": "Engagement Score",
     "sourceField": "Q1",
     "derivationType": "derived",
     "componentFields": ["Q1", "Q2", "Q3", "Q4", "Q5"],
     "aggregationMethod": "average",
     "businessDefinition": "Composite employee engagement metric from survey responses",
     "transformationCode": "const q1 = parseFloat(row['Q1'] || 0); const q2 = parseFloat(row['Q2'] || 0); const q3 = parseFloat(row['Q3'] || 0); const q4 = parseFloat(row['Q4'] || 0); const q5 = parseFloat(row['Q5'] || 0); return (q1 + q2 + q3 + q4 + q5) / 5;",
     "confidence": 0.85,
     "reasoning": "Composite score calculated as average of 5 survey questions (Q1-Q5)"
   }

3. Element "Department" → Semantic match to team/division columns:
   {
     "elementName": "Department",
     "sourceField": "Team",
     "derivationType": "direct",
     "componentFields": [],
     "transformationCode": "return row['Team'];",
     "confidence": 0.88,
     "reasoning": "Team column serves as department/grouping variable for comparative analysis"
   }

4. Element "Turnover Rate" (DERIVED - calculation from status):
   {
     "elementName": "Turnover Rate",
     "sourceField": "Status",
     "derivationType": "derived",
     "componentFields": ["Status", "Start Date"],
     "aggregationMethod": "count_ratio",
     "businessDefinition": "Percentage of employees who left vs total headcount",
     "transformationCode": "return row['Status'] === 'Left' || row['Status'] === 'Terminated' ? 1 : 0;",
     "confidence": 0.80,
     "reasoning": "Derived from employment status - flagging terminated employees for rate calculation"
   }

OUTPUT FORMAT (JSON array):
[
  {
    "elementName": "...",
    "sourceField": "...",
    "derivationType": "direct|derived|aggregated|composite",
    "componentFields": [...],
    "aggregationMethod": "none|average|sum|count|min|max|count_ratio",
    "businessDefinition": "...",
    "transformationCode": "...",
    "confidence": 0.0-1.0,
    "reasoning": "..."
  }
]

IMPORTANT RULES:
1. EVERY element MUST be mapped - use semantic matching if exact match not found
2. For DERIVED fields, list ALL component columns in componentFields array
3. Confidence should be 0.6+ for semantic matches, 0.9+ for exact matches
4. Use JAVASCRIPT syntax for transformationCode (not Python)
5. Always include null/error handling in transformationCode

Return ONLY valid JSON array.`;

        try {
            // FIX 1D: Retry AI mapping up to 3 times with exponential backoff
            let response: any = null;
            let lastAttemptError: any = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    response = await chimaridataAI.generateText({
                        prompt,
                        maxTokens: 2000,
                        temperature: attempt === 0 ? 0.3 : 0.3 + (attempt * 0.15) // Slightly higher temp on retry
                    });
                    if (response?.text) break; // Success
                } catch (attemptErr) {
                    lastAttemptError = attemptErr;
                    console.warn(`⚠️ [AI Mapping] Attempt ${attempt + 1}/3 failed:`, attemptErr instanceof Error ? attemptErr.message : attemptErr);
                    if (attempt < 2) {
                        const delay = (attempt + 1) * 1000; // 1s, 2s
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
            }

            if (!response?.text) {
                console.error('❌ [AI Mapping] All 3 attempts failed. Last error:', lastAttemptError);
                return new Map();
            }

            // Parse AI response
            const jsonMatch = response.text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.warn('⚠️ [AI Mapping] Could not parse AI response as JSON');
                return new Map();
            }

            const mappings = JSON.parse(jsonMatch[0]) as Array<{
                elementName: string;
                sourceField: string;
                transformationCode?: string;
                confidence: number;
                reasoning: string;
                // Enhanced fields for derived calculations
                derivationType?: 'direct' | 'derived' | 'aggregated' | 'composite';
                componentFields?: string[];
                aggregationMethod?: 'none' | 'average' | 'sum' | 'count' | 'min' | 'max' | 'count_ratio';
                businessDefinition?: string;
            }>;

            const result = new Map<string, {
                sourceField: string;
                transformationCode?: string;
                confidence: number;
                reasoning: string;
                derivationType?: 'direct' | 'derived' | 'aggregated' | 'composite';
                componentFields?: string[];
                aggregationMethod?: 'none' | 'average' | 'sum' | 'count' | 'min' | 'max' | 'count_ratio' | string;
                businessDefinition?: string;
            }>();

            for (const mapping of mappings) {
                // Validate the source field exists (or for derived fields, at least one component)
                const sourceExists = availableFields.includes(mapping.sourceField);
                const hasValidComponents = mapping.componentFields?.some(f => availableFields.includes(f));

                if (sourceExists || hasValidComponents) {
                    result.set(mapping.elementName, {
                        sourceField: mapping.sourceField,
                        transformationCode: mapping.transformationCode,
                        confidence: mapping.confidence,
                        reasoning: mapping.reasoning,
                        derivationType: mapping.derivationType,
                        componentFields: mapping.componentFields?.filter(f => availableFields.includes(f)),
                        aggregationMethod: mapping.aggregationMethod,
                        businessDefinition: mapping.businessDefinition
                    });

                    const typeInfo = mapping.derivationType === 'derived'
                        ? ` [DERIVED from ${mapping.componentFields?.join(', ')}]`
                        : '';
                    console.log(`   ✅ ${mapping.elementName} → ${mapping.sourceField} (${Math.round(mapping.confidence * 100)}%)${typeInfo}: ${mapping.reasoning}`);
                } else {
                    console.log(`   ⚠️ ${mapping.elementName}: AI suggested "${mapping.sourceField}" but field not found in schema`);
                }
            }

            console.log(`✅ [AI Mapping] Mapped ${result.size}/${elements.length} elements using AI`);
            return result;

        } catch (error) {
            console.error('❌ [AI Mapping] Error:', error);
            return new Map();
        }
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
            // Bug #9 fix: Use canonical generateStableQuestionId() from constants.ts
            // Never fall back to index-based IDs — they break on question reorder.
            const questionId = projectId
                ? generateStableQuestionId(projectId, question)
                : `q_txt_${crypto.createHash('sha256').update(question.toLowerCase().trim()).digest('hex').substring(0, 8)}`;

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
    /**
     * Entity extraction: Decompose business formula descriptions into operational data fields.
     * Maps business language like "employees who left" to actual data columns like employee_id, termination_date.
     */
    private extractOperationalFields(
        description: string,
        componentFields: string[],
        elementName: string
    ): Array<{ fieldName: string; reason: string }> {
        const fields: Array<{ fieldName: string; reason: string }> = [];
        const descLower = (description + ' ' + elementName + ' ' + componentFields.join(' ')).toLowerCase();

        // Employee-related entities
        if (descLower.includes('employee') || descLower.includes('staff') || descLower.includes('worker') || descLower.includes('headcount')) {
            fields.push({ fieldName: 'employee_id', reason: 'Unique identifier for each employee' });
        }
        // Leaving/termination entities
        if (descLower.includes('left') || descLower.includes('termin') || descLower.includes('resign') || descLower.includes('turnover') || descLower.includes('attrition') || descLower.includes('separation')) {
            fields.push({ fieldName: 'termination_date', reason: 'Date employee left the organization' });
            fields.push({ fieldName: 'employment_status', reason: 'Current status (active/terminated/resigned)' });
        }
        // Period/time entities
        if (descLower.includes('period') || descLower.includes('during') || descLower.includes('over time') || descLower.includes('quarterly') || descLower.includes('monthly')) {
            fields.push({ fieldName: 'date', reason: 'Date field to define the analysis period' });
        }
        // Hiring entities
        if (descLower.includes('hire') || descLower.includes('join') || descLower.includes('onboard') || descLower.includes('new employee')) {
            fields.push({ fieldName: 'hire_date', reason: 'Date employee joined the organization' });
        }
        // Revenue/financial entities
        if (descLower.includes('revenue') || descLower.includes('sales') || descLower.includes('income') || descLower.includes('profit')) {
            fields.push({ fieldName: 'amount', reason: 'Monetary value (revenue/sales amount)' });
            fields.push({ fieldName: 'transaction_date', reason: 'Date of the transaction' });
        }
        // Cost/expense entities
        if (descLower.includes('cost') || descLower.includes('expense') || descLower.includes('spend') || descLower.includes('budget')) {
            fields.push({ fieldName: 'cost_amount', reason: 'Cost or expense value' });
        }
        // Customer entities
        if (descLower.includes('customer') || descLower.includes('client') || descLower.includes('subscriber') || descLower.includes('user')) {
            fields.push({ fieldName: 'customer_id', reason: 'Unique identifier for each customer' });
        }
        // Engagement/satisfaction entities
        if (descLower.includes('engagement') || descLower.includes('satisfaction') || descLower.includes('score') || descLower.includes('rating') || descLower.includes('nps')) {
            fields.push({ fieldName: 'score', reason: 'Measurement or rating value' });
            fields.push({ fieldName: 'survey_date', reason: 'Date of measurement or survey' });
        }
        // Department/team entities
        if (descLower.includes('department') || descLower.includes('team') || descLower.includes('division') || descLower.includes('unit')) {
            fields.push({ fieldName: 'department', reason: 'Department or team grouping' });
        }
        // Company/organization entities
        if (descLower.includes('company') || descLower.includes('organization') || descLower.includes('branch') || descLower.includes('location')) {
            fields.push({ fieldName: 'company_name', reason: 'Organization or location identifier' });
        }
        // Performance entities
        if (descLower.includes('performance') || descLower.includes('productivity') || descLower.includes('output') || descLower.includes('kpi')) {
            fields.push({ fieldName: 'performance_metric', reason: 'Performance measurement value' });
        }
        // Retention/churn entities
        if (descLower.includes('retention') || descLower.includes('churn') || descLower.includes('loyalty')) {
            fields.push({ fieldName: 'status', reason: 'Active/inactive/churned status' });
            fields.push({ fieldName: 'start_date', reason: 'Date relationship began' });
        }

        // Deduplicate by fieldName
        const seen = new Set<string>();
        return fields.filter(f => {
            if (seen.has(f.fieldName)) return false;
            seen.add(f.fieldName);
            return true;
        });
    }

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
                const confidence = candidates[0].score;
                element.sourceField = candidates[0].field;
                element.sourceDataType = columnTypes[candidates[0].field] || schema[candidates[0].field]?.type || 'unknown';

                // AUTO-CONFIRM high-confidence mappings (>= 70%) for seamless non-tech user experience
                // Lower confidence (25-70%) still needs user verification
                const AUTO_CONFIRM_THRESHOLD = 70;
                element.sourceAvailable = confidence >= AUTO_CONFIRM_THRESHOLD;

                // CRITICAL FIX: Normalize confidence to 0-1 range (UI expects 0-1, score is 0-100)
                (element as any).confidence = confidence / 100;

                // Store alternatives for user to choose from (if not auto-confirmed or for reference)
                if (candidates.length > 1) {
                    element.alternatives = candidates.slice(1, 4).map(c => ({
                        sourceField: c.field,
                        transformationLogic: '',
                        confidence: c.score / 100
                    }));
                }

                if (element.sourceAvailable) {
                    console.log(`   ✅ "${element.elementName}" → AUTO-CONFIRMED: "${element.sourceField}" (confidence: ${confidence}%)`);
                } else {
                    console.log(`   📍 "${element.elementName}" → suggested: "${element.sourceField}" (confidence: ${confidence}%, needs verification)`);
                }
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
     * Resolve industry context from data signals first, explicit param as fallback.
     * Requires 2+ matching signals for confidence — prevents single-keyword false positives
     * (e.g., "engagement" alone won't trigger "hr" industry).
     */
    private resolveIndustryFromData(
        datasetMetadata: any,
        normalizedGoals: string[],
        normalizedQuestions: string[],
        explicitIndustry?: string
    ): string {
        // Priority 1: Infer from dataset column names + goals/questions (data doesn't lie)
        const datasetColumns = datasetMetadata?.columns ||
            (datasetMetadata && typeof datasetMetadata === 'object' && !Array.isArray(datasetMetadata)
                ? Object.keys(datasetMetadata) : []);
        const columnContext = datasetColumns.join(' ').toLowerCase();
        const combinedContext = [...normalizedGoals, ...normalizedQuestions].join(' ').toLowerCase();
        const fullContext = `${columnContext} ${combinedContext}`;

        // Score-based detection — require 2+ signals for confidence
        const industryScores: Record<string, number> = {};

        const marketingSignals = (fullContext.match(/\b(campaign|impression|click.?rate|ad.?spend|ctr|cpc|cpm|marketing|seo|sem|social.?media|lead.?gen|conversion.?rate)\b/gi) || []).length;
        if (marketingSignals >= 2) industryScores['marketing'] = marketingSignals;

        // HR: require HR-specific terms — "engagement" alone is NOT enough
        const hrSignals = (fullContext.match(/\b(employee|hr\b|human.?resource|turnover|headcount|attrition|hire|onboard|payroll|fte|termination|separation)\b/gi) || []).length;
        if (hrSignals >= 2) industryScores['hr'] = hrSignals;

        const salesSignals = (fullContext.match(/\b(sales.?pipeline|deal|quota|close.?rate|sales.?rep|opportunity|account.?exec)\b/gi) || []).length;
        if (salesSignals >= 2) industryScores['sales'] = salesSignals;

        const ecomSignals = (fullContext.match(/\b(cart|checkout|product.?page|sku|order.?id|ecommerce|shopif|aov|add.?to.?cart)\b/gi) || []).length;
        if (ecomSignals >= 2) industryScores['ecommerce'] = ecomSignals;

        const finSignals = (fullContext.match(/\b(profit|loss|balance.?sheet|p&l|ledger|accounts.?payable|accounts.?receivable|budget)\b/gi) || []).length;
        if (finSignals >= 2) industryScores['finance'] = finSignals;

        const eduSignals = (fullContext.match(/\b(student|grade|gpa|course|enrollment|semester|academic|faculty)\b/gi) || []).length;
        if (eduSignals >= 2) industryScores['education'] = eduSignals;

        const healthSignals = (fullContext.match(/\b(patient|diagnosis|clinical|treatment|hospital|icd|cpt|ehr|readmission)\b/gi) || []).length;
        if (healthSignals >= 2) industryScores['healthcare'] = healthSignals;

        // Pick highest-scoring industry from data signals
        const topIndustry = Object.entries(industryScores).sort((a, b) => b[1] - a[1])[0];
        if (topIndustry && topIndustry[1] >= 2) {
            console.log(`   Industry context from data signals: ${topIndustry[0]} (${topIndustry[1]} signals)`);
            return topIndustry[0];
        }

        // Priority 2: Fallback to explicit industry ONLY if no data signals detected
        if (explicitIndustry && explicitIndustry !== 'general' && explicitIndustry !== 'other') {
            console.log(`   Industry context from explicit param (no data signals): ${explicitIndustry.toLowerCase()}`);
            return explicitIndustry.toLowerCase();
        }

        console.log(`   Industry context: general (insufficient signals)`);
        return 'general';
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
