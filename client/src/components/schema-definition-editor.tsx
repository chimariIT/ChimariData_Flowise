import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Database, Save, Download, CreditCard, Check, Edit3 } from "lucide-react";

interface SchemaField {
  name: string;
  type: string;
  aiDescription: string;
  userDescription: string;
  sampleValues: string[];
  isEditing: boolean;
}

interface SchemaDefinitionEditorProps {
  projectId: string;
  schema: Record<string, any>;
  onSchemaUpdate: (updatedSchema: Record<string, SchemaField>) => void;
  onExportRequest: () => void;
}

export default function SchemaDefinitionEditor({ 
  projectId, 
  schema, 
  onSchemaUpdate, 
  onExportRequest 
}: SchemaDefinitionEditorProps) {
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [datasetDescription, setDatasetDescription] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Convert schema object to SchemaField array with AI-generated descriptions
    const fields = Object.entries(schema).map(([name, type]) => ({
      name,
      type: String(type),
      aiDescription: generateAIDescription(name, type),
      userDescription: "",
      sampleValues: generateSampleValues(name, type),
      isEditing: false
    }));
    setSchemaFields(fields);
  }, [schema]);

  const generateAIDescription = (fieldName: string, fieldType: string): string => {
    // Generate AI-based field descriptions based on field name and type
    const descriptions: Record<string, string> = {
      'id': 'Unique identifier for each record',
      'name': 'Name or title field containing text values',
      'email': 'Email address field for contact information',
      'date': 'Date field containing temporal information',
      'created_at': 'Timestamp when the record was created',
      'updated_at': 'Timestamp when the record was last modified',
      'price': 'Monetary value or cost information',
      'amount': 'Numerical amount or quantity',
      'status': 'Current state or condition of the record',
      'category': 'Classification or grouping field',
      'description': 'Detailed text description or notes'
    };

    // Match by field name patterns
    const lowerName = fieldName.toLowerCase();
    for (const [pattern, desc] of Object.entries(descriptions)) {
      if (lowerName.includes(pattern)) {
        return desc;
      }
    }

    // Generate based on type
    if (fieldType.includes('int') || fieldType.includes('number')) {
      return `Numerical field containing ${fieldName} values`;
    } else if (fieldType.includes('string') || fieldType.includes('text')) {
      return `Text field containing ${fieldName} information`;
    } else if (fieldType.includes('bool')) {
      return `Boolean field indicating ${fieldName} status`;
    } else if (fieldType.includes('date') || fieldType.includes('time')) {
      return `Date/time field for ${fieldName} tracking`;
    }

    return `Data field for ${fieldName} values`;
  };

  const generateSampleValues = (fieldName: string, fieldType: string): string[] => {
    // Generate sample values based on field characteristics
    const lowerName = fieldName.toLowerCase();
    
    if (lowerName.includes('email')) {
      return ['user@example.com', 'contact@company.org', 'info@business.net'];
    } else if (lowerName.includes('name')) {
      return ['John Smith', 'Sarah Johnson', 'Michael Brown'];
    } else if (lowerName.includes('status')) {
      return ['Active', 'Pending', 'Complete'];
    } else if (lowerName.includes('category')) {
      return ['Category A', 'Category B', 'Category C'];
    } else if (fieldType.includes('int') || fieldType.includes('number')) {
      return ['123', '456', '789'];
    } else if (fieldType.includes('bool')) {
      return ['true', 'false', 'true'];
    } else {
      return ['Sample 1', 'Sample 2', 'Sample 3'];
    }
  };

  const handleEditField = (index: number) => {
    const updated = [...schemaFields];
    updated[index].isEditing = true;
    setSchemaFields(updated);
  };

  const handleSaveField = (index: number) => {
    const updated = [...schemaFields];
    updated[index].isEditing = false;
    setSchemaFields(updated);
    setHasUnsavedChanges(true);
  };

  const handleDescriptionChange = (index: number, description: string) => {
    const updated = [...schemaFields];
    updated[index].userDescription = description;
    setSchemaFields(updated);
  };

  const handleSaveSchema = async () => {
    try {
      const schemaData = {
        projectId,
        datasetDescription,
        fields: schemaFields.reduce((acc, field) => {
          acc[field.name] = {
            type: field.type,
            aiDescription: field.aiDescription,
            userDescription: field.userDescription || field.aiDescription,
            sampleValues: field.sampleValues
          };
          return acc;
        }, {} as Record<string, any>)
      };

      // Call onSchemaUpdate to save the schema
      onSchemaUpdate(schemaData.fields);
      setHasUnsavedChanges(false);
      
      toast({
        title: "Schema Saved",
        description: "Data schema and field definitions have been updated successfully."
      });
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save schema. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Data Schema Definition
          </CardTitle>
          <CardDescription>
            Review and enhance the automatically generated field descriptions to improve analysis accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="datasetDescription">Dataset Description</Label>
            <Textarea
              id="datasetDescription"
              value={datasetDescription}
              onChange={(e) => setDatasetDescription(e.target.value)}
              placeholder="Describe what this dataset contains and its purpose..."
              className="mt-1"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Schema Fields Table */}
      <Card>
        <CardHeader>
          <CardTitle>Field Definitions</CardTitle>
          <CardDescription>
            {schemaFields.length} fields detected. Click edit to customize descriptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {schemaFields.map((field, index) => (
              <div key={field.name} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium text-slate-900">{field.name}</h4>
                    <Badge variant="outline">{field.type}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => field.isEditing ? handleSaveField(index) : handleEditField(index)}
                  >
                    {field.isEditing ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Save
                      </>
                    ) : (
                      <>
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-slate-600">AI Generated Description</Label>
                    <p className="text-sm text-slate-700 bg-blue-50 p-2 rounded border">
                      {field.aiDescription}
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm text-slate-600">
                      {field.isEditing ? 'Edit Description' : 'Your Description'}
                    </Label>
                    {field.isEditing ? (
                      <Textarea
                        value={field.userDescription}
                        onChange={(e) => handleDescriptionChange(index, e.target.value)}
                        placeholder="Add your custom description for better analysis..."
                        className="mt-1"
                        rows={2}
                      />
                    ) : (
                      <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded border min-h-[60px]">
                        {field.userDescription || (
                          <span className="text-slate-400 italic">Click edit to add custom description</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-sm text-slate-600">Sample Values</Label>
                  <div className="flex gap-2 mt-1">
                    {field.sampleValues.map((value, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          <Button onClick={handleSaveSchema} disabled={!hasUnsavedChanges}>
            <Save className="w-4 h-4 mr-2" />
            Save Schema Definition
          </Button>
          
          <Button variant="outline" onClick={onExportRequest}>
            <CreditCard className="w-4 h-4 mr-2" />
            Pay to Export Schema
          </Button>
        </div>

        <Button variant="outline" onClick={onExportRequest}>
          <Download className="w-4 h-4 mr-2" />
          Download Schema Definition
        </Button>
      </div>
    </div>
  );
}