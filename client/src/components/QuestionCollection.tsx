import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  X, 
  HelpCircle, 
  Target, 
  TrendingUp,
  Users,
  DollarSign,
  BarChart3,
  Lightbulb
} from "lucide-react";

interface Question {
  id: string;
  text: string;
  category: string;
}

interface QuestionCollectionProps {
  serviceType: string;
  onQuestionsSubmit: (questions: string[], analysisType: string) => void;
  isLoading?: boolean;
}

const QUESTION_CATEGORIES = [
  { id: 'descriptive', label: 'Descriptive', icon: BarChart3, description: 'What happened?' },
  { id: 'diagnostic', label: 'Diagnostic', icon: HelpCircle, description: 'Why did it happen?' },
  { id: 'predictive', label: 'Predictive', icon: TrendingUp, description: 'What will happen?' },
  { id: 'prescriptive', label: 'Prescriptive', icon: Target, description: 'What should I do?' }
];

const SUGGESTED_QUESTIONS = {
  sales: [
    "What are our top-performing products by revenue?",
    "Which sales regions show the highest growth potential?",
    "What seasonal patterns exist in our sales data?",
    "Which customer segments generate the most profit?"
  ],
  marketing: [
    "Which marketing channels provide the best ROI?",
    "What customer demographics respond best to our campaigns?",
    "How can we improve customer acquisition costs?",
    "Which products have the highest conversion rates?"
  ],
  operations: [
    "Where are the bottlenecks in our process?",
    "How can we optimize resource allocation?",
    "What factors impact our operational efficiency?",
    "Which processes show the most variation?"
  ],
  financial: [
    "What are the key drivers of our revenue?",
    "Which expense categories offer cost reduction opportunities?",
    "How does our performance compare to industry benchmarks?",
    "What financial risks should we monitor?"
  ],
  customer: [
    "What factors influence customer satisfaction?",
    "Which customers are at risk of churning?",
    "How can we increase customer lifetime value?",
    "What drives customer loyalty and retention?"
  ]
};

export function QuestionCollection({ 
  serviceType, 
  onQuestionsSubmit, 
  isLoading = false 
}: QuestionCollectionProps) {
  const [questions, setQuestions] = useState<Question[]>([
    { id: '1', text: '', category: 'descriptive' }
  ]);
  const [analysisType, setAnalysisType] = useState('standard');
  const [selectedSuggestionCategory, setSelectedSuggestionCategory] = useState('sales');

  const addQuestion = () => {
    const newId = (questions.length + 1).toString();
    setQuestions([...questions, { id: newId, text: '', category: 'descriptive' }]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length > 1) {
      setQuestions(questions.filter(q => q.id !== id));
    }
  };

  const updateQuestion = (id: string, field: string, value: string) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const addSuggestedQuestion = (questionText: string) => {
    const newId = (questions.length + 1).toString();
    setQuestions([...questions, { 
      id: newId, 
      text: questionText, 
      category: 'descriptive' 
    }]);
  };

  const handleSubmit = () => {
    const validQuestions = questions
      .filter(q => q.text.trim().length > 0)
      .map(q => q.text.trim());
    
    if (validQuestions.length > 0) {
      onQuestionsSubmit(validQuestions, analysisType);
    }
  };

  const isValid = questions.some(q => q.text.trim().length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <span>Analysis Questions</span>
          </CardTitle>
          <CardDescription>
            Define what you want to learn from your data. The more specific your questions, 
            the more targeted and valuable your analysis will be.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question Categories */}
          <div>
            <Label className="text-sm font-medium mb-3 block">
              Question Types (helps us understand your analysis needs)
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {QUESTION_CATEGORIES.map(category => {
                const IconComponent = category.icon;
                return (
                  <div key={category.id} className="p-3 border rounded-lg text-center">
                    <IconComponent className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                    <div className="text-sm font-medium">{category.label}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {category.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analysis Type Selection */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Analysis Complexity</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { 
                  value: 'standard', 
                  label: 'Standard Analysis', 
                  description: 'Basic insights and visualizations',
                  badge: 'Included'
                },
                { 
                  value: 'advanced', 
                  label: 'Advanced Analysis', 
                  description: 'Statistical modeling and deeper insights',
                  badge: '+50%'
                },
                { 
                  value: 'custom', 
                  label: 'Custom Analysis', 
                  description: 'Tailored methodology for specific needs',
                  badge: serviceType === 'expert_consulting' ? 'Included' : '+100%'
                }
              ].map(type => (
                <div
                  key={type.value}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    analysisType === type.value 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => setAnalysisType(type.value)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{type.label}</h4>
                    <Badge variant={analysisType === type.value ? "default" : "secondary"}>
                      {type.badge}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">{type.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Question Input */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Your Questions</Label>
            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={question.id} className="flex space-x-3">
                  <div className="flex-1 space-y-3">
                    <Textarea
                      placeholder={`Question ${index + 1}: What would you like to know about your data?`}
                      value={question.text}
                      onChange={(e) => updateQuestion(question.id, 'text', e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                    <select
                      value={question.category}
                      onChange={(e) => updateQuestion(question.id, 'category', e.target.value)}
                      className="text-sm border rounded px-3 py-1 bg-white"
                    >
                      {QUESTION_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  {questions.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeQuestion(question.id)}
                      className="flex-shrink-0 text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            <Button
              variant="outline"
              onClick={addQuestion}
              className="mt-4 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Another Question</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Suggested Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Lightbulb className="w-5 h-5 text-yellow-600" />
            <span>Suggested Questions</span>
          </CardTitle>
          <CardDescription>
            Common questions by business area. Click to add to your analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.keys(SUGGESTED_QUESTIONS).map(category => (
                <Button
                  key={category}
                  variant={selectedSuggestionCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSuggestionCategory(category)}
                  className="capitalize"
                >
                  {category}
                </Button>
              ))}
            </div>
            
            <div className="grid gap-2">
              {SUGGESTED_QUESTIONS[selectedSuggestionCategory].map((suggestion, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 cursor-pointer group"
                  onClick={() => addSuggestedQuestion(suggestion)}
                >
                  <span className="text-sm">{suggestion}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!isValid || isLoading}
          size="lg"
          className="px-8"
        >
          {isLoading ? 'Processing...' : 'Continue to Data Upload'}
        </Button>
      </div>
    </div>
  );
}