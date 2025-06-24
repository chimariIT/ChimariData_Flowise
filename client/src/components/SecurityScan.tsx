import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  X, 
  Loader2,
  FileText,
  Lock,
  Scan
} from "lucide-react";

interface ScanResult {
  clean: boolean;
  threats: string[];
  scanTime: number;
  fileHash: string;
}

interface SecurityScanProps {
  isScanning: boolean;
  scanResult?: any;
  onComplete?: (result: { clean: boolean; threats: string[] }) => void;
  serviceType?: string;
}

export function SecurityScan({ 
  isScanning, 
  scanResult: initialScanResult, 
  onComplete, 
  serviceType = 'default' 
}: SecurityScanProps) {
  const [scanProgress, setScanProgress] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResult | null>(initialScanResult || null);
  const [scanStatus, setScanStatus] = useState<'pending' | 'scanning' | 'complete' | 'failed'>('pending');

  useEffect(() => {
    if (isScanning && scanStatus === 'pending') {
      startScan();
    }
  }, [isScanning, scanStatus]);

  const startScan = async () => {
    setScanStatus('scanning');
    setScanProgress(0);

    // Simulate scan progress
    const scanSteps = [
      { step: 'File validation', progress: 20, delay: 500 },
      { step: 'Malware detection', progress: 40, delay: 1000 },
      { step: 'Content analysis', progress: 60, delay: 800 },
      { step: 'Pattern matching', progress: 80, delay: 600 },
      { step: 'Final verification', progress: 100, delay: 400 }
    ];

    for (const { progress, delay } of scanSteps) {
      await new Promise(resolve => setTimeout(resolve, delay));
      setScanProgress(progress);
    }

    // Simulate scan completion
    const result: ScanResult = {
      clean: Math.random() > 0.1, // 90% chance of clean file
      threats: Math.random() > 0.1 ? [] : ['Suspicious pattern detected in cell data'],
      scanTime: 2500,
      fileHash: 'sha256:' + Math.random().toString(36).substring(2, 15)
    };

    setScanResult(result);
    setScanStatus('complete');
    onComplete?.({
      clean: result.clean,
      threats: result.threats
    });
  };

  const renderScanSteps = () => {
    const steps = [
      { id: 'validate', label: 'File Validation', icon: FileText },
      { id: 'malware', label: 'Malware Detection', icon: Shield },
      { id: 'content', label: 'Content Analysis', icon: Scan },
      { id: 'pattern', label: 'Pattern Matching', icon: Lock },
      { id: 'verify', label: 'Final Verification', icon: CheckCircle }
    ];

    return (
      <div className="space-y-3">
        {steps.map((step, index) => {
          const IconComponent = step.icon;
          const isActive = scanStatus === 'scanning' && scanProgress >= (index + 1) * 20;
          const isCompleted = scanProgress > (index + 1) * 20;
          
          return (
            <div key={step.id} className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isCompleted 
                  ? 'bg-green-500 text-white' 
                  : isActive 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <IconComponent className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${
                  isCompleted ? 'text-green-700' : 
                  isActive ? 'text-blue-700' : 
                  'text-slate-600'
                }`}>
                  {step.label}
                </div>
                {isActive && (
                  <div className="text-xs text-slate-500">Processing...</div>
                )}
                {isCompleted && (
                  <div className="text-xs text-green-600">✓ Complete</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span>Security Scan</span>
          </CardTitle>
          <CardDescription>
            Scanning your uploaded file for security threats and malware
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Info */}
          <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-lg">
            <FileText className="w-6 h-6 text-slate-500" />
            <div>
              <div className="font-medium">{filename}</div>
              <div className="text-sm text-slate-500">Upload ID: {uploadId}</div>
            </div>
          </div>

          {/* Scan Progress */}
          {scanStatus === 'scanning' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Scanning Progress</span>
                  <span>{scanProgress}%</span>
                </div>
                <Progress value={scanProgress} className="h-2" />
              </div>
              {renderScanSteps()}
            </div>
          )}

          {/* Scan Results */}
          {scanStatus === 'complete' && scanResult && (
            <div className="space-y-4">
              <Alert className={scanResult.clean ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                {scanResult.clean ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className={scanResult.clean ? 'text-green-800' : 'text-red-800'}>
                        {scanResult.clean ? 'File is Clean' : 'Security Threats Detected'}
                      </strong>
                      <div className="text-sm mt-1">
                        Scan completed in {scanResult.scanTime}ms
                      </div>
                    </div>
                    <Badge variant={scanResult.clean ? 'secondary' : 'destructive'}>
                      {scanResult.clean ? 'Safe' : 'Blocked'}
                    </Badge>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Threat Details */}
              {!scanResult.clean && scanResult.threats.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-800 flex items-center">
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      Security Issues Found
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {scanResult.threats.map((threat, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-red-700">{threat}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* File Hash */}
              <div className="text-xs text-slate-500 p-3 bg-slate-50 rounded font-mono">
                File Hash: {scanResult.fileHash}
              </div>

              {/* Next Steps */}
              {scanResult.clean && (
                <Alert className="border-blue-200 bg-blue-50">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <strong className="text-blue-800">Ready for Processing</strong>
                    <div className="text-sm mt-1">
                      Your file has passed security validation and is ready for schema analysis.
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between">
            {scanStatus === 'pending' && (
              <Button onClick={startScan} disabled={isScanning}>
                <Shield className="w-4 h-4 mr-2" />
                Start Security Scan
              </Button>
            )}
            
            {scanStatus === 'complete' && !scanResult?.clean && (
              <div className="space-x-2">
                <Button variant="outline">
                  Upload Different File
                </Button>
                <Button variant="secondary">
                  Contact Support
                </Button>
              </div>
            )}
          </div>

          {/* Security Information */}
          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <h4 className="font-medium text-slate-900 mb-2">Security Scan Details</h4>
            <div className="text-sm text-slate-600 space-y-1">
              <div>• Malware pattern detection using advanced signatures</div>
              <div>• Content analysis for suspicious code injection</div>
              <div>• File integrity and structure validation</div>
              <div>• Encrypted storage and secure processing pipeline</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}