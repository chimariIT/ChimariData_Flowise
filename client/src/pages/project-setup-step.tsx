import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useProjectSession } from "@/hooks/useProjectSession";
import { apiClient } from "@/lib/api";
import { 
  FolderOpen, 
  Settings, 
  CheckCircle, 
  Database,
  BarChart3,
  Brain,
  Users,
  AlertCircle
} from "lucide-react";

type SessionJourney = 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom';

const JOURNEY_NORMALIZATION_MAP: Record<string, SessionJourney> = {
  'non-tech': 'non-tech',
  'non_tech': 'non-tech',
  'ai_guided': 'non-tech',
  guided: 'non-tech',
  business: 'business',
  'template_based': 'business',
  technical: 'technical',
  'self_service': 'technical',
  consultation: 'consultation',
  custom: 'custom',
};

const SESSION_TO_PROJECT_JOURNEY: Record<SessionJourney, string> = {
  'non-tech': 'ai_guided',
  business: 'template_based',
  technical: 'self_service',
  consultation: 'consultation',
  custom: 'custom',
};

const DEFAULT_PROJECT_DESCRIPTION = "Project initialized from guided journey setup.";

const normalizeSessionJourney = (value?: string): SessionJourney => {
  if (!value) return 'non-tech';
  const key = value.toLowerCase();
  return JOURNEY_NORMALIZATION_MAP[key] ?? 'non-tech';
};

interface ProjectSetupStepProps {
  journeyType: string;
}

