import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Database,
  BarChart3,
  Brain,
  Download,
  Eye,
  Clock,
  CheckCircle,
  ArrowRight,
  Layers,
  Zap,
  TrendingUp,
  FileSearch,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface ProjectArtifactTimelineProps {
  projectId: string;
  onViewArtifact?: (artifact: any) => void;
  onExportArtifact?: (artifact: any) => void;
}

const ARTIFACT_TYPE_ICONS = {
  transformation: Layers,
  analysis: BarChart3,
  visualization: TrendingUp,
  ai_insight: Brain,
  report: FileText,
  export: Download,
  ingestion: Database,
  schema: FileSearch,
} as const;

const ARTIFACT_TYPE_COLORS = {
  transformation: "bg-blue-100 text-blue-800",
  analysis: "bg-green-100 text-green-800",
  visualization: "bg-purple-100 text-purple-800",
  ai_insight: "bg-orange-100 text-orange-800",
  report: "bg-red-100 text-red-800",
  export: "bg-gray-100 text-gray-800",
  ingestion: "bg-cyan-100 text-cyan-800",
  schema: "bg-indigo-100 text-indigo-800",
} as const;

const ARTIFACT_TYPE_NAMES = {
  transformation: "Data Transformation",
  analysis: "Statistical Analysis",
  visualization: "Data Visualization",
  ai_insight: "AI Insights",
  report: "Report",
  export: "Export",
  ingestion: "Data Ingestion",
  schema: "Schema Analysis",
} as const;

type ArtifactPreview = string | Record<string, unknown> | unknown[] | null;

type NormalizedArtifact = {
  id: string;
  type: string;
  createdAt: string;
  parentArtifactId?: string | null;
  displayName: string;
  displayDescription: string | null;
  previewContent: ArtifactPreview;
  status?: string;
  name?: string;
  children?: NormalizedArtifact[];
  [key: string]: any;
};

type NormalizedProjectDataset = {
  id?: string;
  name: string;
  role?: string;
  sourceType?: string;
  recordCount?: number | null;
};

