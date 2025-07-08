import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Eye, EyeOff, X } from "lucide-react";

interface PIIDetectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDecision: (requiresPII: boolean, anonymizeData: boolean, selectedColumns: string[]) => void;
  piiResult: {
    detectedPII: Array<{
      column: string;
      types: string[];
      confidence: number;
      examples: string[];
    }>;
    riskLevel: string;
    recommendations: string[];
  };
}

export function PIIDetectionDialog({ isOpen, onClose, onDecision, piiResult }: PIIDetectionDialogProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [anonymizeData, setAnonymizeData] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!isOpen) return null;

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const handleProceed = () => {
    onDecision(true, anonymizeData, selectedColumns);
  };

  const handleCancel = () => {
    onDecision(false, false, []);
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPIITypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'email': return 'bg-blue-100 text-blue-800';
      case 'phone': return 'bg-purple-100 text-purple-800';
      case 'ssn': return 'bg-red-100 text-red-800';
      case 'credit_card': return 'bg-red-100 text-red-800';
      case 'name': return 'bg-green-100 text-green-800';
      case 'address': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
              <div>
                <CardTitle className="text-xl">Personal Information Detected</CardTitle>
                <CardDescription>
                  We found potentially sensitive information in your dataset
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Risk Level */}
          <div className="flex items-center gap-2">
            <span className="font-medium">Risk Level:</span>
            <Badge className={getRiskColor(piiResult.riskLevel)}>
              {piiResult.riskLevel.toUpperCase()}
            </Badge>
          </div>

          {/* Detected PII Summary */}
          <div>
            <h3 className="font-semibold mb-3">Detected Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {piiResult.detectedPII.map((pii, index) => (
                <Card key={index} className="border-l-4 border-l-yellow-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium">{pii.column}</h4>
                      <Badge variant="outline">
                        {(pii.confidence * 100).toFixed(0)}% confident
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {pii.types.map((type, typeIndex) => (
                          <Badge key={typeIndex} className={getPIITypeColor(type)}>
                            {type.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                      
                      {showDetails && pii.examples.length > 0 && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                          <p className="font-medium text-gray-700 mb-1">Examples:</p>
                          <ul className="list-disc pl-4 text-gray-600">
                            {pii.examples.slice(0, 3).map((example, exampleIndex) => (
                              <li key={exampleIndex} className="truncate">
                                {example}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
          </div>

          {/* Recommendations */}
          {piiResult.recommendations.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Recommendations</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                {piiResult.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Column Selection */}
          <div>
            <h3 className="font-semibold mb-3">Select Columns to Include</h3>
            <p className="text-sm text-gray-600 mb-4">
              Choose which columns containing PII you want to include in your analysis:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {piiResult.detectedPII.map((pii, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox
                    id={`pii-${index}`}
                    checked={selectedColumns.includes(pii.column)}
                    onCheckedChange={() => handleColumnToggle(pii.column)}
                  />
                  <Label htmlFor={`pii-${index}`} className="text-sm">
                    {pii.column}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Anonymization Option */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <Checkbox
                id="anonymize"
                checked={anonymizeData}
                onCheckedChange={setAnonymizeData}
              />
              <Label htmlFor="anonymize" className="font-medium">
                Anonymize sensitive data
              </Label>
            </div>
            <p className="text-sm text-gray-600 ml-6">
              Apply anonymization techniques to mask sensitive information while preserving data utility for analysis.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleCancel}>
              Cancel Upload
            </Button>
            <Button onClick={handleProceed}>
              Proceed with Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}