import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { ArrowLeft, BarChart3, PieChart, LineChart, ScatterChart, TrendingUp, Zap, CreditCard } from "lucide-react";

interface VisualizationPageProps {
  onBack: () => void;
  onPaymentRequired: (projectId: string, visualizationType: string) => void;
}

export default function VisualizationPage({ onBack, onPaymentRequired }: VisualizationPageProps) {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedVisualization, setSelectedVisualization] = useState<string>("");
  const { toast } = useToast();

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
  });

  const visualizationTypes = [
    {
      id: "bar-chart",
      name: "Bar Chart",
      description: "Compare values across categories",
      icon: BarChart3,
      complexity: "Basic",
      price: 5
    },
    {
      id: "pie-chart", 
      name: "Pie Chart",
      description: "Show proportions and percentages",
      icon: PieChart,
      complexity: "Basic",
      price: 5
    },
    {
      id: "line-chart",
      name: "Line Chart", 
      description: "Track trends over time",
      icon: LineChart,
      complexity: "Standard",
      price: 10
    },
    {
      id: "scatter-plot",
      name: "Scatter Plot",
      description: "Explore relationships between variables",
      icon: ScatterChart,
      complexity: "Advanced",
      price: 15
    },
    {
      id: "trend-analysis",
      name: "Trend Analysis",
      description: "Advanced trend detection and forecasting",
      icon: TrendingUp,
      complexity: "Premium",
      price: 25
    }
  ];

  const handleCreateVisualization = () => {
    if (!selectedProject) {
      toast({
        title: "Project Required",
        description: "Please select a project to create visualizations for.",
        variant: "destructive"
      });
      return;
    }

    if (!selectedVisualization) {
      toast({
        title: "Visualization Required", 
        description: "Please select a visualization type to create.",
        variant: "destructive"
      });
      return;
    }

    // Navigate to payment page
    onPaymentRequired(selectedProject, selectedVisualization);
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case "Basic": return "bg-green-100 text-green-700";
      case "Standard": return "bg-blue-100 text-blue-700";
      case "Advanced": return "bg-orange-100 text-orange-700";
      case "Premium": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
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
              <h1 className="text-3xl font-bold text-slate-900">Create Visualization</h1>
              <p className="text-slate-600 mt-1">Generate charts and visualizations from your data</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Project Selection */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Select Project</CardTitle>
                <CardDescription>
                  Choose a project to create visualizations for
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
          </div>

          {/* Visualization Types */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Visualization Types</CardTitle>
                <CardDescription>
                  Choose the type of visualization you want to create
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visualizationTypes.map((viz) => {
                    const Icon = viz.icon;
                    return (
                      <div
                        key={viz.id}
                        onClick={() => setSelectedVisualization(viz.id)}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          selectedVisualization === viz.id
                            ? 'border-primary bg-primary/5'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-medium text-slate-900">{viz.name}</h3>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={getComplexityColor(viz.complexity)}>
                                  {viz.complexity}
                                </Badge>
                                <span className="text-sm font-medium text-slate-600">${viz.price}</span>
                              </div>
                            </div>
                            <p className="text-sm text-slate-600">{viz.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleCreateVisualization}
                disabled={!selectedProject || !selectedVisualization}
                size="lg"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Proceed to Payment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}