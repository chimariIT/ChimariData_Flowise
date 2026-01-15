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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Brain,
  CheckCircle,
  MessageCircle,
  Target,
  AlertCircle,
  Lightbulb,
  Loader2
} from "lucide-react";

interface ClarificationData {
  summary: string;
  understoodGoals: string[];
  clarifyingQuestions: Array<{ question: string; reason: string }>;
  suggestedFocus: string[];
  identifiedGaps: string[];
}

interface PMAgentClarificationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (answers: Record<string, string>, refinedGoal?: string) => void;
  clarificationData: ClarificationData | null;
  isLoading: boolean;
}

export function PMAgentClarificationDialog({
  open,
  onClose,
  onConfirm,
  clarificationData,
  isLoading
}: PMAgentClarificationDialogProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [refinedGoal, setRefinedGoal] = useState("");

  const handleAnswerChange = (questionIndex: number, answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [`q${questionIndex}`]: answer
    }));
  };

  const handleConfirm = () => {
    onConfirm(answers, refinedGoal || undefined);
    // Reset state
    setAnswers({});
    setRefinedGoal("");
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Analyzing Your Goals</DialogTitle>
            <DialogDescription>
              The PM Agent is reviewing your analysis goals and preparing clarifying questions.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">PM Agent is analyzing your goals...</p>
            <p className="text-sm text-muted-foreground mt-2">
              This will just take a moment
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!clarificationData) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <DialogTitle className="text-2xl">Goal Clarification</DialogTitle>
          </div>
          <DialogDescription>
            I've analyzed your goals. Let me confirm my understanding and ask a few clarifying questions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* PM Agent's Understanding */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">My Understanding</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {clarificationData.summary}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Understood Goals */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Specific Goals I Identified</h3>
            </div>
            <ul className="space-y-2">
              {clarificationData.understoodGoals.map((goal, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-primary mt-1">"</span>
                  <span>{goal}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggested Focus Areas */}
          {clarificationData.suggestedFocus.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-yellow-600" />
                <h3 className="font-semibold">Suggested Focus Areas</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {clarificationData.suggestedFocus.map((focus, idx) => (
                  <Badge key={idx} variant="secondary">
                    {focus}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Identified Gaps */}
          {clarificationData.identifiedGaps.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <h3 className="font-semibold">Areas That Need More Detail</h3>
              </div>
              <ul className="space-y-2">
                {clarificationData.identifiedGaps.map((gap, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-orange-600 mt-1">"</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clarifying Questions */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">
                A Few Questions to Help Me Serve You Better
              </h3>
            </div>

            <div className="space-y-6">
              {clarificationData.clarifyingQuestions.map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <Label htmlFor={`question-${idx}`} className="text-base font-medium">
                    {idx + 1}. {item.question}
                  </Label>
                  <p className="text-sm text-muted-foreground italic">
                    Why I'm asking: {item.reason}
                  </p>
                  <Textarea
                    id={`question-${idx}`}
                    placeholder="Your answer..."
                    value={answers[`q${idx}`] || ""}
                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Optional: Refine Goal */}
          <div className="border-t pt-6">
            <Label htmlFor="refined-goal" className="text-base font-medium mb-2 block">
              Would you like to refine or add to your goal? (Optional)
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Based on our discussion, you can update your analysis goal if needed.
            </p>
            <Textarea
              id="refined-goal"
              placeholder="Leave blank if your original goal is still accurate..."
              value={refinedGoal}
              onChange={(e) => setRefinedGoal(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Skip Clarification
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              // Require at least one question to be answered
              Object.keys(answers).length === 0 && !refinedGoal
            }
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirm & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
