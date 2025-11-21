import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, AlertTriangle, Info, RefreshCw } from "lucide-react";

interface DataQualityCheckpointProps {
  qualityScore: number;
  issues: Array<{
    severity: 'critical' | 'warning' | 'info';
    message: string;
    fix?: string;
  }>;
  onApprove: () => void;
  onFixIssue?: (issueIndex: number) => void;
  isLoading?: boolean;
}

export function DataQualityCheckpoint({
  qualityScore,
  issues,
  onApprove,
  onFixIssue,
  isLoading = false
}: DataQualityCheckpointProps) {
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState<Set<number>>(new Set());

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infoIssues = issues.filter(i => i.severity === 'info');

  const hasCriticalIssues = criticalIssues.length > 0;
  const allWarningsAcknowledged = warnings.length === 0 || warnings.every((_, index) => 
    acknowledgedWarnings.has(warnings.indexOf(warnings[index]))
  );

  const canProceed = !hasCriticalIssues && allWarningsAcknowledged;

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 90) return 'default';
    if (score >= 70) return 'secondary';
    return 'destructive';
  };

  const toggleWarningAcknowledgment = (index: number) => {
    setAcknowledgedWarnings(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <Card className={hasCriticalIssues ? "border-red-200 bg-red-50" : canProceed ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hasCriticalIssues ? (
            <AlertCircle className="w-5 h-5 text-red-600" />
          ) : canProceed ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
          )}
          <span className={hasCriticalIssues ? 'text-red-900' : canProceed ? 'text-green-900' : 'text-yellow-900'}>
            Data Quality Checkpoint
          </span>
        </CardTitle>
        <CardDescription className={hasCriticalIssues ? 'text-red-700' : canProceed ? 'text-green-700' : 'text-yellow-700'}>
          {hasCriticalIssues 
            ? 'Critical issues must be resolved before proceeding'
            : canProceed 
            ? 'Data quality approved. Ready to proceed.'
            : 'Please review warnings before proceeding'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quality Score Display */}
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-1">Overall Quality Score</h4>
            <p className="text-xs text-gray-500">Based on completeness, consistency, and validity</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${getScoreColor(qualityScore)}`}>
              {qualityScore}%
            </p>
            <Badge variant={getScoreBadge(qualityScore)} className="mt-1">
              {qualityScore >= 90 ? 'Excellent' : qualityScore >= 70 ? 'Good' : 'Needs Attention'}
            </Badge>
          </div>
        </div>

        {/* Critical Issues */}
        {criticalIssues.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <h4 className="font-semibold">Critical Issues ({criticalIssues.length})</h4>
                <ul className="space-y-2">
                  {criticalIssues.map((issue, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{issue.message}</p>
                        {issue.fix && (
                          <p className="text-xs text-gray-600 mt-1">
                            Suggested fix: {issue.fix}
                          </p>
                        )}
                        {onFixIssue && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => onFixIssue(index)}
                          >
                            Apply Fix
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <h4 className="font-semibold">Warnings ({warnings.length})</h4>
                <ul className="space-y-2">
                  {warnings.map((issue, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm">{issue.message}</p>
                        {issue.fix && (
                          <p className="text-xs text-gray-600 mt-1">
                            Suggested fix: {issue.fix}
                          </p>
                        )}
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={acknowledgedWarnings.has(index)}
                            onChange={() => toggleWarningAcknowledgment(index)}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">
                            I acknowledge this warning
                          </span>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Info Issues */}
        {infoIssues.length > 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <h4 className="font-semibold">Information ({infoIssues.length})</h4>
                <ul className="space-y-1">
                  {infoIssues.map((issue, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">{issue.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Approval Action */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            {hasCriticalIssues && (
              <span className="text-red-600 font-medium">
                Cannot proceed with critical issues
              </span>
            )}
            {!hasCriticalIssues && !allWarningsAcknowledged && (
              <span className="text-yellow-600 font-medium">
                Please acknowledge warnings to proceed
              </span>
            )}
            {canProceed && (
              <span className="text-green-600 font-medium">
                ✓ All checks complete
              </span>
            )}
          </div>
          
          <Button
            onClick={onApprove}
            disabled={!canProceed || isLoading}
            className={canProceed ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve Quality
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}



















