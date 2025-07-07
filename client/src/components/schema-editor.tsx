import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Edit3, Save, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SchemaEditorProps {
  project: any;
}

export default function SchemaEditor({ project }: SchemaEditorProps) {
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldEdits, setFieldEdits] = useState<Record<string, any>>({});
  const [projectDescription, setProjectDescription] = useState(project.description || "");

  const schema = project.schema || {};
  const fields = Object.entries(schema);

  const dataTypes = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "boolean", label: "Boolean" },
    { value: "email", label: "Email" },
    { value: "url", label: "URL" },
    { value: "phone", label: "Phone" },
    { value: "currency", label: "Currency" },
  ];

  const handleEditField = (fieldName: string) => {
    setEditingField(fieldName);
    setFieldEdits({
      ...fieldEdits,
      [fieldName]: {
        ...schema[fieldName],
        name: fieldName,
      }
    });
  };

  const handleSaveField = (fieldName: string) => {
    // Here you would typically save to the backend
    toast({
      title: "Field updated",
      description: `${fieldName} has been updated successfully`,
    });
    setEditingField(null);
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setFieldEdits({});
  };

  const updateFieldEdit = (fieldName: string, key: string, value: any) => {
    setFieldEdits({
      ...fieldEdits,
      [fieldName]: {
        ...fieldEdits[fieldName],
        [key]: value,
      }
    });
  };

  const handleSaveDescription = () => {
    // Here you would typically save to the backend
    toast({
      title: "Description updated",
      description: "Project description has been saved",
    });
  };

  return (
    <div className="space-y-6">
      {/* Project Description */}
      <Card>
        <CardHeader>
          <CardTitle>Project Description</CardTitle>
          <CardDescription>
            Describe your dataset and what it contains
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Describe your data, its purpose, and what insights you're looking for..."
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            className="min-h-[100px]"
          />
          <Button onClick={handleSaveDescription}>
            <Save className="w-4 h-4 mr-2" />
            Save Description
          </Button>
        </CardContent>
      </Card>

      {/* Data Schema */}
      <Card>
        <CardHeader>
          <CardTitle>Data Schema & Field Definitions</CardTitle>
          <CardDescription>
            Review and customize your data fields, types, and descriptions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No schema information available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map(([fieldName, fieldInfo]: [string, any]) => (
                <div key={fieldName} className="border rounded-lg p-4">
                  {editingField === fieldName ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium mb-2 block">Field Name</label>
                          <Input
                            value={fieldEdits[fieldName]?.name || fieldName}
                            onChange={(e) => updateFieldEdit(fieldName, 'name', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">Data Type</label>
                          <Select
                            value={fieldEdits[fieldName]?.type || fieldInfo.type}
                            onValueChange={(value) => updateFieldEdit(fieldName, 'type', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {dataTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium mb-2 block">Description</label>
                        <Textarea
                          placeholder="Describe what this field contains..."
                          value={fieldEdits[fieldName]?.description || fieldInfo.description || ''}
                          onChange={(e) => updateFieldEdit(fieldName, 'description', e.target.value)}
                        />
                      </div>

                      <div className="flex space-x-2">
                        <Button size="sm" onClick={() => handleSaveField(fieldName)}>
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                          <X className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-medium text-gray-900">{fieldName}</h3>
                          <Badge variant="outline">{fieldInfo.type}</Badge>
                          {fieldInfo.nullable && (
                            <Badge variant="secondary">Nullable</Badge>
                          )}
                        </div>
                        
                        {fieldInfo.description && (
                          <p className="text-gray-600 text-sm mb-2">{fieldInfo.description}</p>
                        )}
                        
                        {fieldInfo.sampleValues && fieldInfo.sampleValues.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-gray-500 mr-2">Sample values:</span>
                            {fieldInfo.sampleValues.slice(0, 3).map((value: string, index: number) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {value}
                              </Badge>
                            ))}
                            {fieldInfo.sampleValues.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{fieldInfo.sampleValues.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditField(fieldName)}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}