import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useJourneyState } from "@/hooks/useJourneyState";
import { getResumeRoute } from "@/utils/journey-routing";
import { useLocation } from "wouter";
import { AlertCircle, RefreshCw, CheckCircle2, Circle, Loader2, PlayCircle } from "lucide-react";
import clsx from "clsx";

interface JourneyLifecycleIndicatorProps {
  projectId: string;
  className?: string;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const formatCurrency = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return currencyFormatter.format(value);
};

const formatStepStatus = (stepId: string, completedSteps: string[], currentStepId: string) => {
  if (completedSteps.includes(stepId)) {
    return "completed" as const;
  }
  if (stepId === currentStepId) {
    return "current" as const;
  }
  return "pending" as const;
};

export function JourneyLifecycleIndicator({ projectId, className }: JourneyLifecycleIndicatorProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useJourneyState(projectId);
  const [, setLocation] = useLocation();

  // Force refetch on mount to get latest time calculations
  useEffect(() => {
    if (projectId && !isLoading) {
      refetch();
    }
  }, [projectId]); // Only refetch when projectId changes

  const handleResumeJourney = async () => {
    if (!data) return;
    try {
      const route = await getResumeRoute(projectId, data);
      setLocation(route);
    } catch (error) {
      console.error('Failed to resume journey:', error);
    }
  };

  if (isLoading || (!data && isFetching)) {
    return (
      <Card className={clsx("shadow-sm", className)}>
        <CardHeader>
          <CardTitle>Journey Lifecycle</CardTitle>
          <CardDescription>Tracking analytics journey progress…</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading journey state</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className={clsx("shadow-sm border-destructive/30", className)}>
        <CardHeader>
          <CardTitle>Journey Lifecycle</CardTitle>
          <CardDescription>We could not load the journey state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start space-x-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">Unable to fetch progress</p>
              {error instanceof Error ? <p>{error.message}</p> : null}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { currentStep, steps, completedSteps, percentComplete, estimatedTimeRemaining, costs, canResume } = data;
  const nextStep = steps[currentStep.index + 1];

  return (
    <Card className={clsx("shadow-sm", className)} data-testid="journey-lifecycle">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Journey Lifecycle</span>
          <div className="flex items-center gap-2">
            {canResume ? (
              <>
                <Badge variant="outline">Resumable</Badge>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleResumeJourney}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Resume Journey
                </Button>
              </>
            ) : (
              <Badge variant="secondary">Up to date</Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          {currentStep ? `Currently on "${currentStep.name}"` : "Journey progress is ready"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Overall Progress</span>
            <span>{percentComplete}%</span>
          </div>
          <Progress value={percentComplete} className="mt-2 h-2" />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Next step: {nextStep ? nextStep.name : "All steps complete"}
            </span>
            <span>{estimatedTimeRemaining ? `~${estimatedTimeRemaining} remaining` : "Timing ready"}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Locked estimate</p>
            <p className="text-lg font-semibold" data-testid="journey-cost-locked">
              {formatCurrency(costs?.estimated ?? null)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Spent so far</p>
            <p className="text-lg font-semibold" data-testid="journey-cost-spent">
              {formatCurrency(costs?.spent ?? null)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="text-lg font-semibold" data-testid="journey-cost-remaining">
              {formatCurrency(costs?.remaining ?? null)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Lifecycle Steps</p>
          <ul className="space-y-2">
            {steps.map((step) => {
              const status = formatStepStatus(step.id, completedSteps, currentStep.id);
              return (
                <li
                  key={step.id}
                  className={clsx(
                    "flex items-center justify-between rounded-md border p-3 text-sm",
                    status === "completed" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    status === "current" && "border-blue-200 bg-blue-50 text-blue-700",
                    status === "pending" && "border-border bg-background text-muted-foreground"
                  )}
                >
                  <div className="flex items-center space-x-2">
                    {status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : status === "current" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{step.name}</p>
                      {step.description ? (
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {step.agent.replace(/_/g, " ")}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
