import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Brain, MessageSquare, Lightbulb, TrendingUp, AlertTriangle, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AIInsightsProps {
  project: any;
}

export default function AIInsights({ project }: AIInsightsProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [autoInsights, setAutoInsights] = useState<any>(null);

  const schema = project.schema || {};
  
  const suggestedQuestions = [
    "What are the main patterns in my data?",
    "Are there any outliers or anomalies I should be aware of?",
    "What insights can you provide about data quality?",
    "What are the key trends and relationships?",
    "What recommendations do you have for further analysis?",
    "What business insights can you derive from this data?"
  ];

  const generateAutoInsights = async () => {
    setIsGenerating(true);
    try {
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const mockAutoInsights = {
        summary: "Automated analysis of your dataset reveals several key insights",
        insights: [
          {
            type: "pattern",
            title: "Data Distribution Pattern",
            description: "Your data shows a normal distribution across most numeric fields with some interesting outliers in the upper quartile.",
            confidence: 0.85,
            icon: TrendingUp
          },
          {
            type: "quality",
            title: "Data Quality Assessment",
            description: "Overall data quality is good with 95% completeness. Missing values are primarily in optional fields.",
            confidence: 0.92,
            icon: Brain
          },
          {
            type: "anomaly",
            title: "Anomaly Detection",
            description: "Detected 12 potential outliers that may represent special cases or data entry errors worth investigating.",
            confidence: 0.78,
            icon: AlertTriangle
          },
          {
            type: "recommendation",
            title: "Analysis Recommendations",
            description: "Consider performing correlation analysis on numeric fields and categorical breakdown by key segments.",
            confidence: 0.88,
            icon: Lightbulb
          }
        ],
        timestamp: new Date().toISOString()
      };
      
      setAutoInsights(mockAutoInsights);
      
      toast({
        title: "Auto-insights generated",
        description: "AI analysis of your data is complete",
      });
    } catch (error) {
      toast({
        title: "Insight generation failed",
        description: "There was an error generating insights",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const askQuestion = async () => {
    if (!question.trim()) return;
    
    setIsGenerating(true);
    try {
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockAnswer = {
        question: question,
        answer: generateMockAnswer(question),
        confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0
        timestamp: new Date().toISOString(),
        suggestions: [
          "Consider analyzing seasonal patterns",
          "Look into customer segmentation",
          "Examine geographic distributions"
        ]
      };
      
      setInsights([mockAnswer, ...insights]);
      setQuestion("");
      
      toast({
        title: "Question answered",
        description: "AI has analyzed your question",
      });
    } catch (error) {
      toast({
        title: "Question processing failed",
        description: "There was an error processing your question",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateMockAnswer = (question: string) => {
    const lowerQ = question.toLowerCase();
    
    if (lowerQ.includes("pattern") || lowerQ.includes("trend")) {
      return "Based on your data, I can identify several key patterns: The data shows seasonal variations with peak activity in certain periods. There's a strong correlation between multiple variables suggesting interconnected business processes. Geographic clustering indicates regional preferences or market conditions.";
    }
    
    if (lowerQ.includes("outlier") || lowerQ.includes("anomal")) {
      return "I've detected several outliers in your dataset that warrant attention. These include unusually high values in specific categories and some data points that deviate significantly from the normal pattern. Some outliers may represent genuine edge cases, while others might indicate data quality issues.";
    }
    
    if (lowerQ.includes("quality")) {
      return "Your data quality is generally good with high completeness rates. However, I notice some inconsistencies in formatting and a few potential duplicate entries. The missing values appear to follow a pattern, suggesting they might be systematically absent rather than randomly missing.";
    }
    
    if (lowerQ.includes("business") || lowerQ.includes("insight")) {
      return "From a business perspective, your data reveals several actionable insights: Customer behavior patterns suggest opportunities for targeted marketing, operational efficiency can be improved in specific areas, and there are untapped market segments worth exploring.";
    }
    
    return "Based on your data analysis, I can provide insights tailored to your specific question. The patterns in your dataset suggest several interesting relationships and potential areas for deeper investigation. Would you like me to elaborate on any particular aspect?";
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "bg-green-100 text-green-800";
    if (confidence >= 0.6) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-6">
      {/* Auto-Generate Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Auto-Insights
          </CardTitle>
          <CardDescription>
            Let AI automatically analyze your data and provide key insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!autoInsights ? (
            <Button
              onClick={generateAutoInsights}
              disabled={isGenerating}
              className="w-full"
            >
              <Brain className="w-4 h-4 mr-2" />
              {isGenerating ? "Generating Insights..." : "Generate Auto-Insights"}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-blue-50">
                <h3 className="font-medium text-blue-900 mb-2">{autoInsights.summary}</h3>
                <p className="text-sm text-blue-700">
                  Generated {new Date(autoInsights.timestamp).toLocaleString()}
                </p>
              </div>
              
              {autoInsights.insights.map((insight: any, index: number) => {
                const Icon = insight.icon;
                return (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <Icon className="w-5 h-5 mt-1 text-blue-600" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{insight.title}</h4>
                          <Badge className={getConfidenceColor(insight.confidence)}>
                            {(insight.confidence * 100).toFixed(0)}% confidence
                          </Badge>
                        </div>
                        <p className="text-gray-600 text-sm">{insight.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              <Button
                variant="outline"
                onClick={generateAutoInsights}
                disabled={isGenerating}
              >
                Refresh Insights
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ask Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Ask AI About Your Data
          </CardTitle>
          <CardDescription>
            Ask specific questions about your data and get AI-powered answers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Textarea
              placeholder="Ask me anything about your data..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[80px]"
            />
            
            <Button
              onClick={askQuestion}
              disabled={isGenerating || !question.trim()}
            >
              <Play className="w-4 h-4 mr-2" />
              {isGenerating ? "Processing..." : "Ask Question"}
            </Button>
          </div>

          {/* Suggested Questions */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Suggested questions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuestion(q)}
                  className="text-xs"
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Previous Questions & Answers */}
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previous Questions & Insights</CardTitle>
            <CardDescription>
              Your conversation history with AI about this dataset
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.map((insight, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-blue-900">Q: {insight.question}</h4>
                    <Badge className={getConfidenceColor(insight.confidence)}>
                      {(insight.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">{insight.answer}</p>
                </div>
                
                {insight.suggestions && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-gray-700 mb-2">Follow-up suggestions:</p>
                    <div className="flex flex-wrap gap-1">
                      {insight.suggestions.map((suggestion: string, suggestionIndex: number) => (
                        <Badge key={suggestionIndex} variant="secondary" className="text-xs">
                          {suggestion}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-gray-500 mt-2">
                  {new Date(insight.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}