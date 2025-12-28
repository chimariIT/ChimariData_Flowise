import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Lightbulb,
  CheckCircle,
  ArrowRight,
  Brain,
  MessageCircle,
  Beaker,
  BarChart3,
  Shield,
  AlertCircle,
  Users
} from "lucide-react";
import { useProject } from "@/hooks/useProject";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AgentChatInterface } from "@/components/agent-chat-interface";
import { AudienceDefinitionSection } from "@/components/AudienceDefinitionSection";
import { PMAgentClarificationDialog } from "@/components/PMAgentClarificationDialog";
import { RequiredDataElementsDisplay } from "@/components/RequiredDataElementsDisplay";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useJourneyDataOptional } from "@/contexts/JourneyDataContext";
import { useQueryClient } from "@tanstack/react-query";

interface PrepareStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

// Simple debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export default function PrepareStep({ journeyType, onNext, onPrevious }: PrepareStepProps) {
  const [location, setLocation] = useLocation();

  // Use shared journey context for data continuity between steps
  const journeyContext = useJourneyDataOptional();

  // Extract projectId from URL query params manually since wouter's useRoute might not be set up for query params here
  const getProjectIdFromUrl = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('projectId');
  };

  const urlProjectId = getProjectIdFromUrl();
  const [analysisGoal, setAnalysisGoal] = useState("");
  const [businessQuestions, setBusinessQuestions] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Audience definition state - default based on journey type
  const getDefaultAudienceForJourneyType = (jt: string) => {
    switch (jt) {
      case 'non-tech': return 'ceo';
      case 'business': return 'business_manager';
      case 'technical': return 'data_analyst';
      case 'consultation': return 'consultant';
      default: return 'mixed';
    }
  };
  const [primaryAudience, setPrimaryAudience] = useState<string>(() => getDefaultAudienceForJourneyType(journeyType));
  const [secondaryAudiences, setSecondaryAudiences] = useState<string[]>([]);
  const [decisionContext, setDecisionContext] = useState("");

  // PM Agent conversation state
  const [showPMChat, setShowPMChat] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [pmChatMinimized, setPmChatMinimized] = useState(false);

  // PM Agent Clarification Dialog state
  const [showClarificationDialog, setShowClarificationDialog] = useState(false);
  const [clarificationData, setClarificationData] = useState<any>(null);
  const [loadingClarification, setLoadingClarification] = useState(false);
  const [clarificationCompleted, setClarificationCompleted] = useState(false);

  // GAP F: Researcher Agent state for template recommendations
  const [researcherRecommendations, setResearcherRecommendations] = useState<{
    template?: any;
    confidence?: number;
    marketDemand?: string;
    implementationComplexity?: string;
  } | null>(null);
  const [loadingResearcher, setLoadingResearcher] = useState(false);

  // Required Data Elements state
  const [requiredDataElements, setRequiredDataElements] = useState<any>(null);
  const [loadingDataElements, setLoadingDataElements] = useState(false);
  const [dataElementsError, setDataElementsError] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Centralized project data and state (DEC-003)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => urlProjectId || localStorage.getItem('currentProjectId'));
  const { project, journeyProgress, updateProgress, isLoading: projectLoading, isUpdating } = useProject(currentProjectId || undefined);

  // Track if this is a fresh start
  const [isNewJourney, setIsNewJourney] = useState(false);

  // FIX: Prevent infinite re-render loops (API polling storm)
  const isUpdatingRef = useRef(false);

  // Clear prefilled data when starting a new journey (Fix: old data showing in new journeys)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('new') === 'true') {
      // Clear all cached journey data for fresh start
      localStorage.removeItem('chimari_analysis_goal');
      localStorage.removeItem('chimari_analysis_goals');
      localStorage.removeItem('chimari_analysis_questions');
      localStorage.removeItem('chimari_business_templates');
      localStorage.removeItem('chimari_business_questions');
      localStorage.removeItem('currentProjectId');
      // Reset form state
      setAnalysisGoal('');
      setBusinessQuestions('');
      setSelectedTemplates([]);
      setPrimaryAudience('mixed');
      setSecondaryAudiences([]);
      setDecisionContext('');
      setIsNewJourney(true);
      console.log('🧹 Cleared ALL prefilled data for new journey (including session)');
      // Remove the ?new=true from URL to prevent re-clearing on navigation
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  // Initialize project ID from URL or localStorage
  useEffect(() => {
    if (urlProjectId) {
      localStorage.setItem('currentProjectId', urlProjectId);
      setCurrentProjectId(urlProjectId);
    }
  }, [urlProjectId]);


  // Debounced session updates
  const debouncedGoal = useDebounce(analysisGoal, 500);
  const debouncedQuestions = useDebounce(businessQuestions, 500);

  // Track if initial hydration has been done (prevents infinite loop)
  const hasHydratedRef = useRef(false);
  const lastHydratedProgressIdRef = useRef<string | null>(null);

  // Synchronize local form state with journeyProgress (SSOT) - ONLY ONCE on initial load
  useEffect(() => {
    if (isNewJourney) {
      console.log('🚫 Skipping hydration - new journey started');
      return;
    }

    // Skip if currently updating to prevent write-back loops
    if (isUpdatingRef.current) return;

    // Skip if already hydrated from this journeyProgress version
    const progressId = journeyProgress?.analysisGoal || '';
    if (hasHydratedRef.current && progressId === lastHydratedProgressIdRef.current) {
      return;
    }

    if (journeyProgress) {
      // Only hydrate fields that haven't been filled yet by user
      if (journeyProgress.analysisGoal && !analysisGoal) {
        setAnalysisGoal(journeyProgress.analysisGoal);
      }
      if (journeyProgress.userQuestions?.length && !businessQuestions) {
        setBusinessQuestions(journeyProgress.userQuestions.map(q => q.text).join('\n'));
      }
      if (journeyProgress.audience) {
        if (!primaryAudience || primaryAudience === getDefaultAudienceForJourneyType(journeyType)) {
          setPrimaryAudience(journeyProgress.audience.primary || getDefaultAudienceForJourneyType(journeyType));
        }
        if (secondaryAudiences.length === 0 && journeyProgress.audience.secondary?.length) {
          setSecondaryAudiences(journeyProgress.audience.secondary);
        }
        if (!decisionContext && journeyProgress.audience.decisionContext) {
          setDecisionContext(journeyProgress.audience.decisionContext);
        }
      }

      // Mark as hydrated with current progress version
      hasHydratedRef.current = true;
      lastHydratedProgressIdRef.current = progressId;
      console.log('✅ [SSOT] Hydrated prepare step from journeyProgress');
    }
  }, [isNewJourney, journeyProgress, journeyType]); // Removed analysisGoal/businessQuestions from deps to prevent re-trigger

  // Auto-save to server (replaces localStorage)
  // FIX: Use session?.id instead of session to prevent infinite loop
  // (updateStep updates session object reference, which would re-trigger this effect)
  // Auto-save to journeyProgress (SSOT)
  // P0-2 FIX: Added isSaving state and lastSavedRef to prevent infinite loops
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (!currentProjectId) return;
    if (!analysisGoal && !businessQuestions && !decisionContext) return;
    if (isSaving) return;
    if (isUpdatingRef.current) return;

    // Create a signature of current values to compare
    const currentQuestions = businessQuestions
      .split('\n')
      .map((q, i) => ({ id: `q-${i}`, text: q.trim() }))
      .filter(q => q.text.length > 0);

    const dataToSave = JSON.stringify({
      goal: analysisGoal || '',
      questions: currentQuestions.map(q => q.text),
      audience: {
        primary: primaryAudience,
        secondary: secondaryAudiences,
        decisionContext
      }
    });

    // Skip if data hasn't changed from last saved
    if (dataToSave === lastSavedRef.current) return;

    // Also check against server state to avoid unnecessary updates
    const serverQuestions = journeyProgress?.userQuestions || [];
    const questionsChanged = JSON.stringify(currentQuestions.map(q => q.text)) !== JSON.stringify(serverQuestions.map(q => q.text));
    const goalChanged = (analysisGoal || '') !== (journeyProgress?.analysisGoal || '');
    const audienceChanged =
      (primaryAudience || '') !== (journeyProgress?.audience?.primary || '') ||
      JSON.stringify(secondaryAudiences || []) !== JSON.stringify(journeyProgress?.audience?.secondary || []) ||
      (decisionContext || '') !== (journeyProgress?.audience?.decisionContext || '');

    if (!questionsChanged && !goalChanged && !audienceChanged) {
      // Update lastSavedRef to current state to prevent re-checking
      lastSavedRef.current = dataToSave;
      return;
    }

    const saveData = async () => {
      try {
        setIsSaving(true);
        isUpdatingRef.current = true;
        lastSavedRef.current = dataToSave;

        await updateProgress({
          analysisGoal,
          userQuestions: currentQuestions,
          audience: {
            primary: primaryAudience,
            secondary: secondaryAudiences,
            decisionContext
          },
          currentStep: 'prepare'
        });
      } catch (error) {
        console.error('Failed to save prepare data:', error);
        // On error, reset lastSavedRef to allow retry
        lastSavedRef.current = '';
      } finally {
        // Add a small delay before clearing the lock to allow server response to settle
        setTimeout(() => {
          isUpdatingRef.current = false;
          setIsSaving(false);
        }, 500);
      }
    };

    const timeoutId = setTimeout(saveData, 2000); // Debounce to 2s to reduce frequency
    return () => clearTimeout(timeoutId);
  }, [analysisGoal, businessQuestions, primaryAudience, secondaryAudiences, decisionContext, currentProjectId, isSaving, updateProgress]); // Removed journeyProgress from deps to prevent re-trigger

  // Backwards compatibility: Also cache in localStorage for offline access
  useEffect(() => {
    if (analysisGoal) {
      try { localStorage.setItem('chimari_analysis_goal', analysisGoal); } catch { }
    }
  }, [analysisGoal]);

  useEffect(() => {
    if (businessQuestions) {
      try { localStorage.setItem('chimari_business_questions', businessQuestions); } catch { }
    }
  }, [businessQuestions]);

  // Track last saved values to prevent infinite loops for localStorage saves
  const lastSavedLocalStorageRef = useRef<string>('');
  const saveLocalStorageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save goals and questions for agent recommendations (with ROBUST infinite loop prevention)
  // P0-2 FIX: Improved debounce and signature checking
  useEffect(() => {
    if (!analysisGoal || !businessQuestions) return;

    // Create a signature of current values
    const currentSignature = `${analysisGoal}::${businessQuestions}`;

    // Skip if nothing changed (prevents infinite loop)
    if (currentSignature === lastSavedLocalStorageRef.current) return;

    // Clear any pending save timeout to debounce
    if (saveLocalStorageTimeoutRef.current) {
      clearTimeout(saveLocalStorageTimeoutRef.current);
    }

    // Debounce the save operation by 1 second
    saveLocalStorageTimeoutRef.current = setTimeout(() => {
      try {
        // Double-check the signature hasn't changed during debounce
        const checkSignature = `${analysisGoal}::${businessQuestions}`;
        if (checkSignature === lastSavedLocalStorageRef.current) {
          return; // Already saved
        }

        // Extract questions from the business questions text
        const questions = businessQuestions
          .split('\n')
          .map(q => q.trim())
          .filter(q => q.length > 0);

        // Save in the format expected by agent recommendations
        localStorage.setItem('chimari_analysis_goals', JSON.stringify([analysisGoal]));
        localStorage.setItem('chimari_analysis_questions', JSON.stringify(questions));

        // Update ref AFTER successful save to prevent re-trigger
        lastSavedLocalStorageRef.current = checkSignature;
      } catch (error) {
        console.error('Failed to save goals/questions for agent recommendations:', error);
      }
    }, 1000); // 1 second debounce

    // Cleanup timeout on unmount or re-run
    return () => {
      if (saveLocalStorageTimeoutRef.current) {
        clearTimeout(saveLocalStorageTimeoutRef.current);
      }
    };
  }, [analysisGoal, businessQuestions]);

  // Fetch AI question suggestions for non-tech users
  useEffect(() => {
    if (journeyType !== 'non-tech' || !analysisGoal || analysisGoal.length < 10) {
      setAiSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch('/api/project-manager/suggest-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            goal: analysisGoal,
            journeyType
          })
        });

        if (response.ok) {
          const data = await response.json();
          setAiSuggestions(data.suggestions || []);
        }
      } catch (error) {
        console.error('Failed to fetch AI suggestions:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timer);
  }, [analysisGoal, journeyType]);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Analysis Preparation",
          description: "Let our AI help you define your analysis goals and questions",
          icon: Brain,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Analysis Preparation",
          description: "Define your business questions and select relevant templates",
          icon: Target,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Analysis Preparation",
          description: "Define your technical requirements and analysis parameters",
          icon: Lightbulb,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Consultation Preparation",
          description: "Prepare for your expert consultation session",
          icon: MessageCircle,
          color: "yellow"
        };
      default:
        return {
          title: "Analysis Preparation",
          description: "Define your analysis goals and requirements",
          icon: Target,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  // Load enhanced capabilities and business templates when in business journey
  useEffect(() => {
    if (journeyType !== 'business') return;
    let cancelled = false;
    async function loadTemplates() {
      setLoadingTemplates(true);
      setTemplateError(null);
      try {
        // Lazy import to avoid circular dependencies
        const { apiClient } = await import("@/lib/api");
        const caps = await apiClient.getEnhancedCapabilities();
        console.log('Enhanced capabilities response:', caps);

        const list = Array.isArray(caps?.businessTemplates) ? caps.businessTemplates : [];
        console.log('Business templates list:', list);

        if (!cancelled) {
          const mapped = list.map((t: any) => ({
            id: t.templateId || t.id,
            name: t.name,
            description: t.description || (t.sections?.[0]?.description) || ''
          }));
          console.log('Mapped templates:', mapped);

          setAvailableTemplates(mapped);

          // Only restore from localStorage if no journeyProgress data exists
          if (!journeyProgress?.selectedAnalysisTypes || journeyProgress.selectedAnalysisTypes.length === 0) {
            const saved = localStorage.getItem('chimari_business_templates');
            console.log('Saved templates from localStorage:', saved);

            if (saved) {
              try {
                const parsed = JSON.parse(saved);
                console.log('Parsed saved templates:', parsed);
                setSelectedTemplates(parsed);
              } catch (error) {
                console.error('Failed to parse saved templates:', error);
              }
            }
          } else {
            console.log('Using journeyProgress instead of localStorage:', journeyProgress.selectedAnalysisTypes);
            setSelectedTemplates(journeyProgress.selectedAnalysisTypes);
          }
        }
      } catch (e: any) {
        console.error('Template loading error:', e);
        if (!cancelled) setTemplateError(e?.message || 'Failed to load templates');
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    }
    loadTemplates();
    return () => { cancelled = true; };
  }, [journeyType]);

  const handleTemplateToggle = (templateId: string) => {
    setSelectedTemplates(prev => {
      const next = prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId];

      // Persist selection to journeyProgress (SSOT)
      if (currentProjectId) {
        updateProgress({
          selectedAnalysisTypes: next,
          currentStep: 'prepare'
        });
      }
      return next;
    });
  };

  const isFormValid = () => {
    if (journeyType === 'business') {
      return analysisGoal.trim() && businessQuestions.trim() && selectedTemplates.length > 0;
    }
    return analysisGoal.trim() && businessQuestions.trim();
  };

  // Generate required data elements from goals/questions
  const generateDataRequirements = async () => {
    // CRITICAL FIX: Use currentProjectId from useProject hook (most reliable source)
    // Also check URL and localStorage as fallbacks
    const projectId = currentProjectId || urlProjectId || localStorage.getItem('currentProjectId');

    // CRITICAL FIX: Check both state and journeyProgress for goal (state might not be updated yet)
    const effectiveGoal = analysisGoal.trim() || (journeyProgress as any)?.analysisGoal || '';
    
    if (!projectId) {
      console.warn('Cannot generate data requirements: missing project ID', {
        currentProjectId,
        urlProjectId,
        localStorageId: localStorage.getItem('currentProjectId')
      });
      return;
    }

    if (!effectiveGoal.trim()) {
      console.warn('Cannot generate data requirements: missing goal', {
        analysisGoalState: analysisGoal,
        journeyProgressGoal: (journeyProgress as any)?.analysisGoal
      });
      return;
    }

    setLoadingDataElements(true);
    setDataElementsError(null);

    try {
      console.log('📋 Generating required data elements from goals/questions...', {
        projectId,
        goal: effectiveGoal,
        goalSource: analysisGoal.trim() ? 'state' : 'journeyProgress'
      });

      // CRITICAL FIX: Use effectiveGoal (from state or journeyProgress) instead of just analysisGoal state
      const userGoals = effectiveGoal.split('.').map((g: string) => g.trim()).filter((g: string) => g);
      // Also check journeyProgress for questions if businessQuestions state is empty
      const effectiveQuestions = businessQuestions.trim() || 
                                  (journeyProgress as any)?.userQuestions?.map((q: any) => q.text).join('\n') || '';
      const userQuestions = effectiveQuestions.split('\n').map((q: string) => q.trim()).filter((q: string) => q);

      if (userQuestions.length > 0) {
        try {
          // Update journeyProgress with goals and questions (SSOT)
          // CRITICAL FIX: Use effectiveGoal to ensure we save the correct goal (from state or journeyProgress)
          updateProgress({
            analysisGoal: effectiveGoal,
            userQuestions: userQuestions.map((q: string, i: number) => ({ id: `q-${i}`, text: q })),
            currentStep: 'prepare'
          });
          console.log('✅ [SSOT] Persisted goals and questions to journeyProgress');
        } catch (persistError) {
          console.warn('⚠️ Failed to persist questions to journeyProgress, continuing anyway:', persistError);
        }

        // FIX: Production Readiness - Also save questions to project_questions table
        // This ensures analysis execution can link answers back to questions with stable IDs
        try {
          await apiClient.post(`/api/projects/${projectId}/questions`, {
            questions: userQuestions
          });
          console.log('✅ [Evidence Chain] Saved questions to project_questions table for analysis linking');
        } catch (questionsError) {
          console.warn('⚠️ Failed to save questions to project_questions table:', questionsError);
          // Continue anyway - analysis can still work with fallback
        }
      }

      // GAP F: Call Researcher Agent to find matching templates BEFORE generating requirements
      // This helps guide the DS agent with relevant analysis patterns
      setLoadingResearcher(true);
      try {
        console.log('🔍 [GAP F] Calling Researcher Agent to find relevant templates...');
        const researcherResponse = await apiClient.post(`/api/projects/${projectId}/recommend-templates`, {
          businessGoals: userGoals,
          userQuestions,
          journeyType
        });

        if (researcherResponse.success && researcherResponse.recommendations) {
          setResearcherRecommendations(researcherResponse.recommendations);
          console.log('✅ [GAP F] Researcher found template recommendations:', researcherResponse.recommendations);
        }
      } catch (researcherError) {
        console.warn('⚠️ [GAP F] Researcher agent not available, continuing without template recommendations:', researcherError);
      } finally {
        setLoadingResearcher(false);
      }

      // Now generate requirements (DS + BA + PM agents collaborate)
      const data = await apiClient.post(`/api/projects/${projectId}/generate-data-requirements`, {
        userGoals,
        userQuestions,
        // GAP F: Pass researcher recommendations to help guide DS analysis planning
        researcherContext: researcherRecommendations
      });

      if (data.success && data.document) {
        setRequiredDataElements(data.document);

        // CRITICAL FIX: Backend endpoint already stores requirementsDocument AND sets requirementsLocked: true
        // We should NOT call updateProgress immediately because it can race with the backend's atomic JSONB update
        // Wait a bit for the backend's atomic JSONB update to complete before calling updateProgress
        
        // Wait for backend's atomic JSONB update to complete (prevents race condition)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Refresh project data to verify lock was set
        try {
          const verifyProject = await apiClient.get(`/api/projects/${projectId}`);
          const verifyProgress = (verifyProject as any)?.journeyProgress;
          const isLocked = verifyProgress?.requirementsLocked === true;
          const hasDocument = !!verifyProgress?.requirementsDocument;
          
          if (isLocked && hasDocument) {
            console.log('✅ [SSOT] Verified: Requirements document locked successfully by backend');
            // Update local state to match backend
            setRequiredDataElements(verifyProgress.requirementsDocument);
            // CRITICAL FIX: Invalidate React Query cache so Verification step sees the updated requirementsDocument
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
            console.log('✅ [SSOT] Invalidated project query cache to refresh requirementsDocument');
          } else {
            console.warn('⚠️ [SSOT] Warning: Requirements document not locked yet - backend may still be processing, retrying...');
            // Retry after another delay
            setTimeout(async () => {
              try {
                const retryProject = await apiClient.get(`/api/projects/${projectId}`);
                const retryProgress = (retryProject as any)?.journeyProgress;
                if (retryProgress?.requirementsLocked === true && retryProgress?.requirementsDocument) {
                  console.log('✅ [SSOT] Verified on retry: Requirements document locked successfully');
                  setRequiredDataElements(retryProgress.requirementsDocument);
                  // CRITICAL FIX: Invalidate cache on retry as well
                  queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                }
              } catch (retryError) {
                console.warn('⚠️ Could not verify requirements lock status on retry:', retryError);
              }
            }, 500);
          }
        } catch (verifyError) {
          console.warn('⚠️ Could not verify requirements lock status:', verifyError);
        }
        
        // Only update currentStep AFTER verifying lock is set (backend handles requirementsDocument)
        // The PATCH endpoint now has protection to preserve the lock
        await updateProgress({
          currentStep: 'prepare'
        });

        console.log('✅ [SSOT] Generated data requirements - backend will persist and lock the document');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Failed to generate data requirements:', error);
      setDataElementsError(error.message || 'Failed to generate data requirements');
      toast({
        title: "Error",
        description: "Failed to generate data requirements. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoadingDataElements(false);
    }
  };

  // NOTE: Data requirements are now generated AFTER PM clarifications are submitted
  // See onConfirm callback in PMAgentClarificationDialog below

  return (
    <div className="space-y-6">
      {/* Project Status Indicator */}
      {project && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-green-800">
              <Shield className="w-4 h-4" />
              <span>
                <strong>Project Connected</strong> - Your progress is automatically synced to the server.
                {isUpdating && <span className="ml-2 text-green-600">Syncing...</span>}
              </span>
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

      {/* Analysis Goal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            🎯 What Do You Want to Learn?
          </CardTitle>
          <CardDescription>
            Tell us about your goals in plain language. This helps our AI recommend the best analysis approach.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="analysis-goal">Describe your goals</Label>
              <Textarea
                id="analysis-goal"
                placeholder="For example: 'I want to understand why sales dropped last quarter' or 'I need to find patterns in customer behavior' or 'I want to know if our marketing campaign worked'..."
                value={analysisGoal}
                onChange={(e) => setAnalysisGoal(e.target.value)}
                className="mt-2"
                rows={4}
              />
            </div>

            {journeyType === 'non-tech' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">AI Question Suggestions</span>
                </div>

                {loadingSuggestions && (
                  <p className="text-sm text-blue-700">Generating suggestions...</p>
                )}

                {!loadingSuggestions && aiSuggestions.length === 0 && analysisGoal.length >= 10 && (
                  <p className="text-sm text-blue-700">
                    Based on your goal, our AI will suggest relevant questions to explore.
                  </p>
                )}

                {!loadingSuggestions && aiSuggestions.length === 0 && analysisGoal.length < 10 && (
                  <p className="text-sm text-blue-700">
                    Type at least 10 characters in your goal to get AI-powered question suggestions.
                  </p>
                )}

                {!loadingSuggestions && aiSuggestions.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <p className="text-sm text-blue-700 mb-2">
                      Click a suggestion to add it to your questions:
                    </p>
                    {aiSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setBusinessQuestions(prev =>
                            prev ? `${prev}\n- ${suggestion}` : `- ${suggestion}`
                          );
                        }}
                        className="w-full text-left px-3 py-2 bg-white border border-blue-300 rounded hover:bg-blue-100 transition-colors text-sm text-gray-800"
                      >
                        <span className="text-blue-600 mr-2">✦</span>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audience Definition */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            👥 Who Will Use These Results?
          </CardTitle>
          <CardDescription>
            Understanding your audience helps us format insights appropriately and focus on what matters most to them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AudienceDefinitionSection
            primaryAudience={primaryAudience}
            setPrimaryAudience={setPrimaryAudience}
            decisionContext={decisionContext}
            setDecisionContext={setDecisionContext}
          />
        </CardContent>
      </Card>

      {/* Business Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            Initial Questions (Optional)
          </CardTitle>
          <CardDescription>
            Do you have any specific questions in mind? You can refine these later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="business-questions">Any initial questions? (You'll refine these in Step 4)</Label>
              <Textarea
                id="business-questions"
                placeholder="For example: 'Who are our most valuable customers?' or 'What factors drive sales?' or 'How can we reduce churn?'..."
                value={businessQuestions}
                onChange={(e) => setBusinessQuestions(e.target.value)}
                className="mt-2"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-2">
                💡 Tip: Start broad here. Our AI will help you refine specific questions in the Analysis step.
              </p>
            </div>

            {journeyType === 'technical' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-900">Technical Note</span>
                </div>
                <p className="text-sm text-purple-700">
                  Be specific about statistical methods, data requirements, and expected outputs for optimal results.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Required Data Elements Display */}
      {loadingDataElements && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-blue-900">Analyzing your goals and identifying required data elements...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {requiredDataElements && !loadingDataElements && (
        <RequiredDataElementsDisplay
          analysisPath={requiredDataElements.analysisPath || []}
          requiredDataElements={requiredDataElements.requiredDataElements || []}
          completeness={requiredDataElements.completeness}
          status={requiredDataElements.status}
        />
      )}

      {dataElementsError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <span>Failed to generate data requirements: {dataElementsError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PM Agent Clarification (Optional) */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600" />
            Get PM Agent Help (Optional)
          </CardTitle>
          <CardDescription>
            Our Project Manager Agent can help refine your goals, suggest improvements, and ask clarifying questions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showPMChat ? (
            <div className="space-y-4">
              <div className="bg-white border border-indigo-200 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="bg-indigo-100 rounded-full p-2">
                    <Brain className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      How the PM Agent Can Help
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <span>Summarize and validate your analysis goals</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <span>Ask clarifying questions to ensure requirements are clear</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <span>Suggest additional considerations for your audience</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                        <span>Help structure complex analysis questions</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!analysisGoal.trim()) {
                      alert('Please enter your analysis goal first');
                      return;
                    }

                    setLoadingClarification(true);
                    setShowClarificationDialog(true);

                    try {
                      const response = await fetch('/api/project-manager/clarify-goal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          projectId: currentProjectId,
                          analysisGoal,
                          businessQuestions,
                          journeyType
                        })
                      });

                      console.log('PM Clarification Response Status:', response.status, response.statusText);

                      if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                        console.error('PM Clarification Error Response:', errorData);
                        throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
                      }

                      const data = await response.json();
                      console.log('PM Clarification Response Data:', data);

                      if (data.clarification) {
                        setClarificationData(data.clarification);
                      } else {
                        console.warn('No clarification data in response:', data);
                        // Still show dialog with what we got
                        setClarificationData({
                          summary: data.content || 'Clarification received',
                          suggestedFocus: '',
                          dataRequirements: [],
                          estimatedComplexity: 'moderate'
                        });
                      }
                    } catch (error: any) {
                      console.error('Clarification failed:', error);
                      console.error('Error details:', {
                        message: error.message,
                        stack: error.stack,
                        analysisGoal,
                        businessQuestions,
                        journeyType
                      });
                      alert(`Failed to get PM Agent clarification: ${error.message}\n\nCheck browser console for details.`);
                      setShowClarificationDialog(false);
                    } finally {
                      setLoadingClarification(false);
                    }
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  disabled={!analysisGoal.trim() || clarificationCompleted}
                >
                  <Brain className="w-4 h-4 mr-2" />
                  {clarificationCompleted ? '✓ Clarification Complete' : 'Get PM Agent Clarification'}
                </Button>
                <Button
                  onClick={() => setShowPMChat(true)}
                  variant="outline"
                  className="flex-1"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Full Chat Mode
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <AgentChatInterface
                projectId={currentProjectId ?? undefined}
                conversationId={conversationId}
                initialGoals={analysisGoal ? [analysisGoal] : []}
                onGoalsConfirmed={(goals) => {
                  // Update analysis goal with confirmed goals
                  if (goals.length > 0) {
                    const confirmedGoalStatements = goals
                      .filter(g => g.status === 'confirmed')
                      .map(g => g.statement)
                      .join('\n\n');
                    if (confirmedGoalStatements) {
                      setAnalysisGoal(confirmedGoalStatements);
                    }
                  }
                }}
                minimized={pmChatMinimized}
                onMinimizeToggle={(minimized) => setPmChatMinimized(minimized)}
              />
              <Button
                variant="outline"
                onClick={() => setShowPMChat(false)}
                className="w-full"
              >
                Close PM Agent Chat
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Business Templates (for business journey) */}
      {journeyType === 'business' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Business Templates
            </CardTitle>
            <CardDescription>
              Select relevant business analysis templates to guide your analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading templates...</span>
              </div>
            ) : templateError ? (
              <div className="text-center py-8">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-600 mb-2">Failed to load templates</p>
                <p className="text-sm text-gray-500">{templateError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            ) : availableTemplates.length === 0 ? (
              <div className="text-center py-8">
                <Target className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No templates available</p>
                <p className="text-sm text-gray-500">Templates will be loaded automatically</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {availableTemplates.map((template, index) => (
                  <div
                    key={`template-${template.id}-${index}`}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedTemplates.includes(template.id)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    onClick={() => {
                      console.log('Template clicked:', template.id, template.name);
                      handleTemplateToggle(template.id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{template.name}</h4>
                        {template.description && (
                          <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                        )}
                      </div>
                      {selectedTemplates.includes(template.id) && (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedTemplates.length > 0 && (
              <div className="mt-4">
                <Label>Selected Templates:</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTemplates.map((templateId) => {
                    const template = availableTemplates.find(t => t.id === templateId);
                    return (
                      <Badge key={templateId} variant="secondary" className="bg-green-100 text-green-800">
                        {template?.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Consultation Preparation (for consultation journey) */}
      {journeyType === 'consultation' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Consultation Preparation
            </CardTitle>
            <CardDescription>
              Prepare for your expert consultation session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-900">Expert Consultation</span>
              </div>
              <p className="text-sm text-yellow-700 mb-3">
                Our data science experts will review your goals and questions to provide personalized guidance and recommendations.
              </p>
              <div className="text-sm text-yellow-700">
                <p className="font-medium mb-1">What to expect:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>1-on-1 video consultation with senior data scientists</li>
                  <li>Custom analysis strategy tailored to your needs</li>
                  <li>Real-time collaboration and guidance</li>
                  <li>Follow-up summary report with recommendations</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-900">
            <CheckCircle className="w-5 h-5" />
            Preparation Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className={analysisGoal.trim() ? 'text-green-800' : 'text-gray-500'}>
                Analysis goal defined
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className={businessQuestions.trim() ? 'text-green-800' : 'text-gray-500'}>
                Key questions identified
              </span>
            </div>
            {journeyType === 'business' && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className={selectedTemplates.length > 0 ? 'text-green-800' : 'text-gray-500'}>
                  Business templates selected ({selectedTemplates.length})
                </span>
              </div>
            )}
          </div>

          {isFormValid() && (
            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg">
              <p className="text-sm text-green-800 font-medium">
                ✅ Ready to proceed to project setup!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role-specific helper blocks */}
      {journeyType === 'non-tech' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Plain-language coaching</span>
          </div>
          <p className="text-sm text-blue-700">
            Write naturally. For example: “Help me compare average sales by region and month.” We’ll map it to the right analysis.
          </p>
        </div>
      )}

      {journeyType === 'business' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-900">Template spotlight</span>
          </div>
          <p className="text-sm text-green-700">
            Try “Sales Performance Analysis” to auto-configure revenue, growth, and retention KPIs.
          </p>
        </div>
      )}

      {journeyType === 'technical' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Beaker className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-900">Advanced quick links</span>
          </div>
          <ul className="list-disc list-inside text-sm text-purple-700 space-y-1">
            <li>Configure ANOVA/Regression in Execute</li>
            <li>Enable ML pipeline and feature importance</li>
            <li>Export Python/R code in Results</li>
          </ul>
        </div>
      )}

      {/* PM Agent Clarification Dialog */}
      <PMAgentClarificationDialog
        open={showClarificationDialog}
        onClose={() => {
          setShowClarificationDialog(false);
          setClarificationData(null);
        }}
        onConfirm={async (answers, refinedGoal) => {
          try {
            // CRITICAL FIX: Close dialog first and update local state regardless of projectId
            // This prevents user from being stuck if projectId is missing
            if (refinedGoal) {
              setAnalysisGoal(refinedGoal);
            }
            setClarificationCompleted(true);
            setShowClarificationDialog(false);
            setClarificationData(null);

            // Check for projectId and warn if missing
            const effectiveProjectId = currentProjectId || urlProjectId || localStorage.getItem('currentProjectId');
            if (!effectiveProjectId) {
              console.warn('⚠️ [Clarification] No project ID found - clarification saved locally but not persisted');
              toast({
                title: "Clarification Saved Locally",
                description: "No project found. Your answers are saved. Please ensure a project is created before proceeding.",
                variant: "default"
              });
              return;
            }

            // Update journeyProgress with refined goal and answers (SSOT)
            updateProgress({
              analysisGoal: refinedGoal || analysisGoal,
              // Store clarification answers in a way that matches schema if needed,
              // for now we'll just update the goal
              currentStep: 'prepare'
            });

            console.log('✅ Clarification saved to journeyProgress');

            // Generate required data elements based on goals/questions
            // Wrap in try-catch so dialog stays closed even if this fails
            try {
              await generateDataRequirements();
            } catch (genError) {
              console.warn('⚠️ [Clarification] Failed to generate requirements, user can proceed manually:', genError);
              toast({
                title: "Requirements Generation Delayed",
                description: "Clarification saved. Requirements will be generated when you proceed to the next step.",
                variant: "default"
              });
            }
          } catch (error: any) {
            console.error('Failed to save clarification:', error);
            // Still close the dialog so user isn't stuck
            setShowClarificationDialog(false);
            setClarificationData(null);
            toast({
              title: "Error Saving Clarification",
              description: error.message || "Failed to save clarification. Please try again.",
              variant: "destructive"
            });
          }
        }}
        clarificationData={clarificationData}
        isLoading={loadingClarification}
      />

      {/* Navigation Buttons */}
      {(onNext || onPrevious) && (
        <div className="flex items-center justify-between pt-6 border-t mt-6">
          {onPrevious && (
            <Button variant="outline" onClick={onPrevious}>
              <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
              Previous Step
            </Button>
          )}
          {onNext && (
            <Button
              onClick={async () => {
                // Validate required fields
                if (!analysisGoal.trim()) {
                  toast({
                    title: "Analysis Goal Required",
                    description: "Please enter an analysis goal before continuing.",
                    variant: "destructive"
                  });
                  return;
                }

                if (!businessQuestions.trim()) {
                  toast({
                    title: "Business Questions Required",
                    description: "Please enter at least one business question before continuing.",
                    variant: "destructive"
                  });
                  return;
                }

                // Auto-generate requirements document before proceeding
                // This ensures Verification, Transformation, and Execute steps have data
                if (!requiredDataElements && analysisGoal.trim() && businessQuestions.trim()) {
                  console.log('📋 [Auto-Generate] Generating requirements before navigation...');
                  try {
                    await generateDataRequirements();
                  } catch (error) {
                    console.warn('⚠️ [Auto-Generate] Failed to generate requirements, proceeding anyway:', error);
                  }
                }

                // Prepare step data
                const currentQuestions = businessQuestions.split('\n').filter(q => q.trim()).map((q, i) => ({
                  id: `q-${i}`,
                  text: q.trim()
                }));

                // Mark step as complete and save all step data
                try {
                  updateProgress({
                    currentStep: 'data-verification',
                    completedSteps: [...(journeyProgress?.completedSteps || []), 'prepare'],
                    analysisGoal: analysisGoal.trim(),
                    userQuestions: currentQuestions,
                    audience: {
                      primary: primaryAudience,
                      secondary: secondaryAudiences,
                      decisionContext: decisionContext.trim() || undefined
                    },
                    selectedAnalysisTypes: selectedTemplates,
                    stepTimestamps: {
                      ...(journeyProgress?.stepTimestamps || {}),
                      prepareCompleted: new Date().toISOString()
                    }
                  });

                  // Navigate to next step
                  if (onNext) {
                    onNext();
                  }
                } catch (error: any) {
                  console.error('Failed to save prepare step progress:', error);
                  toast({
                    title: "Error Saving Progress",
                    description: error.message || "Failed to save step completion. Please try again.",
                    variant: "destructive"
                  });
                }
              }}
              className="ml-auto bg-blue-600 hover:bg-blue-700"
              disabled={!analysisGoal.trim() || !businessQuestions.trim() || loadingDataElements || isUpdating}
            >
              {loadingDataElements ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Generating Requirements...
                </>
              ) : isUpdating ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  Continue to Data Verification
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}