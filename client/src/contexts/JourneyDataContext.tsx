import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { apiClient } from '@/lib/api';

/**
 * JourneyDataContext - Shared state between journey steps (8-step consolidated flow)
 *
 * Data flows between steps via journeyProgress SSOT:
 * 1. Data Upload & Setup → projectId, datasets[], piiExclusions, joinedData
 * 2. Prepare → analysisGoal, userQuestions[], audience, recommendedAnalyses[], requiredDataElements[]
 * 3. Verification → dataElementMappings[], dataQualityApproved, mappingGaps[]
 * 4. Transformation → transformationRules[], selectionCriteria[], transformedData
 * 5. Analysis Plan → executionPlan, expectedArtifacts[], estimatedCosts, planApproved
 * 6. Execution → analysisResults[], executionMetrics, checkpointApprovals[]
 * 7. Billing → paymentCompleted, invoiceId
 * 8. Dashboard → displays all results, artifacts, exports
 *
 * NOTE: This context syncs with journeyProgress from the server (SSOT).
 * Avoid using localStorage for persistence - use server-side journeyProgress instead.
 */

// Types for shared journey data
export interface UserQuestion {
  id: string;
  text: string;
  category?: string;
  priority?: number;
  originalIndex?: number;
}

export interface RequiredDataElement {
  elementId: string;
  elementName: string;
  dataType: string;
  sourceField?: string;
  sourceAvailable: boolean;
  confidence: number;
  transformationRequired: boolean;
  transformationLogic?: { description: string };
  purpose?: string;
  analysisUsage?: string[];
  relatedQuestions?: string[];
}

export interface AnalysisPathItem {
  analysisId: string;
  analysisName: string;
  analysisType: string;
  description?: string;
  techniques?: string[];
  requiredElements?: string[];
  estimatedDuration?: string;
  priority?: number;
}

export interface QuestionAnswerMapping {
  questionId: string;
  questionText: string;
  requiredDataElements: string[];
  analysisIds: string[];
  confidence?: number;
}

export interface TransformationMapping {
  targetElement: string;
  targetType: string;
  sourceColumn: string | null;
  confidence: number;
  transformationRequired: boolean;
  suggestedTransformation: string;
  userDefinedLogic: string;
  relatedQuestions?: string[];
  elementId?: string;
}

export interface JoinConfig {
  enabled: boolean;
  type: 'left' | 'inner' | 'outer' | 'right';
  foreignKeys: Array<{
    sourceDataset: string;
    sourceColumn: string;
    targetDataset: string;
    targetColumn: string;
  }>;
}

export interface DatasetInfo {
  id: string;
  name: string;
  fileName?: string;
  schema: Record<string, string>;
  preview: any[];
  recordCount: number;
  piiExclusions?: string[]; // Columns excluded due to PII
}

// Step 2: Audience definition
export interface AudienceDefinition {
  primaryAudience: 'technical' | 'business' | 'executive' | 'mixed';
  secondaryAudiences?: string[];
  decisionContext?: string;
}

// Step 5: Execution plan
export interface ExecutionPlan {
  steps: Array<{
    stepId: string;
    analysisType: string;
    order: number;
    dependencies?: string[];
    estimatedDuration?: string;
  }>;
  totalEstimatedDuration?: string;
}

// Step 5: Expected artifacts
export interface ExpectedArtifact {
  type: 'pdf' | 'csv' | 'presentation' | 'dashboard' | 'json';
  name: string;
  description?: string;
}

// Step 6: Execution metrics
export interface ExecutionMetrics {
  startTime: Date | null;
  endTime: Date | null;
  stepsCompleted: number;
  totalSteps: number;
  currentStep?: string;
}

// Step 6: Checkpoint approval
export interface CheckpointApproval {
  stepId: string;
  approved: boolean;
  approvedAt?: Date;
  notes?: string;
}

export interface JourneyDataState {
  // ================== Step 1: Data Upload & Setup ==================
  projectId: string | null;
  datasets: DatasetInfo[];
  mergedSchema: Record<string, string>;
  joinConfig: JoinConfig | null;
  joinedDataPreview: any[] | null;

  // ================== Step 2: Prepare ==================
  analysisGoal: string;
  userQuestions: UserQuestion[];
  audience: AudienceDefinition | null;
  recommendedAnalyses: AnalysisPathItem[];
  requiredDataElements: RequiredDataElement[];

  // ================== Step 3: Verification ==================
  dataElementMappings: TransformationMapping[]; // Maps required elements to columns
  dataQualityApproved: boolean;
  mappingGaps: Array<{ elementId: string; description: string; severity: string }>;

  // ================== Step 4: Transformation ==================
  transformationMappings: TransformationMapping[];
  selectionCriteria: Array<{ analysisId: string; criteria: string; filters: any }>;
  transformedData: any[] | null;
  transformedSchema: Record<string, string> | null;

  // ================== Step 5: Analysis Plan ==================
  executionPlan: ExecutionPlan | null;
  expectedArtifacts: ExpectedArtifact[];
  estimatedCosts: { total: number; breakdown: Record<string, number> } | null;
  planApproved: boolean;

