import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Shield, Eye, EyeOff, CheckCircle, X, Settings } from 'lucide-react';
import { AdvancedAnonymizationDialog } from './AdvancedAnonymizationDialog';

interface PIIInterimDialogProps {
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
  onProceed: (decision: 'include' | 'exclude' | 'anonymize', anonymizationConfig?: any) => void;
}

export function PIIInterimDialog({ isOpen, onClose, piiData, sampleData, onProceed }: PIIInterimDialogProps) {
  const [showSampleValues, setShowSampleValues] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<'include' | 'exclude' | 'anonymize'>('exclude');
  const [showAdvancedAnonymization, setShowAdvancedAnonymization] = useState(false);
  
  // Get all column names from sample data
  const allColumns = sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : [];

  const handleProceed = (decision: 'include' | 'exclude' | 'anonymize') => {
    if (decision === 'anonymize') {
      setShowAdvancedAnonymization(true);
    } else {
      onProceed(decision);
      onClose();
    }
  };

  const handleAdvancedAnonymization = (anonymizationConfig: any) => {
    onProceed('anonymize', anonymizationConfig);
    setShowAdvancedAnonymization(false);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const getPIITypeLabel = (type: string) => {
    switch (type) {
      case 'name': return 'Personal Name';
      case 'address': return 'Address';
      case 'ssn': return 'Social Security Number';
      case 'email': return 'Email Address';
      default: return type;
    }
  };

  const getSampleValue = (column: string) => {
    if (!showSampleValues || !sampleData || sampleData.length === 0) {
      return '***hidden***';
    }
    
    const sample = sampleData.find(row => row[column] !== null && row[column] !== undefined);
    return sample ? sample[column] : '***hidden***';
  };

  const getRecordCount = (column: string) => {
    if (!sampleData) return 0;
    return sampleData.filter(row => row[column] !== null && row[column] !== undefined).length;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              PII Data Detection
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          <p className="text-gray-600">
            We've detected personally identifiable information (PII) in your dataset. Please review and decide how to proceed.
          </p>

          {/* High Risk Warning */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-800">High Risk Level</h3>
                <p className="text-red-700">
                  {piiData.detectedPII.length} type(s) of PII detected across {piiData.detectedPII.length} column(s)
                </p>
              </div>
            </div>
          </div>

          {/* Detected PII Types */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Detected PII Types</h3>
            <p className="text-gray-600 mb-4">Review the types of sensitive data found in your dataset</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(piiData.columnAnalysis).map(([column, analysis]) => (
                <div key={column} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium text-gray-900">{getPIITypeLabel(analysis.type)}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(analysis.confidence * 100)}% confidence
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Column:</span>
                      <span>{column}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Count:</span>
                      <span>{getRecordCount(column)} records</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Sample:</span>
                      <span className="font-mono text-gray-600">{getSampleValue(column)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Show Sample Values Toggle */}
          <div className="flex items-center gap-2">
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

          {/* Decision Options */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Choose How to Handle PII Data</h3>
            <p className="text-gray-600 mb-4">Select how you want to proceed with the detected PII data:</p>
            
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  id="exclude"
                  name="piiDecision"
                  value="exclude"
                  checked={selectedDecision === 'exclude'}
                  onChange={() => setSelectedDecision('exclude')}
                  className="mt-1"
                />
                <div>
                  <label htmlFor="exclude" className="font-medium text-gray-900">
                    Exclude PII Data (Recommended)
                  </label>
                  <p className="text-sm text-gray-600">
                    Remove all PII columns from the dataset before analysis. This is the safest option for privacy compliance.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  id="anonymize"
                  name="piiDecision"
                  value="anonymize"
                  checked={selectedDecision === 'anonymize'}
                  onChange={() => setSelectedDecision('anonymize')}
                  className="mt-1"
                />
                <div>
                  <label htmlFor="anonymize" className="font-medium text-gray-900">
                    Anonymize PII Data
                  </label>
                  <p className="text-sm text-gray-600">
                    Replace PII with anonymized values while preserving data structure for analysis.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-600">Advanced anonymization options available</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  id="include"
                  name="piiDecision"
                  value="include"
                  checked={selectedDecision === 'include'}
                  onChange={() => setSelectedDecision('include')}
                  className="mt-1"
                />
                <div>
                  <label htmlFor="include" className="font-medium text-gray-900">
                    Include PII Data (Not Recommended)
                  </label>
                  <p className="text-sm text-gray-600">
                    Keep all PII data in the dataset. Only choose this if PII is essential for your analysis.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Security Recommendations */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Security Recommendations</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">High-risk PII detected. Strong anonymization recommended.</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">Consider removing sensitive fields if not essential for analysis.</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">Personal names detected. Consider using initials or generic identifiers.</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">Address information found. Consider using geographic regions instead.</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">Contact information detected. Hash or anonymize for privacy protection.</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button variant="outline" onClick={handleCancel}>
              Cancel Upload
            </Button>
            <Button 
              onClick={() => handleProceed(selectedDecision)} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {selectedDecision === 'include' ? 'Proceed with PII' : 
               selectedDecision === 'anonymize' ? 'Proceed with Anonymization' : 
               'Proceed without PII'}
            </Button>
          </div>
        </div>
      </DialogContent>
      
      {/* Advanced Anonymization Dialog */}
      <AdvancedAnonymizationDialog
        isOpen={showAdvancedAnonymization}
        onClose={() => setShowAdvancedAnonymization(false)}
        piiData={piiData}
        sampleData={sampleData}
        allColumns={allColumns}
        onProceed={handleAdvancedAnonymization}
      />
    </Dialog>
  );
}