import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Filter, RefreshCw, Download, Play, CheckCircle, Database, Merge } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MultiFileJoiner from "./multi-file-joiner";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

interface DataTransformationProps {
  project: any;
  onProjectUpdate?: (updatedProject: any) => void;
}

export default function DataTransformation({ project, onProjectUpdate }: DataTransformationProps) {
  const { toast } = useToast();
  const [transformations, setTransformations] = useState<any[]>([]);
  const [isTransforming, setIsTransforming] = useState(false);
  const [hasTransformedData, setHasTransformedData] = useState(false);
  const [transformedDataUrl, setTransformedDataUrl] = useState<string | null>(null);
  const [showJoiner, setShowJoiner] = useState(false);
  const [transformedPreview, setTransformedPreview] = useState<any>(null);

  // Fetch user projects for joining
  const { data: projectsData } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
  });

  const schema = project.schema || {};
  const fields = Object.keys(schema);

  const transformationTypes = [
    { value: "filter", label: "Filter Rows", description: "Remove rows based on conditions" },
    { value: "select", label: "Select Columns", description: "Choose specific columns to keep" },
    { value: "rename", label: "Rename Columns", description: "Change column names" },
    { value: "convert", label: "Convert Types", description: "Change data types" },
    { value: "clean", label: "Clean Data", description: "Remove nulls, trim whitespace" },
    { value: "aggregate", label: "Aggregate", description: "Group and summarize data" },
    { value: "sort", label: "Sort", description: "Order data by columns" },
  ];

  const addTransformation = (type: string) => {
    const newTransformation = {
      id: Date.now(),
      type,
      config: getDefaultConfig(type),
    };
    setTransformations([...transformations, newTransformation]);
  };

  const getDefaultConfig = (type: string) => {
    switch (type) {
      case "filter":
        return { field: "", operator: "equals", value: "" };
      case "select":
        return { fields: [] };
      case "rename":
        return { mappings: {} };
      case "convert":
        return { field: "", newType: "text" };
      case "clean":
        return { removeNulls: true, trimWhitespace: true };
      case "aggregate":
        return { groupBy: [], aggregations: [] };
      case "sort":
        return { fields: [], order: "asc" };
      default:
        return {};
    }
  };

  const updateTransformation = (id: number, config: any) => {
    setTransformations(transformations.map(t => 
      t.id === id ? { ...t, config } : t
    ));
  };

  const removeTransformation = (id: number) => {
    setTransformations(transformations.filter(t => t.id !== id));
  };

  const getTransformationDescription = (transformation: any) => {
    const { type, config } = transformation;
    switch (type) {
      case 'filter':
        return `Filter ${config.field} ${config.operator} ${config.value}`;
      case 'select':
        return `Select ${config.fields?.length || 0} columns`;
      case 'rename':
        return `Rename ${Object.keys(config.mappings || {}).length} columns`;
      case 'convert':
        return `Convert ${config.field} to ${config.newType}`;
      case 'clean':
        return `Clean data (${config.removeNulls ? 'remove nulls' : ''}${config.trimWhitespace ? ', trim whitespace' : ''})`;
      case 'aggregate':
        return `Group by ${config.groupBy?.length || 0} fields, aggregate ${config.aggregations?.length || 0} columns`;
      case 'sort':
        return `Sort by ${config.fields?.length || 0} fields (${config.order})`;
      default:
        return type;
    }
  };

  const executeTransformations = async () => {
    if (!project?.id) return;
    
    setIsTransforming(true);
    try {
      const response = await fetch(`/api/transform-data/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          transformations: transformations.map(t => ({
            type: t.type,
            config: t.config
          }))
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        toast({
          title: "Transformations applied",
          description: "Preview your changes and save to project when ready",
        });
        
        // Store detailed transformation results for preview
        setHasTransformedData(true);
        setTransformedDataUrl(result.downloadUrl);
        setTransformedPreview({
          sampleRows: result.transformedData?.slice(0, 10) || [],
          totalRows: result.totalRows || 0,
          columns: result.columns || [],
          originalRows: project?.record_count || 0,
          transformationsSummary: transformations.map(t => ({
            type: t.type,
            description: getTransformationDescription(t)
          })),
          fileSummary: {
            originalSize: project?.file_size || 0,
            newSize: result.estimatedSize || 0,
            format: 'CSV'
          }
        });
        
        console.log('Transformation result:', result);
      } else {
        throw new Error('Failed to apply transformations');
      }
    } catch (error) {
      console.error('Error applying transformations:', error);
      toast({
        title: "Error",
        description: "Failed to apply transformations",
        variant: "destructive",
      });
    } finally {
      setIsTransforming(false);
    }
  };

  const saveTransformationsToProject = async () => {
    if (!project?.id || !hasTransformedData) return;
    
    try {
      // Create a new transformed file in the project
      const response = await fetch(`/api/create-transformed-file/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          originalFileName: project.file_name || 'data',
          transformations: transformations.map(t => ({
            type: t.type,
            config: t.config,
            description: getTransformationDescription(t)
          })),
          transformedData: transformedPreview?.sampleRows || [],
          totalRows: transformedPreview?.totalRows || 0,
          columns: transformedPreview?.columns || [],
          metadata: {
            sourceFileId: project.id,
            transformationCount: transformations.length,
            createdAt: new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        toast({
          title: "Transformed file created",
          description: `New transformed file "${result.fileName}" has been added to your project workspace with ${result.recordCount} records`,
        });
        
        // Reset transformation state
        setHasTransformedData(false);
        setTransformedPreview(null);
        setTransformations([]);
        
        // Trigger project update if callback provided
        if (onProjectUpdate && result.updatedProject) {
          onProjectUpdate(result.updatedProject);
        }
        
        console.log('Created transformed file:', result);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create transformed file');
      }
    } catch (error: any) {
      console.error('Error creating transformed file:', error);
      toast({
        title: "Save failed",
        description: error.message || "Failed to create transformed file in project",
        variant: "destructive",
      });
    }
  };

  const exportTransformedData = async () => {
    if (!project?.id || !hasTransformedData) {
      toast({
        title: "Export not available",
        description: "No transformed data available for export. Please apply transformations first.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Generate filename with timestamp and transformation info
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const transformationTypes = transformations.map(t => t.type).join('_');
      const baseFileName = project.file_name?.replace(/\.[^/.]+$/, '') || 'data'; // Remove extension
      const fileName = `${baseFileName}_transformed_${transformationTypes}_${timestamp}.csv`;
      
      const response = await fetch(`/api/export-transformed-data/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          transformations: transformations.map(t => ({
            type: t.type,
            config: t.config
          })),
          format: 'csv',
          includeHeaders: true,
          fileName: fileName
        })
      });

      if (response.ok) {
        // Check if response is actually a CSV file
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('text/csv') && !contentType?.includes('application/octet-stream')) {
          throw new Error('Invalid response format: expected CSV file');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        
        // Ensure the link is added to DOM before clicking
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 100);
        
        toast({
          title: "Export successful",
          description: `Transformed data exported as "${fileName}" with ${transformedPreview?.totalRows || 'unknown'} rows`,
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to export data`);
      }
    } catch (error: any) {
      console.error('Error exporting transformed data:', error);
      toast({
        title: "Export failed",
        description: error.message || "Failed to export transformed data as CSV",
        variant: "destructive",
      });
    }
  };

  const renderTransformationConfig = (transformation: any) => {
    const { type, config } = transformation;

    switch (type) {
      case "filter":
        return (
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              value={config.field}
              onValueChange={(value) => updateTransformation(transformation.id, { ...config, field: value })}
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
            
            <Select
              value={config.operator}
              onValueChange={(value) => updateTransformation(transformation.id, { ...config, operator: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="not_equals">Not Equals</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="greater_than">Greater Than</SelectItem>
                <SelectItem value="less_than">Less Than</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              placeholder="Value"
              value={config.value}
              onChange={(e) => updateTransformation(transformation.id, { ...config, value: e.target.value })}
            />
          </div>
        );

      case "select":
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Select columns to keep:</p>
            {fields.map(field => (
              <div key={field} className="flex items-center space-x-2">
                <Checkbox
                  id={`select-${field}`}
                  checked={config.fields.includes(field)}
                  onCheckedChange={(checked) => {
                    const newFields = checked
                      ? [...config.fields, field]
                      : config.fields.filter((f: string) => f !== field);
                    updateTransformation(transformation.id, { ...config, fields: newFields });
                  }}
                />
                <label htmlFor={`select-${field}`} className="text-sm">
                  {field}
                </label>
              </div>
            ))}
          </div>
        );

      case "convert":
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              value={config.field}
              onValueChange={(value) => updateTransformation(transformation.id, { ...config, field: value })}
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
            
            <Select
              value={config.newType}
              onValueChange={(value) => updateTransformation(transformation.id, { ...config, newType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "clean":
        return (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remove-nulls"
                checked={config.removeNulls}
                onCheckedChange={(checked) => updateTransformation(transformation.id, { ...config, removeNulls: checked })}
              />
              <label htmlFor="remove-nulls" className="text-sm">Remove null/empty values</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="trim-whitespace"
                checked={config.trimWhitespace}
                onCheckedChange={(checked) => updateTransformation(transformation.id, { ...config, trimWhitespace: checked })}
              />
              <label htmlFor="trim-whitespace" className="text-sm">Trim whitespace</label>
            </div>
          </div>
        );

      case "rename":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Column Mappings</label>
              <div className="space-y-2">
                {fields.map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <span className="w-32 text-sm font-medium">{field}:</span>
                    <Input
                      placeholder={`New name for ${field}`}
                      value={config.mappings?.[field] || ''}
                      onChange={(e) => updateTransformation(transformation.id, {
                        ...config,
                        mappings: { ...config.mappings, [field]: e.target.value }
                      })}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "aggregate":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Group By Fields</label>
              <div className="space-y-2">
                {fields.map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <Checkbox
                      id={`group-${field}`}
                      checked={config.groupBy?.includes(field) || false}
                      onCheckedChange={(checked) => {
                        const newGroupBy = checked
                          ? [...(config.groupBy || []), field]
                          : (config.groupBy || []).filter((f: string) => f !== field);
                        updateTransformation(transformation.id, { ...config, groupBy: newGroupBy });
                      }}
                    />
                    <label htmlFor={`group-${field}`} className="text-sm">
                      {field}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Aggregations</label>
              <div className="space-y-2">
                {fields.filter(field => schema[field]?.type === 'number').map(field => (
                  <div key={field} className="grid grid-cols-2 gap-2">
                    <span className="text-sm font-medium self-center">{field}:</span>
                    <Select
                      value={config.aggregations?.find((a: any) => a.field === field)?.operation || ''}
                      onValueChange={(value) => {
                        const newAggregations = config.aggregations?.filter((a: any) => a.field !== field) || [];
                        if (value) {
                          newAggregations.push({ field, operation: value });
                        }
                        updateTransformation(transformation.id, { ...config, aggregations: newAggregations });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select operation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sum">Sum</SelectItem>
                        <SelectItem value="avg">Average</SelectItem>
                        <SelectItem value="count">Count</SelectItem>
                        <SelectItem value="min">Minimum</SelectItem>
                        <SelectItem value="max">Maximum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "sort":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Sort Fields</label>
              <div className="space-y-2">
                {fields.map(field => (
                  <div key={field} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sort-${field}`}
                      checked={config.fields?.includes(field) || false}
                      onCheckedChange={(checked) => {
                        const newFields = checked
                          ? [...(config.fields || []), field]
                          : (config.fields || []).filter((f: string) => f !== field);
                        updateTransformation(transformation.id, { ...config, fields: newFields });
                      }}
                    />
                    <label htmlFor={`sort-${field}`} className="text-sm">
                      {field}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Sort Order</label>
              <Select
                value={config.order}
                onValueChange={(value) => updateTransformation(transformation.id, { ...config, order: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return <p className="text-sm text-gray-500">Configuration options for {type}</p>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Transformation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Data Transformations
          </CardTitle>
          <CardDescription>
            Apply transformations to clean, filter, and reshape your data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {transformationTypes.map((type) => (
              <Button
                key={type.value}
                variant="outline"
                className="h-auto flex-col items-start space-y-1 p-4"
                onClick={() => addTransformation(type.value)}
              >
                <div className="font-medium">{type.label}</div>
                <div className="text-xs text-gray-500 text-left">{type.description}</div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>


      {/* Active Transformations */}
      {transformations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Transformations</CardTitle>
            <CardDescription>
              Configure your transformation pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {transformations.map((transformation, index) => (
              <div key={transformation.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Badge>{index + 1}</Badge>
                    <h3 className="font-medium">
                      {transformationTypes.find(t => t.value === transformation.type)?.label}
                    </h3>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeTransformation(transformation.id)}
                  >
                    Remove
                  </Button>
                </div>
                
                {renderTransformationConfig(transformation)}
              </div>
            ))}

            <div className="flex space-x-2 pt-4">
              <Button
                onClick={executeTransformations}
                disabled={isTransforming}
              >
                <Play className="w-4 h-4 mr-2" />
                {isTransforming ? "Applying..." : "Apply Transformations"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transformation Results Preview - Positioned AFTER Apply Button */}
      {hasTransformedData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Transformation Preview
            </CardTitle>
            <CardDescription>
              Review your changes before saving to project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* File Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-3">File Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 font-medium">Original Rows:</span>
                    <div className="font-mono">{transformedPreview?.originalRows?.toLocaleString() || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">New Rows:</span>
                    <div className="font-mono">{transformedPreview?.totalRows?.toLocaleString() || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Columns:</span>
                    <div className="font-mono">{transformedPreview?.columns?.length || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Transformations:</span>
                    <div className="font-mono">{transformations.length}</div>
                  </div>
                </div>
              </div>

              {/* Applied Transformations Summary */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-3">Applied Transformations</h4>
                <div className="space-y-2">
                  {transformedPreview?.transformationsSummary?.map((transform: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                      <span className="text-sm font-medium capitalize">{transform.type}</span>
                      <span className="text-xs text-gray-600">{transform.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample Rows Preview */}
              {transformedPreview?.sampleRows?.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-3">Sample Data Preview (First 10 Rows)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-100">
                          {transformedPreview.columns?.slice(0, 8).map((col: string, index: number) => (
                            <th key={index} className="border border-gray-300 px-2 py-1 text-left font-medium">
                              {col}
                            </th>
                          ))}
                          {transformedPreview.columns?.length > 8 && (
                            <th className="border border-gray-300 px-2 py-1 text-left font-medium">...</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {transformedPreview.sampleRows.slice(0, 5).map((row: any, rowIndex: number) => (
                          <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            {transformedPreview.columns?.slice(0, 8).map((col: string, colIndex: number) => (
                              <td key={colIndex} className="border border-gray-300 px-2 py-1">
                                {String(row[col] || '').length > 20 
                                  ? String(row[col] || '').substring(0, 20) + '...' 
                                  : String(row[col] || '')
                                }
                              </td>
                            ))}
                            {transformedPreview.columns?.length > 8 && (
                              <td className="border border-gray-300 px-2 py-1 text-center">...</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Showing 5 of {transformedPreview.totalRows} rows and {Math.min(8, transformedPreview.columns?.length || 0)} of {transformedPreview.columns?.length || 0} columns
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-3">Next Steps</h4>
                <p className="text-green-700 text-sm mb-3">
                  Review the preview above, then choose to save the transformed data to your project or export it as a CSV file.
                </p>
                <div className="flex space-x-2">
                  <Button 
                    variant="default"
                    onClick={saveTransformationsToProject}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Save Transformed File to Project
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={exportTransformedData}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Transformed Data
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Multi-File Data Joining */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Merge className="w-5 h-5" />
                Multi-File Data Joining
              </CardTitle>
              <CardDescription>
                Combine multiple datasets based on common fields
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowJoiner(!showJoiner)}
              className="flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              {showJoiner ? 'Hide Joiner' : 'Join Datasets'}
            </Button>
          </div>
        </CardHeader>
        {showJoiner && (
          <CardContent>
            <MultiFileJoiner
              currentProject={project}
              userProjects={projectsData?.projects || []}
              onProjectsRefresh={() => {
                // Refresh projects list when new dataset uploaded
                window.location.reload();
              }}
              onJoinComplete={(joinedProject) => {
                setShowJoiner(false);
                if (onProjectUpdate) {
                  onProjectUpdate(joinedProject);
                }
                toast({
                  title: "Datasets Joined Successfully",
                  description: `New project created with ${joinedProject.recordCount} records`
                });
              }}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}