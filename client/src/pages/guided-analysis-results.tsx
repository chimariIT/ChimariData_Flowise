import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Download, 
  BarChart3, 
  Brain, 
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface AnalysisResult {
  analysisId: string;
  status: 'pending_payment' | 'processing' | 'completed' | 'failed';
  config: any;
  pricing: any;
  results?: any;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

const GuidedAnalysisResults: React.FC = () => {
  const [match, params] = useRoute('/guided-analysis-results/:analysisId');
  const [, setLocation] = useLocation();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (match && params?.analysisId) {
      fetchAnalysisResults(params.analysisId);
      
      // Set up polling for in-progress analyses
      const pollInterval = setInterval(() => {
        if (analysis?.status === 'processing') {
          fetchAnalysisResults(params.analysisId);
        }
      }, 5000);

      return () => clearInterval(pollInterval);
    }
  }, [match, params?.analysisId, analysis?.status]);

  const fetchAnalysisResults = async (analysisId: string) => {
    try {
      const result = await apiClient.getGuidedAnalysisResults(analysisId);
      setAnalysis(result);
    } catch (error) {
      console.error('Failed to fetch analysis results:', error);
      toast({
        title: "Error",
        description: "Failed to load analysis results",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Analysis Complete';
      case 'processing':
        return 'Processing Analysis';
      case 'failed':
        return 'Analysis Failed';
      case 'pending_payment':
        return 'Payment Pending';
      default:
        return 'Unknown Status';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading analysis results...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Analysis Not Found</h1>
            <p className="text-gray-600 mb-4">The analysis you're looking for doesn't exist or you don't have access to it.</p>
            <Button onClick={() => setLocation('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                onClick={() => setLocation('/dashboard')}
                className="p-2"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Guided Analysis Results</h1>
                <p className="text-gray-600">Analysis ID: {analysis.analysisId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(analysis.status)}
              <Badge className={getStatusColor(analysis.status)}>
                {getStatusText(analysis.status)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Analysis Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Analysis Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Analysis Type</p>
                <p className="font-medium">{analysis.config.analysisType || 'Comprehensive Analysis'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Variables Selected</p>
                <p className="font-medium">{analysis.config.selectedVariables?.length || 0} variables</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Created</p>
                <p className="font-medium">{new Date(analysis.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Cost</p>
                <p className="font-medium">${analysis.pricing.total.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status-specific content */}
        {analysis.status === 'processing' && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-600" />
                <h3 className="text-lg font-semibold mb-2">Processing Your Analysis</h3>
                <p className="text-gray-600">
                  Your guided analysis is currently being processed. This may take a few minutes depending on the complexity of your analysis.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {analysis.status === 'failed' && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Analysis Failed</h3>
                <p className="text-gray-600 mb-4">
                  {analysis.error || 'An error occurred while processing your analysis.'}
                </p>
                <Button onClick={() => setLocation('/dashboard')}>
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {analysis.status === 'completed' && analysis.results && (
          <>
            {/* Analysis Results */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Analysis Results
                </CardTitle>
                <CardDescription>
                  Statistical analysis and insights from your data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analysis.results.analysis && (
                    <div>
                      <h4 className="font-semibold mb-2">Statistical Analysis</h4>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <pre className="text-sm overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(analysis.results.analysis, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {analysis.results.insights && (
                    <div>
                      <h4 className="font-semibold mb-2">AI Insights</h4>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm">{analysis.results.insights}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  <Button className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Download Results
                  </Button>
                  <Button variant="outline" onClick={() => setLocation('/dashboard')}>
                    Back to Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default GuidedAnalysisResults;