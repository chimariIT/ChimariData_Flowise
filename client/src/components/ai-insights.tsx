import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  MessageSquare,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Play,
  Gauge,
  ClipboardCheck,
  Activity
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface AIInsightsProps {
  project: any;
}

type InsightHighlight = {
  title: string;
  description: string;
  type?: string;
  confidence?: number;
};

type StructuredInsights = {
  summary: string;
  answer?: string;
  highlights: InsightHighlight[];
  recommendations: string[];
  nextSteps: string[];
  followUps: string[];
  warnings: string[];
};

type InsightRecord = {
  mode: "auto" | "question";
  question?: string | null;
  provider?: string;
  generatedAt?: string;
  latencyMs?: number;
  rawText?: string;
  insights: StructuredInsights;
};

type StoredAIInsights = {
  auto?: InsightRecord;
  history?: InsightRecord[];
  lastUpdated?: string;
};

const AUTO_FOCUS_DEFAULT = [
  "overall summary",
  "data quality",
  "actionable recommendations"
];

const HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  pattern: TrendingUp,
  trend: TrendingUp,
  anomaly: AlertTriangle,
  risk: AlertTriangle,
  quality: Gauge,
  recommendation: Lightbulb,
  suggestion: ClipboardCheck,
  action: ClipboardCheck,
  other: Lightbulb,
};

const toStringList = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input
      .map(item => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return [input.trim()].filter(Boolean);
  }
  return [];
};

const coerceHighlight = (item: unknown): InsightHighlight | null => {
  if (!item) {
    return null;
  }
  if (typeof item === "string") {
    const text = item.trim();
    return text.length
      ? { title: text.slice(0, 96), description: text }
      : null;
  }
  if (typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const record = item as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : undefined;
  const descriptionCandidate =
    typeof record.description === "string"
      ? record.description.trim()
      : typeof record.detail === "string"
        ? record.detail.trim()
        : typeof record.summary === "string"
          ? record.summary.trim()
          : undefined;

  if (!title && !descriptionCandidate) {
    return null;
  }

  const confidenceValue = typeof record.confidence === "number"
    ? record.confidence
    : typeof record.score === "number"
      ? record.score
      : undefined;

  const type = typeof record.type === "string"
    ? record.type.toLowerCase()
    : undefined;

  return {
    title: title || (descriptionCandidate ? descriptionCandidate.slice(0, 96) : "Insight"),
    description: descriptionCandidate || title || "Insight highlight",
    type,
    confidence: confidenceValue !== undefined ? Math.min(Math.max(confidenceValue, 0), 1) : undefined,
  };
};

const coerceStructuredInsights = (value: unknown): StructuredInsights => {
  if (!value) {
    return {
      summary: "No insights available yet.",
      highlights: [],
      recommendations: [],
      nextSteps: [],
      followUps: [],
      warnings: [],
    };
  }

  if (typeof value === "string") {
    const text = value.trim();
    return {
      summary: text || "No insights available yet.",
      highlights: [],
      recommendations: [],
      nextSteps: [],
      followUps: [],
      warnings: [],
    };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      summary: "Insights were returned in an unexpected format.",
      highlights: [],
      recommendations: [],
      nextSteps: [],
      followUps: [],
      warnings: [],
    };
  }

  const payload = value as Record<string, unknown>;
  const summary = typeof payload.summary === "string" && payload.summary.trim().length
    ? payload.summary.trim()
    : typeof payload.answer === "string" && payload.answer.trim().length
      ? payload.answer.trim()
      : "No summary provided.";
  const answer = typeof payload.answer === "string" && payload.answer.trim().length
    ? payload.answer.trim()
    : undefined;

  const highlightSource = Array.isArray(payload.highlights)
    ? payload.highlights
    : Array.isArray(payload.insights)
      ? payload.insights
      : [];

  const highlights = highlightSource
    .map(coerceHighlight)
    .filter((item): item is InsightHighlight => !!item)
    .slice(0, 6);

  const recommendations = toStringList(payload.recommendations).slice(0, 6);
  const nextSteps = toStringList((payload as any).nextSteps || (payload as any).actions).slice(0, 5);
  const followUps = toStringList((payload as any).followUps || (payload as any).followupQuestions).slice(0, 5);
  const warnings = toStringList(payload.warnings || (payload as any).risks).slice(0, 5);

  return {
    summary,
    answer,
    highlights,
    recommendations,
    nextSteps,
    followUps,
    warnings,
  };
};

