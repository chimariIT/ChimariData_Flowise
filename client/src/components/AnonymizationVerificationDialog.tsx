import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, AlertTriangle, Eye, EyeOff, ArrowLeft, ArrowRight, Download, FileText } from 'lucide-react';

interface AnonymizationVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onBack: () => void;
  config: {
    uniqueIdentifier: string;
    fieldsToAnonymize: string[];
    anonymizationMethods: Record<string, string>;
    requiresLookupFile: boolean;
    lookupFileName?: string;
  };
  originalData?: Record<string, any>[];
  previewData?: Record<string, any>[];
  schema?: Record<string, any>;
}

export function AnonymizationVerificationDialog({
  isOpen,
  onClose,
  onConfirm,
  onBack,
  config,
  originalData,
  previewData,
  schema
}: AnonymizationVerificationDialogProps) {
  const [showComparison, setShowComparison] = useState(true);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // Generate preview of anonymized data for verification
  const generateAnonymizedPreview = (value: any, method: string, fieldType?: string): string => {
    if (value === null || value === undefined || value === '') return value;
    
    const stringValue = String(value);
    
    switch (method) {
      case 'mask':
        if (stringValue.length <= 4) return '***';
        return stringValue.substring(0, 2) + '***' + stringValue.substring(stringValue.length - 2);
      
      case 'substitute':
        if (fieldType === 'email') return `user${Math.random().toString(36).substr(2, 6)}@example.com`;
        if (fieldType === 'name') return `Person${Math.random().toString(36).substr(2, 3)}`;
        if (fieldType === 'phone') return `***-***-${Math.random().toString().substr(2, 4)}`;
        return `***ANONYMIZED***`;
      
      case 'hash':
        return `HASH_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      case 'encrypt':
        return `ENC_${Math.random().toString(36).substr(2, 12).toUpperCase()}`;
      
      case 'generalize':
        if (fieldType === 'age' || fieldType === 'number') {
          const num = parseInt(stringValue);
          if (!isNaN(num)) {
            const range = Math.floor(num / 10) * 10;
            return `${range}-${range + 9}`;
          }
        }
        return `${stringValue.substring(0, 3)}***`;
      
      case 'remove':
        return '[REMOVED]';
      
      default:
        return '***ANONYMIZED***';
    }
  };

  // Get sample data for preview (first 5 rows)
  const sampleOriginalData = originalData?.slice(0, 5) || [];
  
  // Generate anonymized preview based on config
  const sampleAnonymizedData = sampleOriginalData.map(row => {
    const anonymizedRow = { ...row };
    config.fieldsToAnonymize.forEach(field => {
      if (anonymizedRow[field] !== undefined) {
        const method = config.anonymizationMethods[field];
        const fieldType = schema?.[field]?.type;
        anonymizedRow[field] = generateAnonymizedPreview(row[field], method, fieldType);
      }
    });
    return anonymizedRow;
  });

  const getMethodLabel = (method: string) => {
    const methods = {
      mask: 'Masking (***)',
      hash: 'Hashing (SHA-256)',
      substitute: 'Substitution (Fake Data)',
      encrypt: 'Encryption (AES-256)',
      generalize: 'Generalization (Ranges)',
      remove: 'Complete Removal'
    };
    return methods[method] || method;
  };

  const allColumns = originalData && originalData.length > 0 ? Object.keys(originalData[0]) : [];
  const nonAnonymizedFields = allColumns.filter(col => !config.fieldsToAnonymize.includes(col));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Verify Anonymization Configuration
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Review how your data will look after anonymization. Confirm if you're satisfied with the preview.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Configuration Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configuration Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Unique Identifier</p>
                  <p className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{config.uniqueIdentifier}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Fields to Anonymize</p>
                  <p className="text-sm">{config.fieldsToAnonymize.length} fields selected</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Preserved Fields</p>
                  <p className="text-sm">{nonAnonymizedFields.length} fields unchanged</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Lookup File</p>
                  <p className="text-sm">{config.requiresLookupFile ? 'Will be generated' : 'Not requested'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Anonymization Methods */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Anonymization Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {config.fieldsToAnonymize.map(field => (
                  <div key={field} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{field}</Badge>
                      <span className="text-sm text-gray-600">→</span>
                      <span className="text-sm font-medium">{getMethodLabel(config.anonymizationMethods[field])}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Data Preview Toggle */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Data Preview</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowComparison(!showComparison)}
            >
              {showComparison ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showComparison ? 'Hide Comparison' : 'Show Comparison'}
            </Button>
          </div>

          {/* Data Comparison Preview */}
          {showComparison && (
            <div className="space-y-4">
              {/* Before/After Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Original Data */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-red-600">Before: Original Data</CardTitle>
                    <CardDescription>Contains PII - for comparison only</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {allColumns.slice(0, 4).map(col => (
                              <TableHead key={col} className="text-xs">
                                {col}
                                {config.fieldsToAnonymize.includes(col) && (
                                  <Badge variant="destructive" className="ml-1 text-xs">PII</Badge>
                                )}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sampleOriginalData.map((row, idx) => (
                            <TableRow key={idx}>
                              {allColumns.slice(0, 4).map(col => (
                                <TableCell key={col} className="text-xs font-mono">
                                  {String(row[col] || '').length > 15 
                                    ? String(row[col] || '').substring(0, 15) + '...' 
                                    : String(row[col] || '')
                                  }
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Anonymized Data */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-green-600">After: Anonymized Data</CardTitle>
                    <CardDescription>Safe for analysis and sharing</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {allColumns.slice(0, 4).map(col => (
                              <TableHead key={col} className="text-xs">
                                {col}
                                {config.fieldsToAnonymize.includes(col) && (
                                  <Badge variant="secondary" className="ml-1 text-xs">ANON</Badge>
                                )}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sampleAnonymizedData.map((row, idx) => (
                            <TableRow key={idx}>
                              {allColumns.slice(0, 4).map(col => (
                                <TableCell key={col} className="text-xs font-mono">
                                  {String(row[col] || '').length > 15 
                                    ? String(row[col] || '').substring(0, 15) + '...' 
                                    : String(row[col] || '')
                                  }
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  This is a preview using sample data. The actual anonymization will be applied to your entire dataset.
                </p>
              </div>
            </div>
          )}

          {/* Lookup File Info */}
          {config.requiresLookupFile && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Lookup File Generation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    A lookup file will be generated containing the mapping between original and anonymized values.
                  </p>
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-sm text-yellow-700 font-medium">Security Note:</p>
                    <p className="text-sm text-yellow-700">
                      The lookup file contains original PII values. Store it securely and delete after use if not needed for reversibility.
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium mb-2">File name: {config.lookupFileName}</p>
                    <p className="text-xs text-gray-600">Format: CSV with columns: original_value, anonymized_value, field_name</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between pt-6 border-t">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Configuration
            </Button>
            
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                onClick={onConfirm}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm & Apply Anonymization
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}