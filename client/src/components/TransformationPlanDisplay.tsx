/**
 * Transformation Plan Display Component
 *
 * Displays auto-generated transformation steps from the Data Requirements System
 * Shows step-by-step plan with execution order, descriptions, and estimated duration
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Play,
  CheckCircle,
  Clock,
  Code,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Lightbulb
} from "lucide-react";

interface TransformationStep {
  stepId: string;
  stepName: string;
  description: string;
  affectedElements: string[];
  code: string;
  estimatedDuration: string;
}

interface DataQualityCheck {
  checkName: string;
  description: string;
  targetElements: string[];
  validationCode: string;
}

interface TransformationPlan {
  transformationSteps: TransformationStep[];
  dataQualityChecks: DataQualityCheck[];
}

interface TransformationPlanDisplayProps {
  plan: TransformationPlan;
  onExecutePlan?: () => void;
  isExecuting?: boolean;
  journeyType?: string;
}

export function TransformationPlanDisplay({
  plan,
  onExecutePlan,
  isExecuting = false,
  journeyType = 'technical'
}: TransformationPlanDisplayProps) {
  const isSimplified = journeyType === 'non-tech' || journeyType === 'business' || journeyType === 'consultation';
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const totalSteps = plan.transformationSteps.length;
  const totalChecks = plan.dataQualityChecks.length;

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-blue-600" />
              Auto-Generated Transformation Plan
            </CardTitle>
            <CardDescription>
              {isSimplified
                ? "Your data is being prepared for analysis"
                : "Review and execute the automated transformation steps"}
            </CardDescription>
          </div>
          {onExecutePlan && (
            <Button
              onClick={onExecutePlan}
              disabled={isExecuting || totalSteps === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isExecuting ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Execute Plan
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <Alert className="bg-white border-blue-200">
          <Lightbulb className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {totalSteps}
                </div>
                <div className="text-xs text-gray-600">Transformation Steps</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {totalChecks}
                </div>
                <div className="text-xs text-gray-600">Quality Checks</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {calculateTotalDuration(plan.transformationSteps)}
                </div>
                <div className="text-xs text-gray-600">Estimated Time</div>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        {totalSteps === 0 && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-800">
              ✓ No transformations required - your data is ready for analysis!
            </AlertDescription>
          </Alert>
        )}

        {/* Transformation Steps */}
        {totalSteps > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {isSimplified ? (
                <CheckCircle className="w-4 h-4 text-blue-600" />
              ) : (
                <Code className="w-4 h-4 text-blue-600" />
              )}
              {isSimplified ? "Data Preparation Steps" : "Transformation Steps"}
            </h3>

            {plan.transformationSteps.map((step, index) => {
              const isExpanded = expandedSteps.has(step.stepId);

              return (
                <div
                  key={step.stepId}
                  className="bg-white rounded-lg border border-gray-200"
                >
                  <Collapsible
                    open={isExpanded}
                    onOpenChange={() => toggleStep(step.stepId)}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                              Step {index + 1}
                            </Badge>
                            <h4 className="font-medium text-sm text-gray-900">
                              {step.stepName}
                            </h4>
                            <Badge variant="outline" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              {step.estimatedDuration}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-600 mb-2">
                            {step.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>Affects:</span>
                            <span className="font-medium">
                              {step.affectedElements.length} element(s)
                            </span>
                          </div>
                        </div>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent>
                        <Separator className="my-3" />
                        {isSimplified ? (
                          <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded p-3">
                            <CheckCircle className="w-3 h-3" />
                            This step will be handled automatically
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                              <Code className="w-3 h-3" />
                              Transformation Code
                            </div>
                            <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs font-mono overflow-x-auto">
                              {step.code}
                            </pre>
                          </div>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}

        {/* Data Quality Checks */}
        {totalChecks > 0 && (
          <div className="space-y-4">
            <Separator />
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Data Quality Checks ({totalChecks})
            </h3>

            <div className="space-y-2">
              {plan.dataQualityChecks.map((check, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-gray-900 mb-1">
                        {check.checkName}
                      </h4>
                      <p className="text-xs text-gray-600">
                        {check.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {totalSteps > 3 && (
          <Alert className="bg-yellow-50 border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-xs text-yellow-800">
              <strong>Note:</strong> This transformation involves {totalSteps} steps and may take several minutes to complete.
              Consider running during off-peak hours for large datasets.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Helper: Calculate total estimated duration from steps
 */
function calculateTotalDuration(steps: TransformationStep[]): string {
  if (steps.length === 0) return '0 min';

  // Parse durations (assumes format like "2-5 minutes")
  const totalMinutes = steps.reduce((sum, step) => {
    const match = step.estimatedDuration.match(/(\d+)-(\d+)/);
    if (match) {
      // Use average of range
      const min = parseInt(match[1]);
      const max = parseInt(match[2]);
      return sum + (min + max) / 2;
    }
    return sum + 5; // Default 5 minutes if can't parse
  }, 0);

  if (totalMinutes < 60) {
    return `${Math.round(totalMinutes)} min`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    return `${hours}h ${mins}m`;
  }
}
