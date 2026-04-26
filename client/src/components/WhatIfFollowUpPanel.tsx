import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";

interface WhatIfAnswer {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  groundingColumns: string[];
}

interface WhatIfFollowUpPanelProps {
  projectId?: string;
  existingQuestions?: string[];
}

const MAX_HISTORY = 8;

export default function WhatIfFollowUpPanel({
  projectId,
  existingQuestions = []
}: WhatIfFollowUpPanelProps) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<WhatIfAnswer[]>([]);

  const suggestions = useMemo(() => {
    const trimmed = existingQuestions
      .map((question) => question?.trim())
      .filter((question): question is string => Boolean(question))
      .slice(0, 3);

    if (trimmed.length > 0) {
      return trimmed.map((question) => `What if ${question.replace(/\?$/, "").toLowerCase()} next quarter?`);
    }

    return [
      "What if this metric drops by 5% in one region?",
      "What if we focus on the highest-performing segment only?",
      "What if we improve the lowest score category first?"
    ];
  }, [existingQuestions]);

  const queryMutation = useMutation({
    mutationFn: async (rawQuestion: string) => {
      if (!projectId) {
        throw new Error("Project id is required for what-if analysis.");
      }

      const guardrailedPrompt = [
        "Answer this as a data what-if follow-up using only the project context and available analysis data.",
        "Do not invent columns, metrics, or numeric values. If data is missing, say exactly what is missing.",
        `What-if question: ${rawQuestion}`
      ].join("\n");

      const response = await apiRequest("POST", "/api/ai/query", {
        query: guardrailedPrompt,
        projectId,
        mode: "what_if",
        strictGrounding: true,
        context: {
          existingQuestions: existingQuestions.slice(0, 8)
        }
      });
      return response.json();
    },
    onSuccess: (data, originalQuestion) => {
      const answerText = (typeof data?.response === "string" && data.response.trim().length > 0)
        ? data.response
        : "I could not derive a reliable what-if answer from the available data context.";

      setHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          question: originalQuestion,
          answer: answerText,
          createdAt: new Date().toISOString(),
          groundingColumns: Array.isArray(data?.grounding?.availableColumns)
            ? data.grounding.availableColumns.slice(0, 6)
            : []
        },
        ...prev
      ].slice(0, MAX_HISTORY));

      setInput("");
    },
    onError: (error: any) => {
      toast({
        title: "Could not run follow-up",
        description: error?.message || "Try again in a moment.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = () => {
    const next = input.trim();
    if (!next || queryMutation.isPending) return;
    queryMutation.mutate(next);
  };

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <Card className="border-indigo-200" data-testid="what-if-follow-up-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquarePlus className="w-5 h-5 text-indigo-600" />
          What-If Follow-Up
        </CardTitle>
        <CardDescription>
          Ask scenario-based follow-ups and test alternatives without leaving this tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask a what-if follow-up (for example: What if engagement improves by 10% in Team A?)"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
            disabled={!projectId || queryMutation.isPending}
          />
          <Button onClick={handleSubmit} disabled={!projectId || queryMutation.isPending || input.trim().length === 0}>
            {queryMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Ask
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              onClick={() => handleSuggestion(suggestion)}
              disabled={queryMutation.isPending}
              className="text-xs"
            >
              {suggestion}
            </Button>
          ))}
        </div>

        {history.length > 0 && (
          <div className="space-y-3">
            {history.map((item, index) => (
              <div key={item.id} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-indigo-900">Scenario {index + 1}</p>
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-800">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Badge>
                </div>
                <p className="text-sm text-gray-800 mt-2"><strong>Q:</strong> {item.question}</p>
                <p className="text-sm text-gray-700 mt-2"><strong>A:</strong> {item.answer}</p>
                {item.groundingColumns.length > 0 && (
                  <p className="text-xs text-indigo-700 mt-2">
                    <strong>Grounding:</strong> {item.groundingColumns.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
