import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Eye, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  BarChart3,
  TrendingUp,
  Target
} from "lucide-react";
import { ResultsPreview } from "@/components/results-preview";
import { useProjectSession } from "@/hooks/useProjectSession";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ResultsPreviewStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean;
}

export default function ResultsPreviewStep({ 
  journeyType, 
  onNext, 
  onPrevious, 
  renderAsContent = false 
}: ResultsPreviewStepProps) {
  const { toast } = useToast();
  const { session, getExecuteData } = useProjectSession({
    journeyType: journeyType as 'non-tech' | 'business' | 'technical' | 'consultation'
  });

  const [analysisType, setAnalysisType] = useState<string>("");
  const [analysisConfig, setAnalysisConfig] = useState<any>(null);
  const [audienceContext, setAudienceContext] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreviewData();
  }, []);

  const loadPreviewData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get execute data from session
      const executeData = await getExecuteData();
      
      if (executeData && executeData.selectedAnalyses) {
        setAnalysisType(executeData.selectedAnalyses[0] || "Comprehensive Analysis");
        setAnalysisConfig({
          questions: executeData.selectedAnalyses,
          dataSize: executeData.dataSizeMB || 0,
          recordCount: executeData.recordCount || 0
        });
      }

      // Get audience context from prepare data
      const projectId = session?.projectId;
      if (projectId) {
        try {
          const response = await fetch(`/api/project-session/${projectId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
          });
          
          if (response.ok) {
            const sessionData = await response.json();
            if (sessionData?.prepare?.audience) {
              setAudienceContext({
                primaryAudience: sessionData.prepare.audience.primaryAudience || 'mixed',
                secondaryAudiences: sessionData.prepare.audience.secondaryAudiences || [],
                decisionContext: sessionData.prepare.audience.decisionContext || '',
                journeyType: journeyType
              });
            }
          }
        } catch (err) {
          console.warn('Could not load audience context:', err);
        }
      }

      // Set default audience context if not loaded
      if (!audienceContext) {
        setAudienceContext({
          primaryAudience: 'mixed',
          secondaryAudiences: [],
          decisionContext: '',
          journeyType: journeyType
        });
      }

    } catch (err: any) {
      console.error('Failed to load preview data:', err);
      setError(err.message || 'Failed to load preview data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProceedToPayment = () => {
    if (onNext) {
      onNext();
    }
  };

  const handleBack = () => {
    if (onPrevious) {
      onPrevious();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
              <h3 className="text-lg font-semibold mb-2">Generating Preview</h3>
              <p className="text-gray-600">Creating a preview of your analysis results...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-600" />
              <h3 className="text-lg font-semibold mb-2">Preview Error</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              {onPrevious && (
                <Button onClick={handleBack} variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analysisConfig || !audienceContext) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-4 text-yellow-600" />
              <h3 className="text-lg font-semibold mb-2">Incomplete Configuration</h3>
              <p className="text-gray-600 mb-4">Please complete the previous steps before previewing results.</p>
              {onPrevious && (
                <Button onClick={handleBack} variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-6 h-6 text-blue-600" />
            Preview Analysis Results
          </CardTitle>
          <CardDescription>
            See what insights and recommendations you'll receive before proceeding to payment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Eye className="h-4 w-4" />
            <AlertDescription>
              This is a preview based on your configuration. Full analysis results will be generated after payment.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Results Preview Component */}
      <ResultsPreview
        projectId={session?.projectId || ''}
        analysisType={analysisType}
        analysisConfig={analysisConfig}
        audienceContext={audienceContext}
        onProceedToPayment={handleProceedToPayment}
        onBack={handleBack}
      />
    </div>
  );
}



