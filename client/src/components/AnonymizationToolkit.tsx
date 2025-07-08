import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  Eye, 
  EyeOff, 
  Download, 
  RotateCcw, 
  Settings,
  Lock,
  Shuffle,
  Hash,
  Calendar,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';

interface AnonymizationTechnique {
  id: string;
  name: string;
  description: string;
  preservesFormat: boolean;
  preservesLength: boolean;
  reversible: boolean;
  category: 'masking' | 'substitution' | 'encryption' | 'generalization';
}

interface AnonymizationOptions {
  technique: string;
  preserveFormat?: boolean;
  preserveLength?: boolean;
  customPattern?: string;
  encryptionKey?: string;
  generalizationLevel?: number;
}

interface AnonymizationPreview {
  preview: any[];
  summary: {
    totalColumns: number;
    techniqueCount: Record<string, number>;
    categoryCount: Record<string, number>;
    reversibleCount: number;
  };
}

interface AnonymizationToolkitProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  data: any[];
  piiColumns: string[];
  schema: any;
}

export default function AnonymizationToolkit({ 
  isOpen, 
  onClose, 
  projectId, 
  data, 
  piiColumns, 
  schema 
}: AnonymizationToolkitProps) {
  const [techniques, setTechniques] = useState<AnonymizationTechnique[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, AnonymizationOptions>>({});
  const [preview, setPreview] = useState<AnonymizationPreview | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [generalizationLevel, setGeneralizationLevel] = useState(1);
  const [preserveFormat, setPreserveFormat] = useState(true);
  const [preserveLength, setPreserveLength] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadTechniques();
      initializeDefaultMappings();
    }
  }, [isOpen, piiColumns]);

  const loadTechniques = async () => {
    try {
      const response = await fetch('/api/anonymization/techniques');
      const data = await response.json();
      setTechniques(data.techniques);
    } catch (error) {
      console.error('Error loading techniques:', error);
    }
  };

  const initializeDefaultMappings = () => {
    const defaultMappings: Record<string, AnonymizationOptions> = {};
    
    piiColumns.forEach(column => {
      // Auto-select appropriate technique based on column name/type
      let defaultTechnique = 'mask_partial';
      
      if (column.toLowerCase().includes('email')) {
        defaultTechnique = 'substitute_fake';
      } else if (column.toLowerCase().includes('ssn')) {
        defaultTechnique = 'hash_sha256';
      } else if (column.toLowerCase().includes('name')) {
        defaultTechnique = 'substitute_fake';
      } else if (column.toLowerCase().includes('address')) {
        defaultTechnique = 'substitute_fake';
      } else if (column.toLowerCase().includes('phone')) {
        defaultTechnique = 'substitute_fake';
      } else if (column.toLowerCase().includes('date')) {
        defaultTechnique = 'generalize_date';
      }
      
      defaultMappings[column] = {
        technique: defaultTechnique,
        preserveFormat: true,
        preserveLength: true,
        generalizationLevel: 1
      };
    });
    
    setColumnMappings(defaultMappings);
  };

  const updateColumnMapping = (column: string, options: Partial<AnonymizationOptions>) => {
    setColumnMappings(prev => ({
      ...prev,
      [column]: {
        ...prev[column],
        ...options
      }
    }));
  };

  const generatePreview = async () => {
    if (Object.keys(columnMappings).length === 0) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/anonymization/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          columnMappings,
          sampleSize: 5
        })
      });

      const result = await response.json();
      setPreview(result);
      setShowPreview(true);
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyAnonymization = async () => {
    if (!preview) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/anonymization/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          columnMappings
        })
      });

      const result = await response.json();
      if (result.success) {
        // Show success message and close
        onClose();
        // Trigger data refresh in parent component
        window.location.reload();
      }
    } catch (error) {
      console.error('Error applying anonymization:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getTechniqueIcon = (category: string) => {
    switch (category) {
      case 'masking': return <EyeOff className="h-4 w-4" />;
      case 'substitution': return <Shuffle className="h-4 w-4" />;
      case 'encryption': return <Lock className="h-4 w-4" />;
      case 'generalization': return <BarChart3 className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'masking': return 'bg-blue-100 text-blue-800';
      case 'substitution': return 'bg-green-100 text-green-800';
      case 'encryption': return 'bg-purple-100 text-purple-800';
      case 'generalization': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Interactive Data Anonymization Toolkit</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>×</Button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <Tabs defaultValue="configure" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="configure">Configure</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="apply">Apply</TabsTrigger>
            </TabsList>

            <TabsContent value="configure" className="space-y-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Configure anonymization techniques for each PII column. Changes will be applied to all {data.length} records.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Settings className="h-5 w-5" />
                      <span>Column Configuration</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {piiColumns.map(column => (
                      <div key={column} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{column}</h4>
                          <Badge variant="outline">{schema[column]?.type || 'text'}</Badge>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor={`technique-${column}`}>Anonymization Technique</Label>
                            <Select 
                              value={columnMappings[column]?.technique || ''}
                              onValueChange={(value) => updateColumnMapping(column, { technique: value })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select technique" />
                              </SelectTrigger>
                              <SelectContent>
                                {techniques.map(technique => (
                                  <SelectItem key={technique.id} value={technique.id}>
                                    <div className="flex items-center space-x-2">
                                      {getTechniqueIcon(technique.category)}
                                      <span>{technique.name}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {columnMappings[column]?.technique && (
                            <div className="space-y-2">
                              {techniques.find(t => t.id === columnMappings[column]?.technique)?.category === 'encryption' && (
                                <div>
                                  <Label>Encryption Key</Label>
                                  <Input
                                    type="password"
                                    placeholder="Enter encryption key"
                                    value={encryptionKey}
                                    onChange={(e) => {
                                      setEncryptionKey(e.target.value);
                                      updateColumnMapping(column, { encryptionKey: e.target.value });
                                    }}
                                  />
                                </div>
                              )}

                              {techniques.find(t => t.id === columnMappings[column]?.technique)?.category === 'generalization' && (
                                <div>
                                  <Label>Generalization Level</Label>
                                  <Select
                                    value={String(generalizationLevel)}
                                    onValueChange={(value) => {
                                      const level = parseInt(value);
                                      setGeneralizationLevel(level);
                                      updateColumnMapping(column, { generalizationLevel: level });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">Level 1 (Minimal)</SelectItem>
                                      <SelectItem value="2">Level 2 (Moderate)</SelectItem>
                                      <SelectItem value="3">Level 3 (High)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Available Techniques</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {techniques.map(technique => (
                        <div key={technique.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              {getTechniqueIcon(technique.category)}
                              <span className="font-medium">{technique.name}</span>
                            </div>
                            <Badge className={getCategoryColor(technique.category)}>
                              {technique.category}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{technique.description}</p>
                          <div className="flex space-x-2">
                            {technique.preservesFormat && (
                              <Badge variant="secondary" className="text-xs">Format Preserved</Badge>
                            )}
                            {technique.preservesLength && (
                              <Badge variant="secondary" className="text-xs">Length Preserved</Badge>
                            )}
                            {technique.reversible && (
                              <Badge variant="secondary" className="text-xs">Reversible</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex space-x-4">
                <Button onClick={generatePreview} disabled={isProcessing || Object.keys(columnMappings).length === 0}>
                  {isProcessing ? 'Generating...' : 'Generate Preview'}
                  <Eye className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={initializeDefaultMappings}>
                  Reset to Defaults
                  <RotateCcw className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-6">
              {!preview ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Generate a preview first to see how your data will be anonymized.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Anonymization Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{preview.summary.totalColumns}</div>
                          <div className="text-sm text-gray-600">Columns to Anonymize</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">{preview.summary.reversibleCount}</div>
                          <div className="text-sm text-gray-600">Reversible Techniques</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-600">{Object.keys(preview.summary.techniqueCount).length}</div>
                          <div className="text-sm text-gray-600">Different Techniques</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">{data.length}</div>
                          <div className="text-sm text-gray-600">Total Records</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Data Preview (First 5 Records)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-300">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border border-gray-300 px-4 py-2">Column</th>
                              <th className="border border-gray-300 px-4 py-2">Original</th>
                              <th className="border border-gray-300 px-4 py-2">Anonymized</th>
                              <th className="border border-gray-300 px-4 py-2">Technique</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.preview.map((row, rowIndex) => (
                              Object.entries(row).map(([column, data]: [string, any]) => (
                                <tr key={`${rowIndex}-${column}`} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="border border-gray-300 px-4 py-2 font-medium">{column}</td>
                                  <td className="border border-gray-300 px-4 py-2">{data.original}</td>
                                  <td className="border border-gray-300 px-4 py-2 font-mono">{data.anonymized}</td>
                                  <td className="border border-gray-300 px-4 py-2">
                                    <Badge variant="outline">{data.technique}</Badge>
                                  </td>
                                </tr>
                              ))
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="apply" className="space-y-6">
              {!preview ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Generate a preview first before applying anonymization.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-6">
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Warning:</strong> This action will permanently anonymize your data. 
                      Make sure you have reviewed the preview and are satisfied with the results.
                    </AlertDescription>
                  </Alert>

                  <Card>
                    <CardHeader>
                      <CardTitle>Final Confirmation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Total Records to Process</Label>
                          <div className="text-2xl font-bold">{data.length}</div>
                        </div>
                        <div>
                          <Label>Columns to Anonymize</Label>
                          <div className="text-2xl font-bold">{Object.keys(columnMappings).length}</div>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <Label>Selected Techniques</Label>
                        <div className="space-y-2 mt-2">
                          {Object.entries(columnMappings).map(([column, options]) => {
                            const technique = techniques.find(t => t.id === options.technique);
                            return (
                              <div key={column} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <span className="font-medium">{column}</span>
                                <div className="flex items-center space-x-2">
                                  {technique && getTechniqueIcon(technique.category)}
                                  <span>{technique?.name}</span>
                                  {technique?.reversible && <Badge variant="outline" className="text-xs">Reversible</Badge>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <Separator />

                      <div className="flex items-center space-x-4">
                        <Button 
                          onClick={applyAnonymization} 
                          disabled={isProcessing}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {isProcessing ? 'Processing...' : 'Apply Anonymization'}
                          <Shield className="ml-2 h-4 w-4" />
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}