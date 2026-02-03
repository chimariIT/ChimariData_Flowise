import { useMemo } from "react";
import type { DataProject } from "@shared/schema";
import type { JourneyStateResponse } from "@/hooks/useJourneyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Users,
  Database,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Clock,
  TrendingUp,
} from "lucide-react";

type ExpertOpinion = {
  agentId: string;
  agentName?: string;
  opinion?: Record<string, unknown> | null;
  confidence?: number;
  timestamp?: string;
};

type SynthesizedRecommendation = {
  overallAssessment?: "proceed" | "proceed_with_caution" | "revise_approach" | "not_feasible";
  confidence?: number;
  keyFindings?: string[];
  actionableRecommendations?: string[];
  estimatedTimeline?: string;
  estimatedCost?: string;
  expertConsensus?: {
    dataQuality?: string;
    technicalFeasibility?: string;
    businessValue?: string;
  };
};

type MultiAgentCoordinationResult = {
  coordinationId?: string;
  projectId?: string;
  expertOpinions?: ExpertOpinion[];
  synthesis?: SynthesizedRecommendation;
  timestamp?: string | Date;
  totalResponseTime?: number;
};

interface AgentActivityOverviewProps {
  project: DataProject;
  journeyState?: JourneyStateResponse | null;
  onNavigateToInsights: () => void;
}

const assessmentDisplay = {
  proceed: {
    title: "Ready to proceed",
    description: "Agents agree you can move forward with confidence.",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    icon: CheckCircle,
  },
  proceed_with_caution: {
    title: "Proceed with caution",
    description: "Review agent notes before moving to the next stage.",
    badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: AlertTriangle,
  },
  revise_approach: {
    title: "Revise approach",
    description: "Agents flagged blockers that need attention first.",
    badgeClass: "bg-orange-100 text-orange-800 border-orange-200",
    icon: AlertTriangle,
  },
  not_feasible: {
    title: "Not feasible yet",
    description: "Significant risks detected. Revisit data or goals.",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    icon: AlertCircle,
  },
} satisfies Record<string, { title: string; description: string; badgeClass: string; icon: typeof CheckCircle }>;

const agentDescriptors: Record<string, { label: string; icon: typeof Users; accent: string; badge: string }> = {
  data_engineer: {
    label: "Data Engineer",
    icon: Database,
    accent: "text-blue-700",
    badge: "bg-blue-50 border-blue-200 text-blue-700",
  },
  data_scientist: {
    label: "Data Scientist",
    icon: Brain,
    accent: "text-purple-700",
    badge: "bg-purple-50 border-purple-200 text-purple-700",
  },
  // Backend uses 'business' not 'business_agent'
  business: {
    label: "Business Analyst",
    icon: Briefcase,
    accent: "text-green-700",
    badge: "bg-green-50 border-green-200 text-green-700",
  },
  business_agent: {
    label: "Business Analyst",
    icon: Briefcase,
    accent: "text-green-700",
    badge: "bg-green-50 border-green-200 text-green-700",
  },
  // Add missing agent types from backend
  project_manager: {
    label: "Project Manager",
    icon: Users,
    accent: "text-indigo-700",
    badge: "bg-indigo-50 border-indigo-200 text-indigo-700",
  },
  technical_ai: {
    label: "Technical Architect",
    icon: Brain,
    accent: "text-orange-700",
    badge: "bg-orange-50 border-orange-200 text-orange-700",
  },
};

function safeParseCoordination(payload: unknown): MultiAgentCoordinationResult | null {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as MultiAgentCoordinationResult;
    } catch {
      return null;
    }
  }

  if (typeof payload === "object") {
    return payload as MultiAgentCoordinationResult;
  }

  return null;
}

function formatConfidence(value?: number) {
  if (typeof value !== "number") {
    return null;
  }
  const percentage = Math.round(value * 100);
  return `${percentage}% confidence`;
}

