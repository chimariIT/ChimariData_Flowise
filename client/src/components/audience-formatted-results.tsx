import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users, TrendingUp, BarChart3, FileText, Lightbulb, Target, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';

interface AudienceFormattedResultsProps {
  projectId: string;
  analysisId?: string;
  onBack?: () => void;
}

interface FormattedResult {
  executiveSummary?: string;
  technicalDetails?: string;
  businessInsights?: string[];
  actionableRecommendations?: string[];
  visualizations?: any[];
  methodology?: string;
  confidence?: number;
  nextSteps?: string[];
}

interface AnalysisMetadata {
  analysisType: string;
  audienceType: string;
  timestamp: string;
  dataSize: number;
  columnCount: number;
  columns?: any[];
  journeyType?: string;
}

export function AudienceFormattedResults({ projectId, analysisId, onBack }: AudienceFormattedResultsProps) {
  const [formattedResults, setFormattedResults] = useState<FormattedResult | null>(null);
  const [metadata, setMetadata] = useState<AnalysisMetadata | null>(null);
  const [audienceContext, setAudienceContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAudience, setSelectedAudience] = useState<string>('mixed');
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const audienceOptions = [
    { value: 'executive', label: 'Executive Leadership', icon: Users, description: 'Strategic insights and ROI' },
    { value: 'technical', label: 'Technical Team', icon: BarChart3, description: 'Detailed technical analysis' },
    { value: 'business_ops', label: 'Business Operations', icon: TrendingUp, description: 'Operational improvements' },
    { value: 'marketing', label: 'Marketing Team', icon: Target, description: 'Customer insights and campaigns' },
    { value: 'mixed', label: 'Mixed Audience', icon: Users, description: 'Comprehensive multi-stakeholder view' }
  ];

  useEffect(() => {
    loadAnalysisResults();
  }, [projectId, analysisId]);

  const loadAnalysisResults = async (audienceType?: string) => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiClient.getAudienceAnalysisResults(projectId, audienceType);

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to load analysis results');
      }

      setFormattedResults(data.formattedResults);
      setMetadata({
        analysisType: data.analysisType || data.metadata?.analysisType || 'analysis',
        audienceType: data.audienceContext?.primaryAudience || audienceType || 'mixed',
        timestamp: data.metadata?.timestamp || data.createdAt || new Date().toISOString(),
        dataSize: data.metadata?.dataSize || data.metadata?.schema?.totalRows || 0,
        columnCount: data.metadata?.columns?.length || data.metadata?.schema?.totalColumns || data.metadata?.columnCount || 0,
      });
      setAudienceContext(data.audienceContext);
      setSelectedAudience(data.audienceContext?.primaryAudience || audienceType || 'mixed');
    } catch (err: any) {
      console.error('Failed to load analysis results:', err);
      setError(err.message || 'Failed to load analysis results');
      toast({
        title: "Error",
        description: err.message || "Failed to load analysis results",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAudienceChange = async (newAudience: string) => {
    if (newAudience === selectedAudience) return;

    setRefreshing(true);
    try {
      await loadAnalysisResults(newAudience);
    } finally {
      setRefreshing(false);
    }
  };

  const getAudienceIcon = (audienceType: string) => {
    const option = audienceOptions.find(opt => opt.value === audienceType);
    return option ? option.icon : Users;
  };

  const getAudienceLabel = (audienceType: string) => {
    const option = audienceOptions.find(opt => opt.value === audienceType);
    return option ? option.label : 'Unknown Audience';
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading analysis results...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        {onBack && (
          <Button onClick={onBack} className="mt-4">
            ← Back
          </Button>
        )}
      </div>
    );
  }

  if (!formattedResults || !metadata) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Alert>
          <AlertDescription>No analysis results found for this project.</AlertDescription>
        </Alert>
        {onBack && (
          <Button onClick={onBack} className="mt-4">
            ← Back
          </Button>
        )}
      </div>
    );
  }

  const AudienceIcon = getAudienceIcon(selectedAudience);
  const insightCount = formattedResults?.businessInsights?.length ?? 0;
  const recommendationCount = formattedResults?.actionableRecommendations?.length ?? 0;
  const visualizationCount = formattedResults?.visualizations?.length ?? 0;
  const pipelineTimestamp = metadata?.timestamp ? new Date(metadata.timestamp).toLocaleString() : '—';

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <AudienceIcon className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Analysis Results</h1>
              <p className="text-gray-600">
                {getAudienceLabel(selectedAudience)} • {metadata.analysisType} Analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={selectedAudience} onValueChange={handleAudienceChange} disabled={refreshing}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                {audienceOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {onBack && (
              <Button variant="outline" onClick={onBack}>
                ← Back
              </Button>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex gap-4 text-sm text-gray-600">
          <Badge variant="secondary">{metadata.dataSize.toLocaleString()} records</Badge>
          <Badge variant="secondary">{metadata.columnCount} columns</Badge>
          <Badge variant="secondary">
            {new Date(metadata.timestamp).toLocaleDateString()}
          </Badge>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Input • Process • Output Snapshot
          </CardTitle>
          <CardDescription>
            Trace what data powered this analysis, how it was processed, and what deliverables were produced.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-slate-50 rounded-lg border">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Inputs</p>
              <ul className="text-sm text-slate-700 space-y-2">
                <li>
                  <span className="font-medium">Rows:</span> {(metadata?.dataSize ?? 0).toLocaleString()}
                </li>
                <li>
                  <span className="font-medium">Columns:</span> {metadata?.columnCount ?? metadata?.columns?.length ?? 0}
                </li>
                <li>
                  <span className="font-medium">Audience:</span> {audienceContext?.primaryAudience || selectedAudience}
                </li>
              </ul>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Process</p>
              <ul className="text-sm text-slate-700 space-y-2">
                <li>
                  <span className="font-medium">Analysis:</span> {metadata?.analysisType || 'Unknown'}
                </li>
                <li>
                  <span className="font-medium">Journey:</span> {audienceContext?.journeyType || metadata?.journeyType || 'non-tech'}
                </li>
                <li>
                  <span className="font-medium">Executed:</span> {pipelineTimestamp}
                </li>
              </ul>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border">
              <p className="text-xs uppercase font-semibold text-slate-500 mb-2">Outputs</p>
              <ul className="text-sm text-slate-700 space-y-2">
                <li>
                  <span className="font-medium">Insights:</span> {insightCount}
                </li>
                <li>
                  <span className="font-medium">Recommendations:</span> {recommendationCount}
                </li>
                <li>
                  <span className="font-medium">Visualizations:</span> {visualizationCount}
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="recommendations">Actions</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Executive Summary */}
          {formattedResults.executiveSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <p className="text-gray-700 leading-relaxed">
                    {formattedResults.executiveSummary}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Business Insights */}
          {formattedResults.businessInsights && formattedResults.businessInsights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5" />
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {formattedResults.businessInsights.map((insight, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                      <p className="text-gray-700">{insight}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Visualizations */}
          {formattedResults.visualizations && formattedResults.visualizations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Visualizations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {formattedResults.visualizations.map((viz, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-2">{viz.title || `Visualization ${index + 1}`}</h4>
                      {viz.image && (
                        <img
                          src={`data:image/png;base64,${viz.image}`}
                          alt={viz.title || `Visualization ${index + 1}`}
                          className="w-full h-auto rounded"
                        />
                      )}
                      {viz.insights && (
                        <div className="mt-3 text-sm text-gray-600">
                          <h5 className="font-medium mb-1">Key Insights:</h5>
                          <ul className="list-disc list-inside space-y-1">
                            {viz.insights.map((insight: string, i: number) => (
                              <li key={i}>{insight}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          {formattedResults.businessInsights && formattedResults.businessInsights.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5" />
                  Detailed Insights
                </CardTitle>
                <CardDescription>
                  In-depth analysis findings tailored for {getAudienceLabel(selectedAudience).toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {formattedResults.businessInsights.map((insight, index) => (
                    <div key={index} className="p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                          {index + 1}
                        </div>
                        <p className="text-gray-800">{insight}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No detailed insights available for this audience type.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-6">
          {formattedResults.actionableRecommendations && formattedResults.actionableRecommendations.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Actionable Recommendations
                  </CardTitle>
                  <CardDescription>
                    Specific steps to implement findings for {getAudienceLabel(selectedAudience).toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {formattedResults.actionableRecommendations.map((recommendation, index) => (
                      <div key={index} className="p-4 bg-green-50 rounded-lg">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                            {index + 1}
                          </div>
                          <p className="text-gray-800">{recommendation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Next Steps */}
              {formattedResults.nextSteps && formattedResults.nextSteps.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ArrowRight className="w-5 h-5" />
                      Next Steps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {formattedResults.nextSteps.map((step, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0" />
                          <p className="text-gray-700">{step}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No recommendations available for this audience type.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="technical" className="space-y-6">
          {formattedResults.technicalDetails ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Technical Details
                </CardTitle>
                <CardDescription>
                  Detailed technical analysis and methodology
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {formattedResults.technicalDetails}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No technical details available for this audience type.</p>
              </CardContent>
            </Card>
          )}

          {/* Methodology */}
          {formattedResults.methodology && (
            <Card>
              <CardHeader>
                <CardTitle>Methodology</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {formattedResults.methodology}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Confidence Score */}
          {formattedResults.confidence && (
            <Card>
              <CardHeader>
                <CardTitle>Analysis Confidence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-blue-600">
                    {Math.round(formattedResults.confidence * 100)}%
                  </div>
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${formattedResults.confidence * 100}%` }}
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Confidence in analysis results and recommendations
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
