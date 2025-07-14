import React, { useState } from 'react';
import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, TrendingUp, BarChart3, Brain } from "lucide-react";
import { Link } from "wouter";
import { DescriptiveStats } from "@/components/descriptive-stats";
import AdvancedAnalysisModal from "@/components/advanced-analysis-modal";
import { DataProject } from "@shared/schema";

export default function DescriptiveStatsPage() {
  const { id } = useParams<{ id: string }>();
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  
  const { data: project, isLoading } = useQuery<DataProject>({
    queryKey: [`/api/projects/${id}`],
    enabled: !!id,
  });
  
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }
  
  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Project not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const handleAnalysisComplete = (result: any) => {
    setAnalysisResult(result);
    setIsAnalysisModalOpen(false);
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground">{project.description}</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {project.recordCount} records
            </Badge>
            <Badge variant="outline">
              {Object.keys(project.schema || {}).length} variables
            </Badge>
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="mb-8 flex flex-wrap gap-4">
        <Button 
          onClick={() => setIsAnalysisModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Brain className="h-4 w-4" />
          Advanced Analysis
        </Button>
        
        <Button variant="outline" className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Generate Visualizations
        </Button>
        
        <Button variant="outline" className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Export Report
        </Button>
      </div>
      
      {/* Analysis Path Selection */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Analysis Paths</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <h3 className="font-semibold text-green-700">Relationship Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Discover connections between variables using correlation, ANOVA, or regression analysis
              </p>
            </div>
            
            <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <h3 className="font-semibold text-blue-700">Predictive Modeling</h3>
              <p className="text-sm text-muted-foreground">
                Build models to predict outcomes using machine learning algorithms
              </p>
            </div>
            
            <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <h3 className="font-semibold text-purple-700">Group Classification</h3>
              <p className="text-sm text-muted-foreground">
                Classify data into groups using clustering or discriminant analysis
              </p>
            </div>
            
            <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <h3 className="font-semibold text-orange-700">Structure Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Explore underlying patterns using factor analysis or PCA
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Descriptive Statistics */}
      <DescriptiveStats project={project} analysisResult={analysisResult} />
      
      {/* Advanced Analysis Modal */}
      <AdvancedAnalysisModal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        projectId={id || ''}
        schema={project.schema || {}}
      />
    </div>
  );
}