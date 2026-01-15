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
import { chimaridataAI } from '../../chimaridata-ai';

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
            comparisonType: 'between_groups' | 'within_group' | 'time_series';
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

        // STEP 1: Spell check and grammar correction BEFORE data element extraction
        // This ensures accuracy in element name extraction and matching
        console.log('✏️ [Data Elements Tool] Step 1: Spell checking and grammar correcting goals/questions...');
        const normalizedQuestions = normalizeQuestions(input.userQuestions, true); // Enable logging
        const normalizedGoals = normalizeQuestions(input.userGoals, true); // Enable logging
        console.log(`✅ [Data Elements Tool] Normalized ${normalizedGoals.length} goals and ${normalizedQuestions.length} questions`);

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

        // ========================================================================
        // PHASE 1 FIX: Enrich elements with business definitions from registry
        // This enables agents to have formulas and calculation definitions EARLY
        // so DE agent can create accurate transformation logic without guessing
        // ========================================================================
        console.log(`📚 [Data Elements Tool] Enriching ${requiredDataElements.length} elements with business definitions...`);
        try {
            const { businessDefinitionRegistry } = await import('../business-definition-registry');

            // Try to detect industry from goals/questions for better definition matching
            const combinedContext = [...normalizedGoals, ...normalizedQuestions].join(' ').toLowerCase();
            let industryContext = 'general';
            if (/employee|hr|engagement|turnover|retention|satisfaction|survey/i.test(combinedContext)) {
                industryContext = 'hr';
            } else if (/sales|revenue|customer|conversion|churn/i.test(combinedContext)) {
                industryContext = 'sales';
            } else if (/finance|revenue|profit|cost|budget|roi/i.test(combinedContext)) {
                industryContext = 'finance';
            } else if (/student|education|grade|course|enrollment/i.test(combinedContext)) {
                industryContext = 'education';
            }
            console.log(`   Industry context detected: ${industryContext}`);

            let enrichedCount = 0;
            for (const element of requiredDataElements) {
                const lookupResult = await businessDefinitionRegistry.lookupDefinition(
                    element.elementName,
                    {
                        industry: industryContext,
                        projectId: input.projectId,
                        includeGlobal: true
                    }
                );

                if (lookupResult.found && lookupResult.definition) {
                    const def = lookupResult.definition;
                    // Attach business definition to the element for DE agent to use
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
            }
            console.log(`📚 [Data Elements Tool] Enriched ${enrichedCount}/${requiredDataElements.length} elements with business definitions`);
        } catch (enrichError) {
            console.warn(`⚠️ [Data Elements Tool] Business definition enrichment failed (non-blocking):`, enrichError);
            // Continue without enrichment - non-blocking error
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

            // PHASE 6 FIX: Ensure linking happened - fallback to numeric elements if no matches
            if (linkedElements.length === 0) {
                console.warn(`   ⚠️ [Data Elements Tool] No elements matched for "${analysis.analysisName}" - using ALL numeric elements as fallback`);
                const numericElements = requiredDataElements.filter(el =>
                    ['integer', 'float', 'number', 'numeric', 'decimal'].includes(el.dataType?.toLowerCase())
                );
                analysis.requiredDataElements = numericElements.map(el => el.elementId || el.elementName);
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
        }
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
                element.sourceColumn = mapping.sourceField;  // FIX: Set both field names for frontend compatibility
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
                    industryDomain: (document as any).industryDomain
                }
            );

            // Apply AI mappings - prefer AI over pattern matching for better accuracy
            for (const element of document.requiredDataElements) {
                const aiMapping = aiMappings.get(element.elementName);
                if (aiMapping) {
                    // If AI found a mapping, use it (may override pattern matching)
                    const aiConfidence = aiMapping.confidence;
                    const existingConfidence = (element as any).confidence || 0;

                    // Use AI mapping if it has higher confidence OR element wasn't mapped
                    if (!element.sourceAvailable || aiConfidence > existingConfidence) {
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
            console.error('⚠️ [AI Mapping] Error during AI mapping (continuing with pattern matches):', aiError);
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

        return elements;
    }

    /**
     * Find best matching field in dataset for a required element
     * ENHANCED: Uses question context, semantic matching, and calculationDefinition from DS agent
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

        const prompt = `You are a Data Analysis Expert (combining Business Analyst, Data Scientist, and Data Engineer roles) working on a data analysis project. Your task is to map required data elements to available dataset columns using INTELLIGENT SEMANTIC MATCHING and DERIVED FIELD CALCULATION.

ANALYSIS CONTEXT:
- Analysis Types: ${analysisContext.analysisTypes.join(', ')}
- Business Questions: ${analysisContext.userQuestions.slice(0, 3).join('; ')}
${analysisContext.industryDomain ? `- Industry Domain: ${analysisContext.industryDomain}` : ''}

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
            const response = await chimaridataAI.generateText({
                prompt,
                maxTokens: 2000,
                temperature: 0.3
            });

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
