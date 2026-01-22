/**
 * ClarificationUI Component
 *
 * Displays clarification questions from agents and collects user answers.
 * Part of the u2a2a2u (user-to-agent-to-agent-to-user) pattern.
 *
 * Features:
 * - Multiple question types (multiple choice, free text, yes/no, numeric, date range)
 * - Severity-based styling (high = required, medium/low = optional)
 * - Skip option for non-blocking clarifications
 * - Real-time validation
 * - Help text and context display
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  HelpCircle,
  AlertCircle,
  CheckCircle,
  SkipForward,
  Send,
  RefreshCw,
  Info,
  AlertTriangle
} from 'lucide-react';

// Types matching the backend clarification-service.ts
export type QuestionType = 'multiple_choice' | 'free_text' | 'yes_no' | 'numeric' | 'date_range';
export type ClarificationContext = 'goal' | 'question' | 'description' | 'data_element' | 'analysis_type';
export type AmbiguitySeverity = 'high' | 'medium' | 'low';

export interface ClarificationQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  context: ClarificationContext;
  severity: AmbiguitySeverity;
  relatedField?: string;
  defaultValue?: string;
  helpText?: string;
  validationRules?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
}

export interface ClarificationRequest {
  projectId: string;
  questions: ClarificationQuestion[];
  originalInput: string;
  inputType: ClarificationContext;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'answered' | 'expired' | 'skipped';
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string | string[] | number | boolean;
}

interface ClarificationUIProps {
  projectId: string;
  clarificationRequest: ClarificationRequest;
  onComplete: (revisedInput?: string) => void;
  onSkip?: () => void;
  allowSkip?: boolean;
}

// Severity badge styling
const severityStyles: Record<AmbiguitySeverity, { variant: 'default' | 'destructive' | 'secondary'; icon: typeof AlertCircle }> = {
  high: { variant: 'destructive', icon: AlertCircle },
  medium: { variant: 'default', icon: AlertTriangle },
  low: { variant: 'secondary', icon: Info }
};

// Context labels
const contextLabels: Record<ClarificationContext, string> = {
  goal: 'Analysis Goal',
  question: 'Business Question',
  description: 'Project Description',
  data_element: 'Data Element',
  analysis_type: 'Analysis Type'
};

export function ClarificationUI({
  projectId,
  clarificationRequest,
  onComplete,
  onSkip,
  allowSkip = true
}: ClarificationUIProps) {
  const [answers, setAnswers] = useState<Record<string, ClarificationAnswer['answer']>>(() => {
    // Initialize with default values
    const initial: Record<string, ClarificationAnswer['answer']> = {};
    clarificationRequest.questions.forEach(q => {
      if (q.defaultValue) {
        initial[q.id] = q.defaultValue;
      }
    });
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Submit answers mutation
  const submitMutation = useMutation({
    mutationFn: async (formattedAnswers: ClarificationAnswer[]) => {
      const response = await apiClient.post(`/api/projects/${projectId}/clarifications/submit`, {
        answers: formattedAnswers
      });
      return response as { success: boolean; data?: { revisedInput?: string; remainingQuestions?: ClarificationQuestion[] } };
    },
    onSuccess: (data) => {
      if (data.success) {
        onComplete(data.data?.revisedInput);
      }
    }
  });

  // Skip clarification mutation
  const skipMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/api/projects/${projectId}/clarifications/skip`, {});
      return response as { success: boolean };
    },
    onSuccess: (data) => {
      if (data.success && onSkip) {
        onSkip();
      }
    }
  });

  // Validate a single answer
  const validateAnswer = useCallback((question: ClarificationQuestion, value: ClarificationAnswer['answer']): string | null => {
    if (question.required && (value === undefined || value === null || value === '')) {
      return 'This field is required';
    }

    if (question.validationRules) {
      const rules = question.validationRules;
      const strValue = String(value);

      if (rules.minLength && strValue.length < rules.minLength) {
        return `Minimum ${rules.minLength} characters required`;
      }
      if (rules.maxLength && strValue.length > rules.maxLength) {
        return `Maximum ${rules.maxLength} characters allowed`;
      }
      if (rules.pattern && !new RegExp(rules.pattern).test(strValue)) {
        return 'Invalid format';
      }
      if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
        return `Minimum value is ${rules.min}`;
      }
      if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
        return `Maximum value is ${rules.max}`;
      }
    }

    return null;
  }, []);

  // Update an answer
  const updateAnswer = useCallback((questionId: string, value: ClarificationAnswer['answer']) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    // Clear error when user starts typing
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[questionId];
      return newErrors;
    });
  }, []);

  // Handle submit
  const handleSubmit = useCallback(() => {
    const newErrors: Record<string, string> = {};

    // Validate all answers
    clarificationRequest.questions.forEach(question => {
      const error = validateAnswer(question, answers[question.id]);
      if (error) {
        newErrors[question.id] = error;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Format answers for submission
    const formattedAnswers: ClarificationAnswer[] = clarificationRequest.questions
      .filter(q => answers[q.id] !== undefined)
      .map(q => ({
        questionId: q.id,
        answer: answers[q.id]
      }));

    submitMutation.mutate(formattedAnswers);
  }, [answers, clarificationRequest.questions, validateAnswer, submitMutation]);

  // Handle skip
  const handleSkip = useCallback(() => {
    skipMutation.mutate();
  }, [skipMutation]);

  // Render question input based on type
  const renderQuestionInput = (question: ClarificationQuestion) => {
    const value = answers[question.id];
    const error = errors[question.id];

    switch (question.type) {
      case 'multiple_choice':
        return (
          <RadioGroup
            value={value as string}
            onValueChange={(val) => updateAnswer(question.id, val)}
            className="space-y-2"
          >
            {question.options?.map((option, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${question.id}-${idx}`} />
                <Label htmlFor={`${question.id}-${idx}`} className="cursor-pointer">
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'yes_no':
        return (
          <RadioGroup
            value={value as string}
            onValueChange={(val) => updateAnswer(question.id, val === 'yes')}
            className="flex space-x-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id={`${question.id}-yes`} />
              <Label htmlFor={`${question.id}-yes`} className="cursor-pointer">Yes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id={`${question.id}-no`} />
              <Label htmlFor={`${question.id}-no`} className="cursor-pointer">No</Label>
            </div>
          </RadioGroup>
        );

      case 'numeric':
        return (
          <Input
            type="number"
            value={value as number || ''}
            onChange={(e) => updateAnswer(question.id, parseFloat(e.target.value) || 0)}
            min={question.validationRules?.min}
            max={question.validationRules?.max}
            className={error ? 'border-red-500' : ''}
            placeholder="Enter a number"
          />
        );

      case 'date_range':
        return (
          <div className="flex space-x-2">
            <Input
              type="date"
              value={(value as string)?.split('|')[0] || ''}
              onChange={(e) => {
                const existing = (value as string) || '|';
                const parts = existing.split('|');
                updateAnswer(question.id, `${e.target.value}|${parts[1] || ''}`);
              }}
              className={error ? 'border-red-500' : ''}
            />
            <span className="flex items-center text-muted-foreground">to</span>
            <Input
              type="date"
              value={(value as string)?.split('|')[1] || ''}
              onChange={(e) => {
                const existing = (value as string) || '|';
                const parts = existing.split('|');
                updateAnswer(question.id, `${parts[0] || ''}|${e.target.value}`);
              }}
              className={error ? 'border-red-500' : ''}
            />
          </div>
        );

      case 'free_text':
      default:
        return (
          <Textarea
            value={value as string || ''}
            onChange={(e) => updateAnswer(question.id, e.target.value)}
            className={error ? 'border-red-500' : ''}
            placeholder="Enter your response..."
            rows={3}
          />
        );
    }
  };

  const requiredCount = clarificationRequest.questions.filter(q => q.required).length;
  const answeredRequiredCount = clarificationRequest.questions.filter(q => q.required && answers[q.id]).length;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Clarification Needed
          </CardTitle>
          <Badge variant="outline">
            {contextLabels[clarificationRequest.inputType]}
          </Badge>
        </div>
        <CardDescription>
          Please answer the following questions to help us better understand your requirements.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Original input context */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Your Input</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            "{clarificationRequest.originalInput}"
          </AlertDescription>
        </Alert>

        {/* Progress indicator */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {answeredRequiredCount} of {requiredCount} required questions answered
          </span>
          <span>
            {clarificationRequest.questions.length} total questions
          </span>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {clarificationRequest.questions.map((question, index) => {
            const severity = severityStyles[question.severity];
            const SeverityIcon = severity.icon;

            return (
              <div key={question.id} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <Label className="text-base font-medium flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">{index + 1}.</span>
                      {question.question}
                      {question.required && <span className="text-red-500">*</span>}
                    </Label>
                  </div>
                  <Badge variant={severity.variant} className="flex items-center gap-1">
                    <SeverityIcon className="h-3 w-3" />
                    {question.severity}
                  </Badge>
                </div>

                {question.helpText && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <HelpCircle className="h-3 w-3" />
                    {question.helpText}
                  </p>
                )}

                {question.relatedField && (
                  <p className="text-xs text-muted-foreground">
                    Related to: <code className="bg-muted px-1 rounded">{question.relatedField}</code>
                  </p>
                )}

                <div className="mt-2">
                  {renderQuestionInput(question)}
                </div>

                {errors[question.id] && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors[question.id]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      <CardFooter className="flex justify-between">
        {allowSkip && (
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={skipMutation.isPending || submitMutation.isPending}
          >
            {skipMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <SkipForward className="h-4 w-4 mr-2" />
            )}
            Skip for Now
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || answeredRequiredCount < requiredCount}
          >
            {submitMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit Answers
          </Button>
        </div>
      </CardFooter>

      {/* Error state */}
      {(submitMutation.error || skipMutation.error) && (
        <div className="px-6 pb-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {(submitMutation.error as Error)?.message || (skipMutation.error as Error)?.message || 'An error occurred'}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </Card>
  );
}

/**
 * Hook for managing clarification state in a page
 */
export function useClarification(projectId: string) {
  const [clarificationRequest, setClarificationRequest] = useState<ClarificationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch pending clarifications
  const fetchClarifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/api/projects/${projectId}/clarifications`) as {
        success: boolean;
        data?: { pending: ClarificationRequest | null; hasPending: boolean };
      };
      if (response.success && response.data?.hasPending) {
        setClarificationRequest(response.data.pending);
      } else {
        setClarificationRequest(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch clarifications');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Clear clarification state
  const clearClarification = useCallback(() => {
    setClarificationRequest(null);
  }, []);

  return {
    clarificationRequest,
    isLoading,
    error,
    fetchClarifications,
    clearClarification,
    hasPending: clarificationRequest !== null
  };
}

export default ClarificationUI;
