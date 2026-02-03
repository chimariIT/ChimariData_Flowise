import React, { useState, useEffect, useCallback } from 'react';
import { nanoid } from 'nanoid';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Database,
  Filter,
  Columns,
  ArrowRight,
  Plus,
  Trash2,
  Play,
  Eye,
  Save,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  BarChart3,
  Settings,
  Download,
  Upload
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useProject } from '@/hooks/useProject';
import { apiClient } from '@/lib/api';

interface DataTransformationUIProps {
  projectId: string;
  project: any;
  onProjectUpdate?: (updatedProject: any) => void;
  onNext?: () => void;
  onBack?: () => void;
}

interface TransformationStep {
  id: string;
  type: 'filter' | 'select' | 'rename' | 'convert' | 'clean' | 'aggregate' | 'sort' | 'join';
  name: string;
  description: string;
  config: Record<string, any>;
  status: 'pending' | 'applied' | 'error';
  error?: string;
  preview?: any[];
}

interface JoinConfiguration {
  joinType: 'inner' | 'left' | 'right' | 'outer';
  leftKey: string;
  rightKey: string;
  rightProjectId: string;
}

interface TransformationPreview {
  originalCount: number;
  transformedCount: number;
  columns: string[];
  sampleData: any[];
  warnings: string[];
  summary?: {
    stepsApplied: number;
    operations: Array<{
      index: number;
      type: string;
      rowCount: number;
      description?: string;
      details?: Record<string, unknown>;
    }>;
  };
}