function extractPrimaryHighlight(opinion: ExpertOpinion) {
  const data = (opinion.opinion ?? {}) as Record<string, any>;

  if (opinion.agentId === "data_engineer") {
    const quality = typeof data.overallScore === "number" ? data.overallScore : data.qualityScore;
    if (typeof quality === "number") {
      return `${Math.round(quality * 100)}% data readiness`;
    }
  }

  if (opinion.agentId === "data_scientist") {
    if (typeof data.feasible === "boolean") {
      return data.feasible ? "Feasible analysis plan" : "Requires adjustments";
    }
    if (Array.isArray(data.requiredAnalyses) && data.requiredAnalyses.length) {
      return `Focus: ${data.requiredAnalyses[0]}`;
    }
  }

  if (opinion.agentId === "business_agent") {
    if (typeof data.businessValue === "string") {
      return `Business value: ${data.businessValue}`;
    }
    if (data.alignment) {
      const { goals } = data.alignment as { goals?: number };
      if (typeof goals === "number") {
        return `Goal alignment ${Math.round(goals * 100)}%`;
      }
    }
  }

  return null;
}

function extractSupportingInsight(opinion: ExpertOpinion) {
  const data = (opinion.opinion ?? {}) as Record<string, any>;

  const recommendations = Array.isArray(data.recommendations)
    ? (data.recommendations as string[])
    : [];

  if (recommendations.length > 0) {
    return recommendations[0];
  }

  if (Array.isArray(data.issues) && data.issues.length) {
    const issue = data.issues[0] as { type?: string } | undefined;
    if (issue && typeof issue === "object" && "type" in issue) {
      return `Top issue: ${issue.type ?? "Review data"}`;
    }
  }

  if (Array.isArray(data.concerns) && data.concerns.length) {
    return `Concern: ${data.concerns[0]}`;
  }

  if (typeof data.summary === "string") {
    return data.summary;
  }

  return null;
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString();
}

/**
 * Build coordination data from plan agentContributions stored in journeyProgress.
 * This provides real agent activity data when multiAgentCoordination hasn't been set yet.
 */
function buildCoordinationFromContributions(contributions: Record<string, any>): MultiAgentCoordinationResult {
  const opinions = Object.entries(contributions).map(([agentId, data]: [string, any]) => ({
    agentId,
    agentName: agentDescriptors[agentId]?.label || agentId,
    opinion: { summary: data.contribution || data.summary },
    confidence: data.confidence,
    timestamp: data.completedAt,
  }));

  // P1-24 FIX: Derive overall assessment from actual agent confidence levels instead of hardcoding
  const avgConfidence = opinions.length > 0
    ? opinions.reduce((sum, o) => sum + (o.confidence || 0), 0) / opinions.length
    : 0;
  const overallAssessment: 'proceed' | 'proceed_with_caution' | 'revise_approach' =
    avgConfidence >= 70 ? 'proceed' :
    avgConfidence >= 40 ? 'proceed_with_caution' :
    'revise_approach';

  return {
    expertOpinions: opinions,
    synthesis: {
      overallAssessment,
      confidence: avgConfidence,
      keyFindings: Object.values(contributions)
        .map((c: any) => c.contribution)
        .filter(Boolean) as string[],
    },
  };
}

