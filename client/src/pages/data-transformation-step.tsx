import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RefreshCw, ArrowRight, ArrowLeft, CheckCircle, AlertCircle, Info, XCircle, ThumbsUp, ThumbsDown, Plus, X, Calculator, Loader2, BarChart3, ChevronDown, ChevronUp, Search, Sparkles, Wand2, Database } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { formatConfidence, getConfidenceBadgeVariant } from '@/lib/utils';
import AgentCheckpoints from '@/components/agent-checkpoints';
import { useJourneyDataOptional } from '@/contexts/JourneyDataContext';
import { useProject, JourneyProgress } from '@/hooks/useProject';

interface DataTransformationStepProps {
    journeyType: string;
    onNext?: () => void;
    onPrevious?: () => void;
}

// Aggregation functions for multi-column derived elements (e.g., Likert scores → Overall Score)
type AggregationFunction = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'concat' | 'first' | 'weighted_avg' | null;

interface TransformationMapping {
    targetElement: string;
    targetType: string;
    sourceColumn: string | null; // Single column (backward compatible)
    sourceColumns?: string[]; // Multi-column support for derived elements (e.g., Likert Q1-Q10 → Overall Score)
    aggregationFunction?: AggregationFunction; // How to combine multiple columns
    confidence: number;
    transformationRequired: boolean;
    suggestedTransformation: string;
    userDefinedLogic: string;
    relatedQuestions?: string[]; // Phase 2: Questions this transformation helps answer
    elementId?: string; // Phase 2: Link to required data element
    calculationDefinition?: { // From BusinessDefinitionRegistry
        formula?: string;
        componentFields?: string[];
        aggregationMethod?: string;
    };
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

// Analysis-Centric View: Groups transformations by analysis type for readiness assessment
interface AnalysisTransformationGroup {
    analysisId: string;
    analysisName: string;
    analysisType: string;
    description?: string;
    techniques: string[];
    requiredElements: string[];   // Element IDs needed for this analysis
    mappedElements: string[];     // Elements that have source column mappings
    readinessScore: number;       // 0-1, percentage of required elements mapped
    status: 'ready' | 'partial' | 'blocked';
    blockedReason?: string;
    transformations: TransformationMapping[];  // Subset of mappings relevant to this analysis
}

export default function DataTransformationStep({
    journeyType,
    onNext,
    onPrevious
}: DataTransformationStepProps) {
    const { toast } = useToast();
    const [, setLocation] = useLocation();

    // Use shared journey context for data continuity between steps
    const journeyContext = useJourneyDataOptional();

    // Centralized project data and state (DEC-003)
    const [pid, setPid] = useState<string | null>(() => localStorage.getItem('currentProjectId'));
    const { project, journeyProgress, updateProgress, updateProgressAsync, queryClient, isLoading: projectLoading, isUpdating } = useProject(pid || undefined);

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

    // Checkpoint approval state (U2A2A2U - user must approve before proceeding)
    const [transformationApproved, setTransformationApproved] = useState(false);
    const [showApprovalDialog, setShowApprovalDialog] = useState(false);
    const [checkpointId, setCheckpointId] = useState<string | null>(null);

    // P0-1 FIX: Join approval state (explicit user approval required for multi-dataset joins)
    const [showJoinApprovalDialog, setShowJoinApprovalDialog] = useState(false);
    const [joinApproved, setJoinApproved] = useState(false);
    const [isExecutingJoin, setIsExecutingJoin] = useState(false);

    // DE Agent async transformation generation polling state
    const [isGeneratingTransformations, setIsGeneratingTransformations] = useState(false);
    const [deAgentProgress, setDeAgentProgress] = useState<string | null>(null);

    // Analysis-Centric View state (Phase 2)
    const [viewMode, setViewMode] = useState<'by-element' | 'by-analysis'>('by-element');
    const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

    // Phase 5: Column search filter state for mapping UX
    const [columnSearchFilter, setColumnSearchFilter] = useState<string>('');

    // Phase 5: Helper to get sample values for a column from preview data
    const getColumnSampleValues = useMemo(() => {
        return (columnName: string): string[] => {
            // Get sample data from various sources
            const sampleData = transformedPreview?.sampleData ||
                transformedPreview?.data ||
                journeyProgress?.joinedData?.preview ||
                [];

            if (!sampleData || sampleData.length === 0) return [];

            // Extract unique non-null values for this column (max 3)
            const values = sampleData
                .slice(0, 20)
                .map((row: Record<string, any>) => row[columnName])
                .filter((v: any) => v != null && v !== '')
                .slice(0, 3);

            // Convert to strings and truncate long values
            return [...new Set(values)].map((v: any) => {
                const str = String(v);
                return str.length > 20 ? str.substring(0, 20) + '...' : str;
            }).slice(0, 3);
        };
    }, [transformedPreview, journeyProgress]);

    // Phase 5: Calculate column confidence score for a data element mapping
    const calculateColumnConfidence = useMemo(() => {
        return (columnName: string, element: TransformationMapping): number => {
            // If this column is already mapped, it's 100% confidence
            const selectedCols = element.sourceColumns || (element.sourceColumn ? [element.sourceColumn] : []);
            if (selectedCols.includes(columnName)) return 1.0;

            // Check name similarity
            const colLower = columnName.toLowerCase().replace(/[_\s-]/g, '');
            const elemLower = element.targetElement.toLowerCase().replace(/[_\s-]/g, '');

            let score = 0;

            // Exact match
            if (colLower === elemLower) score = 0.95;
            // Contains match
            else if (colLower.includes(elemLower) || elemLower.includes(colLower)) score = 0.7;
            // Partial word match
            else {
                const colWords = columnName.toLowerCase().split(/[_\s-]/);
                const elemWords = element.targetElement.toLowerCase().split(/[_\s-]/);
                const matches = colWords.filter(w => elemWords.some(e => e.includes(w) || w.includes(e)));
                score = matches.length > 0 ? 0.4 + (matches.length / Math.max(colWords.length, elemWords.length)) * 0.3 : 0;
            }

            // Type compatibility bonus
            const colMeta = currentSchema?.[columnName];
            const colType = typeof colMeta === 'string' ? colMeta : (colMeta?.type || colMeta?.dataType || '');
            const expectedType = element.targetType?.toLowerCase() || '';

            if (colType && expectedType) {
                if (colType === expectedType) score += 0.1;
                else if (
                    (colType === 'number' && expectedType === 'integer') ||
                    (colType === 'integer' && expectedType === 'number')
                ) score += 0.05;
            }

            return Math.min(1, score);
        };
    }, [currentSchema]);

    // Synchronize local state with journeyProgress (SSOT)
    useEffect(() => {
        if (journeyProgress) {
            // Priority 1: Use journeyProgress userQuestions (DEC-001)
            const questions = journeyProgress.userQuestions;
            if (questions && Array.isArray(questions) && questions.length > 0) {
                setUserQuestions(questions.map((q: { text: string }) => q.text));
            }

            // Priority 2: Use journeyProgress requirementsDocument for mappings
            if (journeyProgress.requirementsDocument) {
                setRequiredDataElements(journeyProgress.requirementsDocument);
            }

            // Priority 3: Join Config from SSOT
            if (journeyProgress.joinedData?.joinConfig) {
                const fkMappings = journeyProgress.joinedData.joinConfig.foreignKeyMappings || [];
                setJoinConfig({
                    enabled: true,
                    type: journeyProgress.joinedData.joinConfig.joinType as any,
                    foreignKeys: fkMappings.map((m: { leftDatasetId: string; leftColumn: string; rightDatasetId: string; rightColumn: string }) => ({
                        sourceDataset: m.leftDatasetId,
                        sourceColumn: m.leftColumn,
                        targetDataset: m.rightDatasetId,
                        targetColumn: m.rightColumn
                    }))
                });
            }

            // ✅ FIX: Restore transformation approval state from journeyProgress
            // This ensures approval survives navigation/refresh
            if ((journeyProgress as any).transformationApproved) {
                setTransformationApproved(true);
                console.log('✅ [Checkpoint] Transformation approval restored from journeyProgress');
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

    // ============================================================
    // DE Agent Async Polling: Check for transformation plan generated after verification
    // ============================================================
    useEffect(() => {
        // Only poll if:
        // 1. We have a project ID
        // 2. Verification is completed
        // 3. No transformation plan yet
        // 4. Not already loading mappings
        const shouldPoll = pid &&
            journeyProgress?.verificationCompleted &&
            !journeyProgress?.transformationPlan &&
            !isLoading &&
            transformationMappings.length === 0;

        if (!shouldPoll) return;

        // Start showing loading indicator
        setIsGeneratingTransformations(true);
        setDeAgentProgress('AI Agent is analyzing your data and creating transformation mappings...');
        console.log('🔄 [DE Agent Polling] Starting poll for transformation plan...');

        const pollInterval = setInterval(async () => {
            try {
                const freshProject = await apiClient.getProject(pid);
                const plan = freshProject?.journeyProgress?.transformationPlan;

                if (plan) {
                    console.log('✅ [DE Agent Polling] Transformation plan received!');
                    setIsGeneratingTransformations(false);
                    setDeAgentProgress(null);
                    clearInterval(pollInterval);

                    // Load the generated mappings
                    loadTransformationMappingsFromPlan(plan);
                }
            } catch (err) {
                console.warn('⚠️ [DE Agent Polling] Poll error:', err);
            }
        }, 3000); // Poll every 3 seconds

        // Timeout after 90 seconds - let user proceed manually
        const timeout = setTimeout(() => {
            clearInterval(pollInterval);
            setIsGeneratingTransformations(false);
            setDeAgentProgress(null);
            console.warn('⚠️ [DE Agent Polling] Timeout - user can configure manually');
            toast({
                title: "AI Analysis Complete",
                description: "You can now configure transformations manually or wait for AI suggestions.",
                variant: "default"
            });
        }, 90000);

        return () => {
            clearInterval(pollInterval);
            clearTimeout(timeout);
        };
    }, [pid, journeyProgress?.verificationCompleted, journeyProgress?.transformationPlan, isLoading, transformationMappings.length]);

    // Helper function to load transformation mappings from DE-generated plan
    const loadTransformationMappingsFromPlan = (plan: any) => {
        console.log('📋 [Transformation] Loading DE Agent transformation plan');

        if (plan.mappings && Array.isArray(plan.mappings)) {
            const convertedMappings: TransformationMapping[] = plan.mappings.map((m: any) => ({
                targetElement: m.targetElement || m.requiredElement || m.name || m.elementName || '',
                targetType: m.dataType || m.type || 'string',
                sourceColumn: m.sourceColumn || m.sourceField || null,
                sourceColumns: m.sourceColumns || m.componentFields || [],
                aggregationFunction: (m.aggregationFunction || m.aggregationMethod || null) as AggregationFunction,
                confidence: m.confidence || 0.8,
                transformationRequired: m.transformationRequired ?? true,
                suggestedTransformation: m.suggestedTransformation || m.transformLogic || m.transformation || '',
                userDefinedLogic: m.userDefinedLogic || '',
                relatedQuestions: m.relatedQuestions || [],
                elementId: m.elementId || m.id,
                calculationDefinition: m.calculationDefinition
            }));

            setTransformationMappings(convertedMappings);
            console.log(`✅ [Transformation] Loaded ${convertedMappings.length} pre-generated mappings from DE Agent`);

            toast({
                title: "Transformation Plan Ready",
                description: `AI generated ${convertedMappings.length} transformation mappings. Review and approve below.`,
            });
        }

        // Also update required data elements if included
        if (plan.readinessScore !== undefined) {
            console.log(`📊 [Transformation] DE Agent readiness score: ${(plan.readinessScore * 100).toFixed(0)}%`);
        }
    };

    // Check for existing transformation plan on initial load
    useEffect(() => {
        if (journeyProgress?.transformationPlan && transformationMappings.length === 0 && !isLoading) {
            console.log('📋 [Transformation] Found existing transformation plan in journeyProgress');
            loadTransformationMappingsFromPlan(journeyProgress.transformationPlan);
        }
    }, [journeyProgress?.transformationPlan, transformationMappings.length, isLoading]);

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
                        // FIX: Guard against "undefined" string in dataset name
                        const rawName = ds.fileName || ds.name || '';
                        const dsName = (rawName && rawName !== 'undefined' && String(rawName).trim())
                            ? String(rawName).replace(/\.[^.]+$/, '').substring(0, 50)
                            : `Dataset_${idx + 1}`;
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
                // Mappings are stored in requiredDataElements[].sourceColumn OR sourceField
                const reqDoc = journeyProgress.requirementsDocument;
                // FIX: Accept both sourceColumn AND sourceField (backend uses sourceField, frontend expects sourceColumn)
                const elementsWithMappings = reqDoc?.requiredDataElements?.filter(
                    (el: any) => (el.sourceColumn && el.sourceColumn !== '') || (el.sourceField && el.sourceField !== '')
                ) || [];
                const hasMappingsFromVerification = elementsWithMappings.length > 0;

                if (hasMappingsFromVerification && reqDoc?.requiredDataElements) {
                    // [STEP 3→4 FIX] Use mappings from Verification step instead of regenerating
                    console.log(`✅ [Transformation] Using ${elementsWithMappings.length} verified mappings from Step 3 (Verification)`);
                    const existingMappings: TransformationMapping[] = reqDoc.requiredDataElements.map((el: any) => {
                        // FIX: Accept both field names - prioritize sourceColumn but fallback to sourceField
                        const mappedColumn = el.sourceColumn || el.sourceField || null;
                        const calcDef = el.calculationDefinition;

                        // FIX Issue 4: Generate suggestion from calculationDefinition if available
                        let suggestedTransformation = el.suggestedTransformation || el.transformation || '';
                        if (!suggestedTransformation && calcDef) {
                            if (calcDef.formula?.businessDescription) {
                                suggestedTransformation = calcDef.formula.businessDescription;
                            } else if (calcDef.formula?.aggregationMethod && calcDef.formula?.componentFields?.length) {
                                suggestedTransformation = `${calcDef.formula.aggregationMethod.toUpperCase()} of ${calcDef.formula.componentFields.join(', ')}`;
                            } else if (calcDef.calculationType === 'derived' && calcDef.formula?.componentFields?.length) {
                                suggestedTransformation = `Derived from: ${calcDef.formula.componentFields.join(', ')}`;
                            }
                        }

                        return {
                            targetElement: el.name || el.elementName || '',
                            targetType: el.type || el.dataType || 'string',
                            sourceColumn: mappedColumn,
                            sourceColumns: calcDef?.formula?.componentFields || undefined,  // Multi-column support
                            aggregationFunction: calcDef?.formula?.aggregationMethod as AggregationFunction || undefined,
                            confidence: el.confidence ?? (mappedColumn ? 0.9 : 0),
                            transformationRequired: el.transformationRequired ?? !!suggestedTransformation,
                            suggestedTransformation,
                            userDefinedLogic: el.userDefinedLogic || '',
                            relatedQuestions: el.relatedQuestions || [],
                            elementId: el.id || el.elementId,
                            calculationDefinition: calcDef ? {
                                formula: calcDef.formula?.businessDescription,
                                componentFields: calcDef.formula?.componentFields,
                                aggregationMethod: calcDef.formula?.aggregationMethod
                            } : undefined
                        };
                    });
                    const mappingsWithDefs = existingMappings.filter(m => m.calculationDefinition).length;
                    console.log(`🔗 [Field Mapping] Loaded ${existingMappings.filter(m => m.sourceColumn).length} elements with source columns`);
                    console.log(`📐 [Business Definition] ${mappingsWithDefs} elements have calculation definitions`);
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

    /**
     * P2-2 FIX: Manual mapping update for unmapped or incorrectly mapped elements
     * Allows users to manually select a source column for a target element
     */
    const updateManualMapping = (targetElement: string, newSourceColumn: string | null) => {
        setTransformationMappings(prev => prev.map(mapping => {
            if (mapping.targetElement === targetElement) {
                console.log(`🔧 [P2-2] Manual mapping update: ${targetElement} → ${newSourceColumn || 'null'}`);
                return {
                    ...mapping,
                    sourceColumn: newSourceColumn,
                    // Clear multi-column if setting single column
                    sourceColumns: newSourceColumn ? [newSourceColumn] : undefined,
                    aggregationFunction: null, // Reset aggregation when changing mapping
                    confidence: newSourceColumn ? 1.0 : 0, // Manual mapping = 100% confidence
                    transformationRequired: newSourceColumn !== null
                };
            }
            return mapping;
        }));

        // Show confirmation toast
        toast({
            title: newSourceColumn ? "Mapping Updated" : "Mapping Removed",
            description: newSourceColumn
                ? `"${targetElement}" is now mapped to "${newSourceColumn}"`
                : `Mapping for "${targetElement}" has been removed`,
        });
    };

    /**
     * Multi-column mapping update for derived elements (e.g., Likert scores → Overall Score)
     * Allows users to select multiple source columns and an aggregation function
     */
    const updateMultiColumnMapping = (
        targetElement: string,
        sourceColumns: string[],
        aggregationFunction: AggregationFunction
    ) => {
        setTransformationMappings(prev => prev.map(mapping => {
            if (mapping.targetElement === targetElement) {
                console.log(`🔧 [Multi-Column] Mapping update: ${targetElement} → [${sourceColumns.join(', ')}] via ${aggregationFunction || 'none'}`);
                return {
                    ...mapping,
                    sourceColumn: sourceColumns.length === 1 ? sourceColumns[0] : sourceColumns[0], // Keep first for backward compat
                    sourceColumns: sourceColumns.length > 0 ? sourceColumns : undefined,
                    aggregationFunction: sourceColumns.length > 1 ? aggregationFunction : null,
                    confidence: sourceColumns.length > 0 ? 1.0 : 0,
                    transformationRequired: sourceColumns.length > 1 || mapping.transformationRequired,
                    suggestedTransformation: sourceColumns.length > 1
                        ? `Combine columns [${sourceColumns.join(', ')}] using ${aggregationFunction || 'average'}`
                        : mapping.suggestedTransformation
                };
            }
            return mapping;
        }));

        toast({
            title: sourceColumns.length > 0 ? "Multi-Column Mapping Set" : "Mapping Cleared",
            description: sourceColumns.length > 1
                ? `"${targetElement}" combines ${sourceColumns.length} columns using ${aggregationFunction || 'average'}`
                : sourceColumns.length === 1
                    ? `"${targetElement}" mapped to "${sourceColumns[0]}"`
                    : `Mapping for "${targetElement}" has been cleared`,
        });
    };

    /**
     * Toggle a column in multi-select mode for a target element
     */
    const toggleColumnInMapping = (targetElement: string, column: string) => {
        setTransformationMappings(prev => prev.map(mapping => {
            if (mapping.targetElement === targetElement) {
                const currentColumns = mapping.sourceColumns || (mapping.sourceColumn ? [mapping.sourceColumn] : []);
                let newColumns: string[];

                if (currentColumns.includes(column)) {
                    // Remove column
                    newColumns = currentColumns.filter(c => c !== column);
                } else {
                    // Add column
                    newColumns = [...currentColumns, column];
                }

                console.log(`🔧 [Toggle Column] ${targetElement}: ${currentColumns.join(',')} → ${newColumns.join(',')}`);

                return {
                    ...mapping,
                    sourceColumn: newColumns[0] || null,
                    sourceColumns: newColumns.length > 0 ? newColumns : undefined,
                    aggregationFunction: newColumns.length > 1 ? (mapping.aggregationFunction || 'avg') : null,
                    confidence: newColumns.length > 0 ? 1.0 : 0,
                    transformationRequired: newColumns.length > 1
                };
            }
            return mapping;
        }));
    };

    /**
     * Update aggregation function for a multi-column mapping
     */
    const updateAggregationFunction = (targetElement: string, fn: AggregationFunction) => {
        setTransformationMappings(prev => prev.map(mapping => {
            if (mapping.targetElement === targetElement) {
                return {
                    ...mapping,
                    aggregationFunction: fn,
                    suggestedTransformation: mapping.sourceColumns && mapping.sourceColumns.length > 1
                        ? `Combine columns [${mapping.sourceColumns.join(', ')}] using ${fn || 'average'}`
                        : mapping.suggestedTransformation
                };
            }
            return mapping;
        }));
    };

    // P2-2 FIX: Get available source columns from schema for manual mapping dropdown
    const getAvailableSourceColumns = (): string[] => {
        if (!currentSchema) return [];
        return Object.keys(currentSchema).sort();
    };

    const inferOperationType = (logic: string): string => {
        // Simple inference based on keywords in natural language
        if (!logic) return 'derive'; // Default to derive for transformations
        const lowerLogic = logic.toLowerCase();
        if (lowerLogic.includes('convert') || lowerLogic.includes('cast')) return 'derive';
        if (lowerLogic.includes('filter') || lowerLogic.includes('where')) return 'filter';
        if (lowerLogic.includes('rename') || lowerLogic.includes('alias')) return 'rename';
        if (lowerLogic.includes('aggregate') || lowerLogic.includes('sum') || lowerLogic.includes('average') || lowerLogic.includes('avg')) return 'derive';
        if (lowerLogic.includes('clean') || lowerLogic.includes('trim')) return 'clean';
        if (lowerLogic.includes('join') || lowerLogic.includes('merge')) return 'derive';
        if (lowerLogic.includes('row[') || lowerLogic.includes('parse') || lowerLogic.includes('float') || lowerLogic.includes('int')) return 'derive';
        return 'derive'; // Default to derive for any transformation logic
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

    // GAP C (P1-2 Enhanced): Get which analyses are enabled by a transformation
    // Uses bidirectional lookup: element.analysisUsage[] AND analysis.requiredDataElements[]
    const getEnabledAnalyses = (mapping: TransformationMapping): any[] => {
        if (!requiredDataElements?.analysisPath) {
            return [];
        }

        const analysisPath = requiredDataElements.analysisPath;
        const foundAnalyses = new Set<string>();

        // Find the corresponding required data element
        const dataElement = requiredDataElements.requiredDataElements?.find(
            (el: any) => el.elementId === mapping.elementId || el.elementName === mapping.targetElement
        );

        // Method 1: Forward lookup via element.analysisUsage[]
        if (dataElement?.analysisUsage && Array.isArray(dataElement.analysisUsage)) {
            dataElement.analysisUsage.forEach((analysisId: string) => foundAnalyses.add(analysisId));
        }

        // Method 2: Reverse lookup via analysis.requiredDataElements[] (fallback)
        // This catches cases where analysisUsage wasn't populated but analysis references the element
        if (mapping.elementId || mapping.targetElement) {
            analysisPath.forEach((analysis: any) => {
                if (Array.isArray(analysis.requiredDataElements)) {
                    const hasElement = analysis.requiredDataElements.some((refId: string) =>
                        refId === mapping.elementId ||
                        refId === mapping.targetElement ||
                        refId.toLowerCase() === mapping.targetElement?.toLowerCase()
                    );
                    if (hasElement) {
                        foundAnalyses.add(analysis.analysisId);
                    }
                }
            });
        }

        // Method 3: Heuristic matching by data type (last resort fallback)
        // If no explicit linkage, infer from data type requirements
        if (foundAnalyses.size === 0 && dataElement?.dataType) {
            const elementType = dataElement.dataType;
            analysisPath.forEach((analysis: any) => {
                // Match numeric elements to statistical analyses
                if (elementType === 'numeric' && (
                    analysis.analysisType === 'descriptive' ||
                    analysis.techniques?.some((t: string) => ['regression', 'correlation', 'statistical'].includes(t.toLowerCase()))
                )) {
                    foundAnalyses.add(analysis.analysisId);
                }
                // Match datetime elements to time-series analyses
                if (elementType === 'datetime' && (
                    analysis.techniques?.some((t: string) => ['time-series', 'trend', 'forecasting'].includes(t.toLowerCase()))
                )) {
                    foundAnalyses.add(analysis.analysisId);
                }
                // Match categorical elements to comparative/grouping analyses
                if (elementType === 'categorical' && (
                    analysis.techniques?.some((t: string) => ['segmentation', 'clustering', 'grouping', 'comparison'].includes(t.toLowerCase()))
                )) {
                    foundAnalyses.add(analysis.analysisId);
                }
            });
        }

        // Return matching analyses
        return analysisPath.filter((analysis: any) => foundAnalyses.has(analysis.analysisId));
    };

    // Compute analysis groups for analysis-centric view
    // Groups transformations by analysis type and calculates readiness per analysis
    const computeAnalysisGroups = (): AnalysisTransformationGroup[] => {
        // PHASE 6 FIX (ROOT CAUSE #2): Multiple sources for analysisPath with fallbacks
        // Priority 1: requiredDataElements state (set from various sources)
        let analysisPath = requiredDataElements?.analysisPath;
        let dataElements = requiredDataElements?.requiredDataElements;
        let sourceUsed = 'requiredDataElements state';

        // Fallback 1: Check journeyProgress.requirementsDocument directly (SSOT)
        if ((!analysisPath || analysisPath.length === 0) && journeyProgress?.requirementsDocument?.analysisPath) {
            analysisPath = journeyProgress.requirementsDocument.analysisPath;
            dataElements = journeyProgress.requirementsDocument.requiredDataElements || dataElements;
            sourceUsed = 'journeyProgress.requirementsDocument';
            console.log(`📊 [Transform] Using analysisPath from journeyProgress.requirementsDocument (${analysisPath.length} analyses)`);
        }

        // Fallback 2: Check analysisPlans metadata (PM Agent storage location)
        if ((!analysisPath || analysisPath.length === 0) && (journeyProgress as any)?.analysisPlans?.metadata?.analysisPath) {
            analysisPath = (journeyProgress as any).analysisPlans.metadata.analysisPath;
            dataElements = (journeyProgress as any).analysisPlans.metadata.requiredDataElements || dataElements;
            sourceUsed = 'journeyProgress.analysisPlans.metadata';
            console.log(`📊 [Transform] Using analysisPath from analysisPlans.metadata (${analysisPath.length} analyses)`);
        }

        if (!analysisPath || analysisPath.length === 0) {
            console.warn(`⚠️ [Transform] No analysisPath found in any source - showing empty analysis cards`);
            return [];
        }

        console.log(`📊 [Transform] computeAnalysisGroups using ${analysisPath.length} analyses from ${sourceUsed}`);

        return analysisPath.map((analysis: any) => {
            // Find required elements for this analysis
            const requiredElementIds: string[] = analysis.requiredDataElements || [];

            // Find corresponding required data elements with full details
            // PHASE 6 FIX: Use local dataElements which may come from fallback sources
            const requiredElements = (dataElements || []).filter(
                (el: any) => requiredElementIds.includes(el.elementId) ||
                             requiredElementIds.includes(el.elementName)
            );

            // Find which elements have mappings (source column assigned)
            const mappedElementIds: string[] = [];
            requiredElements.forEach((el: any) => {
                const mapping = transformationMappings.find(m =>
                    m.elementId === el.elementId ||
                    m.targetElement === el.elementName ||
                    m.targetElement === el.elementId
                );
                const hasMapping = mapping?.sourceColumn ||
                                   (mapping?.sourceColumns && mapping.sourceColumns.length > 0);
                if (hasMapping) {
                    mappedElementIds.push(el.elementId || el.elementName);
                }
            });

            // Calculate readiness score
            const totalRequired = requiredElementIds.length || requiredElements.length || 1;
            const readinessScore = mappedElementIds.length / totalRequired;

            // Find relevant transformations for this analysis
            const relevantMappings = transformationMappings.filter(m => {
                const elementId = m.elementId || m.targetElement;
                return requiredElementIds.includes(elementId) ||
                       requiredElements.some((el: any) =>
                           el.elementId === elementId || el.elementName === m.targetElement
                       );
            });

            // Determine status
            let status: 'ready' | 'partial' | 'blocked' = 'ready';
            let blockedReason: string | undefined;

            if (mappedElementIds.length === 0 && requiredElementIds.length > 0) {
                status = 'blocked';
                blockedReason = 'No required data elements mapped';
            } else if (readinessScore < 1 && readinessScore > 0) {
                status = 'partial';
                blockedReason = `${requiredElementIds.length - mappedElementIds.length} element(s) still need mapping`;
            } else if (requiredElementIds.length === 0) {
                // No specific requirements - assume ready
                status = 'ready';
            }

            return {
                analysisId: analysis.analysisId || `analysis_${analysis.analysisName}`,
                analysisName: analysis.analysisName || analysis.name || 'Unnamed Analysis',
                analysisType: analysis.analysisType || 'general',
                description: analysis.description,
                techniques: analysis.techniques || [],
                requiredElements: requiredElementIds,
                mappedElements: mappedElementIds,
                readinessScore,
                status,
                blockedReason,
                transformations: relevantMappings
            };
        });
    };

    // ✅ PHASE 7 FIX: Actually memoize analysis groups with proper dependencies
    // This ensures recomputation when data loads asynchronously
    const analysisGroups = useMemo(() => {
        return computeAnalysisGroups();
    }, [requiredDataElements, journeyProgress, transformationMappings]);

    // Get selected analysis details for expanded view
    const selectedAnalysis = selectedAnalysisId
        ? analysisGroups.find(g => g.analysisId === selectedAnalysisId)
        : null;

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
            // MULTI-COLUMN FIX: Include sourceColumns and aggregationFunction for derived elements
            const transformationSteps = transformationMappings
                .filter(m => m.transformationRequired)
                .map(m => ({
                    targetElement: m.targetElement,
                    sourceColumn: m.sourceColumn,
                    // MULTI-COLUMN: Include array of source columns and aggregation function
                    sourceColumns: m.sourceColumns || (m.sourceColumn ? [m.sourceColumn] : []),
                    aggregationFunction: m.aggregationFunction || null,
                    transformationLogic: transformationLogic[m.targetElement] || m.suggestedTransformation,
                    operation: m.sourceColumns && m.sourceColumns.length > 1
                        ? 'derive'  // Multi-column = derived value
                        : inferOperationType(transformationLogic[m.targetElement] || m.suggestedTransformation)
                }));

            // Enhance mappings with user-defined transformation logic and question linkage (Phase 2)
            // MULTI-COLUMN FIX: Include sourceColumns and aggregationFunction
            const enhancedMappings = transformationMappings.map(m => ({
                ...m,
                sourceColumns: m.sourceColumns || (m.sourceColumn ? [m.sourceColumn] : []),
                aggregationFunction: m.aggregationFunction || null,
                userDefinedLogic: transformationLogic[m.targetElement] || m.suggestedTransformation || '',
                relatedQuestions: m.relatedQuestions || [], // Preserve question linkage
                elementId: m.elementId, // Preserve element ID
                calculationDefinition: m.calculationDefinition // Preserve business definition
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

            // [DAY 6] DE Agent Validation - Validate transformations before execution
            console.log('🔍 [DE Validation] Validating transformation plan with DE agent...');
            try {
                const validationResult = await apiClient.post(`/api/projects/${pid}/validate-transformations`, payload);
                console.log('🔍 [DE Validation] Result:', validationResult);

                // Check for blocking errors
                if (!validationResult.validation?.isValid && validationResult.validation?.errors?.length > 0) {
                    const errorMessages = validationResult.validation.errors.map((e: any) => e.message || e).join('\n');
                    toast({
                        title: "Transformation Validation Failed",
                        description: `DE Agent found issues:\n${errorMessages}`,
                        variant: "destructive"
                    });
                    setIsExecuting(false);
                    return;
                }

                // Show warnings but allow continuation
                if (validationResult.validation?.warnings?.length > 0) {
                    const warningMessages = validationResult.validation.warnings.map((w: any) => w.message || w).join(', ');
                    toast({
                        title: "Validation Warnings",
                        description: `DE Agent notes: ${warningMessages}. Proceeding with execution.`,
                        variant: "default"
                    });
                }

                // Log recommendations for debugging
                if (validationResult.validation?.recommendations?.length > 0) {
                    console.log('💡 [DE Validation] Recommendations:', validationResult.validation.recommendations);
                }

                console.log('✅ [DE Validation] Transformation plan validated successfully');
            } catch (validationError: any) {
                // Non-blocking: Log validation error but allow execution to proceed
                console.warn('⚠️ [DE Validation] Validation check failed (non-blocking):', validationError.message);
            }

            const result = await apiClient.post(`/api/projects/${pid}/execute-transformations`, payload);

            // FIX Issue 6: Structure preview correctly for approval dialog
            // Dialog expects object with .data, .schema, .transformedCount - not a plain array
            const structuredPreview = {
                data: Array.isArray(result.preview) ? result.preview : result.preview?.data || [],
                schema: result.transformedSchema || result.preview?.schema || currentSchema || {},
                transformedCount: result.rowCount || (Array.isArray(result.preview) ? result.preview.length : result.preview?.data?.length) || 0
            };
            console.log(`📋 [Preview] Structure: OBJECT, rows: ${structuredPreview.data?.length}, cols: ${Object.keys(structuredPreview.schema).length}`);
            setTransformedPreview(structuredPreview);

            // Create checkpoint for user approval (U2A2A2U pattern)
            try {
                const checkpointResponse = await apiClient.post(`/api/projects/${pid}/checkpoints`, {
                    stage: 'transformation_review',
                    agentId: 'data_engineer',
                    message: `Data transformation completed. ${result.rowCount || result.preview?.data?.length || 0} rows transformed with ${transformationSteps.length} transformation rules applied.`,
                    artifacts: [
                        {
                            type: 'transformation_summary',
                            data: {
                                rowCount: result.rowCount || result.preview?.data?.length || 0,
                                columnCount: Object.keys(result.preview?.schema || {}).length,
                                transformationSteps: transformationSteps.length,
                                joinApplied: allDatasets.length > 1 && joinConfig.enabled
                            }
                        }
                    ],
                    requiresApproval: true
                });

                if (checkpointResponse.checkpointId) {
                    setCheckpointId(checkpointResponse.checkpointId);
                    setShowApprovalDialog(true);
                }
                console.log('✅ [Checkpoint] Transformation checkpoint created:', checkpointResponse.checkpointId);
            } catch (checkpointError) {
                console.warn('⚠️ Checkpoint creation failed (non-blocking):', checkpointError);
            }

            // CRITICAL FIX: Invalidate cache after backend updates transformed data
            // The backend may have updated journeyProgress or dataset data directly
            queryClient.invalidateQueries({ queryKey: ["project", pid] });

            // Update journeyProgress with transformation results (SSOT)
            // [DATA CONTINUITY FIX] Include transformation summary for downstream steps
            const execPreviewData = result.preview?.data || [];
            const execPreviewSchema = result.preview?.schema || currentSchema || {};
            const execRowCount = result.rowCount || result.preview?.data?.length || 0;

            updateProgress({
                transformationMappings: enhancedMappings.map(m => ({
                    sourceElementId: m.elementId || m.targetElement,
                    targetColumn: m.targetElement,
                    transformationType: inferOperationType(m.userDefinedLogic),
                    config: { logic: m.userDefinedLogic },
                    appliedAt: new Date().toISOString()
                })),
                transformedSchema: execPreviewSchema,
                // CRITICAL FIX: Save transformed preview data for restoration on refresh
                joinedData: {
                    ...(journeyProgress as any)?.joinedData,
                    preview: execPreviewData.length > 0 ? execPreviewData.slice(0, 10) : (journeyProgress as any)?.joinedData?.preview,
                    schema: execPreviewSchema,
                    totalRowCount: execRowCount,
                    rowCount: execRowCount,
                    transformationApplied: true,
                    transformedAt: new Date().toISOString()
                },
                // [NEW] Add transformation summary for Plan and Execute steps
                transformationStepData: {
                    transformedRowCount: execRowCount,
                    transformedColumnCount: Object.keys(execPreviewSchema).length,
                    transformationStepsApplied: transformationSteps.length,
                    schema: execPreviewSchema,
                    // Note: Full transformedData is stored in dataset.ingestionMetadata by backend
                    executedAt: new Date().toISOString(),
                    joinApplied: allDatasets.length > 1 && joinConfig.enabled
                },
                currentStep: 'plan' // Move to next suggested step
            });

            console.log('📊 [Transformation Execute] Saved preview with', execPreviewData.slice(0, 10).length, 'sample rows and', execRowCount, 'total rows');
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

    // P0-1 FIX: Show join approval dialog instead of auto-executing
    // This ensures explicit user consent before merging datasets (u2a2a2u pattern)
    const promptJoinApproval = (): boolean => {
        const joinStatus = isJoinRequiredButNotExecuted();
        if (joinStatus.required && !joinApproved) {
            console.log('🔗 [Join Approval] Multi-dataset join required, showing approval dialog...');
            setShowJoinApprovalDialog(true);
            return false; // Block navigation until approved
        }
        return true; // No join needed or already approved, proceed
    };

    // P0-1 FIX: Execute join after user approval
    const executeJoinWithApproval = async () => {
        if (!pid) return;

        setIsExecutingJoin(true);
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

            console.log('📊 [Join Approved] Executing join with config:', payload.joinConfig);
            const result = await apiClient.post(`/api/projects/${pid}/execute-transformations`, payload);

            // ✅ Step 6 FIX: Validate join result row count
            const resultRowCount = result.rowCount || result.preview?.data?.length || 0;

            // Calculate minimum expected rows based on input datasets
            const inputRowCounts = allDatasets.map((ds: any) =>
                ds?.recordCount || ds?.data?.length || ds?.preview?.length || 0
            );
            const totalInputRows = inputRowCounts.reduce((sum: number, count: number) => sum + count, 0);
            const minInputRows = Math.min(...inputRowCounts.filter((c: number) => c > 0));

            console.log(`📊 [Join Validation] Input datasets: ${inputRowCounts.join(', ')} rows | Result: ${resultRowCount} rows`);

            // Validation checks
            let joinWarning: string | null = null;

            if (resultRowCount === 0 && totalInputRows > 0) {
                // Critical: Zero rows from non-empty datasets
                joinWarning = `Warning: Join produced 0 rows from ${allDatasets.length} datasets with ${totalInputRows} total input rows. The join keys may not match between datasets.`;
                console.error(`❌ [Join Validation] ${joinWarning}`);
            } else if (joinConfig.type === 'inner' && resultRowCount < minInputRows * 0.1) {
                // Inner join with very few matches (less than 10% of smallest dataset)
                joinWarning = `Warning: Inner join produced only ${resultRowCount} rows (${((resultRowCount / minInputRows) * 100).toFixed(1)}% of smallest dataset). Many rows may not have matching keys.`;
                console.warn(`⚠️ [Join Validation] ${joinWarning}`);
            } else if (joinConfig.type === 'left' && resultRowCount < minInputRows) {
                // Left join with fewer rows than primary (shouldn't happen normally)
                joinWarning = `Note: Left join produced ${resultRowCount} rows, fewer than expected. Some primary records may have been filtered.`;
                console.warn(`⚠️ [Join Validation] ${joinWarning}`);
            }

            // FIX Issue 6: Structure preview correctly for approval dialog
            const structuredJoinPreview = {
                data: Array.isArray(result.preview) ? result.preview : result.preview?.data || [],
                schema: result.transformedSchema || currentSchema || {},
                transformedCount: resultRowCount
            };
            console.log(`📋 [Join Preview] Structure: OBJECT, rows: ${structuredJoinPreview.data?.length}, cols: ${Object.keys(structuredJoinPreview.schema).length}`);
            setTransformedPreview(structuredJoinPreview);
            setJoinApproved(true);
            setShowJoinApprovalDialog(false);

            // Update journeyProgress with join info including validation
            updateProgress({
                joinedData: {
                    ...(journeyProgress as any)?.joinedData,
                    joinApproved: true,
                    joinApprovedAt: new Date().toISOString(),
                    joinConfig: payload.joinConfig,
                    rowCount: resultRowCount,
                    inputRowCounts,
                    validationWarning: joinWarning
                }
            });

            // Show appropriate toast based on validation
            if (joinWarning) {
                toast({
                    title: "Datasets Joined - Review Required",
                    description: joinWarning,
                    variant: "destructive"
                });
            } else {
                toast({
                    title: "Datasets Joined Successfully",
                    description: `Merged ${allDatasets.length} datasets into ${resultRowCount} rows. Please review and approve the transformation.`,
                });
            }

            // Create checkpoint for transformation approval after join
            try {
                const checkpointMessage = joinWarning
                    ? `⚠️ Multi-dataset join completed with warnings. ${resultRowCount} rows created from joining ${allDatasets.length} datasets. ${joinWarning}`
                    : `Multi-dataset join completed. ${resultRowCount} rows created from joining ${allDatasets.length} datasets.`;

                const checkpointResponse = await apiClient.post(`/api/projects/${pid}/checkpoints`, {
                    stage: 'transformation_review',
                    agentId: 'data_engineer',
                    message: checkpointMessage,
                    artifacts: [
                        {
                            type: 'join_summary',
                            data: {
                                datasetCount: allDatasets.length,
                                rowCount: resultRowCount,
                                inputRowCounts,
                                joinType: joinConfig.type,
                                foreignKeys: joinConfig.foreignKeys,
                                validationWarning: joinWarning
                            }
                        }
                    ],
                    requiresApproval: true
                });

                if (checkpointResponse.checkpointId) {
                    setCheckpointId(checkpointResponse.checkpointId);
                    setShowApprovalDialog(true);
                }
            } catch (checkpointError) {
                console.warn('⚠️ Checkpoint creation failed (non-blocking):', checkpointError);
            }
        } catch (error: any) {
            console.error('Join execution failed:', error);
            toast({
                title: "Join Failed",
                description: error.message || "Failed to join datasets. Please check join configuration.",
                variant: "destructive"
            });
        } finally {
            setIsExecutingJoin(false);
        }
    };

    // P0-1 FIX: Cancel join and let user revise configuration
    const cancelJoinApproval = () => {
        setShowJoinApprovalDialog(false);
        toast({
            title: "Join Cancelled",
            description: "Please review and adjust the join configuration before proceeding.",
        });
    };

    // Handle checkpoint approval
    const handleApproveCheckpoint = async () => {
        if (!pid) {
            toast({
                title: "Error",
                description: "Project ID not found. Please refresh the page.",
                variant: "destructive"
            });
            return;
        }

        try {
            // Try to send checkpoint feedback if we have a checkpoint ID
            if (checkpointId) {
                try {
                    await apiClient.post(`/api/projects/${pid}/checkpoints/${checkpointId}/feedback`, {
                        approved: true,
                        feedback: 'Transformation approved by user'
                    });
                    console.log('✅ [Checkpoint] Feedback sent for checkpoint:', checkpointId);
                } catch (checkpointError) {
                    // Non-blocking - checkpoint feedback is optional
                    console.warn('⚠️ [Checkpoint] Feedback failed (non-blocking):', checkpointError);
                }
            } else {
                console.log('📋 [Checkpoint] No checkpoint ID - proceeding with approval anyway');
            }

            // ✅ CRITICAL: Always mark transformation as approved regardless of checkpoint
            setTransformationApproved(true);
            setShowApprovalDialog(false);

            // ✅ FIX: Persist approval to journeyProgress (survives navigation/refresh)
            await updateProgressAsync({
                transformationApprovedAt: new Date().toISOString(),
                transformationApproved: true,
                currentStep: 'plan' // Advance to next step
            } as any);

            toast({
                title: "Transformation Approved",
                description: "You can now proceed to the Analysis Plan step.",
            });

            // ✅ NEW: Auto-navigate to next step after approval
            if (onNext) {
                console.log('🚀 [Checkpoint] Auto-navigating to next step after approval');
                setTimeout(() => onNext(), 500);
            }
        } catch (error) {
            console.error('Checkpoint approval failed:', error);
            toast({
                title: "Approval Error",
                description: "Failed to save approval. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleRejectCheckpoint = async () => {
        if (!pid || !checkpointId) return;

        try {
            await apiClient.post(`/api/projects/${pid}/checkpoints/${checkpointId}/feedback`, {
                approved: false,
                feedback: 'Transformation rejected - user wants to revise'
            });
            setShowApprovalDialog(false);
            toast({
                title: "Transformation Rejected",
                description: "Please revise your transformations and try again.",
                variant: "destructive"
            });
        } catch (error) {
            console.error('Checkpoint rejection failed:', error);
        }
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

        // FIX Phase 3 - Checkpoint Enforcement: Verify data quality was approved
        const dataQualityApproved = journeyProgress?.dataQualityApproved === true;
        if (!dataQualityApproved) {
            toast({
                title: "Data Quality Approval Required",
                description: "Please go back to the Verification step and approve data quality before proceeding.",
                variant: "destructive"
            });
            return;
        }

        // Check if transformation has been executed and approved (U2A2A2U checkpoint)
        if (transformedPreview && !transformationApproved) {
            // Check if there's already a pending checkpoint
            if (checkpointId) {
                setShowApprovalDialog(true);
                return;
            }
            toast({
                title: "Approval Required",
                description: "Please approve the transformation results before continuing.",
                variant: "destructive"
            });
            return;
        }

        // P0-1 FIX: Check if join is required but not executed - show approval dialog
        // This replaces auto-execute with explicit user approval (u2a2a2u pattern)
        if (!promptJoinApproval()) {
            // Dialog is now showing, block navigation until user approves
            return;
        }

        // Mark step as complete and save transformation data
        // [DATA CONTINUITY FIX] Preserve existing transformationStepData from executeTransformations
        // FIX: Use async version and await before navigation to prevent race condition
        try {
            // CRITICAL FIX: Include transformedPreview sample data in journeyProgress
            // This ensures preview can be restored after page refresh/navigation
            const previewData = transformedPreview?.sampleData || transformedPreview?.data || [];
            const previewSchema = transformedPreview?.schema || currentSchema || {};
            const previewRowCount = transformedPreview?.transformedCount || transformedPreview?.data?.length || (journeyProgress as any)?.joinedData?.totalRowCount || 0;

            await updateProgressAsync({
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
                transformedSchema: previewSchema,
                // CRITICAL FIX: Save transformed preview data for restoration
                // This updates journeyProgress.joinedData.preview so it can be restored
                joinedData: {
                    ...(journeyProgress as any)?.joinedData,
                    preview: previewData.length > 0 ? previewData : (journeyProgress as any)?.joinedData?.preview,
                    schema: previewSchema,
                    totalRowCount: previewRowCount,
                    rowCount: previewRowCount,
                    transformationApplied: true,
                    transformedAt: new Date().toISOString()
                },
                // Preserve transformationStepData if already set, otherwise create minimal summary
                transformationStepData: (journeyProgress as any)?.transformationStepData || {
                    transformedRowCount: previewRowCount,
                    transformedColumnCount: Object.keys(previewSchema).length,
                    transformationStepsApplied: transformationMappings.length,
                    schema: previewSchema,
                    executedAt: new Date().toISOString(),
                    joinApplied: allDatasets.length > 1
                },
                stepTimestamps: {
                    ...(journeyProgress?.stepTimestamps || {}),
                    transformationCompleted: new Date().toISOString()
                }
            });

            console.log('📊 [Transformation Save] Saved preview with', previewData.length, 'sample rows and', previewRowCount, 'total rows');

            // Force cache refresh before navigation
            await queryClient.refetchQueries({ queryKey: ["project", pid] });

            // Navigate to next step (only after data is persisted)
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
            {/* DE Agent Loading Indicator - Shows when AI is generating transformation plan */}
            {isGeneratingTransformations && (
                <Card className="mb-4 border-blue-200 bg-blue-50">
                    <CardContent className="flex items-center gap-3 py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        <div>
                            <p className="font-medium text-blue-900">Generating Transformation Plan</p>
                            <p className="text-sm text-blue-700">{deAgentProgress || 'AI Agent is analyzing your data...'}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

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

            {/* Analysis View Mode Toggle and Readiness Overview */}
            <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-purple-600" />
                                Analysis Readiness Overview
                            </CardTitle>
                            <CardDescription>
                                {analysisGroups.length > 0
                                    ? `${analysisGroups.filter(g => g.status === 'ready').length} of ${analysisGroups.length} analyses ready to execute`
                                    : 'Loading analysis recommendations...'}
                            </CardDescription>
                        </div>
                        {/* View Mode Toggle */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">View:</span>
                            <div className="flex rounded-lg border overflow-hidden">
                                <Button
                                    variant={viewMode === 'by-element' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-none text-xs h-8"
                                    onClick={() => setViewMode('by-element')}
                                >
                                    By Element
                                </Button>
                                <Button
                                    variant={viewMode === 'by-analysis' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-none text-xs h-8"
                                    onClick={() => setViewMode('by-analysis')}
                                >
                                    <BarChart3 className="w-3 h-3 mr-1" />
                                    By Analysis
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {analysisGroups.length > 0 ? (
                        <div className="space-y-4">
                            {/* Analysis Readiness Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {analysisGroups.map((group) => (
                                    <div
                                        key={group.analysisId}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                                            selectedAnalysisId === group.analysisId ? 'ring-2 ring-purple-500' : ''
                                        } ${
                                            group.status === 'ready'
                                                ? 'bg-green-50 border-green-200 hover:bg-green-100'
                                                : group.status === 'partial'
                                                ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                                                : 'bg-red-50 border-red-200 hover:bg-red-100'
                                        }`}
                                        onClick={() => setSelectedAnalysisId(
                                            selectedAnalysisId === group.analysisId ? null : group.analysisId
                                        )}
                                    >
                                        {/* Status Badge and Score */}
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge
                                                variant={
                                                    group.status === 'ready' ? 'default' :
                                                    group.status === 'partial' ? 'secondary' : 'destructive'
                                                }
                                                className={`text-xs ${
                                                    group.status === 'ready' ? 'bg-green-600' :
                                                    group.status === 'partial' ? 'bg-amber-500' : ''
                                                }`}
                                            >
                                                {group.status === 'ready' ? (
                                                    <><CheckCircle className="w-3 h-3 mr-1" />Ready</>
                                                ) : group.status === 'partial' ? (
                                                    <><AlertCircle className="w-3 h-3 mr-1" />Partial</>
                                                ) : (
                                                    <><XCircle className="w-3 h-3 mr-1" />Blocked</>
                                                )}
                                            </Badge>
                                            <span className={`text-sm font-bold ${
                                                group.status === 'ready' ? 'text-green-700' :
                                                group.status === 'partial' ? 'text-amber-700' : 'text-red-700'
                                            }`}>
                                                {Math.round(group.readinessScore * 100)}%
                                            </span>
                                        </div>

                                        {/* Analysis Name */}
                                        <h4 className="font-medium text-sm mb-1 truncate">{group.analysisName}</h4>

                                        {/* Analysis Type */}
                                        <Badge variant="outline" className="text-xs mb-2 bg-purple-50 text-purple-700">
                                            {group.analysisType}
                                        </Badge>

                                        {/* Progress Indicator */}
                                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                            <span>Elements:</span>
                                            <span>{group.mappedElements.length}/{group.requiredElements.length || 'N/A'}</span>
                                        </div>
                                        <Progress
                                            value={group.readinessScore * 100}
                                            className="h-1.5"
                                        />

                                        {/* Techniques Preview */}
                                        {group.techniques.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {group.techniques.slice(0, 2).map((t, idx) => {
                                                    const techName = typeof t === 'string' ? t : (t as any).name || 'Unknown';
                                                    return (
                                                        <Badge key={idx} variant="secondary" className="text-xs py-0">
                                                            {techName}
                                                        </Badge>
                                                    );
                                                })}
                                                {group.techniques.length > 2 && (
                                                    <Badge variant="outline" className="text-xs py-0">
                                                        +{group.techniques.length - 2}
                                                    </Badge>
                                                )}
                                            </div>
                                        )}

                                        {/* Expand Indicator */}
                                        <div className="flex items-center justify-center mt-2 text-gray-400">
                                            {selectedAnalysisId === group.analysisId ? (
                                                <ChevronUp className="w-4 h-4" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4" />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Selected Analysis Expanded Details */}
                            {selectedAnalysis && (
                                <Card className="mt-4 border-purple-300 bg-white">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            {selectedAnalysis.analysisName}
                                            <Badge variant="outline" className="text-xs">
                                                {selectedAnalysis.analysisType}
                                            </Badge>
                                        </CardTitle>
                                        {selectedAnalysis.description && (
                                            <CardDescription>{selectedAnalysis.description}</CardDescription>
                                        )}
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {/* Blocked Reason Alert */}
                                        {selectedAnalysis.blockedReason && (
                                            <Alert variant={selectedAnalysis.status === 'blocked' ? 'destructive' : 'default'} className="py-2">
                                                <AlertCircle className="h-4 w-4" />
                                                <AlertDescription>{selectedAnalysis.blockedReason}</AlertDescription>
                                            </Alert>
                                        )}

                                        {/* Required Elements Table - PHASE 5 FIX: Check requiredElements, not just transformations */}
                                        {(selectedAnalysis.requiredElements?.length > 0 || selectedAnalysis.transformations.length > 0) ? (
                                            <div>
                                                <h5 className="text-sm font-medium mb-2">Required Data Mappings</h5>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-gray-50">
                                                            <TableHead className="text-xs">Required Element</TableHead>
                                                            <TableHead className="text-xs">Source Column</TableHead>
                                                            <TableHead className="text-xs">Status</TableHead>
                                                            <TableHead className="text-xs">Transformation</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {/* PHASE 5 FIX: Iterate over requiredElements to show ALL required elements */}
                                                        {(selectedAnalysis.requiredElements?.length > 0
                                                            ? selectedAnalysis.requiredElements
                                                            : selectedAnalysis.transformations.map(t => t.elementId || t.targetElement)
                                                        ).map((elementId: string, idx: number) => {
                                                            // Find the full element details from requiredDataElements
                                                            const element = requiredDataElements?.requiredDataElements?.find(
                                                                (el: any) => el.elementId === elementId || el.elementName === elementId
                                                            );
                                                            // Find if there's a mapping for this element
                                                            const mapping = selectedAnalysis.transformations.find(
                                                                (m: any) => m.elementId === elementId || m.targetElement === elementId || m.targetElement === element?.elementName
                                                            );
                                                            const elementName = element?.elementName || mapping?.targetElement || elementId;
                                                            const hasMapping = !!(mapping?.sourceColumn || mapping?.sourceColumns?.length);

                                                            return (
                                                                <TableRow key={idx}>
                                                                    <TableCell className="font-medium text-sm py-2">
                                                                        {elementName}
                                                                    </TableCell>
                                                                    <TableCell className="text-sm py-2">
                                                                        {mapping?.sourceColumn || mapping?.sourceColumns?.join(', ') || (
                                                                            <span className="text-amber-500 italic">Not mapped</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="py-2">
                                                                        {hasMapping ? (
                                                                            <Badge variant="default" className="bg-green-600 text-xs">
                                                                                <CheckCircle className="w-3 h-3 mr-1" />Mapped
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge variant="secondary" className="text-xs">
                                                                                <AlertCircle className="w-3 h-3 mr-1" />Pending
                                                                            </Badge>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell className="text-xs text-gray-600 py-2 max-w-[200px] truncate">
                                                                        {mapping?.suggestedTransformation || element?.suggestedTransformation || 'Direct mapping'}
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded">
                                                No specific data element requirements defined for this analysis.
                                                It will use all available transformed data.
                                            </div>
                                        )}

                                        {/* Techniques */}
                                        {selectedAnalysis.techniques.length > 0 && (
                                            <div>
                                                <h5 className="text-sm font-medium mb-2">Techniques</h5>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedAnalysis.techniques.map((t, idx) => {
                                                        const techName = typeof t === 'string' ? t : (t as any).name || 'Unknown';
                                                        return (
                                                            <Badge key={idx} variant="secondary">
                                                                {techName}
                                                            </Badge>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* PHASE 5 FIX: Suggested Transformations for Required Elements */}
                                        {selectedAnalysis.requiredElements?.length > 0 && (() => {
                                            const suggestedTransforms = selectedAnalysis.requiredElements
                                                .map((elementId: string) => {
                                                    const element = requiredDataElements?.requiredDataElements?.find(
                                                        (el: any) => el.elementId === elementId || el.elementName === elementId
                                                    );
                                                    return element?.suggestedTransformation ? { name: element.elementName, transform: element.suggestedTransformation } : null;
                                                })
                                                .filter(Boolean);

                                            return suggestedTransforms.length > 0 && (
                                                <div className="mt-4">
                                                    <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                                                        <Wand2 className="w-4 h-4 text-blue-600" />
                                                        Suggested Transformations
                                                    </h5>
                                                    <div className="space-y-2">
                                                        {suggestedTransforms.map((item: any, idx: number) => (
                                                            <div key={idx} className="flex items-start gap-2 p-2 bg-blue-50 rounded text-sm">
                                                                <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                                                                <div>
                                                                    <span className="font-medium">{item.name}:</span>{' '}
                                                                    <span className="text-gray-700">{item.transform}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* PHASE 5 FIX: Per-Analysis Data Preview */}
                                        {selectedAnalysis.requiredElements?.length > 0 && (transformedPreview?.sampleData?.length > 0 || transformedPreview?.data?.length > 0) && (
                                            <div className="mt-4">
                                                <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                                                    <Database className="w-4 h-4 text-green-600" />
                                                    Data Preview for {selectedAnalysis.analysisName}
                                                </h5>
                                                <div className="max-h-40 overflow-auto border rounded">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-gray-100 sticky top-0">
                                                                {selectedAnalysis.requiredElements.map((elementId: string) => {
                                                                    const element = requiredDataElements?.requiredDataElements?.find(
                                                                        (el: any) => el.elementId === elementId || el.elementName === elementId
                                                                    );
                                                                    const mapping = transformationMappings.find(
                                                                        (m: any) => m.elementId === elementId || m.targetElement === elementId || m.targetElement === element?.elementName
                                                                    );
                                                                    const colName = mapping?.sourceColumn || element?.elementName || elementId;
                                                                    return (
                                                                        <TableHead key={elementId} className="text-xs py-1 whitespace-nowrap">
                                                                            {colName}
                                                                        </TableHead>
                                                                    );
                                                                })}
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {(transformedPreview?.sampleData || transformedPreview?.data || []).slice(0, 5).map((row: any, rowIdx: number) => (
                                                                <TableRow key={rowIdx}>
                                                                    {selectedAnalysis.requiredElements.map((elementId: string) => {
                                                                        const element = requiredDataElements?.requiredDataElements?.find(
                                                                            (el: any) => el.elementId === elementId || el.elementName === elementId
                                                                        );
                                                                        const mapping = transformationMappings.find(
                                                                            (m: any) => m.elementId === elementId || m.targetElement === elementId || m.targetElement === element?.elementName
                                                                        );
                                                                        const colName = mapping?.sourceColumn || elementId;
                                                                        const value = row[colName];
                                                                        return (
                                                                            <TableCell key={elementId} className="text-xs py-1">
                                                                                {value !== undefined && value !== null ? String(value).substring(0, 50) : '-'}
                                                                            </TableCell>
                                                                        );
                                                                    })}
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Showing relevant columns for this analysis ({selectedAnalysis.requiredElements?.length || 0} columns)
                                                </p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
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

                    {/* Source-to-Target Mapping Table - FIXED: Added horizontal scroll for wider table */}
                    {transformationMappings.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Source-to-Target Mappings</h3>
                            <div className="w-full border rounded-lg overflow-x-auto overflow-y-auto" style={{ maxHeight: '500px' }}>
                                <div className="min-w-[1400px] p-0.5">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50 sticky top-0 z-10">
                                            <TableHead className="w-[180px] min-w-[180px]">Target Element</TableHead>
                                            <TableHead className="w-[100px] min-w-[100px]">Type</TableHead>
                                            <TableHead className="w-[200px] min-w-[200px]">Source Column</TableHead>
                                            <TableHead className="w-[100px] min-w-[100px]">Confidence</TableHead>
                                            <TableHead className="w-[200px] min-w-[200px]">Enables Analyses</TableHead>
                                            <TableHead className="w-[220px] min-w-[220px]">Related Questions</TableHead>
                                            <TableHead className="w-[400px] min-w-[400px]">Transformation Logic (Natural Language)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transformationMappings.map((mapping, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium">{mapping.targetElement}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{mapping.targetType}</Badge>
                                                </TableCell>
                                                {/* MULTI-COLUMN MAPPING: Support single or multiple source columns with aggregation */}
                                                <TableCell>
                                                    <div className="space-y-2">
                                                        {/* Display selected columns as badges */}
                                                        <div className="flex flex-wrap gap-1 min-h-[28px]">
                                                            {(mapping.sourceColumns && mapping.sourceColumns.length > 0
                                                                ? mapping.sourceColumns
                                                                : mapping.sourceColumn ? [mapping.sourceColumn] : []
                                                            ).map((col) => (
                                                                <Badge
                                                                    key={col}
                                                                    variant="secondary"
                                                                    className="text-xs flex items-center gap-1 px-2 py-0.5"
                                                                >
                                                                    {col}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleColumnInMapping(mapping.targetElement, col)}
                                                                        className="hover:bg-gray-300 rounded-full p-0.5"
                                                                    >
                                                                        <X className="h-3 w-3" />
                                                                    </button>
                                                                </Badge>
                                                            ))}
                                                            {(!mapping.sourceColumns || mapping.sourceColumns.length === 0) && !mapping.sourceColumn && (
                                                                <span className="text-gray-400 text-xs italic">No columns selected</span>
                                                            )}
                                                        </div>

                                                        {/* Phase 5: Enhanced Column selector popover with search, confidence & samples */}
                                                        <Popover onOpenChange={() => setColumnSearchFilter('')}>
                                                            <PopoverTrigger asChild>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className={`w-full text-xs ${!mapping.sourceColumn && !mapping.sourceColumns?.length ? 'border-amber-300 bg-amber-50' : ''}`}
                                                                >
                                                                    <Plus className="h-3 w-3 mr-1" />
                                                                    Add Columns
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent
                                                                className="w-80 p-0"
                                                                align="start"
                                                                onPointerDownOutside={(e) => e.preventDefault()}
                                                                onInteractOutside={(e) => e.preventDefault()}
                                                            >
                                                                {/* Search input */}
                                                                <div className="p-2 border-b">
                                                                    <div className="relative">
                                                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                                                        <Input
                                                                            placeholder="Search columns..."
                                                                            value={columnSearchFilter}
                                                                            onChange={(e) => setColumnSearchFilter(e.target.value)}
                                                                            className="h-8 pl-7 text-xs"
                                                                        />
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 mt-1.5">
                                                                        Multi-select for derived values • Sorted by match confidence
                                                                    </div>
                                                                </div>

                                                                <ScrollArea className="h-56">
                                                                    <div className="p-1">
                                                                        {(() => {
                                                                            const availableCols = getAvailableSourceColumns();
                                                                            const selectedCols = mapping.sourceColumns || (mapping.sourceColumn ? [mapping.sourceColumn] : []);

                                                                            // Filter by search term
                                                                            const filteredCols = columnSearchFilter
                                                                                ? availableCols.filter(col =>
                                                                                    col.toLowerCase().includes(columnSearchFilter.toLowerCase())
                                                                                )
                                                                                : availableCols;

                                                                            // Sort by confidence (high to low), then alphabetically
                                                                            const sortedCols = [...filteredCols].sort((a, b) => {
                                                                                const confA = calculateColumnConfidence(a, mapping);
                                                                                const confB = calculateColumnConfidence(b, mapping);
                                                                                if (confA !== confB) return confB - confA;
                                                                                return a.localeCompare(b);
                                                                            });

                                                                            if (sortedCols.length === 0) {
                                                                                return (
                                                                                    <div className="text-center py-4 text-gray-400 text-xs">
                                                                                        No columns match "{columnSearchFilter}"
                                                                                    </div>
                                                                                );
                                                                            }

                                                                            return sortedCols.map((col) => {
                                                                                const isSelected = selectedCols.includes(col);
                                                                                const colMeta = currentSchema?.[col];
                                                                                const colType = typeof colMeta === 'string'
                                                                                    ? colMeta
                                                                                    : (colMeta?.type || colMeta?.dataType || '');
                                                                                const confidence = calculateColumnConfidence(col, mapping);
                                                                                const samples = getColumnSampleValues(col);

                                                                                return (
                                                                                    <div
                                                                                        key={col}
                                                                                        className={`p-2 rounded cursor-pointer hover:bg-gray-50 ${
                                                                                            isSelected ? 'bg-blue-50 border border-blue-200' : ''
                                                                                        }`}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            toggleColumnInMapping(mapping.targetElement, col);
                                                                                        }}
                                                                                    >
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Checkbox
                                                                                                checked={isSelected}
                                                                                                onCheckedChange={() => toggleColumnInMapping(mapping.targetElement, col)}
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                            />
                                                                                            <div className="flex-1 min-w-0">
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <span className="text-sm font-medium truncate">{col}</span>
                                                                                                    {colType && (
                                                                                                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                                                                                            {colType}
                                                                                                        </Badge>
                                                                                                    )}
                                                                                                </div>
                                                                                                {/* Sample values */}
                                                                                                {samples.length > 0 && (
                                                                                                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                                                                                                        e.g., {samples.join(', ')}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                            {/* Confidence indicator */}
                                                                                            {confidence > 0.4 && !isSelected && (
                                                                                                <Badge
                                                                                                    className={`text-[10px] px-1.5 py-0 h-5 flex-shrink-0 ${
                                                                                                        confidence >= 0.8
                                                                                                            ? 'bg-green-100 text-green-700 hover:bg-green-100'
                                                                                                            : confidence >= 0.6
                                                                                                                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
                                                                                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-100'
                                                                                                    }`}
                                                                                                >
                                                                                                    <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                                                                                    {Math.round(confidence * 100)}%
                                                                                                </Badge>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            });
                                                                        })()}
                                                                    </div>
                                                                </ScrollArea>

                                                                <div className="p-2 border-t bg-gray-50">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="w-full text-xs text-gray-500 h-7"
                                                                        onClick={() => updateMultiColumnMapping(mapping.targetElement, [], null)}
                                                                    >
                                                                        <X className="h-3 w-3 mr-1" />
                                                                        Clear All Selections
                                                                    </Button>
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>

                                                        {/* Aggregation function selector - shown when multiple columns selected */}
                                                        {mapping.sourceColumns && mapping.sourceColumns.length > 1 && (
                                                            <div className="flex items-center gap-1">
                                                                <Calculator className="h-3 w-3 text-gray-400" />
                                                                <Select
                                                                    value={mapping.aggregationFunction || 'avg'}
                                                                    onValueChange={(value) => updateAggregationFunction(mapping.targetElement, value as AggregationFunction)}
                                                                >
                                                                    <SelectTrigger className="h-7 text-xs w-24">
                                                                        <SelectValue placeholder="Combine" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="avg">Average</SelectItem>
                                                                        <SelectItem value="sum">Sum</SelectItem>
                                                                        <SelectItem value="min">Minimum</SelectItem>
                                                                        <SelectItem value="max">Maximum</SelectItem>
                                                                        <SelectItem value="count">Count</SelectItem>
                                                                        <SelectItem value="concat">Concatenate</SelectItem>
                                                                        <SelectItem value="first">First Value</SelectItem>
                                                                        <SelectItem value="weighted_avg">Weighted Avg</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {/* P2-1 FIX: Use normalized confidence utilities */}
                                                    <Badge variant={getConfidenceBadgeVariant(mapping.confidence)}>
                                                        {formatConfidence(mapping.confidence)}
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
                                                <TableCell className="w-[400px]">
                                                    {mapping.transformationRequired ? (
                                                        <Textarea
                                                            placeholder="e.g., Convert date string to ISO format, trim whitespace, calculate total..."
                                                            value={transformationLogic[mapping.targetElement] || ''}
                                                            onChange={(e) => updateTransformationLogic(mapping.targetElement, e.target.value)}
                                                            className="min-h-[80px] min-w-[350px] text-sm resize-y"
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
                                <ScrollBar orientation="horizontal" />
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

                    {/* PHASE 3 FIX: Inline Transformation Approval Banner */}
                    {/* Shows prominently when transformations executed but not yet approved */}
                    {transformedPreview && !transformationApproved && (
                        <Alert className="bg-amber-50 border-amber-300 mb-4">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <AlertTitle className="text-amber-800">Approval Required</AlertTitle>
                            <AlertDescription className="flex items-center justify-between">
                                <span className="text-amber-700">
                                    Transformations have been executed. Please review and approve before continuing to analysis.
                                </span>
                                <Button
                                    onClick={() => setShowApprovalDialog(true)}
                                    className="bg-amber-600 hover:bg-amber-700 text-white ml-4"
                                    size="sm"
                                >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Review & Approve
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Approval Confirmed Banner */}
                    {transformedPreview && transformationApproved && (
                        <Alert className="bg-green-50 border-green-300 mb-4">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-800">Transformations Approved</AlertTitle>
                            <AlertDescription className="text-green-700">
                                You can now proceed to the Analysis Plan step.
                            </AlertDescription>
                        </Alert>
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

            {/* Transformation Approval Dialog (U2A2A2U checkpoint) */}
            <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            Approve Data Transformation
                        </DialogTitle>
                        <DialogDescription>
                            The Data Engineer has completed the transformation. Please review the results before proceeding.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        {transformedPreview && (
                            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                <h4 className="font-medium text-sm">Transformation Summary</h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Rows:</span>{' '}
                                        <span className="font-medium">
                                            {transformedPreview.transformedCount ||
                                             transformedPreview.data?.length ||
                                             transformedPreview.sampleData?.length || 0}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Columns:</span>{' '}
                                        <span className="font-medium">
                                            {transformedPreview.columns?.length ||
                                             Object.keys(transformedPreview.schema || {}).length || 0}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Transformations:</span>{' '}
                                        <span className="font-medium">{transformationMappings.filter(m => m.transformationRequired).length}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Join Applied:</span>{' '}
                                        <span className="font-medium">
                                            {(allDatasets.length > 1 && joinConfig.enabled) ||
                                             journeyProgress?.joinedData?.joinInsights?.joinStrategy === 'join' ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                By approving, you confirm that the transformed data is ready for analysis.
                                You can go back and revise transformations if needed.
                            </AlertDescription>
                        </Alert>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={handleRejectCheckpoint}>
                            <ThumbsDown className="w-4 h-4 mr-2" />
                            Revise
                        </Button>
                        <Button onClick={handleApproveCheckpoint} className="bg-green-600 hover:bg-green-700">
                            <ThumbsUp className="w-4 h-4 mr-2" />
                            Approve & Continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* P0-1 FIX: Join Approval Dialog - Explicit user approval for multi-dataset joins */}
            <Dialog open={showJoinApprovalDialog} onOpenChange={setShowJoinApprovalDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-500" />
                            Confirm Dataset Join
                        </DialogTitle>
                        <DialogDescription>
                            You have multiple datasets that need to be merged before analysis can proceed.
                            Please review the join configuration and approve.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4">
                        {/* Join Configuration Summary */}
                        <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                            <h4 className="font-medium text-sm text-blue-900">Join Configuration</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-blue-700">Datasets to merge:</span>{' '}
                                    <span className="font-medium text-blue-900">{allDatasets.length}</span>
                                </div>
                                <div>
                                    <span className="text-blue-700">Join Type:</span>{' '}
                                    <span className="font-medium text-blue-900 uppercase">{joinConfig.type}</span>
                                </div>
                            </div>

                            {/* Show join keys */}
                            {joinConfig.foreignKeys.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-blue-200">
                                    <span className="text-blue-700 text-sm font-medium">Join Keys:</span>
                                    <div className="mt-2 space-y-1">
                                        {joinConfig.foreignKeys.map((fk, idx) => (
                                            <div key={idx} className="text-xs bg-white rounded px-2 py-1 flex items-center gap-2">
                                                <Badge variant="outline" className="text-xs">{fk.sourceColumn}</Badge>
                                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                                <Badge variant="outline" className="text-xs">{fk.targetColumn}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Dataset List */}
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h4 className="font-medium text-sm mb-2">Datasets to be joined:</h4>
                            <ul className="space-y-1 text-sm">
                                {allDatasets.map((ds, idx) => (
                                    <li key={idx} className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                        <span>{ds.dataset?.fileName || ds.fileName || `Dataset ${idx + 1}`}</span>
                                        <span className="text-gray-400 text-xs">
                                            ({ds.dataset?.rowCount || ds.rowCount || '?'} rows)
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertDescription>
                                By approving, the datasets will be merged using a {joinConfig.type.toUpperCase()} JOIN.
                                This operation combines data from all datasets into a single unified view for analysis.
                            </AlertDescription>
                        </Alert>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={cancelJoinApproval} disabled={isExecutingJoin}>
                            <XCircle className="w-4 h-4 mr-2" />
                            Cancel
                        </Button>
                        <Button
                            onClick={executeJoinWithApproval}
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={isExecutingJoin}
                        >
                            {isExecutingJoin ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Joining...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Approve & Join Datasets
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
