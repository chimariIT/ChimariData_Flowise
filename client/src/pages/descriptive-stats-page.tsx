import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, Brain, Download, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { DescriptiveStatsLazy } from "@/components/LazyComponents";
import { AdvancedAnalysisModalLazy } from "@/components/LazyComponents";
import { DataProject } from "@shared/schema";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export default function DescriptiveStatsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingViz, setIsGeneratingViz] = useState(false);
  
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

  const handleExportReport = async () => {
    if (!id) return;

    setIsExporting(true);
    try {
      // Try to export as PDF/CSV
      const response = await apiClient.get(`/api/projects/${id}/export/report`);

      if (response?.downloadUrl) {
        // If we get a download URL, open it
        window.open(response.downloadUrl, '_blank');
        toast({
          title: "Export Started",
          description: "Your report is being generated and will download shortly.",
        });
      } else if (response?.data) {
        // If we get data directly, create a downloadable file
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project?.name || 'report'}-statistics.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast({
          title: "Report Exported",
          description: "Your statistics report has been downloaded.",
        });
      } else {
        toast({
          title: "Export Available",
          description: "Export functionality will be available after analysis is complete.",
          variant: "default",
        });
      }
    } catch (error: any) {
      console.error('Export failed:', error);
      toast({
        title: "Export Not Available",
        description: "Complete the analysis journey to unlock export features.",
        variant: "default",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateVisualizations = () => {
    if (!id) return;

    // Navigate to the visualization page or dashboard builder for this project
    setLocation(`/projects/${id}/dashboard`);
    toast({
      title: "Opening Visualization Builder",
      description: "Create custom charts and dashboards for your data.",
    });
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

        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={handleGenerateVisualizations}
          disabled={isGeneratingViz}
        >
          {isGeneratingViz ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TrendingUp className="h-4 w-4" />
          )}
          Generate Visualizations
        </Button>

        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={handleExportReport}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export Report
        </Button>
      </div>
      
      {/* Project Analysis Summary - User only sees their current project analysis */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Project Analysis Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            This page shows statistics for your current project. To run additional analyses,
            use the Advanced Analysis button above or continue your analysis journey.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg bg-muted/30">
              <h3 className="font-semibold text-gray-700">Records</h3>
              <p className="text-2xl font-bold text-primary">
                {project?.recordCount?.toLocaleString() || 0}
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-muted/30">
              <h3 className="font-semibold text-gray-700">Variables</h3>
              <p className="text-2xl font-bold text-primary">
                {Object.keys(project?.schema || {}).length}
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-muted/30">
              <h3 className="font-semibold text-gray-700">Data Quality</h3>
              <p className="text-2xl font-bold text-primary">
                {(project as any)?.qualityScore || 'N/A'}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Descriptive Statistics */}
      <DescriptiveStatsLazy project={project} analysisResult={analysisResult} />
      
      {/* Advanced Analysis Modal */}
      <AdvancedAnalysisModalLazy
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        projectId={id || ''}
        schema={project.schema || {}}
      />
    </div>
  );
}