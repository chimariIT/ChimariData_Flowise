import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Filter, RefreshCw, Download, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DataTransformationProps {
  project: any;
}

export default function DataTransformation({ project }: DataTransformationProps) {
  const { toast } = useToast();
  const [transformations, setTransformations] = useState<any[]>([]);
  const [isTransforming, setIsTransforming] = useState(false);

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
    setIsTransforming(true);
    try {
      // Here you would send the transformations to the backend
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing
      
      toast({
        title: "Transformations applied",
        description: "Your data has been successfully transformed",
      });
    } catch (error) {
      toast({
        title: "Transformation failed",
        description: "There was an error applying the transformations",
        variant: "destructive",
      });
    } finally {
      setIsTransforming(false);
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
              
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export Transformed Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}