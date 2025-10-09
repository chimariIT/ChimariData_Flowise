import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Brain, 
  BarChart3, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  Lightbulb,
  Activity,
  Eye,
  Loader2
} from 'lucide-react';

interface AIInsightsPanelProps {
  projectId: string;
  onPaymentRequired?: (projectId: string, analysisType: string) => void;
}

interface DataInsights {
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  dataQuality: {
    completeness: number;
    consistency: number;
    accuracy: number;
    issues: string[];
  };
}

interface VisualizationSuggestion {
  type: string;
  title: string;
  description: string;
  columns: string[];
  config: any;
}

export default function AIInsightsPanel({ projectId, onPaymentRequired }: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<DataInsights | null>(null);
  const [visualizations, setVisualizations] = useState<VisualizationSuggestion[]>([]);
  const { toast } = useToast();

  const insightsMutation = useMutation({
    mutationFn: async () => {
      console.log("Making AI insights request for project:", projectId);
      try {
        const res = await apiRequest("POST", "/api/ai/insights", { projectId });
        return res.json();
      } catch (error) {
        console.error("API request failed:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("AI insights success:", data);
      setInsights(data.insights);
      toast({
        title: "Insights Generated",
        description: "AI analysis completed successfully",
      });
    },
    onError: (error: any) => {
      console.error("AI insights error:", error);
      const errorMsg = error.message || "Failed to generate insights";
      console.log("Error message:", errorMsg);
      

      
      if (errorMsg.includes("Payment required") || errorMsg.includes("402")) {
        console.log("Payment required error detected");
        if (onPaymentRequired) {
          onPaymentRequired(projectId, "insights");
        } else {
          toast({
            title: "Payment Required",
            description: "Complete payment to access AI insights",
            variant: "destructive",
          });
        }
      } else if (errorMsg.includes("401") || errorMsg.includes("Authentication required")) {
        console.log("Authentication error detected, redirecting to auth");
        // User is not logged in - redirect to auth
        toast({
          title: "Login Required",
          description: "Please log in to access AI insights",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 1500);
      } else if (errorMsg.includes("quota exceeded")) {
        toast({
          title: "Usage Limit Reached",
          description: "Upgrade your plan for more AI analysis",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Analysis Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    }
  });

  const visualizationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/visualizations", { projectId });
      return res.json();
    },
    onSuccess: (data) => {
      setVisualizations(data.suggestions);
      toast({
        title: "Visualizations Ready",
        description: "Chart suggestions generated",
      });
    },
    onError: (error: any) => {
      const errorMsg = error.message || "Failed to generate visualizations";
      
      if (errorMsg.includes("Payment required") || errorMsg.includes("402")) {
        if (onPaymentRequired) {
          onPaymentRequired(projectId, "visualizations");
        } else {
          toast({
            title: "Payment Required",
            description: "Complete payment to access chart suggestions",
            variant: "destructive",
          });
        }
      } else if (errorMsg.includes("401") || errorMsg.includes("Authentication required")) {
        // User is not logged in - redirect to auth
        toast({
          title: "Login Required",
          description: "Please log in to access chart suggestions",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 1500);
      } else {
        toast({
          title: "Visualization Failed",
          description: errorMsg,
          variant: "destructive",
        });
      }
    }
  });

  const getQualityColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 75) return "text-yellow-600";
    return "text-red-600";
  };

  const getChartIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'bar':
      case 'histogram':
        return <BarChart3 className="w-4 h-4" />;
      case 'line':
      case 'scatter':
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button 
          onClick={() => {
            console.log("Generate Insights button clicked");
            insightsMutation.mutate();
          }}
          disabled={insightsMutation.isPending}
          className="flex items-center gap-2"
        >
          {insightsMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Brain className="w-4 h-4" />
          )}
          Generate Insights
        </Button>
        
        <Button 
          onClick={() => visualizationsMutation.mutate()}
          disabled={visualizationsMutation.isPending}
          variant="outline"
          className="flex items-center gap-2"
        >
          {visualizationsMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          Suggest Charts
        </Button>
      </div>

      {/* Data Quality Overview */}
      {insights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Data Quality Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${getQualityColor(insights.dataQuality.completeness)}`}>
                  {insights.dataQuality.completeness}%
                </div>
                <div className="text-sm text-gray-600">Completeness</div>
                <Progress value={insights.dataQuality.completeness} className="mt-2" />
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${getQualityColor(insights.dataQuality.consistency)}`}>
                  {insights.dataQuality.consistency}%
                </div>
                <div className="text-sm text-gray-600">Consistency</div>
                <Progress value={insights.dataQuality.consistency} className="mt-2" />
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${getQualityColor(insights.dataQuality.accuracy)}`}>
                  {insights.dataQuality.accuracy}%
                </div>
                <div className="text-sm text-gray-600">Accuracy</div>
                <Progress value={insights.dataQuality.accuracy} className="mt-2" />
              </div>
            </div>
            
            {insights.dataQuality.issues.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  Data Quality Issues
                </h4>
                <ul className="space-y-1">
                  {insights.dataQuality.issues.map((issue, index) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Executive Summary */}
      {insights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-600" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 leading-relaxed">{insights.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Key Findings */}
      {insights && insights.keyFindings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Key Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.keyFindings.map((finding, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Badge variant="secondary" className="mt-0.5">
                    {index + 1}
                  </Badge>
                  <p className="text-gray-700">{finding}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {insights && insights.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-600" />
              Business Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5">
                    {index + 1}
                  </Badge>
                  <p className="text-gray-700">{recommendation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visualization Suggestions */}
      {visualizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Recommended Visualizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {visualizations.map((viz, index) => (
                <div key={index} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      {getChartIcon(viz.type)}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{viz.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{viz.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {viz.type.toUpperCase()}
                        </Badge>
                        {viz.columns.map((col, colIndex) => (
                          <Badge key={colIndex} variant="outline" className="text-xs">
                            {col}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!insights && !visualizations.length && !insightsMutation.isPending && !visualizationsMutation.isPending && (
        <Card>
          <CardContent className="text-center py-12">
            <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              AI Analysis Ready
            </h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Generate comprehensive insights and visualization suggestions for your data using AI-powered analysis.
            </p>
            <div className="flex justify-center gap-4">
              <Button 
                onClick={() => insightsMutation.mutate()}
                className="flex items-center gap-2"
              >
                <Brain className="w-4 h-4" />
                Start Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}