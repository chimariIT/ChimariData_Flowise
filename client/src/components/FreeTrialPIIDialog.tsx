import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, X, ArrowRight, Users } from 'lucide-react';

interface FreeTrialPIIDialogProps {
  isOpen: boolean;
  onClose: () => void;
  piiData: {
    detectedPII: string[];
    columnAnalysis: Record<string, {
      isPII: boolean;
      confidence: number;
      type: string;
    }>;
  };
  onProceedWithPII: () => void;
  onSignUp: () => void;
}

export function FreeTrialPIIDialog({ 
  isOpen, 
  onClose, 
  piiData, 
  onProceedWithPII, 
  onSignUp 
}: FreeTrialPIIDialogProps) {
  
  const getPIITypeLabel = (type: string) => {
    switch (type) {
      case 'name': return 'Personal Names';
      case 'address': return 'Address Information';
      case 'ssn': return 'Social Security Numbers';
      case 'email': return 'Email Addresses';
      case 'phone': return 'Phone Numbers';
      default: return type;
    }
  };

  const piiTypes = Object.entries(piiData.columnAnalysis).map(([column, analysis]) => ({
    column,
    type: getPIITypeLabel(analysis.type),
    confidence: Math.round(analysis.confidence * 100)
  }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-600" />
              Personal Information Detected
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Warning Message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-red-800">Privacy Warning</h3>
            </div>
            <p className="text-red-700">
              Your file contains {piiData.detectedPII.length} type(s) of personally identifiable information (PII). 
              Free trial analysis does not include data anonymization or advanced privacy protection.
            </p>
          </div>

          {/* Detected PII Types */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Detected Personal Information</h3>
            <div className="grid gap-3">
              {piiTypes.map(({ column, type, confidence }) => (
                <div key={column} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">{type}</h4>
                    <p className="text-sm text-gray-600">Column: {column}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {confidence}% confidence
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Choose How to Proceed</h3>
            <div className="space-y-3">
              
              {/* Option 1: Sign Up for Full Features */}
              <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900 mb-1">
                      Sign Up for Full Features (Recommended)
                    </h4>
                    <p className="text-sm text-blue-700 mb-3">
                      Get advanced PII anonymization, secure data handling, and comprehensive analysis tools.
                    </p>
                    <Button 
                      onClick={onSignUp}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Sign Up for Full Features
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Option 2: Proceed with PII */}
              <div className="border rounded-lg p-4 bg-yellow-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-yellow-900 mb-1">
                      Continue with Basic Analysis
                    </h4>
                    <p className="text-sm text-yellow-700 mb-3">
                      Proceed with analysis including PII data. Your personal information will be visible in results.
                    </p>
                    <Button 
                      onClick={onProceedWithPII}
                      variant="outline"
                      className="border-yellow-600 text-yellow-700 hover:bg-yellow-100"
                    >
                      Proceed with PII Data
                    </Button>
                  </div>
                </div>
              </div>

              {/* Option 3: Cancel */}
              <div className="border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <X className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 mb-1">
                      Cancel Upload
                    </h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Cancel the upload and remove your file. No data will be processed.
                    </p>
                    <Button 
                      onClick={onClose}
                      variant="outline"
                      className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Cancel Upload
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
            <h4 className="font-medium text-gray-900 mb-2">Privacy Notice</h4>
            <p className="text-gray-700">
              Free trial analysis processes data temporarily for basic insights. 
              For production use with sensitive data, we recommend our full service 
              which includes advanced privacy protection and data anonymization features.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}