  // ================== Step 6: Execution ==================
  analysisResults: any[];
  executionMetrics: ExecutionMetrics | null;
  checkpointApprovals: CheckpointApproval[];

  // ================== Step 7: Billing ==================
  paymentCompleted: boolean;
  invoiceId: string | null;

  // ================== Derived/Legacy (for backward compat) ==================
  analysisPath: AnalysisPathItem[];
  questionAnswerMapping: QuestionAnswerMapping[];
  completeness: {
    totalElements: number;
    elementsMapped: number;
    elementsWithTransformation: number;
    readyForExecution: boolean;
  } | null;
  gaps: Array<{ type: string; description: string; severity: string }>;

  // Loading states
  isLoading: boolean;
  lastLoadedAt: Date | null;
}

export interface JourneyDataContextType extends JourneyDataState {
  // Actions
  setProjectId: (id: string) => void;
  setUserQuestions: (questions: UserQuestion[]) => void;
  setAnalysisGoal: (goal: string) => void;
  loadRequirementsDocument: () => Promise<void>;
  loadDatasets: () => Promise<void>;
  setTransformationMappings: (mappings: TransformationMapping[]) => void;
  setTransformedData: (data: any[], schema: Record<string, string>) => void;
  setJoinConfig: (config: JoinConfig) => void;
  refreshAll: () => Promise<void>;
  clearJourneyData: () => void;
}

const defaultState: JourneyDataState = {
  // Step 1: Data Upload & Setup
  projectId: null,
  datasets: [],
  mergedSchema: {},
  joinConfig: null,
  joinedDataPreview: null,

  // Step 2: Prepare
  analysisGoal: '',
  userQuestions: [],
  audience: null,
  recommendedAnalyses: [],
  requiredDataElements: [],

  // Step 3: Verification
  dataElementMappings: [],
  dataQualityApproved: false,
  mappingGaps: [],

  // Step 4: Transformation
  transformationMappings: [],
  selectionCriteria: [],
  transformedData: null,
  transformedSchema: null,

  // Step 5: Analysis Plan
  executionPlan: null,
  expectedArtifacts: [],
  estimatedCosts: null,
  planApproved: false,

  // Step 6: Execution
  analysisResults: [],
  executionMetrics: null,
  checkpointApprovals: [],

  // Step 7: Billing
  paymentCompleted: false,
  invoiceId: null,

  // Legacy/Derived
  analysisPath: [],
  questionAnswerMapping: [],
  completeness: null,
  gaps: [],

  // Loading states
  isLoading: false,
  lastLoadedAt: null,
};

const JourneyDataContext = createContext<JourneyDataContextType | undefined>(undefined);

