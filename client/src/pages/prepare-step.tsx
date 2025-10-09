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
  BarChart3
} from "lucide-react";

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
        const list = Array.isArray(caps?.businessTemplates) ? caps.businessTemplates : [];
        if (!cancelled) {
          const mapped = list.map((t: any) => ({ id: t.id, name: t.name, description: (t.sections?.[0]?.description) || '' }));
          setAvailableTemplates(mapped);
          // Restore previous selection if present
          const saved = localStorage.getItem('chimari_business_templates');
          if (saved) {
            try { setSelectedTemplates(JSON.parse(saved)); } catch {}
          }
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

  const handleTemplateToggle = (templateId: string) => {
    setSelectedTemplates(prev => {
      const next = prev.includes(templateId)
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId];
      // Persist selection to localStorage for later steps (execute/results)
      try { localStorage.setItem('chimari_business_templates', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const isFormValid = () => {
    if (journeyType === 'business') {
      return analysisGoal.trim() && businessQuestions.trim() && selectedTemplates.length > 0;
    }
    return analysisGoal.trim() && businessQuestions.trim();
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

      {/* Analysis Goal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Analysis Goal
          </CardTitle>
          <CardDescription>
            Describe what you want to achieve with this analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="analysis-goal">What is your main analysis goal?</Label>
              <Textarea
                id="analysis-goal"
                placeholder="e.g., I want to understand customer behavior patterns to improve our marketing strategy..."
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
                  <span className="text-sm font-medium text-blue-900">AI Suggestion</span>
                </div>
                <p className="text-sm text-blue-700">
                  Based on your goal, our AI will suggest the best analysis approach and help you throughout the process.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Business Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            Key Questions
          </CardTitle>
          <CardDescription>
            What specific questions do you want this analysis to answer?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="business-questions">What questions should this analysis answer?</Label>
              <Textarea
                id="business-questions"
                placeholder="e.g., Who are our most valuable customers? What factors drive sales performance? How can we reduce customer churn?..."
                value={businessQuestions}
                onChange={(e) => setBusinessQuestions(e.target.value)}
                className="mt-2"
                rows={4}
              />
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
            {loadingTemplates && (
              <div className="text-sm text-gray-600">Loading templates…</div>
            )}
            {templateError && (
              <div className="text-sm text-red-600">{templateError}</div>
            )}
            <div className="grid gap-3">
              {(availableTemplates.length > 0 ? availableTemplates : []).map((template) => (
                <div
                  key={template.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedTemplates.includes(template.id)
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handleTemplateToggle(template.id)}
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
    </div>
  );
}