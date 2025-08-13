import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import Plot from 'react-plotly.js';

interface VisualizationWorkshopProps {
  project: any;
  onSave?: () => void;
}

interface ChartField {
  x?: string;
  y?: string;
  color?: string;
  size?: string;
  names?: string;
  values?: string;
  z?: string;
}

interface ChartOptions {
  title?: string;
  x_title?: string;
  y_title?: string;
  height?: number;
  bins?: number;
  labels?: Record<string, string>;
}

interface AggregationConfig {
  group_by: string[];
  aggregations: Record<string, string>;
}

export function AdvancedVisualizationWorkshop({ project, onSave }: VisualizationWorkshopProps) {
  const [chartType, setChartType] = useState<string>('bar');
  const [fields, setFields] = useState<ChartField>({});
  const [options, setOptions] = useState<ChartOptions>({});
  const [aggregation, setAggregation] = useState<AggregationConfig>({ group_by: [], aggregations: {} });
  const [useAggregation, setUseAggregation] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [visualizationData, setVisualizationData] = useState<any>(null);
  
  const availableFields = project?.schema ? Object.keys(project.schema) : [];
  const numericFields = availableFields.filter(field => project.schema[field]?.type === 'number');
  const categoricalFields = availableFields.filter(field => project.schema[field]?.type === 'string');
  
  const chartTypes = [
    { value: 'bar', label: 'Bar Chart', description: 'Compare values across categories' },
    { value: 'line', label: 'Line Chart', description: 'Show trends over time or sequence' },
    { value: 'scatter', label: 'Scatter Plot', description: 'Explore relationships between variables' },
    { value: 'pie', label: 'Pie Chart', description: 'Show proportions of a whole' },
    { value: 'histogram', label: 'Histogram', description: 'Show distribution of values' },
    { value: 'boxplot', label: 'Box Plot', description: 'Show statistical summary and outliers' },
    { value: 'heatmap', label: 'Heatmap', description: 'Show correlations or patterns in data' },
    { value: 'violin', label: 'Violin Plot', description: 'Show distribution shape and density' }
  ];

  const aggregationFunctions = ['mean', 'sum', 'count', 'min', 'max', 'std'];

  const getRequiredFields = (type: string) => {
    switch (type) {
      case 'bar':
      case 'line':
        return { required: ['x', 'y'], optional: ['color'] };
      case 'scatter':
        return { required: ['x', 'y'], optional: ['color', 'size'] };
      case 'pie':
        return { required: ['names'], optional: ['values'] };
      case 'histogram':
        return { required: ['x'], optional: ['color'] };
      case 'boxplot':
      case 'violin':
        return { required: ['y'], optional: ['x', 'color'] };
      case 'heatmap':
        return { required: [], optional: ['x', 'y', 'z'] };
      default:
        return { required: [], optional: [] };
    }
  };

  const handleFieldChange = (fieldType: string, value: string) => {
    setFields(prev => ({ ...prev, [fieldType]: value }));
  };

  const handleOptionChange = (optionKey: string, value: any) => {
    setOptions(prev => ({ ...prev, [optionKey]: value }));
  };

  const handleAggregationGroupByChange = (field: string, checked: boolean) => {
    setAggregation(prev => ({
      ...prev,
      group_by: checked 
        ? [...prev.group_by, field]
        : prev.group_by.filter(f => f !== field)
    }));
  };

  const handleAggregationFunctionChange = (field: string, func: string) => {
    setAggregation(prev => ({
      ...prev,
      aggregations: { ...prev.aggregations, [field]: func }
    }));
  };

  const createVisualization = async () => {
    if (!project?.id) {
      toast({
        title: "No project",
        description: "Project information is missing.",
        variant: "destructive",
      });
      return;
    }

    const requiredFields = getRequiredFields(chartType).required;
    const missingFields = requiredFields.filter(field => !fields[field as keyof ChartField]);
    
    if (missingFields.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please select: ${missingFields.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    
    try {
      const requestBody = {
        chart_type: chartType,
        fields,
        options: {
          ...options,
          title: options.title || `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`,
          height: options.height || 500
        },
        aggregate: useAggregation ? aggregation : undefined
      };

      console.log('Creating visualization with:', requestBody);

      const response = await fetch(`/api/create-visualization/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Visualization result:', result);
        
        if (result.success && result.visualization.chart_data) {
          setVisualizationData(result.visualization.chart_data);
          toast({
            title: "Visualization created",
            description: "Your chart has been generated successfully",
          });
        } else {
          throw new Error(result.error || 'Failed to create visualization');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create visualization');
      }
    } catch (error) {
      console.error('Visualization error:', error);
      toast({
        title: "Visualization Error",
        description: error instanceof Error ? error.message : "Failed to create visualization",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const saveToProject = async () => {
    if (!visualizationData) {
      toast({
        title: "No visualization",
        description: "Create a visualization first",
        variant: "destructive",
      });
      return;
    }

    // For now, just show success - the visualization is already saved via the API
    toast({
      title: "Saved to project",
      description: "Visualization has been saved to your project",
    });

    if (onSave) {
      onSave();
    }
  };

  const exportVisualization = () => {
    if (!visualizationData) {
      toast({
        title: "No visualization",
        description: "Create a visualization first",
        variant: "destructive",
      });
      return;
    }

    // Export as JSON
    const dataStr = JSON.stringify(visualizationData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project?.name || 'visualization'}_${chartType}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export complete",
      description: "Visualization data exported as JSON",
    });
  };

  const { required, optional } = getRequiredFields(chartType);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Advanced Visualization Workshop</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chart Type Selection */}
          <div className="space-y-2">
            <Label>Chart Type</Label>
            <Select value={chartType} onValueChange={setChartType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chartTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-sm text-gray-500">{type.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Data Aggregation */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="use-aggregation"
                checked={useAggregation}
                onCheckedChange={setUseAggregation}
              />
              <Label htmlFor="use-aggregation">Apply data aggregation before visualization</Label>
            </div>

            {useAggregation && (
              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <Label>Group By Fields</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {categoricalFields.map(field => (
                      <div key={field} className="flex items-center space-x-2">
                        <Checkbox
                          id={`group-${field}`}
                          checked={aggregation.group_by.includes(field)}
                          onCheckedChange={(checked) => handleAggregationGroupByChange(field, !!checked)}
                        />
                        <Label htmlFor={`group-${field}`} className="text-sm">{field}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Aggregate Functions</Label>
                  <div className="space-y-2 mt-2">
                    {numericFields.map(field => (
                      <div key={field} className="flex items-center space-x-2">
                        <span className="w-24 text-sm">{field}:</span>
                        <Select
                          value={aggregation.aggregations[field] || ''}
                          onValueChange={(value) => handleAggregationFunctionChange(field, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Function" />
                          </SelectTrigger>
                          <SelectContent>
                            {aggregationFunctions.map(func => (
                              <SelectItem key={func} value={func}>{func}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Field Mapping */}
          <div className="space-y-4">
            <Label>Field Mapping</Label>
            
            {/* Required Fields */}
            {required.map(fieldType => (
              <div key={fieldType} className="space-y-2">
                <Label className="text-red-600">
                  {fieldType.toUpperCase()} (Required)
                </Label>
                <Select 
                  value={fields[fieldType as keyof ChartField] || ''} 
                  onValueChange={(value) => handleFieldChange(fieldType, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${fieldType} field`} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map(field => (
                      <SelectItem key={field} value={field}>{field}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            {/* Optional Fields */}
            {optional.map(fieldType => (
              <div key={fieldType} className="space-y-2">
                <Label className="text-gray-600">
                  {fieldType.toUpperCase()} (Optional)
                </Label>
                <Select 
                  value={fields[fieldType as keyof ChartField] || ''} 
                  onValueChange={(value) => handleFieldChange(fieldType, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${fieldType} field`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {availableFields.map(field => (
                      <SelectItem key={field} value={field}>{field}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <Separator />

          {/* Chart Options */}
          <div className="space-y-4">
            <Label>Chart Options</Label>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Chart Title</Label>
                <Input
                  id="title"
                  value={options.title || ''}
                  onChange={(e) => handleOptionChange('title', e.target.value)}
                  placeholder="Enter chart title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="height">Height (px)</Label>
                <Input
                  id="height"
                  type="number"
                  value={options.height || 500}
                  onChange={(e) => handleOptionChange('height', parseInt(e.target.value))}
                  min="300"
                  max="1000"
                />
              </div>

              {fields.x && (
                <div className="space-y-2">
                  <Label htmlFor="x-title">X-Axis Title</Label>
                  <Input
                    id="x-title"
                    value={options.x_title || ''}
                    onChange={(e) => handleOptionChange('x_title', e.target.value)}
                    placeholder={fields.x}
                  />
                </div>
              )}

              {fields.y && (
                <div className="space-y-2">
                  <Label htmlFor="y-title">Y-Axis Title</Label>
                  <Input
                    id="y-title"
                    value={options.y_title || ''}
                    onChange={(e) => handleOptionChange('y_title', e.target.value)}
                    placeholder={fields.y}
                  />
                </div>
              )}

              {chartType === 'histogram' && (
                <div className="space-y-2">
                  <Label htmlFor="bins">Number of Bins</Label>
                  <Input
                    id="bins"
                    type="number"
                    value={options.bins || 30}
                    onChange={(e) => handleOptionChange('bins', parseInt(e.target.value))}
                    min="5"
                    max="100"
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex space-x-4">
            <Button 
              onClick={createVisualization}
              disabled={isCreating}
              className="flex-1"
            >
              {isCreating ? 'Creating...' : 'Create Visualization'}
            </Button>
            
            {visualizationData && (
              <>
                <Button variant="outline" onClick={saveToProject}>
                  Save to Project
                </Button>
                <Button variant="outline" onClick={exportVisualization}>
                  Export JSON
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Visualization Display */}
      {visualizationData && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Visualization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full">
              <Plot
                data={visualizationData.data}
                layout={visualizationData.layout}
                config={{ responsive: true, displayModeBar: true }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}