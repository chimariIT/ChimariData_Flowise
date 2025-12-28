import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, ArrowRight, ArrowLeft, CheckCircle, AlertCircle, Info, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import AgentCheckpoints from '@/components/agent-checkpoints';
import { useJourneyDataOptional } from '@/contexts/JourneyDataContext';
import { useProject } from '@/hooks/useProject';
import { JourneyProgress } from '@shared/schema';
import { useQueryClient } from '@tanstack/react-query';

interface DataTransformationStepProps {
    journeyType: string;
    onNext?: () => void;
    onPrevious?: () => void;
}

interface TransformationMapping {
    targetElement: string;
    targetType: string;
    sourceColumn: string | null;
    confidence: number;
    transformationRequired: boolean;
    suggestedTransformation: string;
    userDefinedLogic: string;
    relatedQuestions?: string[]; // Phase 2: Questions this transformation helps answer
    elementId?: string; // Phase 2: Link to required data element
}

interface JoinConfig {
    enabled: boolean;
    type: 'left' | 'inner' | 'outer' | 'right';
    foreignKeys: Array<{
        sourceDataset: string;
        sourceColumn: string;
        targetDataset: string;
        targetColumn: string;
    }>;
}

export default function DataTransformationStep({
    journeyType,
    onNext,
    onPrevious
}: DataTransformationStepProps) {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();

    // Use shared journey context for data continuity between steps
    const journeyContext = useJourneyDataOptional();

    // Centralized project data and state (DEC-003)
    const [pid, setPid] = useState<string | null>(() => localStorage.getItem('currentProjectId'));
    const { project, journeyProgress, updateProgress, isLoading: projectLoading, isUpdating } = useProject(pid || undefined);

    const [requiredDataElements, setRequiredDataElements] = useState<any>(null);
    const [currentSchema, setCurrentSchema] = useState<any>(null);
    const [allDatasets, setAllDatasets] = useState<any[]>([]);
    const [transformationMappings, setTransformationMappings] = useState<TransformationMapping[]>([]);
    const [transformationLogic, setTransformationLogic] = useState<Record<string, string>>({});
    const [isExecuting, setIsExecuting] = useState(false);
    const [transformedPreview, setTransformedPreview] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [joinConfig, setJoinConfig] = useState<JoinConfig>({
        enabled: false,
        type: 'left',
        foreignKeys: []
    });
    const [userQuestions, setUserQuestions] = useState<string[]>([]); // Actual user questions from project

    // Synchronize local state with journeyProgress (SSOT)
    useEffect(() => {
        if (journeyProgress) {
            // Priority 1: Use journeyProgress userQuestions (DEC-001)
            if (journeyProgress.userQuestions?.length > 0) {
                setUserQuestions(journeyProgress.userQuestions.map(q => q.text));
            }

            // Priority 2: Use journeyProgress requirementsDocument for mappings
            if (journeyProgress.requirementsDocument) {
                setRequiredDataElements(journeyProgress.requirementsDocument);
            }

            // Priority 3: Join Config from SSOT
            if (journeyProgress.joinedData?.joinConfig) {
                setJoinConfig({
                    enabled: true,
                    type: journeyProgress.joinedData.joinConfig.joinType as any,
                    foreignKeys: journeyProgress.joinedData.joinConfig.foreignKeyMappings.map(m => ({
                        sourceDataset: m.leftDatasetId,
                        sourceColumn: m.leftColumn,
                        targetDataset: m.rightDatasetId,
                        targetColumn: m.rightColumn
                    }))
                });
            }
        }
    }, [journeyProgress]);

    // Initialize from context if available (avoids redundant API calls)
    useEffect(() => {
        if (journeyContext) {
            console.log('[DataTransformation] Using shared context data');
            // Use context data if available, avoiding redundant API calls
            if (journeyContext.userQuestions.length > 0 && !journeyProgress?.userQuestions?.length) {
                setUserQuestions(journeyContext.userQuestions.map(q => q.text));
            }
            if ((journeyContext.analysisPath.length > 0 || journeyContext.requiredDataElements.length > 0) && !journeyProgress?.requirementsDocument) {
                setRequiredDataElements({
                    analysisPath: journeyContext.analysisPath,
                    requiredDataElements: journeyContext.requiredDataElements,
                    questionAnswerMapping: journeyContext.questionAnswerMapping,
                    completeness: journeyContext.completeness,
                    gaps: journeyContext.gaps,
                    userQuestions: journeyContext.userQuestions.map(q => q.text),
                });
            }
            if (journeyContext.datasets.length > 0) {
                setAllDatasets(journeyContext.datasets.map(ds => ({ dataset: ds })));
                setCurrentSchema(journeyContext.mergedSchema);
            }
            if (journeyContext.joinConfig && !journeyProgress?.joinedData?.joinConfig) {
                setJoinConfig(journeyContext.joinConfig);
            }
        }
    }, [journeyContext, journeyProgress]);

    useEffect(() => {
        if (pid) {
            loadTransformationInputs(pid);
        } else {
            const storedId = localStorage.getItem('currentProjectId');
            if (!storedId) {
                toast({
                    title: "No Project Found",
                    description: "Please start from data upload",
                    variant: "destructive"
                });
                setLocation(`/journeys/${journeyType}/data`);
                return;
            }
            setPid(storedId);
        }
    }, [pid, journeyType, setLocation, toast]);

    const loadTransformationInputs = async (pid: string) => {
        try {
            setIsLoading(true);

            // 🔒 SSOT: Prioritize journeyProgress for questions
            if (journeyProgress?.userQuestions && journeyProgress.userQuestions.length > 0) {
                const qTexts = journeyProgress.userQuestions.map(q => q.text).filter(Boolean);
                setUserQuestions(qTexts);
                console.log(`📋 [Transformation] Loaded ${qTexts.length} user questions from journeyProgress`);
            } else {
                // Secondary: Try database endpoint if progress not yet synced
                try {
                    const questionsResponse = await apiClient.get(`/api/projects/${pid}/questions`);
                    const actualQuestions = questionsResponse.questions?.map((q: any) =>
                        typeof q === 'string' ? q : q.text || q.questionText || q.question || ''
                    ).filter((q: string) => q) || [];
                    setUserQuestions(actualQuestions);
                } catch (qErr: any) {
                    console.warn('Could not load user questions from DB:', qErr);
                }
            }

            // Load all datasets for the project
            // 🔒 SSOT: Prioritize persisted joined data for schema/preview to ensure continuity
            const persistedJoinedData = journeyProgress?.joinedData;

            // Still fetch datasets list for UI and join config logic
            const datasetsResponse = await apiClient.getProjectDatasets(pid);
            const datasetList = datasetsResponse.datasets || [];
            setAllDatasets(datasetList);

            if (datasetList.length > 0) {
                const primaryDataset = datasetList[0].dataset || datasetList[0];

                let mergedSchema: Record<string, any> = {};

                if (persistedJoinedData?.schema && Object.keys(persistedJoinedData.schema).length > 0) {
                    // [SSOT FIX] Use persisted joined schema from journeyProgress
                    mergedSchema = persistedJoinedData.schema;
                    console.log(`📊 [Transformation] Using SSOT persisted joined schema: ${Object.keys(mergedSchema).length} columns`);
                } else if (datasetsResponse.joinedSchema && Object.keys(datasetsResponse.joinedSchema).length > 0) {
                    // Use persisted joined schema from backend API
                    mergedSchema = datasetsResponse.joinedSchema;
                    console.log(`📊 [Transformation] Using PERSISTED joined schema from API: ${Object.keys(mergedSchema).length} columns`);
                } else {
                    // Fallback: Merge schemas from ALL datasets manually
                    datasetList.forEach((dsEntry: any, idx: number) => {
                        const ds = dsEntry.dataset || dsEntry;
                        const dsName = ds.fileName || ds.name || `dataset_${idx}`;
                        const schema = ds.schema || {};

                        for (const [col, colType] of Object.entries(schema)) {
                            // For first dataset, add columns as-is
                            // For additional datasets, prefix with dataset name if column exists
                            if (idx === 0) {
                                mergedSchema[col] = colType;
                            } else {
                                const finalColName = col in mergedSchema ? `${dsName}_${col}` : col;
                                mergedSchema[finalColName] = colType;
                            }
                        }
                    });
                    console.log(`📊 [Transformation] Merged schema from ${datasetList.length} dataset(s): ${Object.keys(mergedSchema).length} columns`);
                }
                setCurrentSchema(mergedSchema);

                // ISSUE #16 FIX: Check if there are existing saved mappings from previous transformations
                const existingMetadata = primaryDataset.ingestionMetadata?.transformationMetadata;
                if (existingMetadata?.mappings && Array.isArray(existingMetadata.mappings)) {
                    console.log('📂 Loading existing transformation mappings:', existingMetadata.mappings.length);
                    setTransformationMappings(existingMetadata.mappings);
                }

                // FIX: Check for transformed/joined data even without explicit mappings
                // This handles the case where join was executed but no additional transformations were saved
                const transformedData = primaryDataset.ingestionMetadata?.transformedData;
                const joinedPreview = datasetsResponse.joinedPreview;

                // CRITICAL FIX: Check journeyProgress.joinedData FIRST (SSOT)
                // This prevents "Action Required" message when datasets are already joined in Data Upload step
                if (persistedJoinedData?.preview && persistedJoinedData.preview.length > 0) {
                    console.log('📊 [DataTransformation] Found SSOT persisted joined data, datasets are ALREADY JOINED');
                    setTransformedPreview({
                        originalCount: 0,
                        transformedCount: (persistedJoinedData as any).totalRowCount || persistedJoinedData.rowCount || persistedJoinedData.preview.length,
                        columns: Object.keys(mergedSchema),
                        sampleData: persistedJoinedData.preview.slice(0, 10)
                    });
                    // Clear join config since join is already done
                    setJoinConfig({ enabled: false, type: 'left', foreignKeys: [] });
                } else if (transformedData && transformedData.length > 0) {
                    console.log('📊 [DataTransformation] Found existing transformed data, setting preview');
                    setTransformedPreview({
                        originalCount: existingMetadata?.originalRowCount || 0,
                        transformedCount: existingMetadata?.transformedRowCount || transformedData.length,
                        columns: Object.keys(existingMetadata?.transformedSchema || primaryDataset.ingestionMetadata?.transformedSchema || mergedSchema),
                        sampleData: transformedData.slice(0, 10)
                    });
                } else if (joinedPreview && joinedPreview.length > 0) {
                    // Fallback: If joinedPreview exists from API but not yet stored as transformedData
                    console.log('📊 [DataTransformation] Using joined preview from API as existing transformation');
                    setTransformedPreview({
                        originalCount: 0,
                        transformedCount: joinedPreview.length,
                        columns: Object.keys(mergedSchema),
                        sampleData: joinedPreview.slice(0, 10)
                    });
                }

                // If multiple datasets, use DataEngineer agent relationships OR auto-detect join columns
                // CRITICAL: Only set join config if datasets are NOT already joined (from Data Upload step)
                const datasetsAlreadyJoined = persistedJoinedData?.preview && persistedJoinedData.preview.length > 0;

                if (datasetList.length > 1 && !datasetsAlreadyJoined) {
                    // [DATA CONTINUITY FIX] Use autoDetectedJoinConfig from datasets response (avoids extra API call)
                    const autoJoinConfig = datasetsResponse.autoDetectedJoinConfig;

                    if (autoJoinConfig?.enabled && autoJoinConfig.foreignKeys?.length > 0) {
                        console.log(`🔗 [Auto-Join] Using backend auto-detected join config (${autoJoinConfig.foreignKeys.length} joins)`);
                        setJoinConfig({
                            enabled: true,
                            type: autoJoinConfig.type || 'left',
                            foreignKeys: autoJoinConfig.foreignKeys
                        });
                    } else {
                        // Fall back to extracting from dataset relationships
                        const agentRelationships = extractAgentRelationships(datasetList);

                        if (agentRelationships.foreignKeys.length > 0) {
                            console.log(`🤖 [Auto-Join] Using DataEngineer agent-recommended joins (${agentRelationships.foreignKeys.length} found)`);
                            setJoinConfig({
                                enabled: true,
                                type: 'left',
                                foreignKeys: agentRelationships.foreignKeys
                            });
                        } else {
                            // Fall back to local auto-detection
                            const detectedJoin = autoDetectJoinKeys(datasetList);
                            if (detectedJoin.foreignKeys.length > 0) {
                                console.log(`🔍 [Auto-Join] Using local auto-detected joins (${detectedJoin.foreignKeys.length} found)`);
                                setJoinConfig({
                                    enabled: true,
                                    type: 'left',
                                    foreignKeys: detectedJoin.foreignKeys
                                });
                            }
                        }
                    }
                } else if (datasetsAlreadyJoined) {
                    console.log(`✅ [Transformation] Datasets ALREADY JOINED in Data Upload step - skipping join config setup`);
                }
            }

            // FIX: Load required data elements from journeyProgress.requirementsDocument (SSOT)
            // This ensures consistency with Preparation and Verification steps
            // Declare mergedSchema at function scope for accessibility
            let mergedSchemaForMappings: Record<string, any> = currentSchema;
            if (datasetList.length > 0) {
                const persistedJoinedDataForSchema = journeyProgress?.joinedData;
                if (persistedJoinedDataForSchema?.schema && Object.keys(persistedJoinedDataForSchema.schema).length > 0) {
                    mergedSchemaForMappings = persistedJoinedDataForSchema.schema;
                } else if (datasetsResponse.joinedSchema && Object.keys(datasetsResponse.joinedSchema).length > 0) {
                    mergedSchemaForMappings = datasetsResponse.joinedSchema;
                } else if (currentSchema && Object.keys(currentSchema).length > 0) {
                    mergedSchemaForMappings = currentSchema;
                }
            }

            if (journeyProgress?.requirementsDocument) {
                console.log('📋 [Transformation] Using requirementsDocument from journeyProgress (SSOT)');
                setRequiredDataElements(journeyProgress.requirementsDocument);

                // [DATA CONTINUITY FIX] Check if Step 3 (Verification) already created mappings
                // Mappings are stored in requiredDataElements[].sourceColumn by data-verification-step
                const reqDoc = journeyProgress.requirementsDocument;
                const elementsWithMappings = reqDoc?.requiredDataElements?.filter(
                    (el: any) => el.sourceColumn && el.sourceColumn !== ''
                ) || [];
                const hasMappingsFromVerification = elementsWithMappings.length > 0;

                if (hasMappingsFromVerification) {
                    // [STEP 3→4 FIX] Use mappings from Verification step instead of regenerating
                    console.log(`✅ [Transformation] Using ${elementsWithMappings.length} verified mappings from Step 3 (Verification)`);
                    const existingMappings: TransformationMapping[] = reqDoc.requiredDataElements.map((el: any) => ({
                        targetElement: el.name || el.elementName || '',
                        targetType: el.type || el.dataType || 'string',
                        sourceColumn: el.sourceColumn || null,
                        confidence: el.confidence ?? (el.sourceColumn ? 0.9 : 0),
                        transformationRequired: el.transformationRequired ?? !!el.suggestedTransformation,
                        suggestedTransformation: el.suggestedTransformation || el.transformation || '',
                        userDefinedLogic: el.userDefinedLogic || '',
                        relatedQuestions: el.relatedQuestions || [],
                        elementId: el.id || el.elementId
                    }));
                    setTransformationMappings(existingMappings);
                } else {
                    // No mappings from Verification - generate new ones
                    const schemaForMappings = mergedSchemaForMappings || currentSchema;
                    if (schemaForMappings && Object.keys(schemaForMappings).length > 0) {
                        const primaryDataset = datasetList[0]?.dataset || datasetList[0];
                        const existingMetadata = primaryDataset?.ingestionMetadata?.transformationMetadata;
                        if (!existingMetadata?.mappings || existingMetadata.mappings.length === 0) {
                            console.log('📋 [Transformation] No verified mappings found, generating from requirementsDocument');
                            await generateMappings(journeyProgress.requirementsDocument, schemaForMappings);
                        }
                    }
                }
            } else {
                // Fallback: Load from API if not in journeyProgress
                try {
                    const reqElements = await apiClient.get(`/api/projects/${pid}/required-data-elements`);

                    // [PHASE 3 FIX] Handle graceful "no dataset" response from backend
                    if (reqElements.success === false && reqElements.error === 'no_dataset') {
                        console.log('📋 [Transformation] No dataset yet, using default elements');
                        setRequiredDataElements(reqElements.defaultElements || null);
                        toast({
                            title: "Data Required",
                            description: "Please upload your data in the Data Upload step before configuring transformations.",
                            variant: "default"
                        });
                    } else {
                        setRequiredDataElements(reqElements.document);

                        // Only generate new mappings if none were loaded from saved state
                        if (datasetList.length > 0) {
                            const primaryDataset = datasetList[0].dataset || datasetList[0];
                            const existingMetadata = primaryDataset.ingestionMetadata?.transformationMetadata;
                            if (!existingMetadata?.mappings || existingMetadata.mappings.length === 0) {
                                // FIX: Use joined schema from journeyProgress or merged schema
                                const schemaForMappings = mergedSchemaForMappings || currentSchema;
                                if (schemaForMappings && Object.keys(schemaForMappings).length > 0) {
                                    await generateMappings(reqElements.document, schemaForMappings);
                                }
                            }
                        }
                    }
                } catch (reqError: any) {
                    console.warn('Required data elements not available:', reqError);
                    // [PHASE 3 FIX] Use non-destructive toast for requirements loading issues
                    toast({
                        title: "Requirements Loading",
                        description: reqError?.message || "Could not load data requirements. You may proceed, but some features may be limited.",
                        variant: "default"
                    });
                }
            }
        } catch (error: any) {
            console.error('Failed to load transformation inputs:', error);
            toast({
                title: "Error",
                description: error.message || "Failed to load transformation requirements",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-detect potential join keys between datasets - ENHANCED to find highest merge potential
    const autoDetectJoinKeys = (datasetList: any[]) => {
        const foreignKeys: JoinConfig['foreignKeys'] = [];

        console.log(`🔗 [Auto-Join Frontend] Starting ENHANCED auto-detection for ${datasetList.length} datasets`);

        if (datasetList.length < 2) {
            console.log(`🔗 [Auto-Join Frontend] Skipping - only ${datasetList.length} dataset(s)`);
            return { foreignKeys };
        }

        const primaryDataset = datasetList[0].dataset || datasetList[0];
        const primarySchema = primaryDataset.schema || {};
        const primaryCols = Object.keys(primarySchema);
        const primaryName = primaryDataset.fileName || primaryDataset.name || 'Primary';
        const primaryData = primaryDataset.data || primaryDataset.preview || primaryDataset.sampleData || [];

        console.log(`🔗 [Auto-Join Frontend] Primary dataset: ${primaryName} (${primaryData.length} rows)`);
        console.log(`🔗 [Auto-Join Frontend] Primary columns (${primaryCols.length}):`, primaryCols);

        // Extended join key patterns - prioritized list with scores
        const joinKeyPatterns = [
            { pattern: /^employee_?id$/i, score: 100 },
            { pattern: /^emp_?id$/i, score: 95 },
            { pattern: /^user_?id$/i, score: 90 },
            { pattern: /^customer_?id$/i, score: 90 },
            { pattern: /^department_?id$/i, score: 85 },
            { pattern: /^dept_?id$/i, score: 85 },
            { pattern: /^department$/i, score: 80 },
            { pattern: /^dept$/i, score: 80 },
            { pattern: /^id$/i, score: 75 },
            { pattern: /_id$/i, score: 70 },
            { pattern: /^.*_key$/i, score: 65 },
            { pattern: /^.*_code$/i, score: 60 },
            { pattern: /^name$/i, score: 50 },
            { pattern: /^employee_?name$/i, score: 55 },
            { pattern: /^full_?name$/i, score: 55 }
        ];

        for (let i = 1; i < datasetList.length; i++) {
            const secondaryDataset = datasetList[i].dataset || datasetList[i];
            const secondarySchema = secondaryDataset.schema || {};
            const secondaryCols = Object.keys(secondarySchema);
            const secondaryName = secondaryDataset.fileName || secondaryDataset.name || `Secondary_${i}`;
            const secondaryData = secondaryDataset.data || secondaryDataset.preview || secondaryDataset.sampleData || [];

            console.log(`🔗 [Auto-Join Frontend] Secondary dataset: ${secondaryName} (${secondaryData.length} rows)`);
            console.log(`🔗 [Auto-Join Frontend] Secondary columns (${secondaryCols.length}):`, secondaryCols);

            // ENHANCED: Find ALL possible matches and score them by merge potential
            interface MatchCandidate {
                sourceColumn: string;
                targetColumn: string;
                matchType: 'direct' | 'pattern' | 'partial';
                patternScore: number;
                mergePotential: number; // How many rows would actually match
            }
            const matchCandidates: MatchCandidate[] = [];

            // Find all matching column pairs
            for (const pCol of primaryCols) {
                const pColLower = pCol.toLowerCase();

                for (const sCol of secondaryCols) {
                    const sColLower = sCol.toLowerCase();

                    // Check for direct match (case-insensitive) - highest priority
                    const directMatch = pColLower === sColLower;

                    // Check for pattern match with score
                    let patternScore = 0;
                    for (const { pattern, score } of joinKeyPatterns) {
                        if (pattern.test(pCol) && pattern.test(sCol)) {
                            patternScore = Math.max(patternScore, score);
                        }
                    }

                    // Check for partial match (column names share common suffix like '_id')
                    const partialMatch = (pColLower.endsWith('_id') && sColLower.endsWith('_id')) ||
                        (pColLower.endsWith('_key') && sColLower.endsWith('_key')) ||
                        (pColLower.endsWith('_code') && sColLower.endsWith('_code'));

                    if (directMatch || patternScore > 0 || partialMatch) {
                        // Calculate merge potential: how many rows would match
                        const primaryValues = new Set<string>(
                            primaryData.slice(0, 500).map((row: any) =>
                                String(row[pCol] ?? '').toLowerCase().trim()
                            ).filter((v: string) => v !== '')
                        );
                        const secondaryValues = new Set<string>(
                            secondaryData.slice(0, 500).map((row: any) =>
                                String(row[sCol] ?? '').toLowerCase().trim()
                            ).filter((v: string) => v !== '')
                        );

                        // Count intersection
                        let matchCount = 0;
                        primaryValues.forEach((v) => {
                            if (secondaryValues.has(v)) matchCount++;
                        });

                        const mergePotential = Math.min(primaryValues.size, secondaryValues.size) > 0
                            ? (matchCount / Math.min(primaryValues.size, secondaryValues.size)) * 100
                            : 0;

                        matchCandidates.push({
                            sourceColumn: pCol,
                            targetColumn: sCol,
                            matchType: directMatch ? 'direct' : patternScore > 0 ? 'pattern' : 'partial',
                            patternScore: directMatch ? 110 : patternScore || (partialMatch ? 40 : 0),
                            mergePotential
                        });

                        console.log(`   Candidate: ${pCol} ↔ ${sCol} | Type: ${directMatch ? 'direct' : patternScore > 0 ? 'pattern' : 'partial'} | Pattern Score: ${directMatch ? 110 : patternScore} | Merge Potential: ${mergePotential.toFixed(1)}%`);
                    }
                }
            }

            // Select the BEST match based on combined score (pattern score + merge potential)
            if (matchCandidates.length > 0) {
                // Sort by: (1) merge potential (weight 60%), (2) pattern score (weight 40%)
                matchCandidates.sort((a, b) => {
                    const scoreA = (a.mergePotential * 0.6) + (a.patternScore * 0.4);
                    const scoreB = (b.mergePotential * 0.6) + (b.patternScore * 0.4);
                    return scoreB - scoreA;
                });

                const bestMatch = matchCandidates[0];
                console.log(`✅ [Auto-Join Frontend] BEST join key: ${primaryName}.${bestMatch.sourceColumn} ↔ ${secondaryName}.${bestMatch.targetColumn}`);
                console.log(`   Match type: ${bestMatch.matchType} | Pattern Score: ${bestMatch.patternScore} | Merge Potential: ${bestMatch.mergePotential.toFixed(1)}%`);
                console.log(`   Considered ${matchCandidates.length} candidates, selected highest combined score`);

                foreignKeys.push({
                    sourceDataset: primaryDataset.id,
                    sourceColumn: bestMatch.sourceColumn,
                    targetDataset: secondaryDataset.id,
                    targetColumn: bestMatch.targetColumn
                });
            } else {
                console.log(`⚠️ [Auto-Join Frontend] No matching join key found between ${primaryName} and ${secondaryName}`);
            }
        }

        console.log(`🔗 [Auto-Join Frontend] ENHANCED auto-detection complete: ${foreignKeys.length} join(s) found`);
        return { foreignKeys };
    };

    // Extract relationships detected by DataEngineer agent from ingestion metadata
    const extractAgentRelationships = (datasetList: any[]) => {
        const foreignKeys: JoinConfig['foreignKeys'] = [];

        if (datasetList.length < 2) return { foreignKeys };

        // Check each dataset for agent-detected relationships
        for (let i = 0; i < datasetList.length; i++) {
            const dsEntry = datasetList[i];
            const ds = dsEntry.dataset || dsEntry;
            const ingestionMetadata = ds.ingestionMetadata || {};
            const relationships = ingestionMetadata.relationships || (ds as any).relationships || [];

            // DataEngineer agent stores cross-file relationships in format:
            // { file1, file2, joinKey, confidence }
            for (const rel of relationships) {
                if (rel.file1 && rel.file2 && rel.joinKey && rel.confidence >= 0.7) {
                    // Find the dataset IDs for these files
                    const sourceDs = datasetList.find((d: any) => {
                        const dName = (d.dataset || d).fileName || (d.dataset || d).name || '';
                        return dName === rel.file1 || dName.includes(rel.file1);
                    });
                    const targetDs = datasetList.find((d: any) => {
                        const dName = (d.dataset || d).fileName || (d.dataset || d).name || '';
                        return dName === rel.file2 || dName.includes(rel.file2);
                    });

                    if (sourceDs && targetDs) {
                        foreignKeys.push({
                            sourceDataset: (sourceDs.dataset || sourceDs).id,
                            sourceColumn: rel.joinKey,
                            targetDataset: (targetDs.dataset || targetDs).id,
                            targetColumn: rel.joinKey
                        });
                    }
                }
            }

            // Also check processedData.relationships from intelligent analysis
            const processedData = ingestionMetadata.processedData || {};
            const agentRelationships = processedData.relationships || [];
            for (const rel of agentRelationships) {
                if (rel.file1 && rel.file2 && rel.joinKey) {
                    const sourceDs = datasetList.find((d: any) => {
                        const dName = (d.dataset || d).fileName || (d.dataset || d).name || '';
                        return dName === rel.file1 || dName.includes(rel.file1);
                    });
                    const targetDs = datasetList.find((d: any) => {
                        const dName = (d.dataset || d).fileName || (d.dataset || d).name || '';
                        return dName === rel.file2 || dName.includes(rel.file2);
                    });

                    if (sourceDs && targetDs && !foreignKeys.some(fk =>
                        fk.sourceColumn === rel.joinKey && fk.targetColumn === rel.joinKey
                    )) {
                        foreignKeys.push({
                            sourceDataset: (sourceDs.dataset || sourceDs).id,
                            sourceColumn: rel.joinKey,
                            targetDataset: (targetDs.dataset || targetDs).id,
                            targetColumn: rel.joinKey
                        });
                    }
                }
            }
        }

        return { foreignKeys };
    };

    const generateMappings = async (requirements: any, schema: any) => {
        if (!requirements?.requiredDataElements) {
            return;
        }

        // FIX: Get question-to-answer mapping for better linkage
        const questionAnswerMapping = requirements.questionAnswerMapping || [];

        // FIX: Build a reverse lookup from element to questions
        const elementToQuestionsMap = new Map<string, string[]>();
        for (const qaMap of questionAnswerMapping) {
            for (const elemId of qaMap.requiredDataElements || []) {
                const existing = elementToQuestionsMap.get(elemId) || [];
                if (!existing.includes(qaMap.questionText)) {
                    existing.push(qaMap.questionText);
                }
                elementToQuestionsMap.set(elemId, existing);
            }
        }

        // Also use userQuestions from state as fallback
        const fallbackQuestions = userQuestions.length > 0 ? userQuestions : (requirements.userQuestions || []);

        // Auto-generate source-to-target mappings with question linkage (Phase 2)
        const mappings: TransformationMapping[] = requirements.requiredDataElements.map((element: any) => {
            // FIX: Use sourceColumn from verification step mappings (SSOT)
            // If element was mapped in verification step, use that mapping
            const mappedSourceColumn = element.sourceColumn || element.mappedColumn || element.source;
            const isMapped = element.mappingStatus === 'mapped' || !!mappedSourceColumn;
            
            // Calculate confidence based on:
            // 1. Whether source is available (pre-mapped from data columns in verification step)
            // 2. Whether there are related questions
            // 3. Whether the element is required
            let confidence = element.confidence || 0;
            if (isMapped) {
                confidence = Math.max(confidence, 80); // Boost confidence if already mapped
            }

            // FIX: Get questions linked to this element from multiple sources
            const elementQuestions = [
                ...(element.relatedQuestions || []),
                ...(elementToQuestionsMap.get(element.elementId) || []),
            ];
            // Remove duplicates
            const uniqueQuestions = [...new Set(elementQuestions)].filter((q: string) => q.trim());

            // If still no questions, try to match based on element purpose/name
            if (uniqueQuestions.length === 0 && fallbackQuestions.length > 0) {
                // Simple keyword matching for fallback
                const elementWords = (element.elementName || '').toLowerCase().split(/[_\s]+/);
                const purposeWords = (element.purpose || '').toLowerCase().split(/[_\s]+/);
                const allWords = [...elementWords, ...purposeWords];

                for (const q of fallbackQuestions) {
                    const qLower = q.toLowerCase();
                    if (allWords.some((w: string) => w.length > 2 && qLower.includes(w))) {
                        uniqueQuestions.push(q);
                    }
                }
            }

            if (element.sourceAvailable && element.sourceField) {
                // Source is available - high confidence
                confidence = 100;
                if (uniqueQuestions.length > 0) {
                    // Even higher confidence if linked to questions
                    confidence = 100;
                } else {
                    // Available but not directly linked to questions
                    confidence = 80;
                }
            } else if (element.sourceField) {
                // Has source mapping but needs verification
                confidence = element.confidence || 70;
            }

            return {
                targetElement: element.elementName,
                targetType: element.dataType,
                // FIX: Use sourceColumn from verification step mappings (SSOT)
                sourceColumn: mappedSourceColumn || element.datasetMapping?.sourceColumn || null,
                confidence: confidence / 100, // Normalize to 0-1 for display
                transformationRequired: element.transformationRequired || false,
                suggestedTransformation: element.transformationLogic?.description || '',
                userDefinedLogic: '',
                relatedQuestions: uniqueQuestions, // FIX: Use enhanced question linkage
                elementId: element.elementId // Phase 2: Preserve element ID for traceability
            };
        });

        setTransformationMappings(mappings);

        // Log mapping quality for debugging
        const mappingsWithQuestions = mappings.filter(m => m.relatedQuestions && m.relatedQuestions.length > 0);
        console.log(`📋 [Transformation] Generated ${mappings.length} mappings, ${mappingsWithQuestions.length} linked to questions`);

        // Initialize transformation logic with suggested transformations
        const initialLogic: Record<string, string> = {};
        mappings.forEach(m => {
            if (m.transformationRequired && m.suggestedTransformation) {
                initialLogic[m.targetElement] = m.suggestedTransformation;
            }
        });
        setTransformationLogic(initialLogic);
    };

    const updateTransformationLogic = (targetElement: string, logic: string) => {
        setTransformationLogic(prev => ({
            ...prev,
            [targetElement]: logic
        }));
    };

    const inferOperationType = (logic: string): string => {
        // Simple inference based on keywords in natural language
        const lowerLogic = logic.toLowerCase();
        if (lowerLogic.includes('convert') || lowerLogic.includes('cast')) return 'convert';
        if (lowerLogic.includes('filter') || lowerLogic.includes('where')) return 'filter';
        if (lowerLogic.includes('rename') || lowerLogic.includes('alias')) return 'rename';
        if (lowerLogic.includes('aggregate') || lowerLogic.includes('sum') || lowerLogic.includes('average')) return 'aggregate';
        if (lowerLogic.includes('clean') || lowerLogic.includes('trim')) return 'clean';
        if (lowerLogic.includes('join') || lowerLogic.includes('merge')) return 'join';
        return 'custom';
    };

    // GAP B: Validation function to check if transformations can be executed
    const canExecuteTransformations = (): { allowed: boolean; reason: string } => {
        // Check if completeness data is available
        const completeness = requiredDataElements?.completeness;
        if (!completeness) {
            return { allowed: true, reason: '' }; // Allow if no completeness data
        }

        // Check readyForExecution flag
        if (completeness.readyForExecution === false) {
            const mapped = completeness.elementsMapped || 0;
            const total = completeness.totalElements || 0;
            return {
                allowed: false,
                reason: `Missing required data mappings (${mapped}/${total} elements mapped)`
            };
        }

        // Check for high-severity gaps
        const gaps = requiredDataElements?.gaps || [];
        const highSeverityGaps = gaps.filter((g: any) => g.severity === 'high');
        if (highSeverityGaps.length > 0) {
            return {
                allowed: false,
                reason: `${highSeverityGaps.length} high-severity issue(s) must be resolved`
            };
        }

        return { allowed: true, reason: '' };
    };

    // GAP C: Get which analyses are enabled by a transformation
    const getEnabledAnalyses = (mapping: TransformationMapping): any[] => {
        if (!requiredDataElements?.analysisPath || !mapping.elementId) {
            return [];
        }

        // Find the corresponding required data element
        const dataElement = requiredDataElements.requiredDataElements?.find(
            (el: any) => el.elementId === mapping.elementId || el.elementName === mapping.targetElement
        );

        if (!dataElement?.analysisUsage) {
            return [];
        }

        // Find analyses that use this element
        const analysisUsageIds = Array.isArray(dataElement.analysisUsage)
            ? dataElement.analysisUsage
            : [];

        return requiredDataElements.analysisPath.filter((analysis: any) =>
            analysisUsageIds.includes(analysis.analysisId)
        );
    };

    const executeTransformations = async () => {
        // CRITICAL FIX: Show feedback instead of silent return
        if (!pid) {
            toast({
                title: "Project Not Found",
                description: "No project ID found. Please go back to Data Upload and ensure your project is created.",
                variant: "destructive"
            });
            return;
        }

        setIsExecuting(true);
        try {
            // Build transformation steps from mappings and logic
            const transformationSteps = transformationMappings
                .filter(m => m.transformationRequired)
                .map(m => ({
                    targetElement: m.targetElement,
                    sourceColumn: m.sourceColumn,
                    transformationLogic: transformationLogic[m.targetElement] || m.suggestedTransformation,
                    operation: inferOperationType(transformationLogic[m.targetElement] || m.suggestedTransformation)
                }));

            // Enhance mappings with user-defined transformation logic and question linkage (Phase 2)
            const enhancedMappings = transformationMappings.map(m => ({
                ...m,
                userDefinedLogic: transformationLogic[m.targetElement] || m.suggestedTransformation || '',
                relatedQuestions: m.relatedQuestions || [], // Preserve question linkage
                elementId: m.elementId // Preserve element ID
            }));

            // Include join config if multiple datasets
            const payload: any = {
                transformationSteps,
                mappings: enhancedMappings,
                questionAnswerMapping: requiredDataElements?.questionAnswerMapping || [] // Phase 2: Include question mapping
            };

            // Add join configuration if enabled and multiple datasets exist
            if (allDatasets.length > 1 && joinConfig.enabled && joinConfig.foreignKeys.length > 0) {
                payload.joinConfig = {
                    type: joinConfig.type,
                    foreignKeys: joinConfig.foreignKeys
                };
                console.log('📊 Including join config for multi-dataset transformation:', payload.joinConfig);
            }

            const result = await apiClient.post(`/api/projects/${pid}/execute-transformations`, payload);

            setTransformedPreview(result.preview);

            // CRITICAL FIX: Invalidate cache after backend updates transformed data
            // The backend may have updated journeyProgress or dataset data directly
            queryClient.invalidateQueries({ queryKey: ["project", pid] });

            // Update journeyProgress with transformation results (SSOT)
            // [DATA CONTINUITY FIX] Include transformation summary for downstream steps
            updateProgress({
                transformationMappings: enhancedMappings.map(m => ({
                    sourceElementId: m.elementId || m.targetElement,
                    targetColumn: m.targetElement,
                    transformationType: inferOperationType(m.userDefinedLogic),
                    config: { logic: m.userDefinedLogic },
                    appliedAt: new Date().toISOString()
                })),
                transformedSchema: result.preview.schema || currentSchema,
                // [NEW] Add transformation summary for Plan and Execute steps
                transformationStepData: {
                    transformedRowCount: result.rowCount || result.preview?.data?.length || 0,
                    transformedColumnCount: Object.keys(result.preview?.schema || {}).length,
                    transformationStepsApplied: transformationSteps.length,
                    schema: result.preview?.schema || currentSchema,
                    // Note: Full transformedData is stored in dataset.ingestionMetadata by backend
                    executedAt: new Date().toISOString(),
                    joinApplied: allDatasets.length > 1 && joinConfig.enabled
                },
                currentStep: 'plan' // Move to next suggested step
            });
        } catch (error: any) {
            console.error('Failed to execute transformations:', error);
            toast({
                title: "Transformation Failed",
                description: error.message || "Failed to apply transformations",
                variant: "destructive"
            });
        } finally {
            setIsExecuting(false);
        }
    };

    // GAP 1 FIX: Check if multi-dataset join is required but not executed
    const isJoinRequiredButNotExecuted = (): { required: boolean; message: string } => {
        // If we have multiple datasets with detected join keys
        if (allDatasets.length > 1 && joinConfig.enabled && joinConfig.foreignKeys.length > 0) {
            // But no transformed data (join not executed)
            if (!transformedPreview) {
                return {
                    required: true,
                    message: `You have ${allDatasets.length} datasets that need to be joined. Please click "Execute Transformations" to merge them before continuing.`
                };
            }
        }
        return { required: false, message: '' };
    };

    // GAP 1 FIX: Auto-execute join when user tries to skip but join is needed
    const autoExecuteJoinIfNeeded = async (): Promise<boolean> => {
        const joinStatus = isJoinRequiredButNotExecuted();
        if (joinStatus.required && pid) {
            console.log('🔗 [Auto-Join] Multi-dataset join required, auto-executing...');
            try {
                // Execute with just the join config (minimal transformations)
                const payload: any = {
                    transformationSteps: [],
                    mappings: transformationMappings,
                    questionAnswerMapping: requiredDataElements?.questionAnswerMapping || []
                };

                // Always include join config for multi-dataset
                payload.joinConfig = {
                    type: joinConfig.type,
                    foreignKeys: joinConfig.foreignKeys
                };

                console.log('📊 [Auto-Join] Executing join with config:', payload.joinConfig);
                const result = await apiClient.post(`/api/projects/${pid}/execute-transformations`, payload);

                setTransformedPreview(result.preview);
                toast({
                    title: "Datasets Joined",
                    description: `Successfully joined ${allDatasets.length} datasets (${result.rowCount} rows)`,
                });
                return true;
            } catch (error: any) {
                console.error('Auto-join failed:', error);
                toast({
                    title: "Join Failed",
                    description: error.message || "Failed to join datasets. Please try manually.",
                    variant: "destructive"
                });
                return false;
            }
        }
        return true; // No join needed, proceed
    };

    const handleNext = async () => {
        // Validate project exists
        if (!pid) {
            toast({
                title: "Project Not Found",
                description: "No project ID found. Please go back to Data Upload step.",
                variant: "destructive"
            });
            return;
        }

        // GAP 1 FIX: Check if join is required but not executed
        const joinStatus = isJoinRequiredButNotExecuted();
        if (joinStatus.required) {
            // Attempt auto-execute
            const success = await autoExecuteJoinIfNeeded();
            if (!success) {
                // Show error and block navigation
                toast({
                    title: "Datasets Not Joined",
                    description: joinStatus.message,
                    variant: "destructive"
                });
                return;
            }
        }

        // Mark step as complete and save transformation data
        // [DATA CONTINUITY FIX] Preserve existing transformationStepData from executeTransformations
        try {
            updateProgress({
                currentStep: 'plan',
                completedSteps: [...(journeyProgress?.completedSteps || []), 'transformation'],
                // Save transformation mappings if they exist (may have been saved during execution, but ensure they're persisted)
                transformationMappings: transformationMappings.length > 0
                    ? transformationMappings.map(m => ({
                        sourceElementId: m.elementId || m.targetElement,
                        targetColumn: m.targetElement,
                        transformationType: m.suggestedTransformation || 'custom',
                        config: { logic: m.userDefinedLogic },
                        appliedAt: new Date().toISOString()
                    }))
                    : (journeyProgress?.transformationMappings || []),
                transformedSchema: transformedPreview?.schema || currentSchema || journeyProgress?.transformedSchema,
                // Preserve transformationStepData if already set, otherwise create minimal summary
                transformationStepData: (journeyProgress as any)?.transformationStepData || {
                    transformedRowCount: transformedPreview?.data?.length || (journeyProgress as any)?.joinedData?.totalRowCount || 0,
                    transformedColumnCount: Object.keys(transformedPreview?.schema || currentSchema || {}).length,
                    transformationStepsApplied: transformationMappings.length,
                    schema: transformedPreview?.schema || currentSchema,
                    executedAt: new Date().toISOString(),
                    joinApplied: allDatasets.length > 1
                },
                stepTimestamps: {
                    ...(journeyProgress?.stepTimestamps || {}),
                    transformationCompleted: new Date().toISOString()
                }
            });

            // Navigate to next step
            if (onNext) {
                onNext();
            } else {
                setLocation(`/journeys/${journeyType}/plan`);
            }
        } catch (error: any) {
            console.error('Failed to save transformation step progress:', error);
            toast({
                title: "Error Saving Progress",
                description: error.message || "Failed to save step completion. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handlePrevious = () => {
        if (onPrevious) {
            onPrevious();
        } else {
            setLocation(`/journeys/${journeyType}/data-verification`);
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                        <span>Loading transformation requirements...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* GAP 1 FIX: Alert banner when multi-dataset join is required */}
            {isJoinRequiredButNotExecuted().required && (
                <Alert className="border-amber-400 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                        <strong>Action Required:</strong> You have {allDatasets.length} datasets uploaded.
                        These need to be joined before analysis. Click "Execute Transformations" to merge them,
                        or click "Join & Continue" to auto-join using detected keys: {' '}
                        {joinConfig.foreignKeys.map(fk => `${fk.sourceColumn}→${fk.targetColumn}`).join(', ')}
                    </AlertDescription>
                </Alert>
            )}

            {/* FIX #25: Analysis Path Overview - Always show section with loading state */}
            <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Info className="w-5 h-5 text-purple-600" />
                        Planned Analyses (DS Recommendations)
                    </CardTitle>
                    <CardDescription>
                        {requiredDataElements?.analysisPath && requiredDataElements.analysisPath.length > 0
                            ? 'These analyses will be performed on your transformed data'
                            : 'Loading analysis recommendations from Data Scientist agent...'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {requiredDataElements?.analysisPath && requiredDataElements.analysisPath.length > 0 ? (
                        <div className="space-y-3">
                            {requiredDataElements.analysisPath.map((analysis: any, index: number) => (
                                <div key={analysis.analysisId || index} className="flex items-start gap-3 p-3 bg-white rounded-lg border">
                                    <Badge variant="outline" className="mt-1 bg-purple-50 text-purple-700">
                                        {analysis.analysisType || 'Analysis'}
                                    </Badge>
                                    <div className="flex-1">
                                        <h4 className="font-medium text-sm">{analysis.analysisName}</h4>
                                        <p className="text-xs text-gray-600 mt-1">{analysis.description}</p>
                                        {analysis.techniques && analysis.techniques.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {analysis.techniques.map((technique: string, idx: number) => (
                                                    <Badge key={idx} variant="secondary" className="text-xs">
                                                        {technique}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <Badge className="bg-blue-100 text-blue-800 text-xs">
                                        ~{analysis.estimatedDuration || '5-10 min'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center p-4 text-gray-500">
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            <span className="text-sm">Generating analysis recommendations...</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* User Questions Display - Shows actual questions from prepare step */}
            {userQuestions.length > 0 && (
                <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Info className="w-5 h-5 text-blue-600" />
                            Your Business Questions ({userQuestions.length})
                        </CardTitle>
                        <CardDescription>
                            These are the questions you want answered. Data transformations will prepare your data to answer them.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {userQuestions.map((question, idx) => (
                                <div key={idx} className="flex items-start gap-2 p-2 bg-white/60 rounded-lg">
                                    <Badge variant="outline" className="text-blue-700 shrink-0">{idx + 1}</Badge>
                                    <span className="text-sm">{question}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* GAP B: Completeness Status & Gaps Display */}
            {requiredDataElements?.completeness && (
                <Card className={`border-2 ${requiredDataElements.completeness.readyForExecution
                    ? 'border-green-200 bg-gradient-to-br from-green-50 to-emerald-50'
                    : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50'
                    }`}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {requiredDataElements.completeness.readyForExecution ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                            )}
                            Data Readiness Status
                        </CardTitle>
                        <CardDescription>
                            {requiredDataElements.completeness.readyForExecution
                                ? 'All required data elements are mapped and ready for analysis'
                                : 'Some data elements require attention before analysis can proceed'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Progress Bar */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>Elements Mapped</span>
                                <span className="font-medium">
                                    {requiredDataElements.completeness.elementsMapped} / {requiredDataElements.completeness.totalElements}
                                </span>
                            </div>
                            <Progress
                                value={(requiredDataElements.completeness.elementsMapped / Math.max(requiredDataElements.completeness.totalElements, 1)) * 100}
                                className="h-2"
                            />
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>{requiredDataElements.completeness.elementsWithTransformation} need transformation</span>
                                <span>
                                    {Math.round((requiredDataElements.completeness.elementsMapped / Math.max(requiredDataElements.completeness.totalElements, 1)) * 100)}% complete
                                </span>
                            </div>
                        </div>

                        {/* Gaps Display */}
                        {requiredDataElements.gaps && requiredDataElements.gaps.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    Issues to Address ({requiredDataElements.gaps.length})
                                </h4>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {requiredDataElements.gaps.map((gap: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className={`p-2 rounded-lg border flex items-start gap-2 ${gap.severity === 'high'
                                                ? 'bg-red-50 border-red-200'
                                                : gap.severity === 'medium'
                                                    ? 'bg-amber-50 border-amber-200'
                                                    : 'bg-gray-50 border-gray-200'
                                                }`}
                                        >
                                            <Badge
                                                variant={gap.severity === 'high' ? 'destructive' : 'secondary'}
                                                className="shrink-0 text-xs"
                                            >
                                                {gap.severity || 'low'}
                                            </Badge>
                                            <div className="flex-1">
                                                <Badge variant="outline" className="text-xs mr-2">{gap.type}</Badge>
                                                <span className="text-sm">{gap.description}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <RefreshCw className="w-5 h-5" />
                        Data Transformation
                    </CardTitle>
                    <CardDescription>
                        Map source data to required elements and define transformation logic in natural language
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Info Alert */}
                    {transformationMappings.length > 0 && (
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                Review the auto-generated mappings below. For elements requiring transformation,
                                describe the transformation logic in plain English (e.g., "Convert date string to ISO format"
                                or "Calculate total by summing quantity and price").
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Source-to-Target Mapping Table */}
                    {transformationMappings.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Source-to-Target Mappings</h3>
                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50">
                                            <TableHead className="w-[200px]">Target Element</TableHead>
                                            <TableHead className="w-[150px]">Type</TableHead>
                                            <TableHead className="w-[200px]">Source Column</TableHead>
                                            <TableHead className="w-[120px]">Confidence</TableHead>
                                            <TableHead className="w-[180px]">Enables Analyses</TableHead>
                                            <TableHead className="w-[200px]">Related Questions</TableHead>
                                            <TableHead>Transformation Logic (Natural Language)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transformationMappings.map((mapping, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">{mapping.targetElement}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{mapping.targetType}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {mapping.sourceColumn ? (
                                                        <span className="text-sm">{mapping.sourceColumn}</span>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">Not Mapped</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={mapping.confidence > 0.7 ? 'default' : mapping.confidence > 0.4 ? 'secondary' : 'destructive'}>
                                                        {Math.round(mapping.confidence * 100)}%
                                                    </Badge>
                                                </TableCell>
                                                {/* GAP C: Show which analyses this transformation enables */}
                                                <TableCell>
                                                    {(() => {
                                                        const enabledAnalyses = getEnabledAnalyses(mapping);
                                                        return enabledAnalyses.length > 0 ? (
                                                            <div className="space-y-1">
                                                                {enabledAnalyses.slice(0, 2).map((analysis: any, aIdx: number) => (
                                                                    <Badge
                                                                        key={aIdx}
                                                                        variant="outline"
                                                                        className="text-xs block w-full text-left bg-purple-50 text-purple-700 border-purple-200"
                                                                        title={analysis.description}
                                                                    >
                                                                        {analysis.analysisName?.length > 25
                                                                            ? analysis.analysisName.substring(0, 25) + '...'
                                                                            : analysis.analysisName}
                                                                    </Badge>
                                                                ))}
                                                                {enabledAnalyses.length > 2 && (
                                                                    <span className="text-xs text-gray-500">+{enabledAnalyses.length - 2} more</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-400 italic">General data</span>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell>
                                                    {mapping.relatedQuestions && mapping.relatedQuestions.length > 0 ? (
                                                        <div className="space-y-1">
                                                            {mapping.relatedQuestions.slice(0, 2).map((q: string, qIdx: number) => (
                                                                <Badge key={qIdx} variant="outline" className="text-xs block w-full text-left truncate" title={q}>
                                                                    {q.length > 40 ? q.substring(0, 40) + '...' : q}
                                                                </Badge>
                                                            ))}
                                                            {mapping.relatedQuestions.length > 2 && (
                                                                <span className="text-xs text-gray-500">+{mapping.relatedQuestions.length - 2} more</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 italic">No questions linked</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {mapping.transformationRequired ? (
                                                        <Textarea
                                                            placeholder="e.g., Convert date string to ISO format, trim whitespace, calculate total..."
                                                            value={transformationLogic[mapping.targetElement] || ''}
                                                            onChange={(e) => updateTransformationLogic(mapping.targetElement, e.target.value)}
                                                            className="min-h-[60px] text-sm"
                                                        />
                                                    ) : (
                                                        <span className="text-sm text-gray-500 italic">Direct mapping (no transformation needed)</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Transformation Summary */}
                            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                                <div>
                                    <div className="text-sm text-gray-600">Total Elements</div>
                                    <div className="text-2xl font-bold">{transformationMappings.length}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-600">Require Transformation</div>
                                    <div className="text-2xl font-bold text-orange-600">
                                        {transformationMappings.filter(m => m.transformationRequired).length}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-600">Direct Mappings</div>
                                    <div className="text-2xl font-bold text-green-600">
                                        {transformationMappings.filter(m => !m.transformationRequired).length}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Transformation Preview */}
                    {transformedPreview && transformationMappings.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-lg">Transformation Preview</h3>
                                <Badge variant="default" className="bg-green-600">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    {transformedPreview.transformedCount || 0} rows transformed
                                </Badge>
                            </div>

                            <ScrollArea className="h-64 w-full border rounded-lg">
                                <div className="min-w-max">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-gray-50">
                                            <TableRow>
                                                {(transformedPreview.columns || []).map((col: string) => (
                                                    <TableHead key={col} className="whitespace-nowrap">{col}</TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(transformedPreview.sampleData || []).map((row: any, idx: number) => (
                                                <TableRow key={idx}>
                                                    {(transformedPreview.columns || []).map((col: string) => (
                                                        <TableCell key={col} className="whitespace-nowrap">
                                                            {row[col] !== undefined && row[col] !== null ? String(row[col]) : ''}
                                                        </TableCell>
                                                    ))}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </ScrollArea>

                            {transformedPreview.warnings && transformedPreview.warnings.length > 0 && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        <strong>Warnings:</strong>
                                        <ul className="list-disc list-inside mt-2">
                                            {transformedPreview.warnings.map((warning: string, idx: number) => (
                                                <li key={idx}>{warning}</li>
                                            ))}
                                        </ul>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-between pt-4 border-t">
                        <Button variant="outline" onClick={handlePrevious}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Verification
                        </Button>
                        <div className="space-x-2">
                            {transformationMappings.length > 0 && (() => {
                                const validation = canExecuteTransformations();
                                const noTransformationsNeeded = transformationMappings.filter(m => m.transformationRequired).length === 0;
                                const isDisabled = isExecuting || noTransformationsNeeded || !validation.allowed;

                                return (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span>
                                                    <Button
                                                        onClick={executeTransformations}
                                                        disabled={isDisabled}
                                                        variant="secondary"
                                                    >
                                                        {isExecuting ? (
                                                            <>
                                                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                                                Executing...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <RefreshCw className="w-4 h-4 mr-2" />
                                                                Execute Transformations
                                                            </>
                                                        )}
                                                    </Button>
                                                </span>
                                            </TooltipTrigger>
                                            {isDisabled && !isExecuting && (
                                                <TooltipContent>
                                                    <p className="max-w-xs">
                                                        {!validation.allowed
                                                            ? validation.reason
                                                            : noTransformationsNeeded
                                                                ? 'No transformations required - all data can be used directly'
                                                                : 'Unable to execute'}
                                                    </p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </TooltipProvider>
                                );
                            })()}
                            <Button
                                onClick={handleNext}
                                disabled={
                                    // Disable if transformations needed but not executed
                                    (transformationMappings.length > 0 && !transformedPreview) ||
                                    // GAP 1 FIX: Also indicate (but don't disable) when join needed
                                    // The button will auto-execute join on click
                                    false
                                }
                                variant={isJoinRequiredButNotExecuted().required ? "outline" : "default"}
                            >
                                {isJoinRequiredButNotExecuted().required
                                    ? "Join & Continue"
                                    : "Continue to Analysis Plan"}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Agent Checkpoints - shows agent activity and approvals needed */}
            {pid && (
                <div className="mt-6">
                    <AgentCheckpoints projectId={pid} />
                </div>
            )}
        </div>
    );
}
