import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Lightbulb
} from "lucide-react";

interface ExecuteStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

export default function ExecuteStep({ journeyType, onNext, onPrevious }: ExecuteStepProps) {
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'configuring' | 'running' | 'completed' | 'error'>('idle');
  const [executionProgress, setExecutionProgress] = useState(0);
  const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>([]);
  const [executionResults, setExecutionResults] = useState<any>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [scenarioQuestion, setScenarioQuestion] = useState<string>("");
  const [suggestedScenarios, setSuggestedScenarios] = useState<Array<{ id: string; title: string; description: string; analyses: string[] }>>([]);
  const [scenarioSource, setScenarioSource] = useState<'internal' | 'external' | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [selectedBusinessTemplates, setSelectedBusinessTemplates] = useState<string[]>([]);
  const [primaryBusinessTemplate, setPrimaryBusinessTemplate] = useState<string>("");

  useEffect(() => {
    if (journeyType !== 'business') return;
    try {
      const saved = localStorage.getItem('chimari_business_templates');
      if (saved) setSelectedBusinessTemplates(JSON.parse(saved));
    } catch {}
    try {
      const primary = localStorage.getItem('chimari_business_primary_template');
      if (primary) setPrimaryBusinessTemplate(primary);
    } catch {}
  }, [journeyType]);

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

  const analysisOptions = [
    { id: 'descriptive', name: 'Descriptive Statistics', description: 'Basic statistical summaries and distributions', duration: '2-3 min' },
    { id: 'correlation', name: 'Correlation Analysis', description: 'Relationships between variables', duration: '3-5 min' },
    { id: 'regression', name: 'Regression Analysis', description: 'Predictive modeling and relationships', duration: '5-8 min' },
    { id: 'clustering', name: 'Clustering Analysis', description: 'Group similar data points', duration: '8-12 min' },
    { id: 'classification', name: 'Classification Analysis', description: 'Predict categorical outcomes', duration: '10-15 min' },
    { id: 'time-series', name: 'Time Series Analysis', description: 'Trends and patterns over time', duration: '6-10 min' }
  ];

  // Non-tech scenario presets in plain language → mapped to analyses
  const scenarioPresets: Array<{ id: string; title: string; description: string; analyses: string[]; example?: string }>= [
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
        const resp = await fetch('/api/analysis/suggest-scenarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: scenarioQuestion })
        });
        const json = await resp.json();
        if (!cancelled) {
          setSuggestedScenarios(json.scenarios || []);
          setScenarioSource(json.source || null);
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

    // Simulate configuration phase
    setTimeout(() => {
      setExecutionStatus('running');
      
      // Simulate execution progress
      const progressInterval = setInterval(() => {
        setExecutionProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            setExecutionStatus('completed');
            setExecutionResults({
              totalAnalyses: selectedAnalyses.length,
              executionTime: '12 minutes',
              resultsGenerated: selectedAnalyses.length * 3, // 3 results per analysis
              insightsFound: selectedAnalyses.length * 2,
              qualityScore: 92
            });
            return 100;
          }
          return prev + Math.random() * 10;
        });
      }, 1000);
    }, 2000);
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

  const getEstimatedDuration = () => {
    const totalMinutes = selectedAnalyses.reduce((total, analysisId) => {
      const analysis = analysisOptions.find(opt => opt.id === analysisId);
      const duration = analysis?.duration || '5 min';
      return total + parseInt(duration.split('-')[0]);
    }, 0);
    return `${totalMinutes}-${totalMinutes + selectedAnalyses.length * 2} minutes`;
  };

  return (
    <div className="space-y-6">
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
              Ask a question (plain English)
            </CardTitle>
            <CardDescription>
              Describe the outcome you care about. We’ll choose the right analyses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <input
                type="text"
                value={scenarioQuestion}
                onChange={(e) => setScenarioQuestion(e.target.value)}
                placeholder="e.g., Is there evidence of employee attrition due to the new policy?"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              {isSuggesting && (
                <div className="text-xs text-blue-600">Analyzing your question…</div>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                {suggestedScenarios.map((s) => (
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
                      <Badge variant="secondary" className={scenarioSource === 'internal' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                        {scenarioSource === 'internal' ? 'From your data' : 'New type' }
                      </Badge>
                    </div>
                  </div>
                ))}
                {scenarioPresets.map((s) => (
                  <div
                    key={s.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedScenario === s.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => handleSelectScenario(s.id)}
                    data-testid={`scenario-${s.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{s.title}</p>
                        <p className="text-sm text-gray-600">{s.description}</p>
                      </div>
                      {selectedScenario === s.id && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">Selected</Badge>
                      )}
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

      {/* Analysis Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Select Analyses
          </CardTitle>
          <CardDescription>
            {journeyType === 'non-tech' ? 'Optional: We already chose analyses based on your question. You can adjust below.' : 'Choose which analyses to run on your data'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {journeyType === 'business' && (selectedBusinessTemplates.length > 0 || primaryBusinessTemplate) && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                Using business templates: {primaryBusinessTemplate ? `Primary = ${primaryBusinessTemplate}` : ''}
                {selectedBusinessTemplates.length > 0 && (
                  <span> | Selected: {selectedBusinessTemplates.join(', ')}</span>
                )}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionResults.totalAnalyses}</p>
                    <p className="text-sm text-green-700">Analyses Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionResults.executionTime}</p>
                    <p className="text-sm text-green-700">Execution Time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionResults.resultsGenerated}</p>
                    <p className="text-sm text-green-700">Results Generated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-900">{executionResults.qualityScore}%</p>
                    <p className="text-sm text-green-700">Quality Score</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-4">
                  <Button variant="outline" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Preview Results
                  </Button>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
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
                {executionResults?.totalAnalyses} analyses completed
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionResults?.resultsGenerated} results generated
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {executionResults?.qualityScore}% quality score
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}