const coerceInsightRecord = (entry: unknown): InsightRecord | null => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const raw = entry as Record<string, unknown>;
  const mode = raw.mode === "question" ? "question" : "auto";
  const question = typeof raw.question === "string"
    ? raw.question
    : raw.question === null
      ? null
      : undefined;
  const provider = typeof raw.provider === "string" ? raw.provider : undefined;
  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : undefined;
  const latencyMs = typeof raw.latencyMs === "number" ? raw.latencyMs : undefined;
  const rawText = typeof raw.rawText === "string" ? raw.rawText : undefined;
  const insights = coerceStructuredInsights(raw.insights ?? raw);

  return {
    mode,
    question,
    provider,
    generatedAt,
    latencyMs,
    rawText,
    insights,
  };
};

const deriveStoredState = (raw: unknown): { auto: InsightRecord | null; history: InsightRecord[] } => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { auto: null, history: [] };
  }

  const state = raw as StoredAIInsights;
  const autoRecord = coerceInsightRecord(state.auto);
  const historyRecords = Array.isArray(state.history)
    ? state.history
        .map(coerceInsightRecord)
        .filter((item): item is InsightRecord => !!item)
    : [];

  return {
    auto: autoRecord,
    history: historyRecords,
  };
};

const getConfidenceBadgeClass = (confidence?: number) => {
  if (confidence === undefined) {
    return "bg-slate-100 text-slate-700";
  }
  if (confidence >= 0.8) {
    return "bg-green-100 text-green-800";
  }
  if (confidence >= 0.6) {
    return "bg-yellow-100 text-yellow-800";
  }
  return "bg-red-100 text-red-800";
};

const formatConfidenceLabel = (confidence?: number) => {
  if (confidence === undefined) {
    return "confidence n/a";
  }
  return `${Math.round(confidence * 100)}% confidence`;
};

const formatLatency = (latency?: number) => {
  if (typeof latency !== "number" || latency <= 0) {
    return null;
  }
  if (latency < 1000) {
    return `${latency} ms`;
  }
  return `${(latency / 1000).toFixed(1)} s`;
};

const getHighlightIcon = (type?: string): LucideIcon => {
  if (!type) {
    return Lightbulb;
  }
  const key = type.toLowerCase();
  return HIGHLIGHT_ICONS[key] || Lightbulb;
};