export function JourneyDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<JourneyDataState>(defaultState);

  // NOTE: No localStorage initialization - projectId is set explicitly via setProjectId()
  // when entering a journey or resuming from the journeys hub. This ensures SSOT via server.

  // Auto-load data when projectId changes
  useEffect(() => {
    if (state.projectId && !state.lastLoadedAt) {
      loadRequirementsDocument();
      loadDatasets();
    }
  }, [state.projectId]);

  const setProjectId = useCallback((id: string) => {
    // NOTE: No localStorage - projectId flows from server journeyProgress SSOT
    setState(prev => ({
      ...prev,
      projectId: id,
      lastLoadedAt: null, // Reset to trigger reload
    }));
  }, []);

  const setUserQuestions = useCallback((questions: UserQuestion[]) => {
    // NOTE: Questions persisted via server journeyProgress SSOT, not localStorage
    setState(prev => ({ ...prev, userQuestions: questions }));
  }, []);

  const setAnalysisGoal = useCallback((goal: string) => {
    // NOTE: Goal persisted via server journeyProgress SSOT, not localStorage
    setState(prev => ({ ...prev, analysisGoal: goal }));
  }, []);

  const loadRequirementsDocument = useCallback(async () => {
    if (!state.projectId) {
      console.warn('[JourneyDataContext] Cannot load requirements: no projectId');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      console.log('[JourneyDataContext] Loading requirements document for project:', state.projectId);
      const response = await apiClient.get(`/api/projects/${state.projectId}/required-data-elements`);

      if (response.success && response.document) {
        const doc = response.document;
        const analysisPath = doc.analysisPath || [];

        setState(prev => ({
          ...prev,
          // Step 2: Prepare data
          requiredDataElements: doc.requiredDataElements || [],
          recommendedAnalyses: analysisPath, // New field for 8-step flow
          analysisPath, // Keep for backward compat
          questionAnswerMapping: doc.questionAnswerMapping || [],
          analysisGoal: doc.analysisGoal || prev.analysisGoal,
          audience: doc.audience || prev.audience,
          userQuestions: doc.userQuestions?.map((q: any, idx: number) => ({
            id: q.questionId || `q-${idx}`,
            text: typeof q === 'string' ? q : q.questionText || q.text || '',
            category: q.category,
            priority: q.priority || idx,
            originalIndex: idx,
          })) || prev.userQuestions,

          // Step 3: Verification data
          dataElementMappings: doc.dataElementMappings || prev.dataElementMappings,
          dataQualityApproved: doc.dataQualityApproved ?? prev.dataQualityApproved,
          mappingGaps: doc.mappingGaps || prev.mappingGaps,

          // Legacy/derived
          completeness: doc.completeness || null,
          gaps: doc.gaps || [],

          isLoading: false,
          lastLoadedAt: new Date(),
        }));
        console.log('[JourneyDataContext] Requirements loaded:', {
          elements: doc.requiredDataElements?.length || 0,
          analyses: analysisPath.length,
          mappings: doc.questionAnswerMapping?.length || 0,
        });
      } else {
        console.warn('[JourneyDataContext] No requirements document found');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('[JourneyDataContext] Failed to load requirements:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.projectId]);

  const loadDatasets = useCallback(async () => {
    if (!state.projectId) {
      console.warn('[JourneyDataContext] Cannot load datasets: no projectId');
      return;
    }

    try {
      console.log('[JourneyDataContext] Loading datasets for project:', state.projectId);
      const response = await apiClient.getProjectDatasets(state.projectId);

      const datasets: DatasetInfo[] = (response.datasets || []).map((ds: any) => {
        const dataset = ds.dataset || ds;
        return {
          id: dataset.id,
          name: dataset.name || dataset.fileName,
          fileName: dataset.fileName || dataset.originalFileName,
          schema: dataset.schema || {},
          preview: dataset.preview || dataset.data?.slice(0, 20) || [],
          recordCount: dataset.recordCount || dataset.preview?.length || 0,
          piiExclusions: dataset.piiExclusions || dataset.ingestionMetadata?.piiExclusions || [],
        };
      });

      // Build merged schema
      let mergedSchema: Record<string, string> = response.joinedSchema || {};
      if (Object.keys(mergedSchema).length === 0 && datasets.length > 0) {
        datasets.forEach((ds: DatasetInfo, idx: number) => {
          Object.entries(ds.schema).forEach(([col, type]) => {
            if (idx === 0 || !(col in mergedSchema)) {
              mergedSchema[col] = type as string;
            } else {
              mergedSchema[`${ds.name}_${col}`] = type as string;
            }
          });
        });
      }

      // Extract join config if available
      const joinConfig: JoinConfig | null = response.autoDetectedJoinConfig?.enabled
        ? {
            enabled: true,
            type: response.autoDetectedJoinConfig.type || 'left',
            foreignKeys: response.autoDetectedJoinConfig.foreignKeys || [],
          }
        : null;

      // Extract joined data preview if available
      const joinedDataPreview = response.joinedDataPreview || response.joinedData?.slice(0, 20) || null;

      setState(prev => ({
        ...prev,
        datasets,
        mergedSchema,
        joinConfig,
        joinedDataPreview,
      }));

      console.log('[JourneyDataContext] Datasets loaded:', {
        count: datasets.length,
        columns: Object.keys(mergedSchema).length,
        hasJoinConfig: !!joinConfig,
        hasJoinedPreview: !!joinedDataPreview,
      });
    } catch (error) {
      console.error('[JourneyDataContext] Failed to load datasets:', error);
    }
  }, [state.projectId]);

  const setTransformationMappings = useCallback((mappings: TransformationMapping[]) => {
    setState(prev => ({ ...prev, transformationMappings: mappings }));
  }, []);

  const setTransformedData = useCallback((data: any[], schema: Record<string, string>) => {
    setState(prev => ({
      ...prev,
      transformedData: data,
      transformedSchema: schema,
    }));
  }, []);

  const setJoinConfig = useCallback((config: JoinConfig) => {
    setState(prev => ({ ...prev, joinConfig: config }));
  }, []);

  const refreshAll = useCallback(async () => {
    setState(prev => ({ ...prev, lastLoadedAt: null }));
    await Promise.all([
      loadRequirementsDocument(),
      loadDatasets(),
    ]);
  }, [loadRequirementsDocument, loadDatasets]);

  const clearJourneyData = useCallback(() => {
    // NOTE: No localStorage cleanup needed - data flows via server SSOT
    // Simply reset local state; server handles persistence
    setState(defaultState);
  }, []);

  const contextValue: JourneyDataContextType = {
    ...state,
    setProjectId,
    setUserQuestions,
    setAnalysisGoal,
    loadRequirementsDocument,
    loadDatasets,
    setTransformationMappings,
    setTransformedData,
    setJoinConfig,
    refreshAll,
    clearJourneyData,
  };

  return (
    <JourneyDataContext.Provider value={contextValue}>
      {children}
    </JourneyDataContext.Provider>
  );
}

export function useJourneyData(): JourneyDataContextType {
  const context = useContext(JourneyDataContext);
  if (!context) {
    throw new Error('useJourneyData must be used within a JourneyDataProvider');
  }
  return context;
}

// Convenience hook for reading-only (doesn't throw if not in provider)
export function useJourneyDataOptional(): JourneyDataContextType | null {
  return useContext(JourneyDataContext) || null;
}
