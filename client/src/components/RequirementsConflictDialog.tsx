/**
 * Requirements Conflict Dialog
 *
 * Displays conflicts between Data Scientist and PM Agent suggestions
 * Allows users to review and resolve conflicts before execution
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  User,
  Bot,
  Sparkles
} from "lucide-react";

export interface ValidationConflict {
  element: string;
  requirementsSuggests: string;
  pmSuggests: string;
  confidence: {
    requirements: number;
    pm: number;
  };
  recommendation: string;
}

interface RequirementsConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ValidationConflict[];
  overallConfidence: number;
  onResolveConflicts: (resolutions: Record<string, { choice: string; customValue?: string }>) => void;
}

type ConflictChoice = 'requirements' | 'pm' | 'custom';

export function RequirementsConflictDialog({
  open,
  onOpenChange,
  conflicts,
  overallConfidence,
  onResolveConflicts
}: RequirementsConflictDialogProps) {
  const [resolutions, setResolutions] = useState<Record<string, { choice: ConflictChoice; customValue?: string }>>({});

  const handleChoiceChange = (element: string, choice: ConflictChoice) => {
    setResolutions(prev => ({
      ...prev,
      [element]: { choice, customValue: prev[element]?.customValue }
    }));
  };

  const handleCustomValueChange = (element: string, value: string) => {
    setResolutions(prev => ({
      ...prev,
      [element]: { ...prev[element], choice: 'custom', customValue: value }
    }));
  };

  const handleResolve = () => {
    onResolveConflicts(resolutions);
    onOpenChange(false);
  };

  const allConflictsResolved = conflicts.every(conflict =>
    resolutions[conflict.element]?.choice &&
    (resolutions[conflict.element].choice !== 'custom' || resolutions[conflict.element].customValue)
  );

  const getConfidenceBadge = (confidence: number) => {
    const percentage = Math.round(confidence * 100);
    if (confidence >= 0.8) {
      return <Badge className="bg-green-100 text-green-800">{percentage}%</Badge>;
    } else if (confidence >= 0.7) {
      return <Badge className="bg-yellow-100 text-yellow-800">{percentage}%</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">{percentage}%</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
            Requirements Validation - Conflicts Detected
          </DialogTitle>
          <DialogDescription>
            The Data Scientist Agent and PM Agent have suggested different approaches for some elements.
            Please review and choose the best option for your analysis.
          </DialogDescription>
        </DialogHeader>

        {/* Overall Confidence */}
        <Alert className={
          overallConfidence >= 0.8 ? "bg-green-50 border-green-200" :
          overallConfidence >= 0.7 ? "bg-yellow-50 border-yellow-200" :
          "bg-red-50 border-red-200"
        }>
          <TrendingUp className={`h-4 w-4 ${
            overallConfidence >= 0.8 ? "text-green-600" :
            overallConfidence >= 0.7 ? "text-yellow-600" :
            "text-red-600"
          }`} />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Overall Validation Confidence: {Math.round(overallConfidence * 100)}%
              </span>
              {overallConfidence < 0.7 && (
                <span className="text-xs text-red-700">
                  Manual review required before proceeding
                </span>
              )}
            </div>
          </AlertDescription>
        </Alert>

        {/* Conflicts List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Conflicts Found: {conflicts.length}
            </h3>
            <Badge variant="outline">
              {Object.keys(resolutions).length} / {conflicts.length} Resolved
            </Badge>
          </div>

          {conflicts.map((conflict, index) => {
            const resolution = resolutions[conflict.element];
            const currentChoice = resolution?.choice;

            return (
              <Card key={index} className="p-4 border-2 border-yellow-200 bg-yellow-50">
                <div className="space-y-4">
                  {/* Conflict Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-gray-900">
                        Element: {conflict.element}
                      </h4>
                      <Badge variant="outline" className="text-xs">
                        Conflict #{index + 1}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {conflict.recommendation}
                    </p>
                  </div>

                  <Separator />

                  {/* Options */}
                  <RadioGroup
                    value={currentChoice}
                    onValueChange={(value) => handleChoiceChange(conflict.element, value as ConflictChoice)}
                  >
                    {/* Data Scientist Suggestion */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      currentChoice === 'requirements' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="requirements" id={`req-${index}`} />
                        <div className="flex-1">
                          <Label
                            htmlFor={`req-${index}`}
                            className="flex items-center gap-2 mb-2 cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4 text-blue-600" />
                            <span className="font-medium">Data Scientist Suggestion</span>
                            {getConfidenceBadge(conflict.confidence.requirements)}
                          </Label>
                          <p className="text-sm text-gray-700 pl-6">
                            {conflict.requirementsSuggests}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* PM Agent Suggestion */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      currentChoice === 'pm' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="pm" id={`pm-${index}`} />
                        <div className="flex-1">
                          <Label
                            htmlFor={`pm-${index}`}
                            className="flex items-center gap-2 mb-2 cursor-pointer"
                          >
                            <Bot className="w-4 h-4 text-purple-600" />
                            <span className="font-medium">PM Agent Suggestion</span>
                            {getConfidenceBadge(conflict.confidence.pm)}
                          </Label>
                          <p className="text-sm text-gray-700 pl-6">
                            {conflict.pmSuggests}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Custom Option */}
                    <div className={`border-2 rounded-lg p-3 transition-all ${
                      currentChoice === 'custom' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="custom" id={`custom-${index}`} />
                        <div className="flex-1 space-y-2">
                          <Label
                            htmlFor={`custom-${index}`}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <User className="w-4 h-4 text-green-600" />
                            <span className="font-medium">Custom Mapping (Your Choice)</span>
                          </Label>
                          <Input
                            placeholder="Enter your custom transformation approach..."
                            value={resolution?.customValue || ''}
                            onChange={(e) => handleCustomValueChange(conflict.element, e.target.value)}
                            onClick={() => handleChoiceChange(conflict.element, 'custom')}
                            className="ml-6"
                            disabled={currentChoice !== 'custom' && currentChoice !== undefined}
                          />
                        </div>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-sm text-gray-600">
            {!allConflictsResolved && (
              <span className="text-yellow-600 font-medium">
                ⚠ Please resolve all conflicts before proceeding
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolve}
              disabled={!allConflictsResolved}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Apply Resolutions
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