export function DataTransformationUI({ projectId, project, onProjectUpdate, onNext, onBack }: DataTransformationUIProps) {
  const [transformationSteps, setTransformationSteps] = useState<TransformationStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<TransformationPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [transformationRecs, setTransformationRecs] = useState<any>(null);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [selectedJoinProject, setSelectedJoinProject] = useState<string>('');
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [pmGuidance, setPmGuidance] = useState<{ recommendation: string; suggestedTransformations?: string[] } | null>(null);
  const { toast } = useToast();
  // 🔒 SSOT: Use useProject hook for journeyProgress updates
  // Note: `project` comes from props, not from hook, to avoid duplicate identifier
  const {
    journeyProgress,
    updateProgress,
    isUpdating
  } = useProject(projectId);

  const journeyType = project?.journeyType || 'non-tech';

  const schema = project?.schema || {};
  const fields = Object.keys(schema);

  // Transformation types with PM agent guidance
  const transformationTypes = [
    {
      value: 'filter',
      label: 'Filter Rows',
      description: 'Remove rows based on conditions',
      icon: Filter,
      pmGuidance: 'Use filtering to focus on relevant data subsets. Consider business rules and data quality requirements.'
    },
    {
      value: 'select',
      label: 'Select Columns',
      description: 'Choose specific columns to keep',
      icon: Columns,
      pmGuidance: 'Column selection helps reduce complexity and focus on key metrics. Consider your analysis goals.'
    },
    {
      value: 'rename',
      label: 'Rename Columns',
      description: 'Change column names for clarity',
      icon: Database,
      pmGuidance: 'Clear column names improve readability and analysis accuracy. Use business-friendly terminology.'
    },
    {
      value: 'convert',
      label: 'Convert Types',
      description: 'Change data types',
      icon: Settings,
      pmGuidance: 'Type conversion ensures proper analysis. Consider the intended use of each field.'
    },
    {
      value: 'clean',
      label: 'Clean Data',
      description: 'Remove nulls, trim whitespace',
      icon: CheckCircle,
      pmGuidance: 'Data cleaning improves quality and analysis reliability. Handle missing values appropriately.'
    },
    {
      value: 'aggregate',
      label: 'Aggregate',
      description: 'Group and summarize data',
      icon: BarChart3,
      pmGuidance: 'Aggregation creates summary metrics. Consider your reporting and analysis needs.'
    },
    {
      value: 'sort',
      label: 'Sort',
      description: 'Order data by columns',
      icon: ArrowRight,
      pmGuidance: 'Sorting helps identify patterns and trends. Consider chronological or priority ordering.'
    },
    {
      value: 'join',
      label: 'Join Datasets',
      description: 'Combine data from multiple projects',
      icon: Database,
      pmGuidance: 'Joining datasets enriches analysis. Ensure proper key matching and data integrity.'
    }
  ];

  useEffect(() => {
    loadAvailableProjects();

    fetchTransformationRecommendations();
  }, [projectId]);

  const loadAvailableProjects = async () => {
    try {
      const payload = await apiClient.get('/api/projects');
      const projects = Array.isArray(payload) ? payload : Array.isArray(payload?.projects) ? payload.projects : [];
      const available = projects.filter((p: any) =>
        p.id !== projectId && p.data && p.data.length > 0
      );
      setAvailableProjects(available);
    } catch (error) {
      console.error('Failed to load available projects:', error);
    }
  };



  const fetchTransformationRecommendations = async () => {
    setIsLoadingRecs(true);
    try {
      const data = await apiClient.get(`/api/projects/${projectId}/transformation-recommendations`);
      setTransformationRecs(data);

      // Auto-generate transformation steps if available and not already set
      if (data.transformationSteps && data.transformationSteps.length > 0 && transformationSteps.length === 0) {
        setTransformationSteps(data.transformationSteps);
      } else if (data.recommendations && transformationSteps.length === 0) {
        const generatedSteps = data.recommendations
          .filter((rec: any) => rec.transformation.code)
          .map((rec: any) => ({
            id: `step_${nanoid()}`,
            type: 'convert',
            name: rec.elementName,
            description: rec.transformation.description,
            config: {
              field: rec.sourceField,
              code: rec.transformation.code,
              targetType: 'string'
            },
            status: 'pending',
            aiGenerated: true,
            relatedGoals: rec.relatedGoals,
            relatedQuestions: rec.relatedQuestions,
            confidence: rec.confidence
          }));

        if (generatedSteps.length > 0) {
          setTransformationSteps(generatedSteps);
        }
      }
    } catch (error) {
      console.error('Failed to fetch transformation recommendations:', error);
    } finally {
      setIsLoadingRecs(false);
    }
  };

  const addTransformationStep = (type: string) => {
    const transformationType = transformationTypes.find(t => t.value === type);
    const newStep: TransformationStep = {
      id: `step_${Date.now()}`,
      type: type as any,
      name: transformationType?.label || type,
      description: transformationType?.description || '',
      config: getDefaultConfig(type),
      status: 'pending'
    };

    setTransformationSteps([...transformationSteps, newStep]);

    setTransformationSteps([...transformationSteps, newStep]);

    // Update journeyProgress with transformation data
    updateProgress({
      transformationMappings: [...transformationSteps, newStep].map(step => ({
        sourceElementId: step.id,
        targetColumn: step.name, // Mapping UI name to target for logic
        transformationType: step.type,
        config: step.config,
        appliedAt: new Date().toISOString()
      }))
    });
  };

  const getDefaultConfig = (type: string): Record<string, any> => {
    switch (type) {
      case 'filter':
        return {
          field: fields[0] || '',
          operator: 'equals',
          value: ''
        };
      case 'select':
        return {
          columns: fields.slice(0, 3) // Select first 3 columns by default
        };
      case 'rename':
        return {
          mappings: fields.slice(0, 2).map(field => ({
            from: field,
            to: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          }))
        };
      case 'convert':
        return {
          conversions: fields.slice(0, 2).map(field => ({
            field,
            toType: 'string'
          }))
        };
      case 'clean':
        return {
          removeNulls: true,
          trimWhitespace: true,
          removeDuplicates: false
        };
      case 'aggregate':
        return {
          groupBy: fields[0] || '',
          aggregations: [
            { field: fields[1] || fields[0] || '', operation: 'sum' }
          ]
        };
      case 'sort':
        return {
          columns: [{ field: fields[0] || '', direction: 'asc' }]
        };
      case 'join':
        return {
          joinType: 'inner',
          leftKey: fields[0] || '',
          rightKey: '',
          rightProjectId: ''
        };
      default:
        return {};
    }
  };

  const updateStepConfig = (stepId: string, config: Record<string, any>) => {
    setTransformationSteps(steps =>
      steps.map(step =>
        step.id === stepId ? { ...step, config } : step
      )
    );
  };

  const removeStep = (stepId: string) => {
    setTransformationSteps(steps => steps.filter(step => step.id !== stepId));
  };

  const executeTransformations = async () => {
    if (transformationSteps.length === 0) {
      toast({
        title: "No transformations",
        description: "Please add at least one transformation step",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    try {
      const result = await apiClient.post(`/api/analysis/${projectId}/transform`, {
        transformations: transformationSteps.map(step => ({
          type: step.type,
          config: step.config
        }))
      });

      const resultColumns = Array.isArray(result.columns)
        ? result.columns.filter((column: any) => typeof column === 'string')
        : [];

      const previewRows = Array.isArray(result.preview) ? result.preview : [];
      const sampleColumns = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];
      const fallbackColumns = Object.keys(schema);
      const columns = resultColumns.length > 0
        ? resultColumns
        : (sampleColumns.length > 0 ? sampleColumns : fallbackColumns);

      setPreview({
        originalCount: typeof result.originalRowCount === 'number'
          ? result.originalRowCount
          : (project?.data?.length || 0),
        transformedCount: typeof result.rowCount === 'number'
          ? result.rowCount
          : previewRows.length,
        columns,
        sampleData: previewRows,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        summary: result.summary,
      });

      setShowPreview(true);

      toast({
        title: "Transformations applied",
        description: `Successfully processed ${result.rowCount} rows`,
      });

      await updateProgress({
        transformationApprovedAt: new Date().toISOString(),
        transformedDatasetId: result.datasetId || projectId,
        transformedSchema: result.schema || {}
      });
    } catch (error: any) {
      console.error('Transformation error:', error);
      toast({
        title: "Transformation failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const saveTransformedData = async () => {
    if (!preview) return;

    try {
      await apiClient.post(`/api/projects/${projectId}/save-transformed-data`, {
        transformations: transformationSteps,
        preview: preview
      });

      toast({
        title: "Data saved",
        description: "Transformed data has been saved to your project",
      });

      await updateProgress({
        transformationApprovedAt: new Date().toISOString(),
        transformedDatasetId: projectId,
      });

      if (onNext) {
        onNext();
      }
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const renderStepConfiguration = (step: TransformationStep) => {
    switch (step.type) {
      case 'filter':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor={`${step.id}-field`}>Field</Label>
              <Select
                value={step.config.field}
                onValueChange={(value) => updateStepConfig(step.id, { ...step.config, field: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(field => (
                    <SelectItem key={field} value={field}>{field}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${step.id}-operator`}>Operator</Label>
              <Select
                value={step.config.operator}
                onValueChange={(value) => updateStepConfig(step.id, { ...step.config, operator: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="not_equals">Not Equals</SelectItem>
                  <SelectItem value="greater_than">Greater Than</SelectItem>
                  <SelectItem value="less_than">Less Than</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="not_contains">Not Contains</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${step.id}-value`}>Value</Label>
              <Input
                id={`${step.id}-value`}
                value={step.config.value}
                onChange={(e) => updateStepConfig(step.id, { ...step.config, value: e.target.value })}
                placeholder="Enter filter value"
              />
            </div>
          </div>
        );

      case 'select':
        return (
          <div className="space-y-4">
            <Label>Select Columns</Label>
            <div className="grid grid-cols-2 gap-2">
              {fields.map(field => (
                <div key={field} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`${step.id}-${field}`}
                    checked={step.config.columns?.includes(field) || false}
                    onChange={(e) => {
                      const columns = step.config.columns || [];
                      const newColumns = e.target.checked
                        ? [...columns, field]
                        : columns.filter((c: string) => c !== field);
                      updateStepConfig(step.id, { ...step.config, columns: newColumns });
                    }}
                  />
                  <Label htmlFor={`${step.id}-${field}`} className="text-sm">{field}</Label>
                </div>
              ))}
            </div>
          </div>
        );

      case 'join':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor={`${step.id}-join-type`}>Join Type</Label>
              <Select
                value={step.config.joinType}
                onValueChange={(value) => updateStepConfig(step.id, { ...step.config, joinType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inner">Inner Join</SelectItem>
                  <SelectItem value="left">Left Join</SelectItem>
                  <SelectItem value="right">Right Join</SelectItem>
                  <SelectItem value="outer">Outer Join</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`${step.id}-right-project`}>Right Dataset</Label>
              <Select
                value={step.config.rightProjectId}
                onValueChange={(value) => updateStepConfig(step.id, { ...step.config, rightProjectId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project to join" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map(project => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name} ({project.data?.length || 0} rows)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`${step.id}-left-key`}>Left Key</Label>
                <Select
                  value={step.config.leftKey}
                  onValueChange={(value) => updateStepConfig(step.id, { ...step.config, leftKey: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map(field => (
                      <SelectItem key={field} value={field}>{field}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`${step.id}-right-key`}>Right Key</Label>
                <Input
                  id={`${step.id}-right-key`}
                  value={step.config.rightKey}
                  onChange={(e) => updateStepConfig(step.id, { ...step.config, rightKey: e.target.value })}
                  placeholder="Enter field name"
                />
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-gray-500">
            Configuration for {step.type} transformation
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Data Transformation</h1>
              <p className="text-gray-500">
                Transform your data for analysis • {project?.data?.length || (project?.dataPreview && Object.values(project.dataPreview)[0] && (Object.values(project.dataPreview)[0] as any[]).length) || 0} rows, {fields.length} columns
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                ← Back
              </Button>
            )}
            {onNext && (
              <Button onClick={onNext}>
                Skip Transformation →
              </Button>
            )}
          </div>
        </div>

        {/* PM Agent Guidance */}
        {pmGuidance && (
          <Alert className="mb-4">
            <Users className="h-4 w-4" />
            <AlertDescription>
              <strong>Project Manager Guidance:</strong> {pmGuidance.recommendation}
              {pmGuidance.suggestedTransformations && (
                <div className="mt-2">
                  <strong>Suggested:</strong> {pmGuidance.suggestedTransformations.join(', ')}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Tabs defaultValue="guidance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="guidance">Guidance</TabsTrigger>
          <TabsTrigger value="transformations">Transformations</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="transformations" className="space-y-6">
          {/* Transformation Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Transformation Pipeline
              </CardTitle>
              <CardDescription>
                Build your data transformation pipeline step by step
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transformationSteps.map((step, index) => (
                  <div key={step.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-medium">{step.name}</h3>
                          <p className="text-sm text-gray-600">{step.description}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStep(step.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {renderStepConfiguration(step)}
                  </div>
                ))}

                {transformationSteps.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Database className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No transformations added yet</p>
                    <p className="text-sm">Add transformation steps to process your data</p>
                  </div>
                )}
              </div>

              {/* Add Transformation Buttons */}
              <div className="mt-6">
                <Separator className="mb-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {transformationTypes.map(type => (
                    <Button
                      key={type.value}
                      variant="outline"
                      size="sm"
                      onClick={() => addTransformationStep(type.value)}
                      className="h-auto p-3 flex flex-col items-center gap-2"
                    >
                      <type.icon className="w-4 h-4" />
                      <span className="text-xs">{type.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Execute Button */}
              {transformationSteps.length > 0 && (
                <div className="mt-6 flex gap-2">
                  <Button
                    onClick={executeTransformations}
                    disabled={isProcessing}
                    className="flex-1"
                  >
                    {isProcessing ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Apply Transformations
                      </>
                    )}
                  </Button>
                  {preview && (
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(true)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          {preview ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Transformation Preview
                </CardTitle>
                <CardDescription>
                  Review your transformed data before saving
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-700">{preview.originalCount}</div>
                    <div className="text-sm text-blue-600">Original Rows</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-700">{preview.transformedCount}</div>
                    <div className="text-sm text-green-600">Transformed Rows</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-700">{preview.columns.length}</div>
                    <div className="text-sm text-purple-600">Columns</div>
                  </div>
                </div>

                {preview.warnings.length > 0 && (
                  <Alert className="mb-6 border-yellow-200 bg-yellow-50 text-yellow-800">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Warnings:</strong>
                      <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
                        {preview.warnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {preview.summary?.operations?.length ? (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Step Summary</h4>
                    <div className="space-y-2">
                      {preview.summary.operations.map((operation) => (
                        <div key={operation.index} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between text-sm font-medium">
                            <span>
                              Step {operation.index + 1}: {operation.type}
                            </span>
                            <span>{operation.rowCount} rows</span>
                          </div>
                          {operation.description && (
                            <p className="text-sm text-gray-600 mt-1">
                              {operation.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Sample Data Table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        {preview.columns.slice(0, 5).map(column => (
                          <th key={column} className="border border-gray-200 p-2 text-left text-sm font-medium">
                            {column}
                          </th>
                        ))}
                        {preview.columns.length > 5 && (
                          <th className="border border-gray-200 p-2 text-left text-sm font-medium">
                            ...
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleData.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          {preview.columns.slice(0, 5).map(column => (
                            <td key={column} className="border border-gray-200 p-2 text-sm">
                              {row[column]?.toString() || '-'}
                            </td>
                          ))}
                          {preview.columns.length > 5 && (
                            <td className="border border-gray-200 p-2 text-sm text-gray-400">
                              ...
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex gap-2">
                  <Button onClick={saveTransformedData}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Transformed Data
                  </Button>
                  <Button variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No preview available</p>
                <p className="text-sm text-gray-500">Apply transformations to see a preview</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="guidance" className="space-y-6">
          {isLoadingRecs ? (
            <Card>
              <CardContent className="text-center py-8">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Loading transformation guidance...</p>
              </CardContent>
            </Card>
          ) : transformationRecs?.recommendations?.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    🤖 AI-Recommended Transformations
                  </CardTitle>
                  <CardDescription>
                    Based on your goals and questions, we recommend the following transformations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {transformationRecs.recommendations.map((rec: any, idx: number) => (
                      <div key={idx} className="bg-white rounded-lg p-4 border border-blue-100">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{rec.elementName}</h5>
                            <p className="text-sm text-gray-600 mt-1">{rec.purpose}</p>
                          </div>
                          <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'}>
                            {rec.priority}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-medium text-gray-500">Confidence:</span>
                          <Badge variant={rec.confidence >= 0.8 ? 'outline' : 'secondary'} className={rec.confidence >= 0.8 ? 'text-green-600 border-green-600' : 'text-yellow-600'}>
                            {Math.round((rec.confidence || 0) * 100)}%
                          </Badge>
                          {rec.needsReview && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Needs Review
                            </Badge>
                          )}
                        </div>

                        {rec.transformation.validationError && (
                          <div className="mb-3 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                            <strong>Validation Error:</strong> {rec.transformation.validationError}
                          </div>
                        )}

                        {rec.transformation.warnings && rec.transformation.warnings.length > 0 && (
                          <div className="mb-3 p-2 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-200">
                            <strong>Warnings:</strong>
                            <ul className="list-disc list-inside mt-1">
                              {rec.transformation.warnings.map((w: string, i: number) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="mt-3 space-y-2">
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Source:</span>{' '}
                            <code className="bg-gray-100 px-2 py-1 rounded">{rec.sourceField}</code>
                          </div>
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Transformation:</span>{' '}
                            {rec.transformation.description}
                          </div>
                          {rec.relatedQuestions?.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Answers:</span>{' '}
                              <span className="text-gray-600">{rec.relatedQuestions[0]}</span>
                            </div>
                          )}
                          {rec.relatedAnalyses?.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium text-gray-700">Used in:</span>{' '}
                              <span className="text-gray-600">{rec.relatedAnalyses.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {transformationRecs.gaps?.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-900">
                      <AlertCircle className="w-5 h-5" />
                      ⚠️ Data Gaps
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {transformationRecs.gaps.map((gap: any, idx: number) => (
                      <div key={idx} className="mb-3 last:mb-0">
                        <p className="text-sm font-medium text-yellow-900">{gap.description}</p>
                        <p className="text-sm text-yellow-700 mt-1">{gap.recommendation}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Transformation Guidance
                </CardTitle>
                <CardDescription>
                  AI-powered recommendations for your data transformation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  No transformation recommendations available yet. Upload data to get AI-powered guidance.
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div >
  );
}
