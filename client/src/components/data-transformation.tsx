import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Filter, RefreshCw, Download, Play, CheckCircle, Database, Merge, Eye, Save, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MultiFileJoiner from "./multi-file-joiner";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [transformedData, setTransformedData] = useState<any>(null);
  const [showJoiner, setShowJoiner] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

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

  const executeTransformations = async () => {
    if (!project?.id) {
      toast({
        title: "No project",
        description: "Project information is missing. Please ensure you've uploaded data.",
        variant: "destructive",
      });
      return;
    }
    
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
        
        // Store transformation results for validation and preview
        setHasTransformedData(true);
        setTransformedDataUrl(result.downloadUrl);
        setTransformedData(result.transformedData);
        
        // Show validation preview in console for now
        console.log('Transformation preview:', {
          appliedTransformations: transformations.length,
          resultData: result.transformedData?.slice(0, 5),
          downloadUrl: result.downloadUrl
        });
        
        console.log('Transformation result:', result);
      } else {
        const errorData = await response.json();
        console.error('Transformation error:', errorData);
        throw new Error(errorData.error || 'Failed to apply transformations');
      }
    } catch (error) {
      console.error('Error applying transformations:', error);
      toast({
        title: "Transformation Error",
        description: error instanceof Error ? error.message : "Failed to apply transformations. Please check your authentication.",
        variant: "destructive",
      });
    } finally {
      setIsTransforming(false);
    }
  };

  const saveTransformationsToProject = async () => {
    if (!project?.id || !hasTransformedData) return;
    
    try {
      const response = await fetch(`/api/save-transformations/${project.id}`, {
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
          title: "Transformations saved",
          description: "Your transformed data has been saved to the project",
        });
        
        // Update project data with transformed results
        console.log('Saved transformation result:', result);
      } else {
        throw new Error('Failed to save transformations');
      }
    } catch (error) {
      console.error('Error saving transformations:', error);
      toast({
        title: "Save failed",
        description: "Failed to save transformations to project",
        variant: "destructive",
      });
    }
  };

  const exportTransformedData = async () => {
    if (!project?.id || !hasTransformedData) return;
    
    try {
      const response = await fetch(`/api/export-transformed-data/${project.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${project.file_name || 'data'}_transformed.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: "Export successful",
          description: "Transformed data has been downloaded",
        });
      } else {
        throw new Error('Failed to export data');
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      toast({
        title: "Export failed",
        description: "Failed to export transformed data",
        variant: "destructive",
      });
    }
  };

  const viewTransformedData = async () => {
    if (!project?.id) {
      toast({
        title: "No project data",
        description: "Project information is not available",
        variant: "destructive",
      });
      return;
    }

    try {
      // First try to get transformed data if transformations have been applied
      if (hasTransformedData) {
        const response = await fetch(`/api/get-transformed-data/${project.id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          setPreviewData(result.data);
          setShowPreview(true);
          
          toast({
            title: "Data preview loaded",
            description: `Showing first 100 rows of transformed data`,
          });
          return;
        }
      }

      // Fallback: show original project data if available
      if (project.data && Array.isArray(project.data)) {
        const previewData = project.data.slice(0, 100);
        setPreviewData(previewData);
        setShowPreview(true);
        
        toast({
          title: "Original data preview",
          description: `Showing first 100 rows of original data (${project.data.length} total records)`,
        });
      } else {
        throw new Error('No data available to preview');
      }
    } catch (error) {
      console.error('Error viewing data:', error);
      toast({
        title: "Preview failed",
        description: "Failed to load data for preview. Please check if you're logged in.",
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

      {/* Transformation Results Preview */}
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
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">Transformations Applied Successfully</h4>
              <p className="text-green-700 text-sm mb-3">
                {transformations.length} transformation(s) have been applied to your data.
              </p>
              <div className="flex space-x-2">
                <Button 
                  variant="outline"
                  onClick={viewTransformedData}
                  disabled={!project?.data && !hasTransformedData}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Data
                </Button>
                
                <Button 
                  variant="default"
                  onClick={saveTransformationsToProject}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save to Project
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={exportTransformedData}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Export Data
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Data Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Transformed Data Preview</DialogTitle>
            <DialogDescription>
              Preview of your transformed dataset (first 100 rows)
            </DialogDescription>
          </DialogHeader>
          {previewData && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      {Object.keys(previewData[0] || {}).map(key => (
                        <th key={key} className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 100).map((row: any, index: number) => (
                      <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {Object.keys(previewData[0] || {}).map(key => (
                          <td key={key} className="border border-gray-300 px-4 py-2 text-sm">
                            {String(row[key] || '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 100 && (
                <p className="text-sm text-gray-600 mt-2">
                  Showing first 100 rows of {previewData.length} total rows
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}