import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Lightbulb, MessageSquare, Brain, CreditCard, Plus, Trash2 } from "lucide-react";

interface AskQuestionPageProps {
  onBack: () => void;
  onPaymentRequired: (projectId: string, questions: string[]) => void;
}

export default function AskQuestionPage({ onBack, onPaymentRequired }: AskQuestionPageProps) {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [analysisType, setAnalysisType] = useState<string>("standard");
  const { toast } = useToast();

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
  });

  const analysisTypes = [
    {
      id: "standard",
      name: "Standard Analysis",
      description: "Basic insights and answers to your questions",
      price: 15,
      features: ["Direct question answering", "Basic statistical analysis", "Quick insights"]
    },
    {
      id: "advanced", 
      name: "Advanced Analysis",
      description: "Deep analysis with context and recommendations",
      price: 25,
      features: ["Comprehensive analysis", "Context-aware insights", "Actionable recommendations", "Trend identification"]
    },
    {
      id: "expert",
      name: "Expert Analysis", 
      description: "Professional-grade analysis with detailed explanations",
      price: 40,
      features: ["Expert-level insights", "Detailed explanations", "Multiple perspectives", "Business implications", "Custom visualizations"]
    }
  ];

  const questionTemplates = [
    "What are the key trends in this data?",
    "Which factors have the strongest correlation with [target variable]?",
    "Are there any outliers or anomalies in the data?",
    "What patterns can be identified over time?",
    "Which segments perform better and why?",
    "What are the main drivers of [outcome]?",
    "How does [variable A] relate to [variable B]?",
    "What predictions can be made based on this data?"
  ];

  const addQuestion = () => {
    setQuestions([...questions, ""]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, value: string) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const useTemplate = (template: string) => {
    const emptyIndex = questions.findIndex(q => q.trim() === "");
    if (emptyIndex !== -1) {
      updateQuestion(emptyIndex, template);
    } else {
      setQuestions([...questions, template]);
    }
  };

  const handleSubmitQuestions = () => {
    const validQuestions = questions.filter(q => q.trim().length > 0);
    
    if (!selectedProject) {
      toast({
        title: "Project Required",
        description: "Please select a project to analyze.",
        variant: "destructive"
      });
      return;
    }

    if (validQuestions.length === 0) {
      toast({
        title: "Questions Required",
        description: "Please add at least one question to analyze.",
        variant: "destructive"
      });
      return;
    }

    // Navigate to payment page
    onPaymentRequired(selectedProject, validQuestions);
  };

  const calculatePrice = () => {
    const validQuestions = questions.filter(q => q.trim().length > 0);
    const selectedAnalysis = analysisTypes.find(t => t.id === analysisType);
    const basePrice = selectedAnalysis?.price || 15;
    const questionMultiplier = Math.max(1, validQuestions.length);
    return basePrice * questionMultiplier;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Ask Business Questions</h1>
              <p className="text-slate-600 mt-1">Get AI-powered answers to your data questions</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Project & Analysis Selection */}
          <div className="lg:col-span-1 space-y-6">
            {/* Project Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Select Project</CardTitle>
                <CardDescription>
                  Choose a project to analyze
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projectsData?.projects?.map((project: any) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedProject && (
                  <div className="mt-4 p-3 bg-blue-50 rounded border">
                    {(() => {
                      const project = projectsData?.projects?.find((p: any) => p.id === selectedProject);
                      return project ? (
                        <div className="text-sm">
                          <p><strong>Records:</strong> {project.recordCount?.toLocaleString() || 'N/A'}</p>
                          <p><strong>Fields:</strong> {Object.keys(project.schema || {}).length}</p>
                          <p><strong>Created:</strong> {new Date(project.createdAt).toLocaleDateString()}</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Analysis Type */}
            <Card>
              <CardHeader>
                <CardTitle>Analysis Type</CardTitle>
                <CardDescription>
                  Choose the depth of analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysisTypes.map((type) => (
                    <div
                      key={type.id}
                      onClick={() => setAnalysisType(type.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        analysisType === type.id
                          ? 'border-primary bg-primary/5'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{type.name}</h4>
                        <span className="text-sm font-medium text-primary">${type.price}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{type.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {type.features.map((feature, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Questions Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Question Templates */}
            <Card>
              <CardHeader>
                <CardTitle>Question Templates</CardTitle>
                <CardDescription>
                  Click on a template to add it to your questions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {questionTemplates.map((template, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => useTemplate(template)}
                      className="text-left h-auto p-3 justify-start"
                    >
                      <Lightbulb className="w-4 h-4 mr-2 flex-shrink-0" />
                      <span className="text-sm">{template}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Custom Questions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Your Questions
                  <Button variant="outline" size="sm" onClick={addQuestion}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Question
                  </Button>
                </CardTitle>
                <CardDescription>
                  Enter your specific questions about the data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {questions.map((question, index) => (
                  <div key={index} className="flex gap-2">
                    <Textarea
                      value={question}
                      onChange={(e) => updateQuestion(index, e.target.value)}
                      placeholder={`Question ${index + 1}: What would you like to know about your data?`}
                      className="flex-1"
                      rows={2}
                    />
                    {questions.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(index)}
                        className="flex-shrink-0 mt-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Pricing Summary & Submit */}
            <Card>
              <CardHeader>
                <CardTitle>Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Analysis Type:</span>
                    <span className="font-medium">{analysisTypes.find(t => t.id === analysisType)?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Questions:</span>
                    <span className="font-medium">{questions.filter(q => q.trim().length > 0).length}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total Price:</span>
                    <span className="text-primary">${calculatePrice()}</span>
                  </div>
                </div>

                <Button 
                  onClick={handleSubmitQuestions}
                  disabled={!selectedProject || questions.filter(q => q.trim().length > 0).length === 0}
                  className="w-full mt-4"
                  size="lg"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Proceed to Payment
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}