export default function AIInsights({ project }: AIInsightsProps) {
  const { toast } = useToast();
  const [question, setQuestion] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastLatency, setLastLatency] = useState<number | null>(null);

  const initialState = useMemo(() => deriveStoredState(project?.aiInsights), [project?.aiInsights]);
  const [autoInsights, setAutoInsights] = useState<InsightRecord | null>(initialState.auto);
  const [history, setHistory] = useState<InsightRecord[]>(initialState.history);

  useEffect(() => {
    const updated = deriveStoredState(project?.aiInsights);
    if (updated.auto && (!autoInsights || autoInsights.generatedAt !== updated.auto.generatedAt)) {
      setAutoInsights(updated.auto);
    }
    if (updated.history.length) {
      if (!history.length || history[0].generatedAt !== updated.history[0].generatedAt) {
        setHistory(updated.history);
      }
    } else if (history.length) {
      setHistory([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.aiInsights]);

  const role = project?.aiRole || "data analyst";

  const autoFocusAreas = useMemo(() => {
    const focus: string[] = [];
    const coordination = project?.multiAgentCoordination;
    if (coordination?.projectManager?.currentFocus) {
      focus.push(coordination.projectManager.currentFocus);
    }
    if (coordination?.projectManager?.nextSteps) {
      focus.push(...toStringList(coordination.projectManager.nextSteps));
    }
    if (coordination?.dataScientist?.priorityInsights) {
      focus.push(...toStringList(coordination.dataScientist.priorityInsights));
    }
    if (coordination?.dataScientist?.currentFocus) {
      focus.push(coordination.dataScientist.currentFocus);
    }
    const unique = Array.from(new Set(focus.map(item => item.trim()).filter(Boolean)));
    return unique.length ? unique.slice(0, 5) : AUTO_FOCUS_DEFAULT;
  }, [project?.multiAgentCoordination]);

  const suggestedQuestions = [
    "What are the main patterns in my data?",
    "Are there any anomalies or outliers I should investigate?",
    "How strong is data quality across key fields?",
    "Which metrics are most predictive of outcomes?",
    "What immediate actions would you recommend?",
    "What insights are most relevant to executives?"
  ];

  const triggerInsights = async (mode: "auto" | "question") => {
    if (mode === "question" && !question.trim()) {
      return;
    }

    setIsGenerating(true);
    try {
      const payload: Record<string, unknown> = {
        projectId: project.id,
        role,
        focusAreas: mode === "auto" ? autoFocusAreas : [question.trim()],
      };
      if (mode === "question") {
        payload.question = question.trim();
      }

      const response = await apiClient.post("/api/ai/ai-insights", payload);
      const record = coerceInsightRecord({
        ...response,
        mode: response.mode,
        question: response.question,
        provider: response.provider,
        generatedAt: response.generatedAt,
        latencyMs: response.latencyMs,
        rawText: response.rawText,
        insights: response.insights,
      });

      if (!record) {
        throw new Error("AI response was not in the expected format");
      }

      setLastLatency(record.latencyMs ?? null);

      if (record.mode === "auto") {
        setAutoInsights(record);
      } else {
        setHistory(prev => [record, ...prev].slice(0, 15));
        setQuestion("");
      }

      toast({
        title: record.mode === "auto" ? "Auto-insights ready" : "Question answered",
        description: `Response from ${record.provider || "AI service"}${record.latencyMs ? ` in ${formatLatency(record.latencyMs)}` : ""}.`,
      });
    } catch (error: any) {
      const message = error?.message || "There was an error generating insights";
      toast({
        title: "Insight generation failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAutoInsights = () => triggerInsights("auto");
  const handleAskQuestion = () => triggerInsights("question");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Auto-Insights
          </CardTitle>
          <CardDescription>
            Generate a structured summary of this dataset with real analysis providers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!autoInsights ? (
            <Button onClick={handleAutoInsights} disabled={isGenerating} className="w-full">
              <Brain className="w-4 h-4 mr-2" />
              {isGenerating ? "Generating insights..." : "Generate Auto-Insights"}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-blue-50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-blue-900 mb-2">{autoInsights.insights.summary}</h3>
                    <p className="text-xs text-blue-700">
                      {autoInsights.generatedAt ? new Date(autoInsights.generatedAt).toLocaleString() : "Just now"}
                      {autoInsights.provider ? ` • ${autoInsights.provider}` : ""}
                      {autoInsights.latencyMs ? ` • ${formatLatency(autoInsights.latencyMs)}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline">Auto</Badge>
                </div>
              </div>

              {autoInsights.insights.highlights.map((highlight, index) => {
                const Icon = getHighlightIcon(highlight.type);
                return (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <h4 className="font-medium text-gray-900">{highlight.title}</h4>
                          <Badge className={getConfidenceBadgeClass(highlight.confidence)}>
                            {formatConfidenceLabel(highlight.confidence)}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">{highlight.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {autoInsights.insights.recommendations.length > 0 && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardCheck className="w-4 h-4 text-amber-600" />
                    <h4 className="font-medium text-gray-900">Recommendations</h4>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-700">
                    {autoInsights.insights.recommendations.map((item, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-amber-600">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(autoInsights.insights.nextSteps.length > 0 || autoInsights.insights.followUps.length > 0 || autoInsights.insights.warnings.length > 0) && (
                <div className="grid gap-3 md:grid-cols-3">
                  {autoInsights.insights.nextSteps.length > 0 && (
                    <div className="border rounded-lg p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Next steps</p>
                      <ul className="space-y-1 text-sm text-gray-700">
                        {autoInsights.insights.nextSteps.map((item, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-gray-400">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {autoInsights.insights.followUps.length > 0 && (
                    <div className="border rounded-lg p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Follow-up questions</p>
                      <ul className="space-y-1 text-sm text-gray-700">
                        {autoInsights.insights.followUps.map((item, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-gray-400">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {autoInsights.insights.warnings.length > 0 && (
                    <div className="border rounded-lg p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Warnings</p>
                      <ul className="space-y-1 text-sm text-gray-700">
                        {autoInsights.insights.warnings.map((item, idx) => (
                          <li key={idx} className="flex gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <Button variant="outline" onClick={handleAutoInsights} disabled={isGenerating}>
                Refresh Insights
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Ask AI About Your Data
          </CardTitle>
          <CardDescription>
            Submit targeted questions and get answers grounded in your dataset.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Textarea
              placeholder="Ask me anything about your data..."
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="min-h-[80px]"
            />
            <Button onClick={handleAskQuestion} disabled={isGenerating || !question.trim()}>
              <Play className="w-4 h-4 mr-2" />
              {isGenerating ? "Processing..." : "Ask Question"}
            </Button>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Suggested questions</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((item, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuestion(item)}
                  className="text-xs"
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>

          {lastLatency !== null && (
            <p className="text-xs text-gray-500">
              Last response time: {formatLatency(lastLatency) ?? "under a minute"}
            </p>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previous Questions & Insights</CardTitle>
            <CardDescription>
              Review the most recent answers generated for this dataset.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {history.map((entry, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-blue-900">
                      {entry.question ? `Q: ${entry.question}` : "Ad-hoc insight"}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : "Just now"}
                      {entry.provider ? ` • ${entry.provider}` : ""}
                      {entry.latencyMs ? ` • ${formatLatency(entry.latencyMs)}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">Answer</Badge>
                </div>

                <p className="text-sm text-gray-700 leading-relaxed">
                  {entry.insights.answer || entry.insights.summary}
                </p>

                {entry.insights.highlights.length > 0 && (
                  <div className="space-y-2">
                    {entry.insights.highlights.map((highlight, idx) => {
                      const Icon = getHighlightIcon(highlight.type);
                      return (
                        <div key={idx} className="flex items-start gap-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Icon className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-gray-900">{highlight.title}</span>
                              <Badge className={getConfidenceBadgeClass(highlight.confidence)}>
                                {formatConfidenceLabel(highlight.confidence)}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{highlight.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(entry.insights.followUps.length > 0 || entry.insights.nextSteps.length > 0) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {entry.insights.nextSteps.length > 0 && (
                      <div className="border rounded-lg p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Next steps</p>
                        <ul className="space-y-1 text-sm text-gray-700">
                          {entry.insights.nextSteps.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <Activity className="w-4 h-4 text-blue-500" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {entry.insights.followUps.length > 0 && (
                      <div className="border rounded-lg p-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Follow-up ideas</p>
                        <ul className="space-y-1 text-sm text-gray-700">
                          {entry.insights.followUps.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <Lightbulb className="w-4 h-4 text-amber-500" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}