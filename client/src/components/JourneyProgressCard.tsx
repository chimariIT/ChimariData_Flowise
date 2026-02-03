import type { MouseEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useJourneyState } from "@/hooks/useJourneyState";
import { Loader2, Navigation, TimerReset, PanelsTopLeft, PlayCircle } from "lucide-react";
import { useLocation } from "wouter";
import clsx from "clsx";

interface JourneyProgressCardProps {
  project: any;
  onSelect?: (projectId: string) => void;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return "—";
  }

  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || Number.isNaN(numeric)) {
    return "—";
  }

  return currencyFormatter.format(numeric);
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "Not yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not yet";
  }
  return date.toLocaleString();
};

export function JourneyProgressCard({ project, onSelect }: JourneyProgressCardProps) {
  const { id, name, status, journeyType, analysisExecutedAt, analysisBilledAt } = project;
  const { data, isLoading } = useJourneyState(id);
  const [, setLocation] = useLocation();

  const percentComplete = data?.percentComplete ?? 0;
  const currentStepName = data?.currentStep?.name ?? "Initializing";
  const lockedCost = data?.costs?.estimated ?? (project.lockedCostEstimate ? Number(project.lockedCostEstimate) : undefined);
  const spentCost = data?.costs?.spent ?? (project.totalCostIncurred ? Number(project.totalCostIncurred) : undefined);

  const handleSelect = () => {
    if (onSelect) {
      onSelect(id);
      return;
    }
    setLocation(`/projects/${id}`);
  };

  const goToDashboards = (event: MouseEvent) => {
    event.stopPropagation();
    setLocation(`/projects/${id}/dashboard`);
  };

  const goToProject = (event: MouseEvent) => {
    event.stopPropagation();
    handleSelect();
  };

  return (
    <Card
      onClick={handleSelect}
      className={clsx(
        "cursor-pointer border transition hover:border-primary/40 hover:shadow-sm",
        isLoading && "pointer-events-none opacity-80"
      )}
      data-testid="journey-progress-card"
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{journeyType ? journeyType.replace(/_/g, " ") : "journey"}</p>
            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
          </div>
          <Badge variant="secondary" className="capitalize">
            {status?.replace(/_/g, " ") || "active"}
          </Badge>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Progress</span>
            <span>{percentComplete}%</span>
          </div>
          <Progress value={percentComplete} className="mt-2 h-2" />
          <div className="mt-2 flex items-center space-x-2 text-xs text-muted-foreground">
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading journey state…</span>
              </>
            ) : (
              <>
                <Navigation className="h-3 w-3" />
                <span>Current step: {currentStepName}</span>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Locked estimate</p>
            <p className="text-sm font-semibold text-foreground" data-testid="card-locked-cost">
              {formatCurrency(lockedCost ?? null)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Spent so far</p>
            <p className="text-sm font-semibold text-foreground" data-testid="card-spent-cost">
              {formatCurrency(spentCost ?? null)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center space-x-1">
            <TimerReset className="h-3 w-3" />
            <span>Executed: {formatDate(analysisExecutedAt)}</span>
          </span>
          <span className="inline-flex items-center space-x-1">
            <TimerReset className="h-3 w-3" />
            <span>Billed: {formatDate(analysisBilledAt)}</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={goToProject} className="gap-2">
            <PlayCircle className="h-4 w-4" />
            View project
          </Button>
          <Button size="sm" onClick={goToDashboards} className="gap-2">
            <PanelsTopLeft className="h-4 w-4" />
            Dashboards
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
