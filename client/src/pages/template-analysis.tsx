import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Briefcase, CheckCircle, Users, TrendingUp, Target, Star, Building, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

interface TemplateAnalysisProps {
  onBack: () => void;
}

const BUSINESS_SCENARIOS = [
  {
    id: 'hr_engagement',
    role: 'HR Analyst',
    department: 'Human Resources',
    scenario: 'Employee engagement survey analysis',
    businessQuestion: 'I want to analyze engagement scores across different managers and departments',
    expectedOutcome: 'Identify which managers/departments have highest engagement and key drivers',
    icon: Users
  },
  {
    id: 'sales_performance',
    role: 'Sales Manager',
    department: 'Sales',
    scenario: 'Sales performance analysis',
    businessQuestion: 'I want to identify top-performing products and regions for strategic planning',
    expectedOutcome: 'Strategic insights on product performance and market opportunities',
    icon: TrendingUp
  },
  {
    id: 'marketing_roi',
    role: 'Marketing Analyst',
    department: 'Marketing',
    scenario: 'Marketing campaign effectiveness',
    businessQuestion: 'I want to measure ROI and effectiveness of different marketing channels',
    expectedOutcome: 'Optimize marketing spend and channel allocation',
    icon: Target
  },
  {
    id: 'customer_satisfaction',
    role: 'Customer Success Manager',
    department: 'Customer Experience',
    scenario: 'Customer satisfaction analysis',
    businessQuestion: 'I want to understand factors driving customer satisfaction and retention',
    expectedOutcome: 'Improve customer satisfaction and reduce churn',
    icon: Star
  },
  {
    id: 'operations_efficiency',
    role: 'Operations Manager',
    department: 'Operations',
    scenario: 'Process efficiency analysis',
    businessQuestion: 'I want to identify bottlenecks and optimize operational processes',
    expectedOutcome: 'Streamline operations and reduce costs',
    icon: Building
  }
];

export default function TemplateAnalysis({ onBack }: TemplateAnalysisProps) {
  const [, setLocation] = useLocation();
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const { toast } = useToast();

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
  });

  const handleScenarioSelect = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    const scenario = BUSINESS_SCENARIOS.find(s => s.id === scenarioId);
    if (scenario) {
      toast({
        title: "Template Selected",
        description: `Selected ${scenario.role} - ${scenario.scenario}`,
      });
    }
  };

  const handleStartAnalysis = () => {
    if (!selectedScenario) {
      toast({
        title: "Select a Template",
        description: "Please choose a business scenario template to continue",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Analysis Starting",
      description: "Initializing template-based analysis workflow...",
    });

    // For now, navigate to checkout - in a full implementation this would open the guided wizard
    setLocation('/checkout?type=guided_analysis&template=' + selectedScenario);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={onBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <Briefcase className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Template-Based Analysis
            </h1>
            <p className="text-lg text-gray-600">
              Business scenarios and guided workflows for proven analytics templates
            </p>
          </div>
        </div>

        {/* Journey Features */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              What You Get
            </CardTitle>
            <CardDescription>
              This journey is designed for business users who need proven analytics templates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Pre-built Business Templates</h4>
                  <p className="text-sm text-gray-600">HR, Sales, Marketing, Customer Success scenarios</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Guided Analysis Workflows</h4>
                  <p className="text-sm text-gray-600">Step-by-step process tailored to your role</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Role-based Scenarios</h4>
                  <p className="text-sm text-gray-600">Templates designed for specific business functions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">AI-assisted Interpretation</h4>
                  <p className="text-sm text-gray-600">Smart insights and business-friendly explanations</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium">Executive-ready Reports</h4>
                  <p className="text-sm text-gray-600">Professional outputs for stakeholder presentations</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Scenario Selection */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Choose Your Business Scenario</CardTitle>
            <CardDescription>
              Select a pre-built template that matches your analysis needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {BUSINESS_SCENARIOS.map((scenario) => {
                const IconComponent = scenario.icon;
                return (
                  <Card 
                    key={scenario.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedScenario === scenario.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => handleScenarioSelect(scenario.id)}
                    data-testid={`scenario-${scenario.id}`}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <IconComponent className="w-5 h-5" />
                        {scenario.role}
                      </CardTitle>
                      <CardDescription>{scenario.department}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 mb-3">{scenario.businessQuestion}</p>
                      <Badge variant="outline" className="text-xs">
                        {scenario.expectedOutcome.substring(0, 40)}...
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            
            <div className="text-center">
              <Button 
                onClick={handleStartAnalysis}
                className="bg-blue-600 hover:bg-blue-700"
                size="lg"
                disabled={!selectedScenario}
                data-testid="button-start-template-analysis"
              >
                {selectedScenario ? 'Start Analysis with Selected Template' : 'Select a Template First'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Transparent Pricing</CardTitle>
            <CardDescription>
              Pay only for what you use, with clear pricing for each analysis type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Descriptive Analysis</h4>
                <p className="text-2xl font-bold text-blue-600">$25</p>
                <p className="text-sm text-gray-600">Summary statistics & exploration</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Comparative Analysis</h4>
                <p className="text-2xl font-bold text-blue-600">$40</p>
                <p className="text-sm text-gray-600">Statistical testing & comparisons</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-50">
                <h4 className="font-medium mb-2">Predictive Analysis</h4>
                <p className="text-2xl font-bold text-blue-600">$70</p>
                <p className="text-sm text-gray-600">Forecasting & trend analysis</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 text-center mt-4">
              Final pricing calculated based on your specific requirements and data complexity
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}