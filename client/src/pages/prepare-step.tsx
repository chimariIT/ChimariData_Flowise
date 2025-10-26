import { useEffect, useState } from "react";
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
  Users,
  Building,
  TrendingUp
} from "lucide-react";
import { useProjectSession } from "@/hooks/useProjectSession";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AgentChatInterface } from "@/components/agent-chat-interface";
import { AudienceDefinitionSection } from "@/components/AudienceDefinitionSection";
import { PMAgentClarificationDialog } from "@/components/PMAgentClarificationDialog";

interface PrepareStepProps {
  journeyType: string;
}

export default function PrepareStep({ journeyType }: PrepareStepProps) {
  const [analysisGoal, setAnalysisGoal] = useState("");
  const [businessQuestions, setBusinessQuestions] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Audience definition state
  const [primaryAudience, setPrimaryAudience] = useState<string>("mixed");
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

  // Multi-Agent Dataset Recommendations state
  const [datasetAdvice, setDatasetAdvice] = useState<any>(null);
  const [loadingDatasetAdvice, setLoadingDatasetAdvice] = useState(false);
  const [datasetAdviceError, setDatasetAdviceError] = useState<string | null>(null);

  // Secure server-side session management
  const {
    session,
    updateStep,
    getPrepareData,
    loading: sessionLoading,
    error: sessionError
  } = useProjectSession({
    journeyType: journeyType as 'non-tech' | 'business' | 'technical' | 'consultation'
  });

  // Load existing session data on mount
  useEffect(() => {
    const existingData = getPrepareData();
    console.log('Loading session data:', existingData);
    if (existingData) {
      setAnalysisGoal(existingData.analysisGoal || '');
      setBusinessQuestions(existingData.businessQuestions || '');
      if (existingData.selectedTemplates && existingData.selectedTemplates.length > 0) {
        console.log('Setting templates from session:', existingData.selectedTemplates);
        setSelectedTemplates(existingData.selectedTemplates);
      }
      // Load audience data
      if (existingData.audience) {
        setPrimaryAudience(existingData.audience.primaryAudience || 'mixed');
        setSecondaryAudiences(existingData.audience.secondaryAudiences || []);
        setDecisionContext(existingData.audience.decisionContext || '');
      }
    }
  }, [getPrepareData]);

  // Auto-save to server (replaces localStorage)
  useEffect(() => {
    if (session && (analysisGoal || businessQuestions || selectedTemplates.length > 0 || primaryAudience || decisionContext)) {
      const saveData = async () => {
        try {
          await updateStep('prepare', {
            analysisGoal,
            businessQuestions,
            selectedTemplates,
            audience: {
              primaryAudience,
              secondaryAudiences,
              decisionContext
            },
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('Failed to save prepare data:', error);
        }
      };

      // Debounce server saves (save 500ms after user stops typing)
      const timeoutId = setTimeout(saveData, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [analysisGoal, businessQuestions, selectedTemplates, primaryAudience, secondaryAudiences, decisionContext, session, updateStep]);

  // Backwards compatibility: Also cache in localStorage for offline access
  useEffect(() => {
    if (analysisGoal) {
      try { localStorage.setItem('chimari_analysis_goal', analysisGoal); } catch {}
    }
  }, [analysisGoal]);

  useEffect(() => {
    if (businessQuestions) {
      try { localStorage.setItem('chimari_business_questions', businessQuestions); } catch {}
    }
  }, [businessQuestions]);

  // Save goals and questions for agent recommendations
  useEffect(() => {
    if (analysisGoal && businessQuestions) {
      try {
        // Extract questions from the business questions text
        const questions = businessQuestions
          .split('\n')
          .map(q => q.trim())
          .filter(q => q.length > 0);
        
        // Save in the format expected by agent recommendations
        localStorage.setItem('chimari_analysis_goals', JSON.stringify([analysisGoal]));
        localStorage.setItem('chimari_analysis_questions', JSON.stringify(questions));
        console.log('💾 Saved goals and questions for agent recommendations:', { goals: [analysisGoal], questions });
      } catch (error) {
        console.error('Failed to save goals/questions for agent recommendations:', error);
      }
    }
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
          
          // Only restore from localStorage if no session data exists
          const sessionData = getPrepareData();
          if (!sessionData?.selectedTemplates || sessionData.selectedTemplates.length === 0) {
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
            console.log('Using session data instead of localStorage:', sessionData.selectedTemplates);
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
    console.log('Toggling template:', templateId);
    console.log('Current selected templates:', selectedTemplates);
    
    setSelectedTemplates(prev => {
      const next = prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId];
      
      console.log('New selected templates:', next);
      
      // Persist selection to localStorage for later steps (execute/results)
      try { 
        localStorage.setItem('chimari_business_templates', JSON.stringify(next));
        console.log('Saved to localStorage:', next);
        
        // Also save to session for server-side persistence
        if (session) {
          updateStep('prepare', {
            analysisGoal,
            businessQuestions,
            selectedTemplates: next,
            timestamp: new Date().toISOString()
          }).catch(console.error);
        }
      } catch (error) {
        console.error('Failed to save templates:', error);
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

  // Fetch dataset recommendations from multi-agent consultation
  const fetchDatasetRecommendations = async (clarificationAnswers: Record<string, string>) => {
    if (!session?.id || !analysisGoal.trim()) {
      console.warn('Cannot fetch dataset recommendations: missing session or goal');
      return;
    }

    setLoadingDatasetAdvice(true);
    setDatasetAdviceError(null);

    try {
      console.log('🔄 Fetching dataset recommendations from multi-agent consultation...');

      const response = await fetch('/api/project-manager/recommend-datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: session.id,
          analysisGoal,
          businessQuestions,
          clarificationAnswers
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get dataset recommendations');
      }

      const data = await response.json();

      if (data.success) {
        setDatasetAdvice(data.advice);
        console.log('✅ Dataset recommendations received:', data.advice);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('Failed to fetch dataset recommendations:', error);
      setDatasetAdviceError(error.message || 'Failed to get recommendations');
    } finally {
      setLoadingDatasetAdvice(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Secure Session Indicator */}
      {session && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm text-green-800">
              <Shield className="w-4 h-4" />
              <span>
                <strong>Secure Session Active</strong> - Your data is encrypted and saved to the server.
                {sessionLoading && <span className="ml-2 text-green-600">Saving...</span>}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {sessionError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-red-800 text-sm">
            ⚠️ Session sync error: {sessionError}. Your data is still cached locally.
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
                          sessionId: session?.id,
                          analysisGoal,
                          businessQuestions,
                          journeyType
                        })
                      });

                      if (!response.ok) {
                        throw new Error('Failed to get clarification');
                      }

                      const data = await response.json();
                      setClarificationData(data.clarification);
                    } catch (error: any) {
                      console.error('Clarification failed:', error);
                      alert('Failed to get PM Agent clarification. Please try again.');
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
                projectId={session?.projectId}
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

      {/* Dataset Recommendations from Multi-Agent Consultation */}
      {clarificationCompleted && (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              📊 Expert Team Recommendations
            </CardTitle>
            <CardDescription>
              Our Business, Data Engineering, and Data Science agents have consulted and provided advice
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDatasetAdvice ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                <span className="ml-2 text-gray-700">Coordinating with expert agents...</span>
              </div>
            ) : datasetAdviceError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-red-900">Failed to get recommendations</span>
                </div>
                <p className="text-sm text-red-700">{datasetAdviceError}</p>
              </div>
            ) : datasetAdvice ? (
              <div className="space-y-6">
                {/* Natural Language Advice */}
                <div className="bg-white border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="bg-emerald-100 rounded-full p-2">
                      <Brain className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">
                        What Our Expert Team Recommends
                      </h4>
                      <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line">
                        {datasetAdvice.naturalLanguageAdvice}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recommended Datasets */}
                {datasetAdvice.recommendedDatasets && datasetAdvice.recommendedDatasets.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-600" />
                      Recommended Datasets
                    </h4>
                    <div className="space-y-3">
                      {datasetAdvice.recommendedDatasets.map((ds: any, idx: number) => (
                        <div key={idx} className="border-l-4 border-emerald-500 bg-white rounded-r-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{ds.name}</div>
                              <div className="text-sm text-gray-600 mt-1">{ds.description}</div>
                            </div>
                            <Badge
                              variant={ds.priority === 'Required' ? 'default' : 'secondary'}
                              className={ds.priority === 'Required' ? 'bg-emerald-600' : ''}
                            >
                              {ds.priority}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Quality Expectations */}
                {datasetAdvice.qualityExpectations && datasetAdvice.qualityExpectations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Data Quality Expectations
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-700">
                      {datasetAdvice.qualityExpectations.map((exp: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-600 mt-1">✓</span>
                          <span>{exp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Data Requirements */}
                {datasetAdvice.dataRequirements && datasetAdvice.dataRequirements.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      Data Requirements
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-700">
                      {datasetAdvice.dataRequirements.map((req: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-600 mt-1">•</span>
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next Step Prompt */}
                <div className="bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRight className="w-4 h-4 text-emerald-700" />
                    <span className="text-sm font-semibold text-emerald-900">Ready to Upload Your Data?</span>
                  </div>
                  <p className="text-sm text-emerald-800">
                    Proceed to the next step to upload your data. We'll automatically analyze its quality,
                    detect any PII, and help you prepare it for analysis.
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

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
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedTemplates.includes(template.id)
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
            // Update session with clarification results
            await fetch(`/api/project-manager/update-goal-after-clarification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                sessionId: session?.id,
                refinedGoal: refinedGoal || analysisGoal,
                answersToQuestions: answers,
                confirmedUnderstanding: clarificationData
              })
            });

            // Update local state
            if (refinedGoal) {
              setAnalysisGoal(refinedGoal);
            }

            setClarificationCompleted(true);
            setShowClarificationDialog(false);
            setClarificationData(null);

            console.log('✅ Clarification saved successfully');

            // *** TRIGGER MULTI-AGENT DATASET CONSULTATION ***
            // After clarification is complete, get dataset recommendations
            await fetchDatasetRecommendations(answers);
          } catch (error: any) {
            console.error('Failed to save clarification:', error);
            alert('Failed to save clarification. Please try again.');
          }
        }}
        clarificationData={clarificationData}
        isLoading={loadingClarification}
      />
    </div>
  );
}