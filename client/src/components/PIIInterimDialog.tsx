import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Shield, Eye, EyeOff, CheckCircle, X } from 'lucide-react';

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
  onProceed: (decision: 'include' | 'exclude' | 'anonymize') => void;
}

export function PIIInterimDialog({ isOpen, onClose, piiData, sampleData, onProceed }: PIIInterimDialogProps) {
  const [showSampleValues, setShowSampleValues] = useState(false);
  const [requiresPII, setRequiresPII] = useState(false);

  const handleProceed = () => {
    if (requiresPII) {
      onProceed('include');
    } else {
      onProceed('exclude');
    }
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

          {/* Analysis Requirements */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Analysis Requirements</h3>
            <p className="text-gray-600 mb-4">Do you need this PII data for your analysis?</p>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="requiresPII"
                checked={requiresPII}
                onCheckedChange={(checked) => setRequiresPII(checked as boolean)}
              />
              <label
                htmlFor="requiresPII"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Yes, this PII data is required for my analysis
              </label>
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
              onClick={handleProceed} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Proceed without PII
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}