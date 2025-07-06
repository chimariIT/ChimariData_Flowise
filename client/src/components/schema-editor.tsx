import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Database, FileText, Save, Sparkles } from "lucide-react";

interface SchemaField {
  name: string;
  type: string;
  description: string;
  suggestedDescription?: string;
  nullable?: boolean;
  unique?: boolean;
  sampleValues?: string[];
}

interface SchemaEditorProps {
  projectId: string;
  initialSchema: SchemaField[];
  onSave: (updatedSchema: SchemaField[]) => void;
  onCancel: () => void;
}

export function SchemaEditor({ projectId, initialSchema, onSave, onCancel }: SchemaEditorProps) {
  const [fields, setFields] = useState<SchemaField[]>(initialSchema);
  const [isGeneratingDescriptions, setIsGeneratingDescriptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Generate AI-suggested descriptions for all fields
  const generateFieldDescriptions = async () => {
    setIsGeneratingDescriptions(true);
    try {
      const response = await apiRequest("POST", "/api/generate-field-descriptions", {
        projectId,
        fields: fields.map(f => ({
          name: f.name,
          type: f.type,
          sampleValues: f.sampleValues || []
        }))
      });

      const suggestions = await response.json();
      
      setFields(prev => prev.map(field => ({
        ...field,
        suggestedDescription: suggestions[field.name] || field.description,
        description: field.description || suggestions[field.name] || ""
      })));

      toast({
        title: "AI Suggestions Generated",
        description: "Field descriptions have been suggested based on your data structure.",
      });
    } catch (error) {
      console.error("Error generating descriptions:", error);
      toast({
        title: "Description Generation Failed",
        description: "Could not generate AI suggestions. Please add descriptions manually.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDescriptions(false);
    }
  };

  // Update a field's description
  const updateFieldDescription = (fieldName: string, description: string) => {
    setFields(prev => prev.map(field => 
      field.name === fieldName ? { ...field, description } : field
    ));
  };

  // Use AI suggestion for a field
  const useSuggestion = (fieldName: string) => {
    const field = fields.find(f => f.name === fieldName);
    if (field?.suggestedDescription) {
      updateFieldDescription(fieldName, field.suggestedDescription);
    }
  };

  // Save schema updates
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/projects/${projectId}/schema`, {
        fields: fields
      });

      toast({
        title: "Schema Updated",
        description: "Field descriptions have been saved successfully.",
      });

      onSave(fields);
    } catch (error) {
      console.error("Error saving schema:", error);
      toast({
        title: "Save Failed",
        description: "Could not save schema updates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Schema Definition Editor
          </CardTitle>
          <CardDescription>
            Review and edit field descriptions to improve AI analysis accuracy. 
            AI can suggest descriptions based on your data structure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-6">
            <Button 
              onClick={generateFieldDescriptions}
              disabled={isGeneratingDescriptions}
              variant="outline"
            >
              {isGeneratingDescriptions ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate AI Descriptions
                </>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field) => (
              <Card key={field.name} className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  <div>
                    <Label className="text-sm font-medium">{field.name}</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary">{field.type}</Badge>
                      {field.nullable && <Badge variant="outline">Nullable</Badge>}
                      {field.unique && <Badge variant="outline">Unique</Badge>}
                    </div>
                    {field.sampleValues && field.sampleValues.length > 0 && (
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">Sample Values:</Label>
                        <div className="text-xs text-muted-foreground mt-1">
                          {field.sampleValues.slice(0, 3).join(', ')}
                          {field.sampleValues.length > 3 && '...'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor={`desc-${field.name}`} className="text-sm font-medium">
                      Field Description
                    </Label>
                    <Textarea
                      id={`desc-${field.name}`}
                      value={field.description || ''}
                      onChange={(e) => updateFieldDescription(field.name, e.target.value)}
                      placeholder="Describe what this field represents..."
                      className="mt-1"
                      rows={2}
                    />
                    
                    {field.suggestedDescription && field.suggestedDescription !== field.description && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="h-4 w-4 text-blue-600" />
                          <Label className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            AI Suggestion
                          </Label>
                        </div>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                          {field.suggestedDescription}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => useSuggestion(field.name)}
                          className="h-7 text-xs"
                        >
                          Use This Description
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex justify-between pt-6 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Save className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Schema
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}