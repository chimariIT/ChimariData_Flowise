import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Shield, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  FileKey, 
  Database,
  CheckCircle,
  XCircle
} from "lucide-react";

interface PIIType {
  type: 'ssn' | 'email' | 'phone' | 'address' | 'name' | 'credit_card' | 'ip_address' | 'date_of_birth';
  column: string;
  confidence: number;
  sampleValue?: string;
  count: number;
}

interface PIIDetectionResult {
  hasPII: boolean;
  detectedTypes: PIIType[];
  affectedColumns: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

interface PIIDetectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  piiResult: PIIDetectionResult;
  onDecision: (requiresPII: boolean, anonymizeData: boolean, selectedColumns: string[]) => void;
}

const PII_TYPE_LABELS = {
  ssn: 'Social Security Number',
  email: 'Email Address',
  phone: 'Phone Number',
  address: 'Address',
  name: 'Personal Name',
  credit_card: 'Credit Card Number',
  ip_address: 'IP Address',
  date_of_birth: 'Date of Birth'
};

const RISK_COLORS = {
  low: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  medium: 'text-orange-600 bg-orange-50 border-orange-200',
  high: 'text-red-600 bg-red-50 border-red-200'
};

export function PIIDetectionDialog({ 
  isOpen, 
  onClose,
  piiResult, 
  onDecision 
}: PIIDetectionDialogProps) {
  const [requiresPII, setRequiresPII] = useState(false);
  const [anonymizeData, setAnonymizeData] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(piiResult.affectedColumns);
  const [showSamples, setShowSamples] = useState(false);

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const handleAccept = () => {
    onDecision(requiresPII, anonymizeData, selectedColumns);
  };

  const getRiskIcon = () => {
    switch (piiResult.riskLevel) {
      case 'high':
        return <XCircle className="w-5 h-5" />;
      case 'medium':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Shield className="w-5 h-5" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="w-6 h-6 text-blue-600" />
            <span>PII Data Detection</span>
          </DialogTitle>
          <DialogDescription>
            We've detected personally identifiable information (PII) in your dataset. 
            Please review and decide how to proceed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Risk Level Alert */}
          <Alert className={RISK_COLORS[piiResult.riskLevel]}>
            <div className="flex items-center space-x-2">
              {getRiskIcon()}
              <div>
                <strong className="capitalize">{piiResult.riskLevel} Risk Level</strong>
                <div className="text-sm mt-1">
                  {piiResult.detectedTypes.length} type(s) of PII detected across {piiResult.affectedColumns.length} column(s)
                </div>
              </div>
            </div>
          </Alert>

          {/* Detected PII Types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detected PII Types</CardTitle>
              <CardDescription>
                Review the types of sensitive data found in your dataset
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {piiResult.detectedTypes.map((pii, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-xs">
                        {PII_TYPE_LABELS[pii.type]}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {Math.round(pii.confidence * 100)}% confidence
                      </span>
                    </div>
                    <div className="text-sm space-y-1">
                      <div><strong>Column:</strong> {pii.column}</div>
                      <div><strong>Count:</strong> {pii.count} records</div>
                      {pii.sampleValue && (
                        <div className="flex items-center space-x-2">
                          <strong>Sample:</strong>
                          <code className="text-xs bg-slate-100 px-1 rounded">
                            {showSamples ? pii.sampleValue : '***hidden***'}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSamples(!showSamples)}
                  className="text-xs"
                >
                  {showSamples ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                  {showSamples ? 'Hide' : 'Show'} Sample Values
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Data Usage Question */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Analysis Requirements</CardTitle>
              <CardDescription>
                Do you need this PII data for your analysis?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="requires-pii"
                    checked={requiresPII}
                    onCheckedChange={(checked) => setRequiresPII(!!checked)}
                  />
                  <label htmlFor="requires-pii" className="text-sm font-medium">
                    Yes, this PII data is required for my analysis
                  </label>
                </div>

                {requiresPII && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <Database className="h-4 w-4 text-blue-600" />
                    <AlertDescription>
                      <strong className="text-blue-800">Data Protection Policy</strong>
                      <div className="text-sm mt-1 text-blue-700">
                        ChimariData cannot store PII data. We can anonymize your data and provide 
                        a lookup table to translate results back to original values.
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Anonymization Options */}
          {requiresPII && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Anonymization Options</CardTitle>
                <CardDescription>
                  Select which columns to anonymize and how to process them
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="anonymize-data"
                      checked={anonymizeData}
                      onCheckedChange={(checked) => setAnonymizeData(!!checked)}
                    />
                    <label htmlFor="anonymize-data" className="text-sm font-medium">
                      Anonymize PII data and provide lookup table
                    </label>
                  </div>

                  {anonymizeData && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Select columns to anonymize:</h4>
                      <div className="grid md:grid-cols-2 gap-2">
                        {piiResult.affectedColumns.map((column) => (
                          <div key={column} className="flex items-center space-x-2">
                            <Checkbox
                              id={`column-${column}`}
                              checked={selectedColumns.includes(column)}
                              onCheckedChange={() => handleColumnToggle(column)}
                            />
                            <label htmlFor={`column-${column}`} className="text-sm">
                              {column}
                            </label>
                          </div>
                        ))}
                      </div>

                      <Alert className="border-green-200 bg-green-50">
                        <FileKey className="h-4 w-4 text-green-600" />
                        <AlertDescription>
                          <strong className="text-green-800">Anonymization Process</strong>
                          <div className="text-sm mt-1 text-green-700 space-y-1">
                            <div>• Original PII values will be replaced with anonymized identifiers</div>
                            <div>• A secure lookup table will be provided for result translation</div>
                            <div>• Data structure and relationships will be preserved</div>
                            <div>• Analysis accuracy will not be compromised</div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Security Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {piiResult.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel Upload
          </Button>
          <Button onClick={handleAccept} className="bg-blue-600 hover:bg-blue-700">
            {requiresPII ? (anonymizeData ? 'Proceed with Anonymization' : 'Proceed with PII') : 'Proceed without PII'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}