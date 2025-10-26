// client/src/components/CheckpointDialog.tsx
// Phase 3 - Task 3.3: Checkpoint System

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Edit3,
  FileText,
  BarChart3,
  Eye,
  MessageSquare
} from "lucide-react";

interface AnalysisStep {
  id: string;
  name: string;
  description: string;
  duration: string;
  status?: 'pending' | 'approved' | 'modified';
}

interface CheckpointDialogProps {
  open: boolean;
  onClose: () => void;
  onApprove: (feedback?: string) => void;
  onModify: (modifications: string) => void;
  analysisSteps: AnalysisStep[];
  journeyType: string;
  estimatedDuration?: string;
  estimatedCost?: number;
}

export function CheckpointDialog({
  open,
  onClose,
  onApprove,
  onModify,
  analysisSteps,
  journeyType,
  estimatedDuration,
  estimatedCost
}: CheckpointDialogProps) {
  const [feedback, setFeedback] = useState("");
  const [modifications, setModifications] = useState("");
  const [showModifyForm, setShowModifyForm] = useState(false);

  const handleApprove = () => {
    onApprove(feedback || undefined);
    setFeedback("");
    setShowModifyForm(false);
  };

  const handleModify = () => {
    if (modifications.trim()) {
      onModify(modifications);
      setModifications("");
      setShowModifyForm(false);
    }
  };

  const getJourneyIcon = () => {
    switch (journeyType) {
      case 'non-tech':
        return <BarChart3 className="w-5 h-5 text-blue-600" />;
      case 'business':
        return <FileText className="w-5 h-5 text-green-600" />;
      case 'technical':
        return <Eye className="w-5 h-5 text-purple-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {getJourneyIcon()}
            Analysis Plan Review Checkpoint
          </DialogTitle>
          <DialogDescription>
            Review the proposed analysis plan before execution. You can approve it as-is or request modifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Analysis Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Estimated Duration:</span>
                </div>
                <Badge variant="secondary">{estimatedDuration || 'Calculating...'}</Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Total Steps:</span>
                </div>
                <Badge variant="secondary">{analysisSteps.length} steps</Badge>
              </div>

              {estimatedCost !== undefined && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Estimated Cost:</span>
                  </div>
                  <Badge variant="secondary">${estimatedCost.toFixed(2)}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Planned Analysis Steps</CardTitle>
              <CardDescription>
                The following steps will be executed in order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analysisSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-3 p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">{step.name}</h4>
                        <span className="text-xs text-gray-500">{step.duration}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                      {step.status && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          {step.status === 'approved' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {step.status === 'modified' && <Edit3 className="w-3 h-3 mr-1" />}
                          {step.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Feedback/Modification Section */}
          {!showModifyForm ? (
            <div className="space-y-3">
              <Label htmlFor="feedback" className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Optional Feedback (Optional)
              </Label>
              <Textarea
                id="feedback"
                placeholder="Add any notes or feedback about this analysis plan..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-gray-500">
                Your feedback helps improve future analysis recommendations
              </p>
            </div>
          ) : (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  Request Modifications
                </CardTitle>
                <CardDescription>
                  Describe what changes you'd like to the analysis plan
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Example: Please add time-series analysis and remove clustering analysis..."
                  value={modifications}
                  onChange={(e) => setModifications(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowModifyForm(!showModifyForm)}
            className="mr-auto"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            {showModifyForm ? 'Cancel Modify' : 'Request Changes'}
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>

            {showModifyForm ? (
              <Button
                onClick={handleModify}
                disabled={!modifications.trim()}
                variant="secondary"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Submit Changes
              </Button>
            ) : (
              <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve & Execute
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
