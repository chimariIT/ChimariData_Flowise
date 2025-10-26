import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  AlertCircle,
  Shield,
  Database,
  FileText,
  BarChart3,
  Eye,
  Download,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Info
} from "lucide-react";
import { PIIDetectionDialog } from "@/components/PIIDetectionDialog";
import { SchemaAnalysis } from "@/components/SchemaAnalysis";
import { DataQualityCheckpoint } from "@/components/DataQualityCheckpoint";
import { SchemaValidationDialog } from "@/components/SchemaValidationDialog";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface DataVerificationStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean;
}

interface VerificationStatus {
  dataQuality: boolean;
  schemaValidation: boolean;
  piiReview: boolean;
  dataPreview: boolean;
  overallApproved: boolean;
}

export default function DataVerificationStep({ 
  journeyType, 
  onNext, 
  onPrevious, 
  renderAsContent = false 
}: DataVerificationStepProps) {
  const { toast } = useToast();
  
  // State for verification status
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    dataQuality: false,
    schemaValidation: false,
    piiReview: false,
    dataPreview: false,
    overallApproved: false
  });

  // Data state
  const [projectData, setProjectData] = useState<any>(null);
  const [dataQuality, setDataQuality] = useState<any>(null);
  const [piiResults, setPiiResults] = useState<any>(null);
  const [schemaAnalysis, setSchemaAnalysis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // PII Dialog state
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [piiReviewCompleted, setPiiReviewCompleted] = useState(false);

  // Schema Validation Dialog state
  const [showSchemaDialog, setShowSchemaDialog] = useState(false);
  const [editedSchema, setEditedSchema] = useState<any>(null);

  // Get current project data
  useEffect(() => {
    loadProjectData();
  }, []);

  const loadProjectData = async () => {
    try {
      setIsLoading(true);
      const projectId = localStorage.getItem('currentProjectId');
      
      if (!projectId) {
        toast({
          title: "No Project Found",
          description: "Please upload data first before verification",
          variant: "destructive"
        });
        return;
      }

      // Load project data
      const project = await apiClient.getProject(projectId);
      setProjectData(project);

      // Load data quality assessment
      try {
        const qualityResponse = await apiClient.get(`/api/projects/${projectId}/data-quality`);
        setDataQuality(qualityResponse);
        setVerificationStatus(prev => ({ ...prev, dataQuality: true }));
      } catch (error) {
        console.warn('Data quality assessment not available:', error);
      }

      // Load PII detection results
      try {
        const piiResponse = await apiClient.get(`/api/projects/${projectId}/pii-analysis`);
        setPiiResults(piiResponse);
        setVerificationStatus(prev => ({ ...prev, piiReview: true }));
      } catch (error) {
        console.warn('PII analysis not available:', error);
      }

      // Load schema analysis
      try {
        const schemaResponse = await apiClient.get(`/api/projects/${projectId}/schema-analysis`);
        setSchemaAnalysis(schemaResponse);
        setVerificationStatus(prev => ({ ...prev, schemaValidation: true }));
      } catch (error) {
        console.warn('Schema analysis not available:', error);
      }

      // Mark data preview as available
      if (project.preview || project.sampleData) {
        setVerificationStatus(prev => ({ ...prev, dataPreview: true }));
      }

    } catch (error) {
      console.error('Failed to load project data:', error);
      toast({
        title: "Error",
        description: "Failed to load project data for verification",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePIIReview = () => {
    if (piiResults && piiResults.detectedPII?.length > 0) {
      setShowPIIDialog(true);
    } else {
      setPiiReviewCompleted(true);
      updateVerificationStatus('piiReview', true);
    }
  };

  const handlePIIApproval = () => {
    setPiiReviewCompleted(true);
    setShowPIIDialog(false);
    updateVerificationStatus('piiReview', true);
    toast({
      title: "PII Review Complete",
      description: "Data privacy review has been completed",
    });
  };

  const handleSchemaConfirm = (schema: Record<string, string>) => {
    setEditedSchema(schema);
    updateVerificationStatus('schemaValidation', true);
    toast({
      title: "Schema Confirmed",
      description: "Schema validation complete",
    });
  };

  const handleQualityApprove = () => {
    updateVerificationStatus('dataQuality', true);
    toast({
      title: "Quality Approved",
      description: "Data quality has been approved",
    });
  };

  const handleFixIssue = (issueIndex: number) => {
    toast({
      title: "Apply Fix",
      description: "Fix functionality will be implemented",
    });
  };

  const updateVerificationStatus = (key: keyof VerificationStatus, value: boolean) => {
    setVerificationStatus(prev => {
      const updated = { ...prev, [key]: value };
      
      // Check if all verification steps are complete
      const allComplete = Object.values(updated).every(status => status === true);
      updated.overallApproved = allComplete;
      
      return updated;
    });
  };

  const handleApproveData = async () => {
    try {
      setIsProcessing(true);
      
      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) {
        throw new Error('No project ID found');
      }

      // Mark project as verified
      await apiClient.put(`/api/projects/${projectId}/verify`, {
        verificationStatus: 'approved',
        verificationTimestamp: new Date().toISOString(),
        verificationChecks: verificationStatus
      });

      toast({
        title: "Data Approved",
        description: "Your data has been verified and approved for analysis",
      });

      // Proceed to next step
      if (onNext) {
        onNext();
      }

    } catch (error) {
      console.error('Failed to approve data:', error);
      toast({
        title: "Error",
        description: "Failed to approve data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Data Verification",
          description: "Our AI has analyzed your data. Review the findings below.",
          icon: CheckCircle,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Data Verification", 
          description: "Verify your business data quality and structure",
          icon: Database,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Data Verification",
          description: "Review data quality, schema, and technical details",
          icon: BarChart3,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Expert Data Verification",
          description: "Comprehensive data review with expert validation",
          icon: Shield,
          color: "indigo"
        };
      default:
        return {
          title: "Data Verification",
          description: "Review and verify your uploaded data",
          icon: CheckCircle,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const IconComponent = journeyInfo.icon;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
              <h3 className="text-lg font-semibold mb-2">Loading Data Verification</h3>
              <p className="text-gray-600">Analyzing your uploaded data...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!projectData) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-600" />
              <h3 className="text-lg font-semibold mb-2">No Data Found</h3>
              <p className="text-gray-600 mb-4">Please upload data first before verification.</p>
              {onPrevious && (
                <Button onClick={onPrevious} variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back to Upload
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const verificationSteps = [
    {
      id: 'dataPreview',
      title: 'Data Preview',
      description: 'Review uploaded data structure and sample records',
      status: verificationStatus.dataPreview,
      icon: Eye
    },
    {
      id: 'dataQuality',
      title: 'Data Quality',
      description: 'Assess completeness, consistency, and validity',
      status: verificationStatus.dataQuality,
      icon: CheckCircle
    },
    {
      id: 'schemaValidation',
      title: 'Schema Validation',
      description: 'Verify data types and structure detection',
      status: verificationStatus.schemaValidation,
      icon: Database
    },
    {
      id: 'piiReview',
      title: 'Privacy Review',
      description: 'Check for personally identifiable information',
      status: verificationStatus.piiReview,
      icon: Shield
    }
  ];

  const completedSteps = verificationSteps.filter(step => step.status).length;
  const totalSteps = verificationSteps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconComponent className="w-6 h-6 text-blue-600" />
            {journeyInfo.title}
          </CardTitle>
          <CardDescription>{journeyInfo.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Verification Progress</span>
              <span className="text-sm text-gray-600">{completedSteps}/{totalSteps} completed</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Verification Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Checklist</CardTitle>
          <CardDescription>Complete all verification steps to proceed with analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {verificationSteps.map((step) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 p-4 rounded-lg border ${
                    step.status 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className={`p-2 rounded-full ${
                    step.status ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <StepIcon className={`w-4 h-4 ${
                      step.status ? 'text-green-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-medium ${
                      step.status ? 'text-green-900' : 'text-gray-900'
                    }`}>
                      {step.title}
                    </h4>
                    <p className={`text-sm ${
                      step.status ? 'text-green-700' : 'text-gray-600'
                    }`}>
                      {step.description}
                    </p>
                  </div>
                  <Badge variant={step.status ? "default" : "secondary"}>
                    {step.status ? "Complete" : "Pending"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Verification Tabs */}
      <Card>
        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="preview">Data Preview</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Preview</CardTitle>
                <CardDescription>Sample records from your uploaded data</CardDescription>
              </CardHeader>
              <CardContent>
                {projectData.preview || projectData.sampleData ? (
                  <ScrollArea className="h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {Object.keys(projectData.preview?.[0] || projectData.sampleData?.[0] || {}).map((key) => (
                            <TableHead key={key}>{key}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(projectData.preview || projectData.sampleData || []).slice(0, 10).map((row: any, index: number) => (
                          <TableRow key={index}>
                            {Object.values(row).map((value: any, cellIndex: number) => (
                              <TableCell key={cellIndex}>{String(value)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      No preview data available. Please ensure your file was uploaded successfully.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quality" className="space-y-4">
            <DataQualityCheckpoint
              qualityScore={dataQuality?.score || 85}
              issues={dataQuality?.issues?.map((issue: string, index: number) => ({
                severity: index < 2 ? 'critical' : 'warning',
                message: issue,
                fix: `Apply data cleaning for: ${issue}`
              })) || []}
              onApprove={handleQualityApprove}
              onFixIssue={handleFixIssue}
              isLoading={isProcessing}
            />
          </TabsContent>

          <TabsContent value="schema" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Schema Analysis</CardTitle>
                <CardDescription>Detected data types and structure</CardDescription>
              </CardHeader>
              <CardContent>
                {schemaAnalysis ? (
                  <div className="space-y-4">
                    <SchemaAnalysis schema={schemaAnalysis} />
                    <Button 
                      onClick={() => setShowSchemaDialog(true)}
                      variant="outline"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Review & Edit Schema
                    </Button>
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Schema analysis is not available. This may be normal for some file types.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Privacy Review</CardTitle>
                <CardDescription>Check for personally identifiable information</CardDescription>
              </CardHeader>
              <CardContent>
                {piiResults ? (
                  <div className="space-y-4">
                    {piiResults.detectedPII && piiResults.detectedPII.length > 0 ? (
                      <div>
                        <Alert className="mb-4">
                          <Shield className="h-4 w-4" />
                          <AlertDescription>
                            PII detected in your data. Please review the findings below.
                          </AlertDescription>
                        </Alert>
                        
                        <div className="space-y-2">
                          <h4 className="font-semibold">Detected PII Fields:</h4>
                          {piiResults.detectedPII.map((pii: any, index: number) => (
                            <Badge key={index} variant="destructive" className="mr-2">
                              {pii.field}: {pii.type}
                            </Badge>
                          ))}
                        </div>
                        
                        <Button 
                          onClick={handlePIIReview}
                          className="mt-4"
                          variant="outline"
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Review PII Handling
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                        <h4 className="font-semibold text-green-900">No PII Detected</h4>
                        <p className="text-gray-600">Your data appears to be free of personally identifiable information.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      PII analysis is not available. This may be normal for some file types.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-4">
            {onPrevious && (
              <Button onClick={onPrevious} variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Upload
              </Button>
            )}
            
            <Button 
              onClick={loadProjectData} 
              variant="outline"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh Analysis
            </Button>
          </div>

          <div className="flex items-center gap-4">
            {verificationStatus.overallApproved ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">All Checks Complete</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">{completedSteps}/{totalSteps} Complete</span>
              </div>
            )}
            
            <Button 
              onClick={handleApproveData}
              disabled={!verificationStatus.overallApproved || isProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve Data
                </>
              )}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PII Detection Dialog */}
      {showPIIDialog && (
        <PIIDetectionDialog
          isOpen={showPIIDialog}
          onClose={() => setShowPIIDialog(false)}
          onApprove={handlePIIApproval}
          piiResult={piiResults}
          projectData={projectData}
        />
      )}

      {/* Schema Validation Dialog */}
      {showSchemaDialog && schemaAnalysis && (
        <SchemaValidationDialog
          isOpen={showSchemaDialog}
          onClose={() => setShowSchemaDialog(false)}
          onConfirm={handleSchemaConfirm}
          detectedSchema={schemaAnalysis}
          sampleData={projectData?.preview || projectData?.sampleData || []}
        />
      )}
    </div>
  );
}