export default function AgentActivityOverview({ project, journeyState, onNavigateToInsights }: AgentActivityOverviewProps) {
  const coordination = useMemo(() => {
    // Primary: multiAgentCoordination from project record
    const primary = safeParseCoordination((project as Record<string, unknown>).multiAgentCoordination);
    if (primary?.expertOpinions?.length) return primary;

    // Fallback: Build from plan agentContributions saved to journeyProgress
    const jp = (project as any)?.journeyProgress;
    const planContributions = jp?.latestPlanAgentContributions;
    if (planContributions && typeof planContributions === 'object' && Object.keys(planContributions).length > 0) {
      return buildCoordinationFromContributions(planContributions);
    }

    return primary;
  }, [project.multiAgentCoordination, (project as any)?.journeyProgress]);

  const overallAssessment = coordination?.synthesis?.overallAssessment;
  const assessmentInfo = overallAssessment ? assessmentDisplay[overallAssessment] : undefined;
  const overallConfidence = formatConfidence(coordination?.synthesis?.confidence);

  const keyFindings = coordination?.synthesis?.keyFindings ?? [];
  const actionableRecommendations = coordination?.synthesis?.actionableRecommendations ?? [];

  const expertOpinions = coordination?.expertOpinions ?? [];

  const currentStepName = journeyState?.currentStep?.name ?? "Intake";
  const nextRecommendation = actionableRecommendations[0];
  const estimatedTimeline = coordination?.synthesis?.estimatedTimeline ?? journeyState?.estimatedTimeRemaining;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Fast-track to Insights {project?.name ? `for ${project.name}` : ''}
          </CardTitle>
          <CardDescription>
            Stay aligned with what the agent team has already prepared so you can jump into insight review sooner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current focus</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{currentStepName}</p>
              {estimatedTimeline && (journeyState as any)?.status !== 'completed' && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  ~{estimatedTimeline} remaining
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Agent readiness</p>
              {assessmentInfo ? (
                <div className={`mt-1 inline-flex items-center gap-2 border px-2 py-1 rounded-full text-xs ${assessmentInfo.badgeClass}`}>
                  <assessmentInfo.icon className="w-3 h-3" />
                  <span>{assessmentInfo.title}</span>
                </div>
              ) : (
                <p className="text-sm text-gray-600 mt-1">Coordinating first recommendations…</p>
              )}
              {overallConfidence && (
                <p className="text-xs text-gray-500 mt-1">{overallConfidence}</p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Next best action</p>
              {nextRecommendation ? (
                <p className="text-sm font-semibold text-gray-900 mt-1 flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 mt-1" />
                  {nextRecommendation}
                </p>
              ) : (
                <p className="text-sm text-gray-600 mt-1">Review AI insights to confirm direction.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onNavigateToInsights}>
              Review AI Insights
            </Button>
            {journeyState?.canResume && (
              <Button variant="outline" onClick={onNavigateToInsights}>
                Skip ahead to insights
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Agent Team Status
          </CardTitle>
          <CardDescription>
            Each agent keeps you unblocked in their specialty so you do not have to wait on manual reviews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expertOpinions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">
              Agents publish their first update as soon as the initial coordination run finishes. Kick off analysis or refresh in a moment.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {expertOpinions.map((opinion) => {
                const descriptor = agentDescriptors[opinion.agentId] ?? {
                  label: opinion.agentName ?? "Agent",
                  icon: Users,
                  accent: "text-gray-700",
                  badge: "bg-gray-50 border-gray-200 text-gray-700",
                };
                const Icon = descriptor.icon;
                const headline = extractPrimaryHighlight(opinion);
                const supporting = extractSupportingInsight(opinion);
                const confidenceLabel = formatConfidence(opinion.confidence);
                const lastUpdated = formatTimestamp(opinion.timestamp);

                return (
                  <div key={`${opinion.agentId}-${opinion.timestamp ?? "latest"}`} className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg bg-white border ${descriptor.badge}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${descriptor.accent}`}>{descriptor.label}</p>
                          {confidenceLabel && <p className="text-xs text-gray-500">{confidenceLabel}</p>}
                        </div>
                      </div>
                      {headline && (
                        <Badge variant="outline" className="text-xs">
                          {headline}
                        </Badge>
                      )}
                    </div>

                    {supporting && (
                      <p className="mt-3 text-sm text-gray-700">{supporting}</p>
                    )}

                    {lastUpdated && (
                      <p className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        Updated {lastUpdated}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Key Findings & Next Steps
          </CardTitle>
          <CardDescription>
            Pinpoint why the agents chose their recommendation so you can review insights without retracing earlier steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {keyFindings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key findings</p>
              <ul className="space-y-2 text-sm text-gray-700">
                {keyFindings.slice(0, 4).map((finding, index) => (
                  <li key={index} className="flex gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {actionableRecommendations.length > 0 && (
            <div>
              <Separator className="my-4" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Actionable recommendations</p>
              <ul className="space-y-2 text-sm text-gray-700">
                {actionableRecommendations.slice(0, 4).map((rec, index) => (
                  <li key={index} className="flex gap-2">
                    <ArrowRight className="w-4 h-4 text-blue-600 mt-0.5" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {keyFindings.length === 0 && actionableRecommendations.length === 0 && (
            <p className="text-sm text-gray-600">
              Once the first coordination pass finishes, you will see a distilled set of findings and actions here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
