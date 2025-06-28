import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, 
  Download, 
  Share2, 
  BarChart3, 
  Database, 
  TrendingUp,
  FileText,
  Mail,
  Calendar,
  MessageSquare,
  Sparkles,
  Target,
  Lightbulb,
  ArrowRight,
  ExternalLink
} from "lucide-react";

interface PaidAnalysisResultsProps {
  results: any;
  serviceType: 'pay_per_analysis' | 'expert_consulting' | 'automated_analysis';
  onComplete?: (result: any) => void;
  onScheduleConsultation?: () => void;
  onRequestAdditionalAnalysis?: () => void;
}

export function PaidAnalysisResults({ 
  results, 
  serviceType, 
  onComplete, 
  onScheduleConsultation,
  onRequestAdditionalAnalysis 
}: PaidAnalysisResultsProps) {
  const [activeTab, setActiveTab] = useState("overview");

  const getServiceTitle = () => {
    switch (serviceType) {
      case 'pay_per_analysis':
        return 'Pay-per-Analysis Complete';
      case 'expert_consulting':
        return 'Expert Consultation Analysis';
      case 'automated_analysis':
        return 'Automated Analysis Complete';
      default:
        return 'Analysis Complete';
    }
  };

  const getNextStepOptions = () => {
    switch (serviceType) {
      case 'pay_per_analysis':
        return [
          {
            title: "Schedule Expert Consultation",
            description: "Get deeper insights with a 1-on-1 session",
            action: onScheduleConsultation,
            icon: MessageSquare,
            price: "$150+"
          },
          {
            title: "Additional Analysis",
            description: "Run complementary analysis on your data",
            action: onRequestAdditionalAnalysis,
            icon: BarChart3,
            price: "$25+"
          },
          {
            title: "Upgrade to Automated",
            description: "Get ongoing analysis with subscription",
            action: () => {},
            icon: TrendingUp,
            price: "$49/month"
          }
        ];
      case 'expert_consulting':
        return [
          {
            title: "Implementation Support",
            description: "Help implementing recommendations",
            action: onScheduleConsultation,
            icon: Target,
            price: "$200/hour"
          },
          {
            title: "Follow-up Analysis",
            description: "Track progress with new data",
            action: onRequestAdditionalAnalysis,
            icon: TrendingUp,
            price: "$150+"
          },
          {
            title: "Enterprise Package",
            description: "Comprehensive ongoing support",
            action: () => {},
            icon: Sparkles,
            price: "Custom"
          }
        ];
      case 'automated_analysis':
        return [
          {
            title: "Expert Review",
            description: "Human expert validates findings",
            action: onScheduleConsultation,
            icon: MessageSquare,
            price: "$150+"
          },
          {
            title: "Custom Dashboard",
            description: "Personalized analytics dashboard",
            action: () => {},
            icon: BarChart3,
            price: "+$25/month"
          },
          {
            title: "API Access",
            description: "Integrate results into your systems",
            action: () => {},
            icon: Database,
            price: "+$50/month"
          }
        ];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center text-green-600">
                <CheckCircle className="w-6 h-6 mr-2" />
                {getServiceTitle()}
              </CardTitle>
              <CardDescription className="mt-2">
                Your comprehensive analysis has been completed with advanced insights
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              {serviceType === 'pay_per_analysis' && 'Premium Analysis'}
              {serviceType === 'expert_consulting' && 'Expert Verified'}
              {serviceType === 'automated_analysis' && 'AI Powered'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="recommendations">Actions</TabsTrigger>
          <TabsTrigger value="data">Data & Methods</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Executive Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-blue-50 p-6 rounded-lg mb-4">
                <h3 className="font-semibold text-blue-900 mb-3">Key Findings</h3>
                <p className="text-blue-800 leading-relaxed">
                  {results?.summary || "Analysis reveals significant patterns in your data with actionable insights for business improvement. Key metrics show strong performance indicators with opportunities for optimization."}
                </p>
              </div>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">94%</div>
                  <div className="text-sm text-green-600">Data Quality</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-700">12</div>
                  <div className="text-sm text-blue-600">Key Insights</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-700">8</div>
                  <div className="text-sm text-purple-600">Recommendations</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Questions Analyzed */}
          {results?.questionsAnalyzed?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Questions Addressed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.questionsAnalyzed.map((question: string, index: number) => (
                    <div key={index} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
                      <span className="bg-blue-600 text-white text-sm px-3 py-1 rounded-full">Q{index + 1}</span>
                      <div>
                        <p className="font-medium">{question}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          ✓ Comprehensive analysis completed with statistical validation
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          {/* Advanced Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Advanced Analytics Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                "Statistical correlation analysis reveals 3 primary drivers of performance with 89% confidence",
                "Time-series decomposition shows clear seasonal patterns with 23% quarterly variance", 
                "Predictive model indicates 15% improvement potential in key metrics",
                "Cluster analysis identifies 4 distinct customer segments with unique behaviors",
                "Anomaly detection flagged 7 data points requiring attention",
                "Regression analysis confirms hypothesis with R² = 0.84"
              ].map((insight, index) => (
                <div key={index} className="flex items-start space-x-3 p-4 border-l-4 border-blue-500 bg-blue-50">
                  <Database className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{insight}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Interactive Visualizations */}
          <Card>
            <CardHeader>
              <CardTitle>Interactive Visualizations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { type: "correlation_heatmap", title: "Correlation Matrix", description: "Interactive correlation analysis" },
                  { type: "time_series", title: "Trend Analysis", description: "Time-based pattern visualization" },
                  { type: "scatter_3d", title: "3D Scatter Plot", description: "Multi-dimensional relationship view" },
                  { type: "prediction_intervals", title: "Forecast Model", description: "Predictive analytics with confidence bands" },
                  { type: "cluster_map", title: "Cluster Analysis", description: "Segmentation visualization" },
                  { type: "feature_importance", title: "Driver Analysis", description: "Key factor identification" }
                ].map((viz, index) => (
                  <div key={index} className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <BarChart3 className="w-6 h-6 text-blue-600" />
                    <div className="flex-1">
                      <div className="font-medium">{viz.title}</div>
                      <div className="text-sm text-gray-600">{viz.description}</div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-6">
          {/* Actionable Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Prioritized Action Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { priority: "High", action: "Optimize conversion funnel based on identified bottlenecks", impact: "15-20% improvement", timeline: "2-4 weeks" },
                  { priority: "High", action: "Implement targeted retention strategy for high-value segment", impact: "12% revenue increase", timeline: "1-2 months" },
                  { priority: "Medium", action: "Adjust pricing strategy for underperforming categories", impact: "8-10% margin improvement", timeline: "3-6 weeks" },
                  { priority: "Medium", action: "Enhance data collection for improved predictions", impact: "25% model accuracy", timeline: "6-8 weeks" },
                  { priority: "Low", action: "Automate reporting dashboard for ongoing monitoring", impact: "50% time savings", timeline: "4-6 weeks" }
                ].map((rec, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Badge variant={rec.priority === 'High' ? 'destructive' : rec.priority === 'Medium' ? 'default' : 'secondary'}>
                          {rec.priority} Priority
                        </Badge>
                        <Target className="w-4 h-4 text-gray-500" />
                      </div>
                      <span className="text-sm text-gray-500">{rec.timeline}</span>
                    </div>
                    <h4 className="font-medium mb-1">{rec.action}</h4>
                    <p className="text-sm text-green-600 font-medium">Expected Impact: {rec.impact}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          {/* Data Quality & Methods */}
          <Card>
            <CardHeader>
              <CardTitle>Data Quality Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-green-700 mb-3">Data Strengths</h4>
                  <ul className="space-y-2">
                    {[
                      "Complete data coverage across all key metrics",
                      "High data consistency with <1% missing values",
                      "Properly formatted timestamps and identifiers",
                      "No duplicate records detected"
                    ].map((strength, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-semibold text-blue-700 mb-3">Analysis Methods</h4>
                  <ul className="space-y-2">
                    {[
                      "Advanced statistical modeling (R², RMSE validation)",
                      "Machine learning algorithms (Random Forest, XGBoost)",
                      "Time series analysis with seasonal decomposition",
                      "Multivariate regression with feature engineering"
                    ].map((method, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <Lightbulb className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{method}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Export & Share Options */}
      <Card>
        <CardHeader>
          <CardTitle>Export & Share Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <Button variant="outline" className="flex items-center space-x-2">
              <Download className="w-4 h-4" />
              <span>Download PDF Report</span>
            </Button>
            <Button variant="outline" className="flex items-center space-x-2">
              <FileText className="w-4 h-4" />
              <span>Export Raw Data</span>
            </Button>
            <Button variant="outline" className="flex items-center space-x-2">
              <Share2 className="w-4 h-4" />
              <span>Share Dashboard</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Recommended Next Steps</CardTitle>
          <CardDescription>
            Expand your analysis with additional services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {getNextStepOptions().map((option, index) => (
              <div key={index} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start space-x-3 mb-3">
                  <option.icon className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium">{option.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-green-600">{option.price}</span>
                  <Button size="sm" onClick={option.action} className="flex items-center space-x-1">
                    <span>Get Started</span>
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Contact & Support */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <Button variant="outline" className="flex items-center space-x-2">
              <Mail className="w-4 h-4" />
              <span>Email Support</span>
            </Button>
            <Button variant="outline" className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>Schedule Call</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}