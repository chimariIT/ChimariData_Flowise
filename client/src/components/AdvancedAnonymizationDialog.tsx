import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Shield, Eye, EyeOff, CheckCircle, X, Key, FileText, Download } from 'lucide-react';

interface AdvancedAnonymizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  piiData: {
    detectedPII: string[];
    columnAnalysis: Record<string, {
      isPII: boolean;
      confidence: number;
      type: string;
    }>;
    recommendations: string[];
  };
  sampleData?: Record<string, any>[];
  allColumns: string[];
  onProceed: (config: AnonymizationConfig) => void;
}

interface AnonymizationConfig {
  uniqueIdentifier: string;
  fieldsToAnonymize: string[];
  anonymizationMethods: Record<string, string>;
  requiresLookupFile: boolean;
  lookupFileName?: string;
}

const ANONYMIZATION_METHODS = {
  mask: 'Masking (***)',
  hash: 'Hashing (SHA-256)',
  substitute: 'Substitution (Fake Data)',
  encrypt: 'Encryption (AES-256)',
  generalize: 'Generalization (Ranges)',
  remove: 'Complete Removal'
};

export function AdvancedAnonymizationDialog({ 
  isOpen, 
  onClose, 
  piiData, 
  sampleData, 
  allColumns,
  onProceed 
}: AdvancedAnonymizationDialogProps) {
  const [config, setConfig] = useState<AnonymizationConfig>({
    uniqueIdentifier: '',
    fieldsToAnonymize: [...piiData.detectedPII],
    anonymizationMethods: Object.fromEntries(
      piiData.detectedPII.map(field => [field, 'mask'])
    ),
    requiresLookupFile: false,
    lookupFileName: 'anonymization_lookup.csv'
  });

  const [showSampleValues, setShowSampleValues] = useState(false);
  const [activeTab, setActiveTab] = useState('identifier');

  const handleUniqueIdentifierChange = (value: string) => {
    setConfig(prev => ({ ...prev, uniqueIdentifier: value }));
  };

  const handleFieldToggle = (field: string, checked: boolean) => {
    if (checked) {
      setConfig(prev => ({
        ...prev,
        fieldsToAnonymize: [...prev.fieldsToAnonymize, field],
        anonymizationMethods: {
          ...prev.anonymizationMethods,
          [field]: 'mask'
        }
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        fieldsToAnonymize: prev.fieldsToAnonymize.filter(f => f !== field),
        anonymizationMethods: Object.fromEntries(
          Object.entries(prev.anonymizationMethods).filter(([k]) => k !== field)
        )
      }));
    }
  };

  const handleMethodChange = (field: string, method: string) => {
    setConfig(prev => ({
      ...prev,
      anonymizationMethods: {
        ...prev.anonymizationMethods,
        [field]: method
      }
    }));
  };

  const handleLookupToggle = (checked: boolean) => {
    setConfig(prev => ({ ...prev, requiresLookupFile: checked }));
  };

  const handleProceed = () => {
    // Don't close immediately - pass config to parent for verification step
    onProceed(config);
  };

  const getSampleValue = (column: string) => {
    if (!showSampleValues || !sampleData || sampleData.length === 0) {
      return '***hidden***';
    }
    
    const sample = sampleData.find(row => row[column] !== null && row[column] !== undefined);
    return sample ? sample[column] : '***hidden***';
  };

  const getAnonymizedPreview = (column: string, method: string) => {
    const originalValue = getSampleValue(column);
    if (originalValue === '***hidden***') return originalValue;
    
    switch (method) {
      case 'mask':
        return '***MASKED***';
      case 'hash':
        return 'a1b2c3d4e5f6...';
      case 'substitute':
        return column.includes('email') ? 'user123@example.com' : 
               column.includes('phone') ? '***-***-1234' : 'SubstitutedValue';
      case 'encrypt':
        return 'ENC_a1b2c3d4e5f6...';
      case 'generalize':
        return column.includes('age') ? '25-35' : 'GeneralizedValue';
      case 'remove':
        return '[REMOVED]';
      default:
        return originalValue;
    }
  };

  const nonPIIColumns = allColumns.filter(col => !piiData.detectedPII.includes(col));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Advanced Data Anonymization
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-semibold text-blue-800">Advanced Anonymization Setup</h3>
                <p className="text-blue-700">
                  Configure anonymization settings, select unique identifiers, and choose field-specific methods
                </p>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="identifier">
                <Key className="w-4 h-4 mr-2" />
                Unique Identifier
              </TabsTrigger>
              <TabsTrigger value="fields">
                <Eye className="w-4 h-4 mr-2" />
                Field Selection
              </TabsTrigger>
              <TabsTrigger value="lookup">
                <FileText className="w-4 h-4 mr-2" />
                Lookup File
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="identifier" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Select Unique Identifier</CardTitle>
                  <CardDescription>
                    Choose a column that uniquely identifies each observation for tracking purposes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="unique-identifier">Unique Identifier Column</Label>
                    <Select value={config.uniqueIdentifier} onValueChange={handleUniqueIdentifierChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a column as unique identifier" />
                      </SelectTrigger>
                      <SelectContent>
                        {allColumns.map(column => (
                          <SelectItem key={column} value={column}>
                            {column}
                            {piiData.detectedPII.includes(column) && (
                              <Badge variant="secondary" className="ml-2">PII</Badge>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {config.uniqueIdentifier && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <h4 className="font-medium mb-2">Selected Identifier Preview</h4>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{config.uniqueIdentifier}:</span>
                        <span className="text-sm text-gray-600">{getSampleValue(config.uniqueIdentifier)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="fields" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Field Anonymization Configuration</CardTitle>
                  <CardDescription>
                    Select which fields to anonymize and choose the anonymization method for each
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSampleValues(!showSampleValues)}
                      className="flex items-center gap-2"
                    >
                      {showSampleValues ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      Show Sample Values
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {piiData.detectedPII.map(field => (
                      <div key={field} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={config.fieldsToAnonymize.includes(field)}
                              onCheckedChange={(checked) => handleFieldToggle(field, checked as boolean)}
                            />
                            <div>
                              <h4 className="font-medium">{field}</h4>
                              <p className="text-sm text-gray-600">
                                Type: {piiData.columnAnalysis[field]?.type || 'Unknown'}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary">
                            {Math.round((piiData.columnAnalysis[field]?.confidence || 0) * 100)}% confidence
                          </Badge>
                        </div>

                        {config.fieldsToAnonymize.includes(field) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label>Anonymization Method</Label>
                              <Select
                                value={config.anonymizationMethods[field] || 'mask'}
                                onValueChange={(value) => handleMethodChange(field, value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(ANONYMIZATION_METHODS).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Preview</Label>
                              <div className="p-2 bg-gray-50 rounded border">
                                <div className="text-sm">
                                  <span className="text-gray-600">Original:</span> {getSampleValue(field)}
                                </div>
                                <div className="text-sm">
                                  <span className="text-green-600">Anonymized:</span> {getAnonymizedPreview(field, config.anonymizationMethods[field] || 'mask')}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="lookup" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lookup File Configuration</CardTitle>
                  <CardDescription>
                    Configure whether to generate a lookup file to map original values to anonymized ones
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={config.requiresLookupFile}
                      onCheckedChange={handleLookupToggle}
                    />
                    <div>
                      <Label>Generate Lookup File</Label>
                      <p className="text-sm text-gray-600">
                        Create a secure file that maps original values to anonymized ones for future reference
                      </p>
                    </div>
                  </div>

                  {config.requiresLookupFile && (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="lookup-filename">Lookup File Name</Label>
                        <Input
                          id="lookup-filename"
                          value={config.lookupFileName}
                          onChange={(e) => setConfig(prev => ({ ...prev, lookupFileName: e.target.value }))}
                          placeholder="anonymization_lookup.csv"
                        />
                      </div>

                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          <div>
                            <h4 className="font-medium text-yellow-800">Security Notice</h4>
                            <p className="text-sm text-yellow-700">
                              The lookup file will contain original PII values. Store it securely and delete after use if not needed.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-lg">
                        <h4 className="font-medium mb-2">Lookup File Preview</h4>
                        <div className="text-sm font-mono">
                          <div className="text-gray-600">original_value,anonymized_value,field_name</div>
                          {config.fieldsToAnonymize.slice(0, 2).map(field => (
                            <div key={field}>
                              {getSampleValue(field)},{getAnonymizedPreview(field, config.anonymizationMethods[field] || 'mask')},{field}
                            </div>
                          ))}
                          <div className="text-gray-500">...</div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Configuration Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Unique Identifier</Label>
                  <p className="text-sm">{config.uniqueIdentifier || 'Not selected'}</p>
                </div>
                <div>
                  <Label>Fields to Anonymize</Label>
                  <p className="text-sm">{config.fieldsToAnonymize.length} fields selected</p>
                </div>
                <div>
                  <Label>Lookup File</Label>
                  <p className="text-sm">{config.requiresLookupFile ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <Label>Non-PII Fields</Label>
                  <p className="text-sm">{nonPIIColumns.length} fields will remain unchanged</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleProceed}
              disabled={!config.uniqueIdentifier || config.fieldsToAnonymize.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Shield className="w-4 h-4 mr-2" />
              Preview Anonymization
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}