export default function ProjectSetupStep({ journeyType }: ProjectSetupStepProps) {
  const normalizedJourneyType = normalizeSessionJourney(journeyType);

  const {
    session,
    linkProject,
    getPrepareData,
    loading: sessionLoading,
  } = useProjectSession({
    journeyType: normalizedJourneyType
  });

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [dataSource, setDataSource] = useState("");
  const [expectedRows, setExpectedRows] = useState("");
  const [analysisComplexity, setAnalysisComplexity] = useState("");
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [primaryTemplate, setPrimaryTemplate] = useState<string>("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [projectInitializing, setProjectInitializing] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [savedGoals, setSavedGoals] = useState<string[]>([]);
  const [savedQuestions, setSavedQuestions] = useState<string[]>([]);
  const [hasAttemptedProjectInit, setHasAttemptedProjectInit] = useState(false);

  const recommendationSignatureRef = useRef<string | null>(null);

  const normalizedProjectJourney = SESSION_TO_PROJECT_JOURNEY[normalizedJourneyType];
  const sessionProjectId = session?.projectId ?? null;

  const handleRetryProjectInit = useCallback(() => {
    setProjectError(null);
    setHasAttemptedProjectInit(false);
  }, []);

  // Load saved context from localStorage for agent coordination
  useEffect(() => {
    try {
      const storedGoals = JSON.parse(localStorage.getItem('chimari_analysis_goals') || '[]');
      if (Array.isArray(storedGoals)) {
        setSavedGoals(storedGoals);
      }
    } catch {
      setSavedGoals([]);
    }

    try {
      const storedQuestions = JSON.parse(localStorage.getItem('chimari_analysis_questions') || '[]');
      if (Array.isArray(storedQuestions)) {
        setSavedQuestions(storedQuestions);
      }
    } catch {
      setSavedQuestions([]);
    }
  }, []);

  // Hydrate from secure session storage if available
  useEffect(() => {
    const data = getPrepareData();
    if (!data) return;

    if (!projectName && typeof data.analysisGoal === 'string' && data.analysisGoal.trim()) {
      setProjectName(data.analysisGoal.trim());
    }

    if (!projectDescription && typeof data.businessQuestions === 'string' && data.businessQuestions.trim()) {
      setProjectDescription(data.businessQuestions.trim());
    }

    if (!savedGoals.length && typeof data.analysisGoal === 'string' && data.analysisGoal.trim()) {
      setSavedGoals([data.analysisGoal.trim()]);
    }

    if (!savedQuestions.length) {
      if (Array.isArray(data.businessQuestions)) {
        const filtered = data.businessQuestions
          .map((q: any) => (typeof q === 'string' ? q.trim() : ''))
          .filter((q: string) => q.length > 0);
        if (filtered.length) {
          setSavedQuestions(filtered);
        }
      } else if (typeof data.businessQuestions === 'string') {
        const extracted = data.businessQuestions
          .split('\n')
          .map((q: string) => q.trim())
          .filter((q: string) => q.length > 0);
        if (extracted.length) {
          setSavedQuestions(extracted);
        }
      }
    }
  }, [getPrepareData, projectName, projectDescription, savedGoals, savedQuestions]);

  // Reflect linked project from session updates
  useEffect(() => {
    if (!sessionProjectId) return;
    setCurrentProjectId(sessionProjectId);
    setProjectError(null);
    setHasAttemptedProjectInit(true);
  }, [sessionProjectId]);

  // Provide sensible defaults for project metadata when context is available
  useEffect(() => {
    if (!projectName && savedGoals.length > 0) {
      setProjectName(savedGoals[0]);
    }
  }, [projectName, savedGoals]);

  useEffect(() => {
    if (!projectDescription && savedQuestions.length > 0) {
      setProjectDescription(savedQuestions.join('\n'));
    }
  }, [projectDescription, savedQuestions]);

  // Ensure each journey session has a persisted project before reaching agent tooling
  useEffect(() => {
    if (sessionLoading || !session || sessionProjectId || projectInitializing || hasAttemptedProjectInit) {
      return;
    }

    const hasContext = projectName.trim().length > 0 || savedGoals.length > 0;
    if (!hasContext) {
      return;
    }

    const createAndLinkProject = async () => {
      try {
        setProjectError(null);
        setProjectInitializing(true);
        setHasAttemptedProjectInit(true);

        const fallbackName = (projectName.trim() || savedGoals[0] || `Journey Project ${new Date().toLocaleDateString()}`).slice(0, 80);
        const fallbackDescription = (projectDescription.trim() || savedQuestions.join('\n') || DEFAULT_PROJECT_DESCRIPTION).slice(0, 400);

        const response = await apiClient.createProject({
          name: fallbackName,
          description: fallbackDescription,
          journeyType: normalizedProjectJourney,
        });

        const createdProject = response?.project ?? response;
        const newProjectId = createdProject?.id;

        if (!newProjectId) {
          throw new Error('Project creation response missing id');
        }

        await linkProject(newProjectId);
        setCurrentProjectId(newProjectId);

        if (!projectName) {
          setProjectName(createdProject?.name || fallbackName);
        }
        if (!projectDescription) {
          setProjectDescription(createdProject?.description || fallbackDescription);
        }
      } catch (error: any) {
        console.error('Failed to initialize project for journey setup:', error);
        setProjectError(error.message || 'Failed to initialize project');
      } finally {
        setProjectInitializing(false);
      }
    };

    createAndLinkProject();
  }, [session, sessionLoading, sessionProjectId, projectInitializing, hasAttemptedProjectInit, projectName, projectDescription, savedGoals, savedQuestions, normalizedProjectJourney, linkProject]);

  // Fetch agent recommendations once a real project is available
  useEffect(() => {
    if (!currentProjectId) {
      return;
    }

    if (!savedGoals.length || !savedQuestions.length) {
      return;
    }

    const signaturePayload = JSON.stringify({
      projectId: currentProjectId,
      goals: savedGoals,
      questions: savedQuestions,
      dataSource: dataSource || 'upload',
    });

    if (recommendationSignatureRef.current === signaturePayload) {
      return;
    }

    let cancelled = false;
    recommendationSignatureRef.current = signaturePayload;
    setLoadingRecommendations(true);

    const fetchRecommendations = async () => {
      try {
        const result = await apiClient.post(`/api/projects/${currentProjectId}/agent-recommendations`, {
          goals: savedGoals,
          questions: savedQuestions,
          dataSource: dataSource || 'upload',
        });

        if (cancelled) return;

        if (result?.success && result.recommendations) {
          if (result.recommendations.expectedDataSize && !expectedRows) {
            setExpectedRows(result.recommendations.expectedDataSize);
          }

          if (result.recommendations.analysisComplexity && !analysisComplexity) {
            setAnalysisComplexity(result.recommendations.analysisComplexity);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch agent recommendations:', error);
          recommendationSignatureRef.current = null;
        }
      } finally {
        if (!cancelled) {
          setLoadingRecommendations(false);
        }
      }
    };

    fetchRecommendations();

    return () => {
      cancelled = true;
    };
  }, [currentProjectId, savedGoals, savedQuestions, dataSource]);

  useEffect(() => {
    if (journeyType !== 'business') return;
    let cancelled = false;
    async function loadTemplates() {
      setLoadingTemplates(true);
      setTemplateError(null);
      try {
        const { apiClient } = await import("@/lib/api");
        const caps = await apiClient.getEnhancedCapabilities();
        const list = Array.isArray(caps?.businessTemplates) ? caps.businessTemplates : [];
        if (!cancelled) {
          setAvailableTemplates(list.map((t: any) => ({ id: t.id, name: t.name })));
          // Sync with selection from Prepare step if exists
          const saved = localStorage.getItem('chimari_business_templates');
          if (saved) {
            try {
              const arr = JSON.parse(saved) as string[];
              if (arr.length > 0) setPrimaryTemplate(arr[0]);
            } catch {}
          }
          // Also restore a saved primary choice
          const savedPrimary = localStorage.getItem('chimari_business_primary_template');
          if (savedPrimary) setPrimaryTemplate(savedPrimary);
        }
      } catch (e: any) {
        if (!cancelled) setTemplateError(e?.message || 'Failed to load templates');
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    }
    loadTemplates();
    return () => { cancelled = true; };
  }, [journeyType]);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Project Setup",
          description: "Our AI will help configure your project for optimal results",
          icon: Brain,
          color: "blue",
          complexity: "Simple - AI handles most configuration"
        };
      case 'business':
        return {
          title: "Business Project Setup", 
          description: "Configure your project with business-focused templates",
          icon: BarChart3,
          color: "green",
          complexity: "Moderate - Template-based with customization"
        };
      case 'technical':
        return {
          title: "Technical Project Setup",
          description: "Full control over project configuration and parameters",
          icon: Settings,
          color: "purple",
          complexity: "Advanced - Full customization available"
        };
      case 'consultation':
        return {
          title: "Consultation Project Setup",
          description: "Prepare project details for expert consultation",
          icon: Users,
          color: "yellow",
          complexity: "Expert-guided - Customized by data scientists"
        };
      default:
        return {
          title: "Project Setup",
          description: "Configure your analysis project",
          icon: FolderOpen,
          color: "blue",
          complexity: "Standard"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  const journeyColorClasses: Record<string, { card: string; title: string; description: string; badge: string }> = {
    blue: {
      card: "border-blue-200 bg-blue-50",
      title: "text-blue-900",
      description: "text-blue-700",
      badge: "bg-blue-100 text-blue-800",
    },
    green: {
      card: "border-green-200 bg-green-50",
      title: "text-green-900",
      description: "text-green-700",
      badge: "bg-green-100 text-green-800",
    },
    purple: {
      card: "border-purple-200 bg-purple-50",
      title: "text-purple-900",
      description: "text-purple-700",
      badge: "bg-purple-100 text-purple-800",
    },
    yellow: {
      card: "border-yellow-200 bg-yellow-50",
      title: "text-yellow-900",
      description: "text-yellow-700",
      badge: "bg-yellow-100 text-yellow-800",
    },
  };

  const journeyColors =
    journeyColorClasses[journeyInfo.color] ?? journeyColorClasses.blue;

  const dataSourceOptions = [
    { value: 'csv', label: 'CSV File', description: 'Upload a CSV file with your data' },
    { value: 'excel', label: 'Excel File', description: 'Upload an Excel spreadsheet' },
    { value: 'database', label: 'Database Connection', description: 'Connect to your database' },
    { value: 'api', label: 'API Integration', description: 'Connect to external APIs' },
    { value: 'manual', label: 'Manual Entry', description: 'Enter data manually' }
  ];

  const complexityOptions = [
    { value: 'simple', label: 'Simple Analysis', description: 'Basic statistical analysis and visualizations' },
    { value: 'moderate', label: 'Moderate Analysis', description: 'Advanced analytics with some customization' },
    { value: 'complex', label: 'Complex Analysis', description: 'Advanced statistical modeling and machine learning' },
    { value: 'expert', label: 'Expert Analysis', description: 'Custom algorithms and advanced data science techniques' }
  ];

  const isFormValid = () => {
    const base = projectName.trim() && projectDescription.trim() && dataSource && expectedRows.trim();
    if (journeyType === 'business') {
      return !!base && !!primaryTemplate;
    }
    return !!base;
  };

  const getEstimatedCost = () => {
    const rows = parseInt(expectedRows) || 0;
    const baseCost = 29;
    
    let multiplier = 1;
    if (rows > 100000) multiplier = 1.5;
    if (rows > 500000) multiplier = 2;
    if (rows > 1000000) multiplier = 3;
    
    if (analysisComplexity === 'moderate') multiplier *= 1.3;
    if (analysisComplexity === 'complex') multiplier *= 1.8;
    if (analysisComplexity === 'expert') multiplier *= 2.5;
    
    return Math.round(baseCost * multiplier);
  };

  return (
    <div className="space-y-6">
      {projectError && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <AlertCircle className="w-5 h-5" />
              Project Setup Warning
            </CardTitle>
            <CardDescription className="text-red-700">
              {projectError}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-red-700">
              We couldn’t initialize a project for this journey. Make sure your details look correct, then retry.
            </p>
            <Button
              onClick={handleRetryProjectInit}
              disabled={projectInitializing}
              variant="outline"
            >
              {projectInitializing ? 'Retrying...' : 'Retry project initialization'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Journey Type Info */}
      <Card className={journeyColors.card}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${journeyColors.title}`}>
            <Icon className="w-5 h-5" />
            {journeyInfo.title}
          </CardTitle>
          <CardDescription className={journeyColors.description}>
            {journeyInfo.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={journeyColors.badge}>
              {journeyInfo.complexity}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Project Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Project Details
          </CardTitle>
          <CardDescription>
            Basic information about your analysis project
          </CardDescription>
          {loadingRecommendations && (
            <p className="mt-3 text-xs text-blue-600">
              Gathering agent recommendations; please wait a moment while we pre-fill suggestions.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="e.g., Customer Behavior Analysis Q4 2024"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="project-description">Project Description</Label>
              <Textarea
                id="project-description"
                placeholder="Describe what this analysis will accomplish and any specific requirements..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Source Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Data Source
          </CardTitle>
          <CardDescription>
            How will you provide your data for analysis?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="data-source">Data Source Type</Label>
              <select
                id="data-source"
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value)}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="">Select data source...</option>
                {dataSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <Label htmlFor="expected-rows">Expected Data Size</Label>
              <Input
                id="expected-rows"
                type="number"
                placeholder="e.g., 10000"
                value={expectedRows}
                onChange={(e) => setExpectedRows(e.target.value)}
                className="mt-1"
              />
              <p className="text-sm text-gray-500 mt-1">
                Approximate number of rows in your dataset (affects processing time and cost)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Analysis Configuration
          </CardTitle>
          <CardDescription>
            Configure the complexity and scope of your analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {journeyType === 'business' && (
              <div>
                <Label htmlFor="primary-template">Primary Business Template</Label>
                {loadingTemplates && (
                  <p className="text-sm text-gray-600 mt-1">Loading templates…</p>
                )}
                {templateError && (
                  <p className="text-sm text-red-600 mt-1">{templateError}</p>
                )}
                <select
                  id="primary-template"
                  value={primaryTemplate}
                  onChange={(e) => {
                    setPrimaryTemplate(e.target.value);
                    try { localStorage.setItem('chimari_business_primary_template', e.target.value); } catch {}
                  }}
                  className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select a template…</option>
                  {availableTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {primaryTemplate && (
                  <p className="text-xs text-gray-600 mt-1">This template will guide KPIs, insights, and deliverables.</p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="analysis-complexity">Analysis Complexity</Label>
              <select
                id="analysis-complexity"
                value={analysisComplexity}
                onChange={(e) => setAnalysisComplexity(e.target.value)}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="">Select complexity level...</option>
                {complexityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.description}
                  </option>
                ))}
              </select>
            </div>
            
            {journeyType === 'technical' && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Settings className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-900">Technical Options</span>
                </div>
                <p className="text-sm text-purple-700">
                  Advanced configuration options will be available in the next step, including custom algorithms, 
                  statistical methods, and machine learning parameters.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cost Estimation */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-900">
            <CheckCircle className="w-5 h-5" />
            Project Summary & Cost Estimation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Project Name:</span>
                <p className="text-gray-600">{projectName || 'Not specified'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Data Source:</span>
                <p className="text-gray-600">{dataSourceOptions.find(opt => opt.value === dataSource)?.label || 'Not selected'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Expected Rows:</span>
                <p className="text-gray-600">{expectedRows || 'Not specified'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Complexity:</span>
                <p className="text-gray-600">{complexityOptions.find(opt => opt.value === analysisComplexity)?.label || 'Not selected'}</p>
              </div>
            </div>
            
            {isFormValid() && (
              <div className="border-t border-green-300 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">Estimated Cost:</p>
                    <p className="text-xs text-green-600">Based on data size and complexity</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-900">${getEstimatedCost()}</p>
                    <p className="text-xs text-green-600">per analysis</p>
                  </div>
                </div>
              </div>
            )}
            
            {isFormValid() && (
              <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg">
                <p className="text-sm text-green-800 font-medium">
                  ✅ Project configuration complete! Ready to proceed to data upload.
                </p>
                {journeyType === 'business' && primaryTemplate && (
                  <p className="text-xs text-green-700 mt-1">Template selected: {availableTemplates.find(t => t.id === primaryTemplate)?.name}</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}