export function ProjectArtifactTimeline({
  projectId,
  onViewArtifact,
  onExportArtifact,
}: ProjectArtifactTimelineProps) {
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(new Set());

  const {
    data: artifacts = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["/api/projects", projectId, "artifacts"],
    queryFn: async () => {
      if (!projectId) {
        return [];
      }
      try {
        const result = await apiClient.getProjectArtifacts(projectId);
        if (Array.isArray(result?.data)) {
          return result.data;
        }
        return Array.isArray(result) ? result : result?.artifacts ?? [];
      } catch (fetchError) {
        console.error("Failed to fetch project artifacts:", fetchError);
        return [];
      }
    },
    enabled: !!projectId,
  });

  const { data: projectDatasets = [] } = useQuery({
    queryKey: ["/api/projects", projectId, "datasets"],
    queryFn: async () => {
      if (!projectId) {
        return [];
      }
      try {
        const result = await apiClient.getProjectDatasets(projectId);
        if (Array.isArray(result?.data)) {
          return result.data;
        }
        return Array.isArray(result) ? result : result?.datasets ?? [];
      } catch (fetchError) {
        console.error("Failed to fetch project datasets:", fetchError);
        return [];
      }
    },
    enabled: !!projectId,
  });

  const normalizedArtifacts = useMemo<NormalizedArtifact[]>(() => {
    if (!Array.isArray(artifacts)) {
      return [];
    }

    return artifacts.map((artifact: any) => {
      const output = artifact.output || {};
      const formatted = output.formattedResults || null;
      const rawResults = output.rawResults || null;
      const metadata = output.metadata || artifact.metadata || {};
      const params = artifact.params || {};

      const defaultName = typeof params.analysisType === "string"
        ? `${params.analysisType.replace(/_/g, " ")} analysis`
        : (artifact.type || "Artifact").replace(/_/g, " ");

      const displayName = metadata.title || output.analysisType || defaultName;
      const displayDescription = metadata.summary
        || metadata.description
        || formatted?.summary
        || rawResults?.summary
        || null;

      const previewContent = formatted || rawResults || output;

      return {
        ...artifact,
        displayName,
        displayDescription,
        previewContent,
        name: artifact.name ?? displayName,
      };
    });
  }, [artifacts]);

  const normalizedProjectDatasets = useMemo<NormalizedProjectDataset[]>(() => {
    if (!Array.isArray(projectDatasets)) {
      return [];
    }

    return projectDatasets.map((pd: any) => {
      const dataset = pd.dataset ?? pd.datasetDetails ?? pd;
      const association = pd.association ?? pd;
      const datasetId = dataset?.id || association?.datasetId || pd.datasetId;
      const resolvedName =
        association?.alias ||
        dataset?.name ||
        association?.datasetName ||
        dataset?.originalFileName ||
        datasetId ||
        "Dataset";

      return {
        id: datasetId,
        name: resolvedName,
        role: association?.role ?? pd.role,
        sourceType: dataset?.sourceType,
        recordCount: dataset?.recordCount ?? null,
      };
    });
  }, [projectDatasets]);

  const hierarchicalArtifacts = useMemo(() => {
    const map = new Map<string, NormalizedArtifact>();
    const roots: NormalizedArtifact[] = [];

    normalizedArtifacts.forEach((artifact) => {
      map.set(artifact.id, { ...artifact, children: [] });
    });

    normalizedArtifacts.forEach((artifact) => {
      const node = map.get(artifact.id);
      if (!node) {
        return;
      }
      if (artifact.parentArtifactId && map.has(artifact.parentArtifactId)) {
        map.get(artifact.parentArtifactId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [normalizedArtifacts]);

  const toggleArtifactExpansion = (artifactId: string) => {
    setExpandedArtifacts((prev) => {
      const next = new Set(prev);
      if (next.has(artifactId)) {
        next.delete(artifactId);
      } else {
        next.add(artifactId);
      }
      return next;
    });
  };

  const renderArtifactNode = (artifact: NormalizedArtifact, level = 0) => {
    const IconComponent = ARTIFACT_TYPE_ICONS[artifact.type as keyof typeof ARTIFACT_TYPE_ICONS] || FileText;
    const badgeClass = ARTIFACT_TYPE_COLORS[artifact.type as keyof typeof ARTIFACT_TYPE_COLORS] || "bg-muted text-foreground";
    const badgeLabel = ARTIFACT_TYPE_NAMES[artifact.type as keyof typeof ARTIFACT_TYPE_NAMES] || artifact.type;
    const preview = artifact.previewContent;
    const isExpanded = expandedArtifacts.has(artifact.id);
    const hasChildren = Array.isArray(artifact.children) && artifact.children.length > 0;
    const previewJson = preview && typeof preview !== "string" ? JSON.stringify(preview, null, 2) : null;
    const hasPreview = preview !== null && preview !== undefined;

    return (
      <div
        key={artifact.id}
        className={level > 0 ? "ml-6 border-l-2 border-muted pl-4" : ""}
      >
        <Card className="mb-3" data-testid={`card-artifact-${artifact.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="flex flex-col items-center">
                  <div className="p-2 rounded-lg bg-muted">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  {hasChildren && level === 0 && <div className="w-px h-6 bg-muted mt-2" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <h4 className="font-medium" data-testid={`text-artifact-name-${artifact.id}`}>
                      {artifact.displayName || artifact.name || artifact.type}
                    </h4>
                    <Badge
                      variant="outline"
                      className={badgeClass}
                      data-testid={`badge-artifact-type-${artifact.id}`}
                    >
                      {badgeLabel}
                    </Badge>
                  </div>

                  {artifact.displayDescription && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {artifact.displayDescription}
                    </p>
                  )}

                  <div className="flex items-center space-x-4 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDistanceToNow(new Date(artifact.createdAt), { addSuffix: true })}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>{artifact.status ? artifact.status : "Completed"}</span>
                    </span>
                  </div>

                  {isExpanded && hasPreview && (
                    <div className="mt-3 p-3 bg-muted rounded-lg">
                      <h5 className="text-sm font-medium mb-2">Content Preview:</h5>
                      <div className="text-sm text-muted-foreground">
                        {typeof preview === "string" ? (
                          <p className="whitespace-pre-wrap line-clamp-3">{preview}</p>
                        ) : (
                          <pre className="text-xs overflow-x-auto">
                            {previewJson?.slice(0, 200)}
                            {previewJson && previewJson.length > 200 && "..."}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {hasPreview && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleArtifactExpansion(artifact.id)}
                    data-testid={`button-expand-${artifact.id}`}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
                {onViewArtifact && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onViewArtifact({ ...artifact })}
                    data-testid={`button-view-${artifact.id}`}
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                )}
                {onExportArtifact && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onExportArtifact({ ...artifact })}
                    data-testid={`button-export-${artifact.id}`}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {hasChildren && (
          <div className="space-y-0">
            {artifact.children!.map((child) => renderArtifactNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <Alert>
        <AlertDescription>
          Failed to load project artifacts. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6" data-testid="project-artifact-timeline">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Project Timeline</h3>
          <p className="text-sm text-muted-foreground">
            Track your analysis workflow from data ingestion to final results
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          data-testid="button-refresh-timeline"
        >
          <Zap className="w-4 h-4 icon-gap" />
          Refresh
        </Button>
      </div>

      {normalizedProjectDatasets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connected Datasets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {normalizedProjectDatasets.map((pd) => (
                <Badge
                  key={pd.id || pd.name}
                  variant="secondary"
                  data-testid={`badge-dataset-${pd.id ?? pd.name}`}
                >
                  <Database className="w-3 h-3 icon-gap" />
                  {pd.name || pd.id || "Dataset"}
                  {pd.role && ` (${pd.role})`}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-0">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="text-sm text-muted-foreground mt-2">Loading project timeline...</p>
          </div>
        ) : hierarchicalArtifacts.length === 0 ? (
          <div className="text-center py-8">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              No analysis artifacts yet. Start by adding datasets to your project.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-0">
              {hierarchicalArtifacts.map((artifact) => renderArtifactNode(artifact))}
            </div>
          </ScrollArea>
        )}
      </div>

      {normalizedArtifacts.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <ArrowRight className="w-4 h-4" />
              <span>
                Your analysis workflow is progressing. Continue with transformations, analysis, or visualizations.
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
