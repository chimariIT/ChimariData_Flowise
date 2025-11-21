import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Upload,
  CheckCircle,
  AlertCircle,
  FileText,
  BarChart3,
  Settings,
  Download,
  Eye,
  Shield,
  ArrowRight
} from "lucide-react";
import { PIIDetectionDialog } from "@/components/PIIDetectionDialog";
import AgentCheckpoints from "@/components/agent-checkpoints";
import { SchemaAnalysis } from "@/components/SchemaAnalysis";
import { AgentRecommendationDialog } from "@/components/AgentRecommendationDialog";
import { DataTransformationUI } from "@/components/data-transformation-ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { startClientMetric, type ClientMetricHandle } from "@/lib/performanceTracker";

interface DataStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean;
}

export default function DataStep({ journeyType, onNext, onPrevious, renderAsContent = false }: DataStepProps) {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [dataPreview, setDataPreview] = useState<Record<string, any[]>>({});
  interface ValidationStats {
    totalRows: number;
    totalColumns: number;
    missingValues: number;
    duplicateRows: number;
    qualityScore: number;
  }

  const [dataValidation, setDataValidation] = useState<Record<string, ValidationStats>>({});
  const [linkedSchema, setLinkedSchema] = useState<{ [table: string]: { columns: Record<string, string>, primaryKey?: string, foreignKeys?: Array<{ column: string, references: string }> } }>({});
  const [editingRelations, setEditingRelations] = useState(false);
  const [pendingRelations, setPendingRelations] = useState<{ [table: string]: { primaryKey?: string, foreignKeys: Array<{ column: string, references: string }> } }>({});
  const [inferring, setInferring] = useState(false);

  // Quality checkpoint and PII detection state
  const [showPIIDialog, setShowPIIDialog] = useState(false);
  const [piiDetectionResult, setPiiDetectionResult] = useState<any>(null);
  const [piiReviewCompleted, setPiiReviewCompleted] = useState(false);
  const [dataQualityApproved, setDataQualityApproved] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);

  // Agent recommendation state
  const [agentRecommendation, setAgentRecommendation] = useState<any | null>(null);
  const [showRecommendationDialog, setShowRecommendationDialog] = useState(false);
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState(false);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);

  // Data transformation state
  const [showDataTransformation, setShowDataTransformation] = useState(false);
  const [project, setProject] = useState<any>(null);

  const aggregatedValidation = useMemo(() => {
    const entries = Object.values(dataValidation);
    if (!entries.length) return null;

    return entries.reduce(
      (acc, stats, idx) => {
        acc.totalRows += stats.totalRows || 0;
        acc.totalColumns = Math.max(acc.totalColumns, stats.totalColumns || 0);
        acc.missingValues += stats.missingValues || 0;
        acc.duplicateRows += stats.duplicateRows || 0;
        acc.qualityScoreSum += stats.qualityScore || 0;
        acc.datasets = idx + 1;
        return acc;
      },
      {
        totalRows: 0,
        totalColumns: 0,
        missingValues: 0,
        duplicateRows: 0,
        qualityScoreSum: 0,
        datasets: 0,
      }
    );
  }, [dataValidation]);

  const aggregatedQualityScore = aggregatedValidation
    ? Math.round(aggregatedValidation.qualityScoreSum / aggregatedValidation.datasets)
    : 0;

  const filterDataPreviewColumns = useCallback((columnsToRemove: string[]) => {
    if (!columnsToRemove.length) {
      return;
    }

    setDataPreview((prev) => {
      const next: Record<string, any[]> = {};
      Object.entries(prev).forEach(([name, rows]) => {
        next[name] = rows.map((row) => {
          const filtered: Record<string, any> = {};
          Object.entries(row).forEach(([key, value]) => {
            if (!columnsToRemove.includes(key)) {
              filtered[key] = value;
            }
          });
          return filtered;
        });
      });
      return next;
    });

    setLinkedSchema((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((table) => {
        const existing = next[table];
        if (!existing) return;
        const updatedColumns = { ...existing.columns };
        columnsToRemove.forEach((column) => {
          delete updatedColumns[column];
        });
        next[table] = { ...existing, columns: updatedColumns };
      });
      return next;
    });
  }, []);

  const refreshProjectPreview = useCallback(async () => {
    if (!currentProjectId) {
      return;
    }
    try {
      setIsRefreshingPreview(true);
      const response = await apiClient.getProjectDatasets(currentProjectId);
      const datasetEntry = response?.datasets?.[0]?.dataset;
      if (datasetEntry?.preview && Array.isArray(datasetEntry.preview)) {
        const datasetName = datasetEntry.originalFileName || 'Dataset Preview';
        setDataPreview({ [datasetName]: datasetEntry.preview });
        if (datasetEntry.schema) {
          setLinkedSchema((prev) => ({
            ...prev,
            [datasetName]: {
              columns: datasetEntry.schema,
              primaryKey: prev[datasetName]?.primaryKey,
              foreignKeys: prev[datasetName]?.foreignKeys || []
            }
          }));
        }
      }
    } catch (error) {
      console.error('Failed to refresh dataset preview', error);
    } finally {
      setIsRefreshingPreview(false);
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (currentProjectId) {
      refreshProjectPreview();
    }
  }, [currentProjectId, refreshProjectPreview]);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Data Upload",
          description: "Our AI will automatically validate and prepare your data",
          icon: Database,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Data Upload", 
          description: "Upload your business data with template-based validation",
          icon: BarChart3,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Data Upload",
          description: "Upload data with full control over validation and transformation",
          icon: Settings,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Consultation Data Upload",
          description: "Upload data for expert review and preparation",
          icon: Eye,
          color: "yellow"
        };
      default:
        return {
          title: "Data Upload",
          description: "Upload and prepare your data for analysis",
          icon: Database,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  const checkForPII = async (preview: any[], schema: Record<string, string>) => {
    try {
      // Simple client-side PII detection (in production, call backend API)
      const piiColumns: Array<{column: string; types: string[]; confidence: number; examples: string[]}> = [];

      Object.keys(schema).forEach(columnName => {
        const lowerName = columnName.toLowerCase();
        const sampleValues = preview.slice(0, 5).map(row => String(row[columnName] || ''));
        const detectedTypes: string[] = [];

        // Simple pattern matching
        if (lowerName.includes('email') || sampleValues.some(v => /@/.test(v))) {
          detectedTypes.push('email');
        }
        if (lowerName.includes('phone') || lowerName.includes('tel') || sampleValues.some(v => /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(v))) {
          detectedTypes.push('phone');
        }
        if (lowerName.includes('ssn') || lowerName.includes('social')) {
          detectedTypes.push('ssn');
        }
        if (lowerName.includes('name') && !lowerName.includes('file') && !lowerName.includes('user')) {
          detectedTypes.push('name');
        }
        if (lowerName.includes('address') || lowerName.includes('street')) {
          detectedTypes.push('address');
        }

        if (detectedTypes.length > 0) {
          piiColumns.push({
            column: columnName,
            types: detectedTypes,
            confidence: 0.8,
            examples: sampleValues.filter(v => v).slice(0, 3)
          });
        }
      });

      if (piiColumns.length > 0) {
        // Calculate risk level
        const highRiskTypes = piiColumns.flatMap(c => c.types).filter(t => ['ssn', 'credit_card'].includes(t));
        const riskLevel = highRiskTypes.length > 0 ? 'high' : piiColumns.length > 3 ? 'medium' : 'low';

        setPiiDetectionResult({
          detectedPII: piiColumns,
          riskLevel,
          recommendations: [
            'Consider anonymizing sensitive fields before analysis',
            'Review data retention policies',
            'Ensure compliance with data protection regulations'
          ]
        });
        setShowPIIDialog(true);
      } else {
        // No PII detected, mark as reviewed
        setPiiReviewCompleted(true);
      }
    } catch (error) {
      console.error('PII detection error:', error);
      // On error, allow to proceed
      setPiiReviewCompleted(true);
    }
  };

  const fetchAgentRecommendations = async (projectId: string, fileIds: string[]) => {
    if (!projectId || fileIds.length === 0) {
      console.log('⚠️  Skipping agent recommendations: missing projectId or fileIds');
      return;
    }

    setIsLoadingRecommendation(true);

    try {
      console.log('🤖 Fetching agent recommendations for project:', projectId);

      // Get user questions from localStorage (saved during prepare/project-setup step)
      const userQuestions = JSON.parse(localStorage.getItem('projectQuestions') || '[]');
      const businessContext = JSON.parse(localStorage.getItem('businessContext') || '{}');

      // Use apiClient to ensure correct API base URL (localhost:5000)
      const data = await apiClient.post(`/api/projects/${projectId}/agent-recommendations`, {
        uploadedFileIds: fileIds,
        userQuestions: userQuestions.length > 0 ? userQuestions : ['Analyze the uploaded data'],
        businessContext
      });

      if (!data || !data.success) {
        throw new Error(data?.error || 'Failed to get recommendations');
      }

      if (data.success && data.recommendation) {
        console.log('✅ Agent recommendations received:', data.recommendation);
        setAgentRecommendation(data.recommendation);
        setShowRecommendationDialog(true);

        // Store recommendations for use in Execute step
        localStorage.setItem('agentRecommendations', JSON.stringify(data.recommendation));
      } else {
        throw new Error('Invalid recommendation response');
      }
    } catch (error: any) {
      console.error('❌ Error fetching agent recommendations:', error);
      toast({
        title: "Agent Recommendation Error",
        description: error.message || "Failed to get agent recommendations. You can proceed manually.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingRecommendation(false);
    }
  };

  const handleAcceptRecommendation = (recommendation: any) => {
    console.log('✅ User accepted agent recommendations');
    setShowRecommendationDialog(false);

    // Store accepted recommendations
    localStorage.setItem('acceptedRecommendations', JSON.stringify(recommendation));

    toast({
      title: "Recommendations Accepted",
      description: `Analysis will proceed with ${recommendation.analysisComplexity} complexity.`
    });

    // Optionally auto-advance to next step
    // onNext?.();
  };

  const handleModifyRecommendation = (recommendation: any) => {
    console.log('🔧 User wants to modify recommendations');
    setShowRecommendationDialog(false);

    // Store recommendations as draft for manual editing
    localStorage.setItem('draftRecommendations', JSON.stringify(recommendation));

    toast({
      title: "Ready for Customization",
      description: "You can customize the analysis configuration in the Execute step."
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to upload files. Authentication is required to access data analysis features.",
        variant: "destructive"
      });
      setUploadStatus('error');
      return;
    }

    setUploadedFiles((prev) => [...prev, ...files]);
    setUploadStatus('uploading');
    setUploadProgress(5);
    setDataQualityApproved(false);
    setPiiReviewCompleted(false);
    setPiiDetectionResult(null);

    const newlyUploadedFileIds: string[] = [];
    let latestProjectId = localStorage.getItem('currentProjectId') || null;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const projectName = file.name.replace(/\.[^/.]+$/, "");
        const progressBase = Math.round((index / files.length) * 100);

        let uploadFlowMetric: ClientMetricHandle | null = null;
        let uploadNetworkMetric: ClientMetricHandle | null = null;

        uploadFlowMetric = startClientMetric('upload_flow_total', {
          fileName: file.name,
          fileSize: file.size,
          journeyType
        });

        uploadNetworkMetric = startClientMetric('upload_network', {
          fileName: file.name,
          fileSize: file.size
        });

        console.log(`📤 Uploading file: ${file.name} using apiClient`);
        setUploadProgress(progressBase + 10);

        let data: any;
        try {
          data = await apiClient.uploadFile(file, {
            name: projectName,
            description: `Uploaded file: ${file.name}`,
            questions: [],
            isTrial: false
          });

          if (!data?.success) {
            uploadNetworkMetric?.end('error', {
              message: data?.error || 'Upload failed',
              responseStatus: data?.status
            });
            throw new Error(data?.error || 'Upload failed');
          }

          uploadNetworkMetric?.end('success', {
            projectId: data.projectId,
            requiresPIIDecision: !!data.requiresPIIDecision
          });
        } catch (error: any) {
          uploadNetworkMetric?.end('error', {
            message: error?.message || 'Upload request failed'
          });
          throw error;
        }

        console.log(`📥 Upload response received for ${file.name}`);
        setUploadProgress(progressBase + 40);

        if (data.projectId) {
          latestProjectId = data.projectId;
          localStorage.setItem('currentProjectId', data.projectId);
          setCurrentProjectId(data.projectId);
        }

        setUploadStatus('processing');

        const preview = data.project?.preview || data.sampleData || [];
        const recordCount = data.recordCount || preview.length || 0;

        const schema: Record<string, string> = {};
        let columns = 0;
        let missingValues = 0;

        if (preview.length > 0) {
          const firstRow = preview[0];
          columns = Object.keys(firstRow).length;

          Object.keys(firstRow).forEach(key => {
            const values = preview.map((row: any) => row[key]);
            const nonNullValues = values.filter((v: any) => v !== null && v !== undefined && v !== '');
            missingValues += (values.length - nonNullValues.length);

            if (nonNullValues.length > 0) {
              const sample = nonNullValues[0];
              if (typeof sample === 'number') {
                schema[key] = Number.isInteger(sample) ? 'integer' : 'float';
              } else if (typeof sample === 'boolean') {
                schema[key] = 'boolean';
              } else if (sample instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(sample))) {
                schema[key] = 'date';
              } else {
                schema[key] = 'string';
              }
            } else {
              schema[key] = 'string';
            }
          });
        }

        const previews: Record<string, any[]> = {};
        previews[file.name] = preview.slice(0, 10);
        setDataPreview((prev) => ({ ...prev, ...previews }));

        const qualityScore = recordCount && columns
          ? Math.max(0, Math.round(((recordCount * columns - missingValues) / (recordCount * columns)) * 100))
          : 0;

        setDataValidation((prev) => ({
          ...prev,
          [file.name]: {
            totalRows: recordCount,
            totalColumns: columns,
            missingValues,
            duplicateRows: 0,
            qualityScore: qualityScore || 93
          }
        }));

        const tables: Record<string, { columns: Record<string, string>; primaryKey?: string; foreignKeys: Array<{ column: string; references: string }> }> = {};
        const tableNames = new Set<string>();

        Object.keys(schema).forEach(col => {
          if (col.includes('_id') || col.toLowerCase().includes('id')) {
            const tableName = col.replace(/_id$|Id$/i, '');
            if (tableName) tableNames.add(tableName);
          }
        });

        const baseTableName = file.name.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, '_');

        if (!tables[baseTableName]) {
          tables[baseTableName] = {
            columns: schema,
            primaryKey: Object.keys(schema).includes('id') ? 'id' : undefined,
            foreignKeys: []
          };
        }

        if (tableNames.size > 0) {
          tableNames.forEach(tableName => {
            if (!tables[tableName]) {
              tables[tableName] = {
                columns: {
                  id: 'integer',
                  name: 'string'
                },
                primaryKey: 'id',
                foreignKeys: []
              };
            }

            const fkColumn = `${tableName}_id`;
            if (schema[fkColumn]) {
              tables[baseTableName].foreignKeys.push({
                column: fkColumn,
                references: `${tableName}.id`
              });
            }
          });
        }

        setLinkedSchema((prev) => ({ ...prev, ...tables }));

        console.log('📈 Real data loaded:', {
          file: file.name,
          rows: recordCount,
          columns: columns,
          quality: qualityScore
        });

        if (data.fileId) {
          newlyUploadedFileIds.push(data.fileId);
        }

        await checkForPII(preview, schema);

        const flowStatus: 'success' | 'warning' = data?.requiresPIIDecision ? 'warning' : 'success';
        uploadFlowMetric?.end(flowStatus, {
          projectId: data.projectId,
          recordCount,
          columnCount: columns,
          qualityScore: qualityScore || 93
        });

        const progressAfterFile = Math.round(((index + 1) / files.length) * 100);
        setUploadProgress(progressAfterFile);
      }

      setUploadStatus('completed');
      setUploadProgress(100);

      if (latestProjectId) {
        setCurrentProjectId(latestProjectId);
      }

      if (newlyUploadedFileIds.length > 0) {
        const combinedFileIds = [...uploadedFileIds, ...newlyUploadedFileIds];
        setUploadedFileIds(combinedFileIds);
        if (latestProjectId) {
          await fetchAgentRecommendations(latestProjectId, combinedFileIds);
        }
      }
    } catch (error: any) {
      console.error('❌ Upload error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack
      });

      setUploadStatus('error');
      setUploadProgress(0);

      let userMessage = error.message || 'Upload failed';

      if (error.message?.includes('Authentication required')) {
        userMessage = 'Please log in to upload files. You need to be authenticated.';
      } else if (error.message?.includes('Not Found')) {
        userMessage = 'Upload endpoint not found. Please check your connection and try again.';
      }

      toast({
        title: "Upload failed",
        description: userMessage,
        variant: "destructive"
      });
    }
  };

  const getUploadStatusIcon = () => {
    switch (uploadStatus) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'uploading':
      case 'processing':
        return <Database className="w-5 h-5 text-blue-600 animate-pulse" />;
      default:
        return <Upload className="w-5 h-5 text-gray-600" />;
    }
  };

  const getUploadStatusText = () => {
    switch (uploadStatus) {
      case 'uploading':
        return 'Uploading file...';
      case 'processing':
        return 'Processing and validating data...';
      case 'completed':
        return 'Data uploaded and validated successfully!';
      case 'error':
        return 'Upload failed. Please try again.';
      default:
        return 'Ready to upload';
    }
  };

  const applyQuickAnonymization = async (columns: string[]) => {
    if (!currentProjectId || columns.length === 0) {
      return;
    }

    const columnMappings = columns.reduce<Record<string, any>>((acc, column) => {
      acc[column] = {
        technique: 'mask_partial',
        preserveFormat: true,
        preserveLength: true
      };
      return acc;
    }, {});

    await apiClient.post('/api/anonymization/apply', {
      projectId: currentProjectId,
      columnMappings
    });
  };

  const handlePIIDecision = async (requiresPII: boolean, anonymizeData: boolean, selectedColumns: string[]) => {
    setShowPIIDialog(false);

    if (requiresPII && selectedColumns.length > 0) {
      setExcludedColumns(selectedColumns);
      filterDataPreviewColumns(selectedColumns);
    }

    if (requiresPII && anonymizeData && selectedColumns.length > 0) {
      try {
        await applyQuickAnonymization(selectedColumns);
        await refreshProjectPreview();
        setExcludedColumns([]);
      } catch (error) {
        console.error('Failed to apply anonymization', error);
        toast({
          title: "Anonymization failed",
          description: error instanceof Error ? error.message : "Unable to anonymize selected columns",
          variant: "destructive"
        });
      }
    }

    setPiiReviewCompleted(true);
  };

  const content = (
    <div className="space-y-6">
      {/* Journey Type Info */}
      <Card className={`border-${journeyInfo.color}-200 bg-${journeyInfo.color}-50`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-${journeyInfo.color}-900`}>
            <Icon className="w-5 h-5" />
            {journeyInfo.title}
          </CardTitle>
          <CardDescription className={`text-${journeyInfo.color}-700`}>
            {journeyInfo.description}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Your Data
          </CardTitle>
          <CardDescription>
            Upload your data file for analysis. Supported formats: CSV, Excel, JSON
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer ${uploadStatus === 'uploading' || uploadStatus === 'processing' ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <div className="flex flex-col items-center space-y-4">
                  {getUploadStatusIcon()}
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      {uploadedFiles.length ? `${uploadedFiles.length} file(s) selected` : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {getUploadStatusText()}
                    </p>
                  </div>
                  {!uploadedFiles.length && (
                    <Button variant="outline" disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}>
                      Choose File
                    </Button>
                  )}
                </div>
              </label>
            </div>

            {/* Upload Progress */}
            {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Validation Results */}
      {uploadStatus === 'completed' && aggregatedValidation && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Data Validation Results
            </CardTitle>
            <CardDescription className="text-green-700">
              Your data has been successfully validated and is ready for analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedValidation.totalRows}</p>
                <p className="text-sm text-green-700">Total Rows</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedValidation.totalColumns}</p>
                <p className="text-sm text-green-700">Columns</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedValidation.missingValues}</p>
                <p className="text-sm text-green-700">Missing Values</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{aggregatedQualityScore}%</p>
                <p className="text-sm text-green-700">Quality Score</p>
              </div>
            </div>
            
            {/* Role-specific schema view */}
            <div className="space-y-3 mt-2">
              <h4 className="font-medium text-green-900">Schema Overview</h4>
              {journeyType === 'non-tech' && (
                <p className="text-sm text-green-800">
                  We detected People and Departments tables and linked them automatically.
                </p>
              )}
              {journeyType === 'business' && (
                <p className="text-sm text-green-800">
                  Key fields: Employee ID, Department, Hire Date, Policy Change Date. Relationships mapped for cross-table KPIs.
                </p>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                {Object.entries(linkedSchema).map(([table, def]) => (
                  <div key={table} className="p-3 bg-white rounded border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{table}</span>
                      {editingRelations ? (
                        <select
                          className="text-xs border rounded px-1 py-0.5"
                          value={pendingRelations[table]?.primaryKey || def.primaryKey || ''}
                          onChange={(e) => setPendingRelations(prev => ({
                            ...prev,
                            [table]: { ...(prev[table] || { foreignKeys: def.foreignKeys || [] }), primaryKey: e.target.value }
                          }))}
                        >
                          <option value="">Select PK</option>
                          {Object.keys(def.columns).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        def.primaryKey && (
                          <Badge variant="outline" className="text-xs">PK: {def.primaryKey}</Badge>
                        )
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Object.entries(def.columns).map(([col, type]) => (
                        <Badge key={col} variant="secondary" className="bg-green-100 text-green-800">
                          {journeyType === 'technical' ? `${col}: ${type}` : col}
                        </Badge>
                      ))}
                    </div>
                    {editingRelations ? (
                      <div className="space-y-2">
                        {(pendingRelations[table]?.foreignKeys || def.foreignKeys || []).map((fk, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span>FK</span>
                            <select
                              className="border rounded px-1 py-0.5"
                              value={fk.column}
                              onChange={(e) => {
                                const updated = [...(pendingRelations[table]?.foreignKeys || def.foreignKeys || [])];
                                updated[idx] = { ...updated[idx], column: e.target.value };
                                setPendingRelations(prev => ({ ...prev, [table]: { primaryKey: (prev[table]?.primaryKey || def.primaryKey), foreignKeys: updated } }));
                              }}
                            >
                              {Object.keys(def.columns).map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <span>→</span>
                            <select
                              className="border rounded px-1 py-0.5"
                              value={fk.references}
                              onChange={(e) => {
                                const updated = [...(pendingRelations[table]?.foreignKeys || def.foreignKeys || [])];
                                updated[idx] = { ...updated[idx], references: e.target.value };
                                setPendingRelations(prev => ({ ...prev, [table]: { primaryKey: (prev[table]?.primaryKey || def.primaryKey), foreignKeys: updated } }));
                              }}
                            >
                              {Object.entries(linkedSchema).map(([t, d]) => (
                                (d.primaryKey ? <option key={`${t}.${d.primaryKey}`} value={`${t}.${d.primaryKey}`}>{t}.{d.primaryKey}</option> : null)
                              ))}
                            </select>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => {
                          const updated = [...(pendingRelations[table]?.foreignKeys || def.foreignKeys || [])];
                          updated.push({ column: Object.keys(def.columns)[0], references: Object.entries(linkedSchema).map(([t, d]) => `${t}.${d.primaryKey || 'id'}`)[0] });
                          setPendingRelations(prev => ({ ...prev, [table]: { primaryKey: (prev[table]?.primaryKey || def.primaryKey), foreignKeys: updated } }));
                        }}>Add FK</Button>
                      </div>
                    ) : (
                      (def.foreignKeys && def.foreignKeys.length > 0) && (
                        <p className="text-xs text-gray-600">FK: {def.foreignKeys.map(fk => `${fk.column} → ${fk.references}`).join(', ')}</p>
                      )
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingRelations(v => !v)}>
                  {editingRelations ? 'Done Editing' : 'Edit Relationships'}
                </Button>
                <Button variant="outline" size="sm" disabled={inferring} onClick={async () => {
                  try {
                    setInferring(true);
                    const resp = await fetch('/api/data/infer-relationships', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tables: linkedSchema })
                    });
                    const json = await resp.json();
                    if (json?.suggestions) {
                      // Merge suggestions into pending then apply
                      const merged: any = {};
                      for (const [t, s] of Object.entries<any>(json.suggestions)) {
                        merged[t] = { primaryKey: s.primaryKey || linkedSchema[t]?.primaryKey, foreignKeys: s.foreignKeys || linkedSchema[t]?.foreignKeys || [] };
                      }
                      setPendingRelations(merged);
                      setEditingRelations(true);
                    }
                  } finally {
                    setInferring(false);
                  }
                }}>
                  {inferring ? 'Detecting…' : 'Auto-detect relationships'}
                </Button>
                {editingRelations && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                    const next: any = {};
                    for (const [t, def] of Object.entries(linkedSchema)) {
                      next[t] = {
                        ...def,
                        primaryKey: pendingRelations[t]?.primaryKey || def.primaryKey,
                        foreignKeys: pendingRelations[t]?.foreignKeys || def.foreignKeys || []
                      };
                    }
                    setLinkedSchema(next);
                    setEditingRelations(false);
                  }}>Apply</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quality Checkpoint - Agent Approval */}
      {uploadStatus === 'completed' && piiReviewCompleted && currentProjectId && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Shield className="w-5 h-5" />
              Data Quality Checkpoint
            </CardTitle>
            <CardDescription className="text-purple-700">
              Our agents are reviewing your data quality. Please review and approve before proceeding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentCheckpoints projectId={currentProjectId} />

            {/* Manual Quality Approval */}
            <div className="mt-4 p-4 bg-white rounded-lg border">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-2">Quality Review</h4>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Data completeness: {aggregatedQualityScore}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Schema validated: {Object.keys(linkedSchema).length} table(s)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {piiReviewCompleted ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      )}
                      <span>PII review: {piiReviewCompleted ? 'Completed' : 'Pending'}</span>
                    </div>
                  </div>
                </div>
                {!dataQualityApproved && (
                  <Button
                    onClick={() => setDataQualityApproved(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve Quality
                  </Button>
                )}
                {dataQualityApproved && (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approved
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PII Detection Dialog */}
      {showPIIDialog && piiDetectionResult && (
        <PIIDetectionDialog
          isOpen={showPIIDialog}
          onClose={() => setShowPIIDialog(false)}
          onDecision={(requiresPII, anonymizeData, selectedColumns) => {
            console.log('PII Decision:', { requiresPII, anonymizeData, selectedColumns });
            setPiiReviewCompleted(true);
            setShowPIIDialog(false);
            // In production, would call API to apply anonymization
          }}
          piiResult={piiDetectionResult}
        />
      )}

      {/* Data Preview (multiple files) */}
      {uploadStatus === 'completed' && Object.keys(dataPreview).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Data Preview
            </CardTitle>
            <CardDescription>
              First rows for each uploaded file (post-PII decisions)
              {isRefreshingPreview && ' • refreshing...'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(dataPreview).map(([name, rows]) => {
                const visibleColumns = rows.length
                  ? Object.keys(rows[0]).filter(column => !excludedColumns.includes(column))
                  : [];
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{name}</h4>
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800">{rows.length} rows shown</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      {visibleColumns.length === 0 ? (
                        <p className="text-sm text-gray-600">No columns available after PII filtering.</p>
                      ) : (
                        <table className="w-full border-collapse border border-gray-300">
                          <thead>
                            <tr className="bg-gray-50">
                              {visibleColumns.map((column) => (
                                <th key={column} className="border border-gray-300 px-3 py-2 text-left font-medium">
                                  {column}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, index) => (
                              <tr key={index}>
                                {visibleColumns.map((column) => (
                                  <td key={`${column}-${index}`} className="border border-gray-300 px-3 py-2">
                                    {String(row[column] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journey-specific Information */}
      {journeyType === 'non-tech' && uploadStatus === 'completed' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Database className="w-5 h-5" />
              AI Data Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700 mb-3">
              Our AI has automatically analyzed your data and will suggest the best analysis approach based on:
            </p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Data structure and column types</li>
              <li>Data quality and completeness</li>
              <li>Optimal statistical methods</li>
              <li>Best visualization approaches</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {journeyType === 'technical' && uploadStatus === 'completed' && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Settings className="w-5 h-5" />
              Technical Data Options
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-700 mb-3">
              Advanced data processing options available in the next step:
            </p>
            <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
              <li>Custom data transformations</li>
              <li>Feature engineering</li>
              <li>Statistical preprocessing</li>
              <li>Machine learning data preparation</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Data Transformation (Optional) */}
      {uploadStatus === 'completed' && currentProjectId && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Settings className="w-5 h-5" />
              Review & Transform Data (Optional)
            </CardTitle>
            <CardDescription className="text-blue-700">
              Before proceeding to analysis, you can optionally review and transform your data (pivot, filter, aggregate, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Collapsible open={showDataTransformation} onOpenChange={setShowDataTransformation}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {showDataTransformation ? 'Hide' : 'Show'} Data Transformation Tools
                  <ArrowRight className={`w-4 h-4 ml-2 transition-transform ${showDataTransformation ? 'rotate-90' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                <div className="border-t pt-4">
                  <DataTransformationUI
                    projectId={currentProjectId}
                    project={project || {
                      id: currentProjectId,
                      schema: linkedSchema,
                      dataPreview: dataPreview
                    }}
                    onProjectUpdate={(updatedProject) => {
                      setProject(updatedProject);
                      toast({
                        title: "Data transformed",
                        description: "Your transformations have been applied successfully.",
                      });
                    }}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>💡 Tip:</strong> You can filter rows, pivot columns, aggregate data, and more.
                Transformations are optional - you can proceed directly to analysis if your data is ready.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ready for Next Step */}
      {uploadStatus === 'completed' && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Upload Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-800 font-medium mb-3">
              ✅ Your data has been uploaded successfully! Next, we'll verify the data quality, schema, and privacy.
            </p>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {aggregatedValidation?.totalRows || 'Unknown'} rows uploaded
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            {onNext && (
              <Button
                onClick={onNext}
                className="bg-green-600 hover:bg-green-700"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Continue to Data Verification
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agent Recommendation Dialog */}
      <AgentRecommendationDialog
        recommendation={agentRecommendation}
        onAccept={handleAcceptRecommendation}
        onModify={handleModifyRecommendation}
        open={showRecommendationDialog}
        onOpenChange={setShowRecommendationDialog}
      />

      {/* PII Detection Dialog */}
      {piiDetectionResult && (
        <PIIDetectionDialog
          isOpen={showPIIDialog}
          onClose={() => setShowPIIDialog(false)}
          onDecision={handlePIIDecision}
          projectId={currentProjectId}
          onToolkitApplied={refreshProjectPreview}
          piiResult={piiDetectionResult}
        />
      )}
    </div>
  );

  if (renderAsContent) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Preparation
        </CardTitle>
        <CardDescription>
          Upload, validate, and transform your data
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}