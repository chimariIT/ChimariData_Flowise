import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Play,
  CheckCircle,
  Clock,
  Settings,
  Brain,
  Zap,
  AlertCircle,
  Download,
  Eye,
  MessageCircle,
  Lightbulb,
  Shield,
  ShieldCheck,
  Loader2
} from "lucide-react";
import { useProjectSession } from "@/hooks/useProjectSession";
import { CheckpointDialog } from "@/components/CheckpointDialog";
import { apiClient } from "@/lib/api";
import type { JourneyTemplate } from '@shared/journey-templates';
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface ExecuteStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

export default function ExecuteStep({ journeyType, onNext, onPrevious }: ExecuteStepProps) {
  const { toast } = useToast();
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'configuring' | 'running' | 'completed' | 'error'>('idle');
  const [executionProgress, setExecutionProgress] = useState(0);
  const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>([]);
  const [executionResults, setExecutionResults] = useState<any>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [scenarioQuestion, setScenarioQuestion] = useState<string>("");
  const [suggestedScenarios, setSuggestedScenarios] = useState<Array<{ id: string; title: string; description: string; analyses: string[] }>>([]);
  const [scenarioSource, setScenarioSource] = useState<'internal' | 'external' | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [selectedBusinessTemplates, setSelectedBusinessTemplates] = useState<string[]>([]);
  const [primaryBusinessTemplate, setPrimaryBusinessTemplate] = useState<string>("");
  const [savedQuestions, setSavedQuestions] = useState<string[]>([]);
  const [savedGoal, setSavedGoal] = useState<string>("");
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('chimari_analysis_questions') || '[]');
      if (Array.isArray(stored) && stored.length > 0) {
        const filtered = stored
          .map((q: any) => (typeof q === 'string' ? q.trim() : ''))
          .filter((q: string) => q.length > 0)
          .slice(0, 6);
        setSavedQuestions(filtered);
      }
    } catch {
      setSavedQuestions([]);
    }

    const goal = localStorage.getItem('chimari_analysis_goal') || "";
    if (goal) {
      setSavedGoal(goal);
    }
  }, []);

  useEffect(() => {
    if (!scenarioQuestion && savedQuestions.length > 0) {
      setScenarioQuestion(savedQuestions[0]);
      setSelectedScenario(`user-${0}`);
    }
  }, [scenarioQuestion, savedQuestions]);

  const resolvedProjectId = session?.projectId ?? localStorage.getItem('currentProjectId');
  const [loadingServerResults, setLoadingServerResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  useEffect(() => {
    if (!resolvedProjectId || executionResults || executionStatus === 'running') {
      return;
    }

    let cancelled = false;
    const loadResults = async () => {
      setLoadingServerResults(true);
      setResultsError(null);
      try {
        const response = await apiClient.getAnalysisResults(resolvedProjectId);
        if (!cancelled && response?.results) {
          setExecutionResults(response.results);
          setExecutionStatus('completed');
          setValidationStatus('validated');
          try {
            localStorage.setItem('chimari_execution_results', JSON.stringify(response.results));
          } catch {
            // ignore storage failures
          }
        }
      } catch (error: any) {
        if (cancelled) return;
        const status = error?.response?.status || error?.status;
        if (status === 404) {
          // No execution yet; keep idle state
          return;
        }
        console.error('Failed to load execution results from server:', error);
        setResultsError(error?.message || 'Unable to load execution results. Please try again.');
      } finally {
        if (!cancelled) setLoadingServerResults(false);
      }
    };

    loadResults();
    return () => { cancelled = true; };
  }, [resolvedProjectId, executionResults, executionStatus]);

  const inferAnalysesForQuestion = (question: string): string[] => {
    const q = question.toLowerCase();
    const analyses = new Set<string>(['descriptive']);
    if (/(trend|time|month|week|year|season)/.test(q)) analyses.add('time-series');
    if (/(impact|effect|improve|drive|increase|decrease|predict|churn|attrition)/.test(q)) analyses.add('regression');
    if (/(relationship|correlat|association|compare|versus|vs)/.test(q)) analyses.add('correlation');
    if (/(segment|cluster|group|persona)/.test(q)) analyses.add('clustering');
    if (/(classification|classify|category)/.test(q)) analyses.add('classification');
    return Array.from(analyses);
  };

  const personalizedScenarios = savedQuestions.map((question, index) => ({
    id: `user-${index}`,
    title: question.length > 60 ? `${question.slice(0, 57)}…` : question,
    description: 'Based on the questions you entered earlier',
    analyses: inferAnalysesForQuestion(question),
    example: question,
    source: 'user' as const
  }));
  const [validationStatus, setValidationStatus] = useState<'pending' | 'validating' | 'validated' | 'failed'>('pending');
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [checkpointApproved, setCheckpointApproved] = useState(false);

  // Agent recommendation state
  const [agentRecommendations, setAgentRecommendations] = useState<any | null>(null);
  const [useAgentConfig, setUseAgentConfig] = useState(true); // Default to using agent recommendations

  // Secure server-side session with integrity validation
  const {
    session,
    updateStep,
    validateExecution,
    getExecuteData,
    loading: sessionLoading,
    error: sessionError
  } = useProjectSession({
    journeyType: journeyType as 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom'
  });

  // Load templates and fetch their configurations (Phase 3 - Task 3.2)
  useEffect(() => {
    if (journeyType !== 'business') return;

    // Load template data from multiple sources for reliability
    try {
      const saved = localStorage.getItem('chimari_business_templates');
      if (saved) {
        const templates = JSON.parse(saved);
        setSelectedBusinessTemplates(templates);
        console.log('Loaded business templates from localStorage:', templates);
      }
    } catch (error) {
      console.error('Failed to load templates from localStorage:', error);
    }

    try {
      const primary = localStorage.getItem('chimari_business_primary_template');
      if (primary) {
        setPrimaryBusinessTemplate(primary);
        console.log('Loaded primary template:', primary);
      }
    } catch (error) {
      console.error('Failed to load primary template:', error);
    }

    // Also try to load from session data
    const executeData = getExecuteData();
    if (executeData?.selectedTemplates) {
      setSelectedBusinessTemplates(executeData.selectedTemplates);
      console.log('Loaded templates from session:', executeData.selectedTemplates);
    }
  }, [journeyType, getExecuteData]);

  // Load agent recommendations from localStorage and auto-populate configuration
  useEffect(() => {
    try {
      const savedRecommendations = localStorage.getItem('acceptedRecommendations');
      if (savedRecommendations) {
        const recommendations = JSON.parse(savedRecommendations);
        setAgentRecommendations(recommendations);

        console.log('🤖 Loaded agent recommendations:', recommendations);

        // Auto-populate recommended analyses if user hasn't made changes yet
        if (selectedAnalyses.length === 0 && recommendations.recommendedAnalyses?.length > 0) {
          setSelectedAnalyses(recommendations.recommendedAnalyses);
          console.log('✅ Auto-selected analyses from agent recommendations:', recommendations.recommendedAnalyses);
        }
      }
    } catch (error) {
      console.error('Failed to load agent recommendations:', error);
    }
  }, []); // Run once on mount

  // Fetch template configurations and auto-fill recommended analyses (Phase 3 - Task 3.2)
  useEffect(() => {
    if (journeyType !== 'business' || !primaryBusinessTemplate) return;

    const fetchTemplateConfig = async () => {
      try {
        const response = await fetch(`/api/templates/${primaryBusinessTemplate}/config`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.config) {
            console.log('Template config loaded:', data.config);

            // Auto-fill recommended analyses (but don't override agent recommendations)
            if (!agentRecommendations && data.config.recommendedAnalyses && data.config.recommendedAnalyses.length > 0) {
              setSelectedAnalyses(data.config.recommendedAnalyses);
              console.log('Auto-selected analyses from template:', data.config.recommendedAnalyses);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch template config:', error);
        // Silently fail - user can still manually select analyses
      }
    };

    fetchTemplateConfig();
  }, [journeyType, primaryBusinessTemplate, agentRecommendations]);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Analysis Execution",
          description: "Our AI will automatically configure and run the optimal analysis",
          icon: Brain,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Analysis Execution", 
          description: "Execute analysis using business templates and best practices",
          icon: BarChart3,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Analysis Execution",
          description: "Configure and execute advanced statistical analysis",
          icon: Settings,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Expert-Guided Analysis",
          description: "Analysis executed with expert consultation and guidance",
          icon: Eye,
          color: "yellow"
        };
      default:
        return {
          title: "Analysis Execution",
          description: "Configure and execute your data analysis",
          icon: BarChart3,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  // Analysis options with journey-specific labels
  const getAnalysisOptions = () => {
    if (journeyType === 'non-tech') {
      return [
        { id: 'descriptive', name: 'Understand Your Data', description: 'See what your data looks like with charts and summaries', duration: '2-3 min' },
        { id: 'correlation', name: 'Find Patterns', description: 'Discover how different things relate to each other', duration: '3-5 min' },
        { id: 'regression', name: 'Predict Outcomes', description: 'Understand what factors drive results', duration: '5-8 min' },
        { id: 'clustering', name: 'Group Similar Items', description: 'Find natural groups in your data', duration: '8-12 min' },
        { id: 'classification', name: 'Categorize & Predict', description: 'Predict which category something belongs to', duration: '10-15 min' },
        { id: 'time-series', name: 'Spot Trends Over Time', description: 'See how things change over days, months, or years', duration: '6-10 min' }
      ];
    }

    // For business journey, show template-based workflow steps instead of technical analyses
    if (journeyType === 'business' && selectedBusinessTemplates.length > 0) {
      // Map business templates to their workflow steps
      const templateWorkflowSteps = selectedBusinessTemplates.flatMap(templateId => {
        // Business template workflow steps based on template type
        switch (templateId) {
          case 'retail_customer_segmentation':
            return [
              { id: 'customer_data_prep', name: 'Prepare Customer Data', description: 'Clean and normalize customer purchase behavior data', duration: '3-5 min' },
              { id: 'customer_clustering', name: 'Customer Clustering', description: 'Identify customer segments based on behavior', duration: '8-12 min' },
              { id: 'segment_profiling', name: 'Segment Profiling', description: 'Analyze characteristics of each customer segment', duration: '5-7 min' }
            ];
          case 'finance_fraud_detection':
            return [
              { id: 'transaction_features', name: 'Transaction Feature Engineering', description: 'Extract fraud indicators from transactions', duration: '5-8 min' },
              { id: 'anomaly_detection', name: 'Anomaly Detection', description: 'Identify suspicious transaction patterns', duration: '10-15 min' },
              { id: 'fraud_scoring', name: 'Fraud Risk Scoring', description: 'Calculate fraud probability scores', duration: '5-7 min' }
            ];
          case 'finance_credit_risk':
            return [
              { id: 'credit_data_prep', name: 'Credit Data Preparation', description: 'Prepare borrower credit history and financial data', duration: '4-6 min' },
              { id: 'risk_scoring', name: 'Risk Score Calculation', description: 'Calculate creditworthiness scores', duration: '6-9 min' },
              { id: 'default_prediction', name: 'Default Prediction Model', description: 'Predict likelihood of loan default', duration: '10-15 min' }
            ];
          case 'hr_attrition_prediction':
            return [
              { id: 'employee_analysis', name: 'Employee Data Analysis', description: 'Analyze employee demographics and performance', duration: '3-5 min' },
              { id: 'attrition_patterns', name: 'Attrition Pattern Identification', description: 'Find factors driving employee turnover', duration: '8-12 min' },
              { id: 'retention_insights', name: 'Retention Strategy Insights', description: 'Generate recommendations to reduce attrition', duration: '5-7 min' }
            ];
          case 'hr_compensation_analysis':
            return [
              { id: 'comp_benchmarking', name: 'Compensation Benchmarking', description: 'Compare compensation against market data', duration: '5-8 min' },
              { id: 'equity_analysis', name: 'Pay Equity Analysis', description: 'Identify compensation disparities', duration: '7-10 min' },
              { id: 'comp_recommendations', name: 'Compensation Recommendations', description: 'Generate fair compensation adjustments', duration: '5-7 min' }
            ];
          default:
            // Generic business template steps
            return [
              { id: 'business_data_prep', name: 'Business Data Preparation', description: 'Prepare data according to template requirements', duration: '3-5 min' },
              { id: 'business_analysis', name: 'Template-based Analysis', description: 'Execute analysis using business template', duration: '8-12 min' },
              { id: 'business_insights', name: 'Business Insights Generation', description: 'Generate actionable business insights', duration: '5-7 min' }
            ];
        }
      });

      // Remove duplicates by id
      const uniqueSteps = Array.from(new Map(templateWorkflowSteps.map(step => [step.id, step])).values());
      return uniqueSteps;
    }

    // Default technical labels for technical/consultation users
    return [
      { id: 'descriptive', name: 'Descriptive Statistics', description: 'Basic statistical summaries and distributions', duration: '2-3 min' },
      { id: 'correlation', name: 'Correlation Analysis', description: 'Relationships between variables', duration: '3-5 min' },
      { id: 'regression', name: 'Regression Analysis', description: 'Predictive modeling and relationships', duration: '5-8 min' },
      { id: 'clustering', name: 'Clustering Analysis', description: 'Group similar data points', duration: '8-12 min' },
      { id: 'classification', name: 'Classification Analysis', description: 'Predict categorical outcomes', duration: '10-15 min' },
      { id: 'time-series', name: 'Time Series Analysis', description: 'Trends and patterns over time', duration: '6-10 min' }
    ];
  };

  const analysisOptions = getAnalysisOptions();

  // Non-tech scenario presets in plain language → mapped to analyses
  const scenarioPresets: Array<{ id: string; title: string; description: string; analyses: string[]; example?: string; source?: 'user' | 'system' }>= [
    {
      id: 'policy-attrition',
      title: 'Policy impact on employee attrition',
      description: 'Check if a policy change increased employee departures',
      analyses: ['descriptive','correlation','regression','time-series'],
      example: 'Is there evidence of employee attrition due to the new remote work policy?'
    },
    {
      id: 'campaign-effectiveness',
      title: 'Marketing campaign effectiveness',
      description: 'Determine if a recent campaign drove sales lift',
      analyses: ['descriptive','time-series','regression'],
      example: 'Did the April campaign increase weekly sales?'
    },
    {
      id: 'pricing-churn',
      title: 'Pricing change effect on churn',
      description: 'Assess if pricing changes impacted customer churn',
      analyses: ['descriptive','correlation','classification','regression'],
      example: 'Did the price adjustment affect churn rates?'
    },
    {
      id: 'operations-sla',
      title: 'Operational changes and SLA breaches',
      description: 'See if schedule changes affected SLA breaches',
      analyses: ['descriptive','correlation','time-series'],
      example: 'Did staffing changes increase SLA breaches?'
    }
  ];

  const scenarioOptions = personalizedScenarios.concat(scenarioPresets);

  // Debounced question suggestion fetch for non-tech users
  useEffect(() => {
    let cancelled = false;
    if (journeyType !== 'non-tech') return;
    if (!scenarioQuestion || scenarioQuestion.trim().length < 8) {
      setSuggestedScenarios([]);
      setScenarioSource(null);
      return;
    }
    setIsSuggesting(true);
    const t = setTimeout(async () => {
      try {
        const resp = await apiClient.post('/api/analysis/suggest-scenarios', { question: scenarioQuestion });
        if (!cancelled) {
          setSuggestedScenarios(resp?.scenarios || []);
          setScenarioSource(resp?.source || null);
        }
      } catch (e) {
        if (!cancelled) {
          setSuggestedScenarios([]);
          setScenarioSource(null);
        }
      } finally {
        if (!cancelled) setIsSuggesting(false);
      }
    }, 450);

    return () => { cancelled = true; clearTimeout(t); };
  }, [scenarioQuestion, journeyType]);

  const handleAnalysisToggle = (analysisId: string) => {
    setSelectedAnalyses(prev => 
      prev.includes(analysisId) 
        ? prev.filter(id => id !== analysisId)
        : [...prev, analysisId]
    );
  };

  const handleExecuteAnalysis = async () => {
    if (selectedAnalyses.length === 0) return;

    // Phase 3 - Task 3.3: Show checkpoint dialog first
    if (!checkpointApproved) {
      setShowCheckpoint(true);
      return;
    }

    setExecutionStatus('configuring');
    setExecutionProgress(0);

    // Persist execution context for backend/agents to read later if needed
    if (journeyType === 'business') {
      const context = {
        templates: selectedBusinessTemplates,
        primaryTemplate: primaryBusinessTemplate
      };
      try { localStorage.setItem('chimari_execute_business_context', JSON.stringify(context)); } catch {}
    }

    try {
      // Get current project ID from localStorage or context
      const currentProjectId = getCurrentProjectId();
      
      if (!currentProjectId) {
        console.error('No project ID found');
        setExecutionStatus('error');
        return;
      }

      console.log(`🚀 Executing real analysis for project ${currentProjectId}`);
      console.log(`📊 Analysis types: ${selectedAnalyses.join(', ')}`);

      // Call the REAL analysis execution API
      setExecutionStatus('running');
      setExecutionProgress(10);

      // Get authentication token
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/analysis-execution/execute', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          projectId: currentProjectId,
          analysisTypes: selectedAnalyses,
          journeyType: journeyType,
          templateContext: journeyType === 'business' ? {
            selectedTemplates: selectedBusinessTemplates,
            primaryTemplate: primaryBusinessTemplate
          } : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      setExecutionProgress(50);

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Analysis execution failed');
      }

      // ✅ Validate response data structure
      if (!data.results) {
        throw new Error('Analysis results missing from response');
      }

      console.log('✅ Analysis completed successfully');
      console.log(`📈 Results: ${data.results?.insightCount || 0} insights, ${data.results?.recommendationCount || 0} recommendations`);

      setExecutionProgress(100);
      setExecutionStatus('completed');

      const payload = data.results;
      setExecutionResults(payload);

      // Store execution summary for pricing/session validation
      const pricingSummary = {
        totalAnalyses: payload?.analysisTypes?.length ?? payload?.summary?.totalAnalyses ?? selectedAnalyses.length,
        executionTime: payload?.summary?.executionTime ?? (payload?.executionTimeSeconds ? `${payload.executionTimeSeconds}s` : '0s'),
        resultsGenerated: payload?.insightCount ?? payload?.summary?.dataRowsProcessed ?? 0,
        insightsFound: payload?.insightCount ?? 0,
        recommendationsFound: payload?.recommendationCount ?? payload?.recommendations?.length ?? 0,
        qualityScore: payload?.qualityScore ?? payload?.summary?.qualityScore ?? 0,
        dataSize: payload?.dataRowsProcessed ?? payload?.summary?.dataRowsProcessed ?? 0,
        datasetCount: payload?.metadata?.datasetCount ?? payload?.datasetCount ?? 1,
        selectedAnalyses,
        estimatedCost: payload?.cost ?? payload?.costBreakdown?.total ?? payload?.estimatedCost?.total ?? 0
      };

      // 🔒 SECURITY: Save to server AND validate integrity
      try {
        // Save to server session
        await updateStep('execute', pricingSummary);

        // Server-side validation to prevent tampering
        setValidationStatus('validating');
        const isValid = await validateExecution(pricingSummary);

        if (isValid) {
          setValidationStatus('validated');
          console.log('✅ Execution results validated by server');
        } else {
          setValidationStatus('failed');
          console.error('❌ Server validation failed');
          alert('⚠️ Results validation failed. Please re-run your analysis.');
          setExecutionStatus('error');
          return;
        }

        // Backwards compatibility: Also cache in localStorage
        localStorage.setItem('chimari_execution_results', JSON.stringify(payload));

      } catch (error) {
        console.error('Failed to save/validate execution results:', error);
        setValidationStatus('failed');
        // Don't fail the execution, just warn
        console.warn('Server save/validation failed, data cached locally only');
      }

    } catch (error: any) {
      console.error('❌ Analysis execution error:', error);
      setExecutionStatus('error');
      setExecutionProgress(0);
      alert(`Analysis failed: ${error.message}`);
    }
  };

  const getCurrentProjectId = () => resolvedProjectId;

  const handlePreviewResults = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      toast({
        title: "Missing project",
        description: "Please select a project or upload data before previewing results.",
        variant: "destructive"
      });
      return;
    }

    setPreviewError(null);
    setPreviewLoading(true);

    try {
      let resultsPayload = executionResults;
      if (!resultsPayload) {
        const apiResponse = await apiClient.getAnalysisResults(projectId);
        resultsPayload = apiResponse?.results;
      }

      if (!resultsPayload) {
        throw new Error('Results are not available yet. Please run the analysis first.');
      }

      setPreviewData(resultsPayload);
      setIsPreviewOpen(true);
    } catch (error: any) {
      const message = error?.message || 'Failed to load preview results.';
      setPreviewError(message);
      toast({
        title: "Preview unavailable",
        description: message,
        variant: "destructive"
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadArtifacts = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      toast({
        title: "Missing project",
        description: "Please select a project before downloading artifacts.",
        variant: "destructive"
      });
      return;
    }

    setArtifactLoading(true);

    try {
      const response = await apiClient.getProjectArtifacts(projectId);
      const artifacts = response?.artifacts ?? [];
      const fileRef = artifacts
        .flatMap((artifact: any) => artifact.fileRefs || [])
        .find((ref: any) =>
          ['pdf', 'presentation', 'dashboard', 'csv'].includes(ref?.type || '') || ref?.url
        );

      if (fileRef?.url) {
        window.open(fileRef.url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Artifacts are still generating. Please check back shortly.');
      }
    } catch (error: any) {
      const message = error?.message || 'Failed to download artifacts.';
      toast({
        title: "Download unavailable",
        description: message,
        variant: "destructive"
      });
    } finally {
      setArtifactLoading(false);
    }
  };

  // Phase 3 - Task 3.3: Checkpoint handlers
  const handleCheckpointApprove = (feedback?: string) => {
    console.log('Analysis plan approved', feedback ? `with feedback: ${feedback}` : '');
    setCheckpointApproved(true);
    setShowCheckpoint(false);
    // Store approval decision in project history
    try {
      const approvalRecord = {
        timestamp: new Date().toISOString(),
        approved: true,
        feedback: feedback || '',
        analysesSelected: selectedAnalyses
      };
      const existingHistory = JSON.parse(localStorage.getItem('chimari_checkpoint_history') || '[]');
      existingHistory.push(approvalRecord);
      localStorage.setItem('chimari_checkpoint_history', JSON.stringify(existingHistory));
    } catch (error) {
      console.error('Failed to store approval record:', error);
    }
    // Trigger execution
    setTimeout(() => handleExecuteAnalysis(), 100);
  };

  const handleCheckpointModify = (modifications: string) => {
    console.log('Modification requested:', modifications);
    setShowCheckpoint(false);
    // Store modification request
    try {
      const modificationRecord = {
        timestamp: new Date().toISOString(),
        approved: false,
        modifications,
        analysesSelected: selectedAnalyses
      };
      const existingHistory = JSON.parse(localStorage.getItem('chimari_checkpoint_history') || '[]');
      existingHistory.push(modificationRecord);
      localStorage.setItem('chimari_checkpoint_history', JSON.stringify(existingHistory));
    } catch (error) {
      console.error('Failed to store modification record:', error);
    }
    // Show message to user
    alert(`Your modification request has been recorded:\n\n"${modifications}"\n\nPlease adjust your analysis selection and try again.`);
  };

  const handleCheckpointClose = () => {
    setShowCheckpoint(false);
  };

  // For non-tech, selecting a scenario auto-selects mapped analyses
  const handleSelectScenario = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    const preset = (suggestedScenarios.find(s => s.id === scenarioId) || scenarioPresets.find(s => s.id === scenarioId));
    if (preset) {
      setSelectedAnalyses(preset.analyses);
      // Only scenario presets have examples, suggested scenarios don't
      const presetWithExample = preset as { example?: string };
      if (!scenarioQuestion && presetWithExample.example) setScenarioQuestion(presetWithExample.example);
    }
  };

  const getExecutionStatusIcon = () => {
    switch (executionStatus) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'running':
        return <Zap className="w-5 h-5 text-blue-600 animate-pulse" />;
      case 'configuring':
        return <Settings className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Play className="w-5 h-5 text-gray-600" />;
    }
  };

  const getExecutionStatusText = () => {
    switch (executionStatus) {
      case 'configuring':
        return 'Configuring analysis parameters...';
      case 'running':
        return 'Running analysis...';
      case 'completed':
        return 'Analysis completed successfully!';
      case 'error':
        return 'Analysis failed. Please try again.';
      default:
        return 'Ready to execute';
    }
  };

  // State for template duration
  const [executeDuration, setExecuteDuration] = useState<string>('<1 minute');

  // Load template duration from API (Task 2.2: Frontend Template Integration)
  useEffect(() => {
    async function loadTemplateDuration() {
      try {
        const templates = await apiClient.getTemplatesByJourneyType(journeyType);
        if (templates?.data && templates.data.length > 0) {
          const template = templates.data[0];
          const executeStep = template.steps?.find((s: any) => s.id === 'execute');
          if (executeStep?.estimatedDuration) {
            setExecuteDuration(`${executeStep.estimatedDuration} minute${executeStep.estimatedDuration === 1 ? '' : 's'}`);
          }
        }
      } catch (error) {
        console.warn('Failed to load template duration from API, using default:', error);
        // Fallback to default if API fails
      }
    }
    if (journeyType) {
      loadTemplateDuration();
    }
  }, [journeyType]);

  // Find correct duration from template (fallback function kept for backwards compatibility)
  function getExecuteDuration(journeyType: string): string {
    return executeDuration; // Use state value from API
  }

  const getEstimatedDuration = () => {
    const totalMinutes = selectedAnalyses.reduce((total, analysisId) => {
      const analysis = analysisOptions.find(opt => opt.id === analysisId);
      const duration = analysis?.duration || '5 min';
      return total + parseInt(duration.split('-')[0]);
    }, 0);
    return `${totalMinutes}-${totalMinutes + selectedAnalyses.length * 2} minutes`;
  };

  const executionSummary = useMemo(() => {
    if (!executionResults) {
      return {
        totalAnalyses: 0,
        executionTime: '—',
        resultsGenerated: 0,
        qualityScore: 0,
        insightCount: 0,
        recommendationCount: 0,
        datasetCount: 0
      };
    }

    const totalAnalyses = executionResults.analysisTypes?.length
      ?? executionResults.summary?.totalAnalyses
      ?? selectedAnalyses.length;
    const executionTime = executionResults.summary?.executionTime
      ?? (executionResults.executionTimeSeconds ? `${executionResults.executionTimeSeconds}s` : '—');
    const resultsGenerated = executionResults.insightCount
      ?? executionResults.summary?.dataRowsProcessed
      ?? 0;
    const qualityScore = executionResults.qualityScore
      ?? executionResults.summary?.qualityScore
      ?? 0;

    return {
      totalAnalyses,
      executionTime,
      resultsGenerated,
      qualityScore,
      insightCount: executionResults.insightCount ?? executionResults.insights?.length ?? 0,
      recommendationCount: executionResults.recommendationCount ?? executionResults.recommendations?.length ?? 0,
      datasetCount: executionResults.metadata?.datasetCount ?? executionResults.datasetCount ?? 1
    };
  }, [executionResults, selectedAnalyses.length]);

  const previewSummary = useMemo(() => {
    if (!previewData) return null;
    const insightCount = previewData.insightCount ?? previewData.insights?.length ?? 0;
    const recommendationCount = previewData.recommendationCount ?? previewData.recommendations?.length ?? 0;
    const quality = previewData.qualityScore ?? previewData.summary?.qualityScore ?? executionSummary.qualityScore;
    const avgConfidence = previewData.insights?.length
      ? Math.round(
          previewData.insights.reduce(
            (sum: number, insight: any) => sum + (insight.confidence || 60),
            0
          ) / previewData.insights.length
        )
      : quality;

    return {
      insightCount,
      recommendationCount,
      quality,
      avgConfidence,
      duration: previewData.summary?.executionTime ?? executionSummary.executionTime
    };
  }, [previewData, executionSummary]);

  return (
    <div className="space-y-6">
      {/* Phase 3 - Task 3.3: Checkpoint Dialog */}
      <CheckpointDialog
        open={showCheckpoint}
        onClose={handleCheckpointClose}
        onApprove={handleCheckpointApprove}
        onModify={handleCheckpointModify}
        analysisSteps={analysisOptions.filter(a => selectedAnalyses.includes(a.id))}
        journeyType={journeyType}
        estimatedDuration={selectedAnalyses.length > 0 ? `${selectedAnalyses.length * 5}-${selectedAnalyses.length * 8} minutes` : undefined}
      />

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
          if (!open) {
            setPreviewError(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Analysis Preview</DialogTitle>
            <DialogDescription>
              Generated insights and confidence scores from your latest execution.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : previewError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {previewError}
            </div>
          ) : previewData ? (
            <>
              {previewSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Confidence</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.avgConfidence}%</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Insights</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.insightCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Recommendations</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.recommendationCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-gray-500 uppercase">Quality Score</p>
                    <p className="text-2xl font-semibold text-gray-900">{previewSummary.quality}%</p>
                  </div>
                </div>
              )}

              <Separator />

              <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2">Key Insights</h4>
                <ScrollArea className="h-64 pr-4">
                  {previewData.insights?.length ? (
                    previewData.insights.map((insight: any, index: number) => (
                      <div key={`insight-${index}`} className="mb-3 rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-900">{insight.title || `Insight ${index + 1}`}</p>
                          <Badge variant="secondary" className="text-xs">
                            {insight.confidence ?? 60}% confidence
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700 mt-2">{insight.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">No insights are available yet.</p>
                  )}
                </ScrollArea>
              </div>

              <Separator className="my-4" />

              <div>
                <h4 className="text-sm font-semibold mb-2">Recommended Actions</h4>
                <ScrollArea className="h-48 pr-4">
                  {previewData.recommendations?.length ? (
                    previewData.recommendations.map((rec: any, index: number) => (
                      <div key={`rec-${index}`} className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-blue-900">{rec.title || `Recommendation ${index + 1}`}</p>
                          <Badge className="text-xs bg-blue-100 text-blue-700">
                            Priority: {rec.priority || 'Medium'}
                          </Badge>
                        </div>
                        <p className="text-sm text-blue-800 mt-2">{rec.description}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">No recommendations generated yet.</p>
                  )}
                </ScrollArea>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">No preview data is available yet. Run the analysis to generate insights.</p>
          )}
        </DialogContent>
      </Dialog>

      {loadingServerResults && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading latest execution results from the server…</span>
            </div>
          </CardContent>
        </Card>
      )}

      {resultsError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-red-800">
              <AlertCircle className="w-4 h-4" />
              <span>{resultsError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journey Type Info */}
      <Card className={`border-${journeyInfo.color}-200 bg-${journeyInfo.color}-50`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-${journeyInfo.color}-900`}>
            <Icon className="w-5 h-5" />
            {journeyInfo.title}
          </CardTitle>
          <CardDescription className={`text-${journeyInfo.color}-700`}>
            {journeyInfo.description}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Non-tech scenario-based entry */}
      {journeyType === 'non-tech' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              🔍 Refine Your Analysis Questions
            </CardTitle>
            <CardDescription>
              Now let's get specific. Describe the exact outcome you want to understand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <p className="text-sm font-medium text-blue-900 mb-1">💡 Your Project Goal:</p>
                <p className="text-sm text-blue-700 italic">
                  {savedGoal || localStorage.getItem('chimari_analysis_goal') || 'Not specified'}
                </p>
              </div>
              <Label htmlFor="scenario-question">Specific question to answer:</Label>
              <input
                id="scenario-question"
                type="text"
                value={scenarioQuestion}
                onChange={(e) => setScenarioQuestion(e.target.value)}
                placeholder={
                  savedQuestions.length > 0
                    ? `Ex: ${savedQuestions[0]}`
                    : "For example: 'Is there evidence of employee attrition due to the new policy?'"
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              {isSuggesting && (
                <div className="text-xs text-blue-600">Analyzing your question…</div>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                {scenarioOptions.map((s) => (
                  <div
                    key={`suggested-${s.id}`}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedScenario === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => handleSelectScenario(s.id)}
                    data-testid={`scenario-suggested-${s.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{s.title}</p>
                        <p className="text-sm text-gray-600">{s.description}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          s.source === 'user' || scenarioSource === 'internal'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }
                      >
                        {s.source === 'user' || scenarioSource === 'internal' ? 'Your question' : 'Suggested'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {selectedAnalyses.length > 0 && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  AI will run: {selectedAnalyses.map(id => analysisOptions.find(a => a.id === id)?.name || id).join(', ')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Recommendations Card */}
      {agentRecommendations && (
        <Card className="border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Brain className="w-6 h-6 text-blue-600" />
              🤖 Agent Recommendations
            </CardTitle>
            <CardDescription className="text-blue-700">
              Our AI agents analyzed your data and generated these intelligent recommendations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Data Analysis Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Files Analyzed</p>
                <p className="text-lg font-bold text-blue-900">{agentRecommendations.filesAnalyzed || 0}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Total Records</p>
                <p className="text-lg font-bold text-blue-900">{agentRecommendations.expectedDataSize?.toLocaleString() || 0}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Data Quality</p>
                <div className="flex items-center gap-1">
                  <p className="text-lg font-bold text-blue-900">{agentRecommendations.dataQuality || 0}%</p>
                  <Badge variant={agentRecommendations.dataQuality >= 90 ? "default" : "secondary"} className="text-xs">
                    {agentRecommendations.dataQuality >= 90 ? 'Excellent' : agentRecommendations.dataQuality >= 70 ? 'Good' : 'Fair'}
                  </Badge>
                </div>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Complexity</p>
                <Badge className={
                  agentRecommendations.analysisComplexity === 'low' ? 'bg-green-100 text-green-800' :
                  agentRecommendations.analysisComplexity === 'medium' ? 'bg-blue-100 text-blue-800' :
                  agentRecommendations.analysisComplexity === 'high' ? 'bg-orange-100 text-orange-800' :
                  'bg-red-100 text-red-800'
                }>
                  {agentRecommendations.analysisComplexity?.toUpperCase() || 'N/A'}
                </Badge>
              </div>
            </div>

            {/* Recommended Analyses */}
            {agentRecommendations.recommendedAnalyses && agentRecommendations.recommendedAnalyses.length > 0 && (
              <div className="p-4 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-semibold text-gray-900">
                    {agentRecommendations.recommendedAnalyses.length} Recommended Analyses
                  </p>
                </div>
                <ul className="space-y-2">
                  {agentRecommendations.recommendedAnalyses.map((analysis: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="mt-0.5 flex-shrink-0">{i + 1}</Badge>
                      <span className="text-gray-700">{analysis}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cost & Time Estimates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <p className="text-xs font-medium text-gray-600">Estimated Time</p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{agentRecommendations.timeEstimate || 'N/A'}</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="w-4 h-4 bg-green-600 p-0" />
                  <p className="text-xs font-medium text-gray-600">Estimated Cost</p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{agentRecommendations.costEstimate || 'N/A'}</p>
              </div>
            </div>

            {/* Rationale */}
            {agentRecommendations.rationale && (
              <div className="p-4 bg-blue-100/50 rounded-lg border border-blue-300">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-5 h-5 text-blue-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900 mb-1">Why these recommendations?</p>
                    <p className="text-sm text-blue-800">{agentRecommendations.rationale}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Toggle to use manual configuration */}
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-200">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">Using Agent Recommendations</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUseAgentConfig(!useAgentConfig)}
                className="text-xs"
              >
                {useAgentConfig ? 'Customize Configuration' : 'Use Agent Config'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analysis Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            {journeyType === 'business' && selectedBusinessTemplates.length > 0
              ? 'Select Business Template Workflow Steps'
              : agentRecommendations
              ? 'Review & Adjust Recommended Analyses'
              : 'Select Analyses'}
          </CardTitle>
          <CardDescription>
            {agentRecommendations
              ? '✅ Analyses below were auto-selected based on agent recommendations. You can adjust them if needed.'
              : journeyType === 'non-tech'
              ? '✨ Our AI has recommended these analyses based on your goals. You can adjust the selection below.'
              : journeyType === 'business' && selectedBusinessTemplates.length > 0
              ? '📋 Select workflow steps from your chosen business templates. These are pre-configured for your industry and use case.'
              : 'Choose which analyses to run on your data'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {journeyType === 'business' && (selectedBusinessTemplates.length > 0 || primaryBusinessTemplate) && (
              <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-5 h-5 text-green-700" />
                  <span className="font-semibold text-green-900">Business Templates Active</span>
                </div>
                <p className="text-sm text-green-800 mb-2">
                  The workflow steps below are tailored for your selected business templates:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedBusinessTemplates.map(templateId => (
                    <Badge key={templateId} variant="secondary" className="bg-green-100 text-green-800 border border-green-300">
                      {templateId.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3">
              {analysisOptions.map((analysis) => (
                <div
                  key={analysis.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedAnalyses.includes(analysis.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handleAnalysisToggle(analysis.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900">{analysis.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {analysis.duration}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{analysis.description}</p>
                    </div>
                    {selectedAnalyses.includes(analysis.id) && (
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {selectedAnalyses.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      {selectedAnalyses.length} analysis{selectedAnalyses.length > 1 ? 'es' : ''} selected
                    </p>
                    <p className="text-xs text-blue-700">
                      Estimated duration: {getEstimatedDuration()}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {selectedAnalyses.length} selected
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Journey-specific Configuration */}
      {journeyType === 'non-tech' && selectedAnalyses.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Brain className="w-5 h-5" />
              AI Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700 mb-3">
              Our AI will automatically configure optimal parameters for your selected analyses:
            </p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Best statistical methods for your data type</li>
              <li>Optimal visualization styles</li>
              <li>Automated insight generation</li>
              <li>Plain English explanations</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {journeyType === 'technical' && selectedAnalyses.length > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Settings className="w-5 h-5" />
              Advanced Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-700 mb-3">
              Advanced configuration options available:
            </p>
            <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
              <li>Custom statistical parameters</li>
              <li>Machine learning algorithms</li>
              <li>Cross-validation settings</li>
              <li>Feature selection methods</li>
            </ul>
            <Button variant="outline" size="sm" className="mt-3 border-purple-300 text-purple-700 hover:bg-purple-100">
              Configure Advanced Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Execution Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getExecutionStatusIcon()}
            Analysis Execution
          </CardTitle>
          <CardDescription>
            {getExecutionStatusText()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {executionStatus === 'idle' && (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  Select analyses above to begin execution
                </p>
                <Button
                  onClick={() => {
                    // For non-tech: if no explicit analyses selected, pick defaults
                    if (journeyType === 'non-tech' && selectedAnalyses.length === 0) {
                      const defaults = ['descriptive','correlation','regression'];
                      setSelectedAnalyses(defaults);
                      // Delay execute slightly to allow state update
                      setTimeout(() => handleExecuteAnalysis(), 50);
                      return;
                    }
                    handleExecuteAnalysis();
                  }}
                  disabled={journeyType !== 'non-tech' ? selectedAnalyses.length === 0 : false}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Execute Analysis
                </Button>
              </div>
            )}

            {(executionStatus === 'configuring' || executionStatus === 'running') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Execution Progress</span>
                  <span>{Math.round(executionProgress)}%</span>
                </div>
                <Progress value={executionProgress} className="h-2" />
                
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-blue-600">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">
                      {executionStatus === 'configuring' ? 'Configuring...' : 'Running analysis...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {executionStatus === 'completed' && executionResults && (
              <div className="space-y-4">
                {/* Server Validation Status */}
                {validationStatus === 'validated' && (
                  <div className="p-3 bg-green-50 border-2 border-green-300 rounded-lg">
                    <div className="flex items-center gap-2 text-green-800">
                      <ShieldCheck className="w-5 h-5" />
                      <span className="font-semibold">✅ Results Verified</span>
                      <span className="text-sm">- Server has validated your execution results for pricing</span>
                    </div>
                  </div>
                )}

                {validationStatus === 'validating' && (
                  <div className="p-3 bg-blue-50 border border-blue-300 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-800">
                      <Shield className="w-5 h-5 animate-pulse" />
                      <span className="font-semibold">Validating results with server...</span>
                    </div>
                  </div>
                )}

                {validationStatus === 'failed' && (
                  <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-semibold">⚠️ Validation Failed</span>
                      <span className="text-sm">- Please re-run analysis or contact support</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.totalAnalyses}</p>
                    <p className="text-sm text-green-700">Analyses Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.executionTime}</p>
                    <p className="text-sm text-green-700">Execution Time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.resultsGenerated}</p>
                    <p className="text-sm text-green-700">Results Generated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionSummary.qualityScore}%</p>
                    <p className="text-sm text-green-700">Quality Score</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={handlePreviewResults}
                    disabled={previewLoading || (!executionResults && executionStatus !== 'completed')}
                  >
                    {previewLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    Preview Results
                  </Button>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={handleDownloadArtifacts}
                    disabled={artifactLoading}
                  >
                    {artifactLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download Report
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Execution Summary */}
      {executionStatus === 'completed' && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Analysis Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-800 font-medium mb-3">
              ✅ Your analysis has been completed successfully! Results are ready for review and pricing.
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionSummary.totalAnalyses} analyses completed
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionSummary.resultsGenerated} results generated
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionSummary.qualityScore}% quality score
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}