import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Shield, Eye, EyeOff, CheckCircle, X, Settings } from 'lucide-react';
import { AdvancedAnonymizationDialog } from './AdvancedAnonymizationDialog';
import { AnonymizationVerificationDialog } from './AnonymizationVerificationDialog';

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
  const [showVerification, setShowVerification] = useState(false);
  const [anonymizationConfig, setAnonymizationConfig] = useState<any>(null);
  const [overriddenColumns, setOverriddenColumns] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Get all column names from sample data
  const allColumns = sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : [];
  
  // Handle column override
  const handleColumnOverride = (columnName: string) => {
    setOverriddenColumns(prev => 
      prev.includes(columnName) 
        ? prev.filter(col => col !== columnName)
        : [...prev, columnName]
    );
  };
  
  // Filter out overridden columns from detected PII
  const filteredPIIColumns = piiData.detectedPII.filter(col => !overriddenColumns.includes(col));
  const activeColumnAnalysis = Object.fromEntries(
    Object.entries(piiData.columnAnalysis).filter(([col, _]) => !overriddenColumns.includes(col))
  );

  const handleProceed = (decision: 'include' | 'exclude' | 'anonymize') => {
    console.log("handleProceed called with decision:", decision);
    console.log("filteredPIIColumns.length:", filteredPIIColumns.length);
    console.log("overriddenColumns.length:", overriddenColumns.length);
    console.log("overriddenColumns:", overriddenColumns);
    
    // Set processing state to show progress indicator
    setIsProcessing(true);
    
    // If all PII columns have been marked as "Not PII", bypass PII handling entirely
    if (filteredPIIColumns.length === 0 && overriddenColumns.length > 0) {
      console.log("Triggering PII bypass logic");
      // All PII was false positive - proceed with normal upload
      onProceed('include', { overriddenColumns, bypassPII: true });
      // Don't close immediately - let the parent handle closing after upload completes
      return;
    }
    
    console.log("Normal PII processing path");
    if (decision === 'anonymize') {
      setIsProcessing(false); // Reset processing state for anonymization dialog
      setShowAdvancedAnonymization(true);
    } else {
      // Pass overridden columns as part of the decision
      onProceed(decision, { overriddenColumns });
      // Don't close immediately - let the parent handle closing after upload completes
    }
  };

  const handleAdvancedAnonymization = (config: any) => {
    // Store config and show verification dialog
    setAnonymizationConfig(config);
    setShowAdvancedAnonymization(false);
    setShowVerification(true);
  };

  const handleVerificationConfirm = () => {
    // Set processing state before proceeding
    setIsProcessing(true);
    // Proceed with the anonymization after verification, including overridden columns
    onProceed('anonymize', { ...anonymizationConfig, overriddenColumns });
    setShowVerification(false);
    // Don't close immediately - let the parent handle closing after upload completes
  };

  const handleVerificationBack = () => {
    // Go back to advanced anonymization configuration
    setShowVerification(false);
    setShowAdvancedAnonymization(true);
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
    <Dialog open={isOpen} onOpenChange={isProcessing ? undefined : onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto fixed top-[8vh] left-[50%] translate-x-[-50%] translate-y-0">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              {isProcessing ? "Processing Upload..." : "PII Data Detection"}
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isProcessing}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>
        
        {/* Progress indicator overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white bg-opacity-95 flex items-center justify-center z-50 rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-700 font-medium">Processing your data...</p>
              <p className="text-sm text-gray-500 mt-2">Please wait while we apply your privacy settings</p>
            </div>
          </div>
        )}
        
        <div className="space-y-6">
          <p className="text-gray-600">
            We've detected personally identifiable information (PII) in your dataset. Please review and decide how to proceed.
          </p>

          {/* High Risk Warning */}
          <div className={`border rounded-lg p-4 ${
            filteredPIIColumns.length > 0 
              ? 'bg-red-50 border-red-200' 
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${
                filteredPIIColumns.length > 0 ? 'text-red-600' : 'text-green-600'
              }`} />
              <div>
                <h3 className={`font-semibold ${
                  filteredPIIColumns.length > 0 ? 'text-red-800' : 'text-green-800'
                }`}>
                  {filteredPIIColumns.length > 0 ? 'High Risk Level' : 'Low Risk Level'}
                </h3>
                <p className={
                  filteredPIIColumns.length > 0 ? 'text-red-700' : 'text-green-700'
                }>
                  {filteredPIIColumns.length > 0 
                    ? `${filteredPIIColumns.length} type(s) of PII detected across ${filteredPIIColumns.length} column(s)`
                    : 'All detected PII has been marked as "Not PII" or resolved'
                  }
                  {overriddenColumns.length > 0 && (
                    <span className="block text-sm mt-1">
                      ({overriddenColumns.length} column(s) marked as "Not PII")
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Detected PII Types */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Detected PII Types</h3>
            <p className="text-gray-600 mb-4">Review the types of sensitive data found in your dataset</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(activeColumnAnalysis).map(([column, analysis]) => (
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
            
            {/* Show if all PII has been overridden */}
            {Object.keys(activeColumnAnalysis).length === 0 && overriddenColumns.length > 0 && (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>All detected PII has been marked as "Not PII"</p>
                <p className="text-sm">Your data can now be processed safely</p>
              </div>
            )}
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

          {/* PII Override Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-blue-800">False Positive Detection?</h3>
            </div>
            <p className="text-blue-700 mb-4">
              If any fields are incorrectly identified as PII (like product names, campaign IDs, or other business identifiers), 
              you can mark them as "Not PII" below.
            </p>
            
            <div className="space-y-2">
              <h4 className="font-medium text-blue-800">Override PII Detection:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {piiData.detectedPII.map((column) => (
                  <div key={column} className="flex items-center space-x-2">
                    <Checkbox
                      id={`override-${column}`}
                      checked={overriddenColumns.includes(column)}
                      onCheckedChange={() => handleColumnOverride(column)}
                    />
                    <label 
                      htmlFor={`override-${column}`} 
                      className="text-sm font-medium text-blue-700"
                    >
                      {column} is NOT PII
                    </label>
                  </div>
                ))}
              </div>
              
              {overriddenColumns.length > 0 && (
                <div className="mt-3 p-3 bg-white rounded border border-blue-200">
                  <p className="text-sm font-medium text-blue-800">
                    Columns marked as "Not PII": {overriddenColumns.join(', ')}
                  </p>
                  <p className="text-sm text-blue-600 mt-1">
                    These columns will be treated as regular business data and won't trigger PII warnings.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-600 font-medium">
                      Ready to submit - Your overrides will be applied when you proceed
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Decision Options */}
          <div>
            <h3 className="font-semibold text-lg mb-3">Choose How to Handle PII Data</h3>
            <p className="text-gray-600 mb-4">
              Select how you want to proceed with the detected PII data:
              {overriddenColumns.length > 0 && (
                <span className="block mt-2 text-sm text-blue-600 font-medium">
                  ✓ {overriddenColumns.length} column(s) marked as "Not PII" will be preserved as regular business data
                </span>
              )}
            </p>

            {/* Special option when all PII is overridden */}
            {filteredPIIColumns.length === 0 && overriddenColumns.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-green-800">No PII Data Detected</h4>
                </div>
                <p className="text-green-700 text-sm mb-3">
                  All detected fields have been marked as "Not PII". Your data can proceed without any privacy concerns.
                </p>
                <Button 
                  onClick={() => handleProceed('include')} 
                  className="bg-green-600 hover:bg-green-700 text-white w-full"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing Upload...
                    </>
                  ) : (
                    "Proceed with Business Data (No PII Processing Needed)"
                  )}
                </Button>
              </div>
            )}
            
            {/* Standard PII options when there are still PII columns */}
            {filteredPIIColumns.length > 0 && (
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
                      disabled={isProcessing}
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
              )}
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
            <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
              Cancel Upload
            </Button>
            <Button 
              onClick={() => handleProceed(selectedDecision)} 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                overriddenColumns.length > 0 ? (
                  selectedDecision === 'include' ? 'Apply Overrides & Proceed with PII' : 
                  selectedDecision === 'anonymize' ? 'Apply Overrides & Proceed with Anonymization' : 
                  'Apply Overrides & Proceed without PII'
                ) : (
                  selectedDecision === 'include' ? 'Proceed with PII' : 
                  selectedDecision === 'anonymize' ? 'Proceed with Anonymization' : 
                  'Proceed without PII'
                )
              )}
            </Button>
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
      
      {/* Anonymization Verification Dialog */}
      <AnonymizationVerificationDialog
        isOpen={showVerification}
        onClose={() => setShowVerification(false)}
        onConfirm={handleVerificationConfirm}
        onBack={handleVerificationBack}
        config={anonymizationConfig || {
          uniqueIdentifier: '',
          fieldsToAnonymize: [],
          anonymizationMethods: {},
          requiresLookupFile: false
        }}
        originalData={sampleData}
        schema={piiData.columnAnalysis}
      />
    </Dialog>
  );
}