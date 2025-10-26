import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Eye, CreditCard, CheckCircle, BarChart3, TrendingUp, Users, Target, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ResultsPreviewProps {
  projectId: string;
  analysisType: string;
  analysisConfig: any;
  audienceContext: any;
  onProceedToPayment: () => void;
  onBack: () => void;
}

interface PreviewData {
  summary: string;
  keyInsights: string[];
  expectedRecommendations: string[];
  estimatedValue: string;
  confidence: number;
  sampleVisualizations: string[];
  methodology: string;
}

export function ResultsPreview({ 
  projectId, 
  analysisType, 
  analysisConfig, 
  audienceContext, 
  onProceedToPayment, 
  onBack 
}: ResultsPreviewProps) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    generatePreview();
  }, [projectId, analysisType, analysisConfig, audienceContext]);

  const generatePreview = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/audience-formatting/preview-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          projectId,
          analysisType,
          audienceContext
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      const data = await response.json();
      
      if (data.success) {
        setPreviewData({
          summary: data.preview.summary,
          keyInsights: data.preview.keyInsights,
          expectedRecommendations: data.preview.recommendations,
          estimatedValue: data.estimatedValue,
          confidence: 0.85, // Default confidence for preview
          sampleVisualizations: ['Data Overview', 'Key Metrics', 'Trend Analysis'],
          methodology: `Advanced ${analysisType} analysis using statistical methods and AI-powered insights`
        });
      } else {
        throw new Error(data.error || 'Failed to generate preview');
      }
    } catch (err: any) {
      console.error('Failed to generate preview:', err);
      setError(err.message);
      
      // Fallback preview data
      setPreviewData({
        summary: `This ${analysisType} analysis will provide comprehensive insights tailored for ${audienceContext.primaryAudience} audience, revealing key patterns and opportunities in your data.`,
        keyInsights: [
          'Data patterns and trends will be identified',
          'Key performance indicators will be analyzed',
          'Strategic opportunities will be highlighted',
          'Risk factors will be assessed'
        ],
        expectedRecommendations: [
          'Implement data-driven decision making',
          'Optimize key business processes',
          'Establish performance monitoring',
          'Develop strategic initiatives'
        ],
        estimatedValue: 'Strategic decision support and actionable insights',
        confidence: 0.8,
        sampleVisualizations: ['Data Overview', 'Key Metrics', 'Trend Analysis'],
        methodology: `Advanced ${analysisType} analysis using statistical methods and AI-powered insights`
      });
    } finally {
      setLoading(false);
    }
  };

  const getAudienceIcon = (audienceType: string) => {
    switch (audienceType) {
      case 'executive': return Users;
      case 'technical': return BarChart3;
      case 'business_ops': return TrendingUp;
      case 'marketing': return Target;
      default: return Users;
    }
  };

  const getAudienceLabel = (audienceType: string) => {
    switch (audienceType) {
      case 'executive': return 'Executive Leadership';
      case 'technical': return 'Technical Team';
      case 'business_ops': return 'Business Operations';
      case 'marketing': return 'Marketing Team';
      case 'mixed': return 'Mixed Audience';
      default: return 'General Audience';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Generating analysis preview...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !previewData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={onBack} className="mt-4">
          ← Back
        </Button>
      </div>
    );
  }

  const AudienceIcon = getAudienceIcon(audienceContext.primaryAudience);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Eye className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Analysis Preview</h1>
              <p className="text-gray-600">
                See what you'll get before you pay
              </p>
            </div>
          </div>
          
          <Button variant="outline" onClick={onBack}>
            ← Back
          </Button>
        </div>

        {/* Analysis Info */}
        <div className="flex gap-4 text-sm">
          <Badge variant="secondary">{analysisType} Analysis</Badge>
          <Badge variant="secondary">
            <AudienceIcon className="w-3 h-3 mr-1" />
            {getAudienceLabel(audienceContext.primaryAudience)}
          </Badge>
        </div>
      </div>

      {/* Preview Content */}
      <div className="space-y-6">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              What You'll Get
            </CardTitle>
            <CardDescription>
              Preview of your analysis results tailored for {getAudienceLabel(audienceContext.primaryAudience).toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 p-4 rounded-lg mb-4">
              <p className="text-blue-800 leading-relaxed">
                {previewData?.summary}
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">
                  {Math.round((previewData?.confidence || 0.8) * 100)}%
                </div>
                <div className="text-sm text-green-600">Confidence</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">
                  {previewData?.keyInsights.length || 4}
                </div>
                <div className="text-sm text-blue-600">Key Insights</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-700">
                  {previewData?.expectedRecommendations.length || 4}
                </div>
                <div className="text-sm text-purple-600">Recommendations</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expected Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Expected Key Insights
            </CardTitle>
            <CardDescription>
              These are the types of insights you can expect from your analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {previewData?.keyInsights.map((insight, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                    {index + 1}
                  </div>
                  <p className="text-gray-700">{insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expected Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Expected Recommendations
            </CardTitle>
            <CardDescription>
              Actionable steps you'll receive based on the analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {previewData?.expectedRecommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                    {index + 1}
                  </div>
                  <p className="text-gray-700">{recommendation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Visualizations Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Sample Visualizations
            </CardTitle>
            <CardDescription>
              Types of charts and visualizations you'll receive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {previewData?.sampleVisualizations.map((viz, index) => (
                <div key={index} className="p-3 border rounded-lg text-center">
                  <BarChart3 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-medium">{viz}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Value Proposition */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Value Proposition
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-green-800 font-medium mb-2">
                {previewData?.estimatedValue}
              </p>
              <p className="text-green-700 text-sm">
                This analysis will provide data-driven insights to support your decision-making process 
                and help optimize your business operations.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Button 
                onClick={onProceedToPayment}
                className="flex-1"
                size="lg"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Proceed to Payment
              </Button>
              <Button 
                variant="outline" 
                onClick={onBack}
                size="lg"
              >
                ← Back to Configuration
              </Button>
            </div>
            
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                💡 <strong>Preview Mode:</strong> This shows what you can expect from your analysis. 
                The actual results will be more detailed and specific to your data.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
