import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileSearch
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface ProjectArtifactTimelineProps {
  projectId: string;
  onViewArtifact?: (artifact: any) => void;
  onExportArtifact?: (artifact: any) => void;
}

const ARTIFACT_TYPE_ICONS = {
  'transformation': Layers,
  'analysis': BarChart3,
  'visualization': TrendingUp,
  'ai_insight': Brain,
  'report': FileText,
  'export': Download,
  'ingestion': Database,
  'schema': FileSearch
};

const ARTIFACT_TYPE_COLORS = {
  'transformation': 'bg-blue-100 text-blue-800',
  'analysis': 'bg-green-100 text-green-800',
  'visualization': 'bg-purple-100 text-purple-800',
  'ai_insight': 'bg-orange-100 text-orange-800',
  'report': 'bg-red-100 text-red-800',
  'export': 'bg-gray-100 text-gray-800',
  'ingestion': 'bg-cyan-100 text-cyan-800',
  'schema': 'bg-indigo-100 text-indigo-800'
};

const ARTIFACT_TYPE_NAMES = {
  'transformation': 'Data Transformation',
  'analysis': 'Statistical Analysis',
  'visualization': 'Data Visualization',
  'ai_insight': 'AI Insights',
  'report': 'Report',
  'export': 'Export',
  'ingestion': 'Data Ingestion',
  'schema': 'Schema Analysis'
};

export function ProjectArtifactTimeline({ 
  projectId, 
  onViewArtifact, 
  onExportArtifact 
}: ProjectArtifactTimelineProps) {
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(new Set());

  // Fetch project artifacts
  const { data: artifacts = [], isLoading, error, refetch } = useQuery({
    queryKey: ['/api/projects', projectId, 'artifacts'],
    enabled: !!projectId
  });

  // Fetch project datasets for context
  const { data: projectDatasets = [] } = useQuery({
    queryKey: ['/api/projects', projectId, 'datasets'],
    enabled: !!projectId
  });

  // Type assertions for proper TypeScript support
  const typedArtifacts = artifacts as any[];
  const typedProjectDatasets = projectDatasets as any[];

  const toggleArtifactExpansion = (artifactId: string) => {
    const newExpanded = new Set(expandedArtifacts);
    if (newExpanded.has(artifactId)) {
      newExpanded.delete(artifactId);
    } else {
      newExpanded.add(artifactId);
    }
    setExpandedArtifacts(newExpanded);
  };

  // Build artifact hierarchy (parent-child relationships)
  const buildArtifactHierarchy = (artifacts: any[]) => {
    const artifactMap = new Map();
    const rootArtifacts: any[] = [];
    
    // First pass: create artifact map
    artifacts.forEach(artifact => {
      artifactMap.set(artifact.id, { ...artifact, children: [] });
    });
    
    // Second pass: build hierarchy
    artifacts.forEach(artifact => {
      const artifactNode = artifactMap.get(artifact.id);
      if (artifact.parentArtifactId && artifactMap.has(artifact.parentArtifactId)) {
        const parent = artifactMap.get(artifact.parentArtifactId);
        parent.children.push(artifactNode);
      } else {
        rootArtifacts.push(artifactNode);
      }
    });
    
    return rootArtifacts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  const renderArtifactNode = (artifact: any, level = 0) => {
    const IconComponent = ARTIFACT_TYPE_ICONS[artifact.type as keyof typeof ARTIFACT_TYPE_ICONS] || FileText;
    const isExpanded = expandedArtifacts.has(artifact.id);
    const hasChildren = artifact.children && artifact.children.length > 0;
    
    return (
      <div key={artifact.id} className={`${level > 0 ? 'ml-6 border-l-2 border-muted pl-4' : ''}`}>
        <Card className="mb-3" data-testid={`card-artifact-${artifact.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="flex flex-col items-center">
                  <div className="p-2 rounded-lg bg-muted">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  {hasChildren && level === 0 && (
                    <div className="w-px h-6 bg-muted mt-2"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <h4 className="font-medium" data-testid={`text-artifact-name-${artifact.id}`}>
                      {artifact.name}
                    </h4>
                    <Badge 
                      variant="outline" 
                      className={ARTIFACT_TYPE_COLORS[artifact.type as keyof typeof ARTIFACT_TYPE_COLORS]}
                      data-testid={`badge-artifact-type-${artifact.id}`}
                    >
                      {ARTIFACT_TYPE_NAMES[artifact.type as keyof typeof ARTIFACT_TYPE_NAMES] || artifact.type}
                    </Badge>
                  </div>
                  
                  {artifact.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {artifact.description}
                    </p>
                  )}
                  
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>
                        {formatDistanceToNow(new Date(artifact.createdAt), { addSuffix: true })}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>Completed</span>
                    </span>
                  </div>
                  
                  {/* Content preview */}
                  {isExpanded && artifact.content && (
                    <div className="mt-3 p-3 bg-muted rounded-lg">
                      <h5 className="text-sm font-medium mb-2">Content Preview:</h5>
                      <div className="text-sm text-muted-foreground">
                        {typeof artifact.content === 'string' ? (
                          <p className="whitespace-pre-wrap line-clamp-3">{artifact.content}</p>
                        ) : (
                          <pre className="text-xs overflow-x-auto">
                            {JSON.stringify(artifact.content, null, 2).slice(0, 200)}
                            {JSON.stringify(artifact.content, null, 2).length > 200 && '...'}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center space-x-2">
                {artifact.content && (
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
                    onClick={() => onViewArtifact(artifact)}
                    data-testid={`button-view-${artifact.id}`}
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                )}
                {onExportArtifact && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onExportArtifact(artifact)}
                    data-testid={`button-export-${artifact.id}`}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Render children */}
        {hasChildren && (
          <div className="space-y-0">
            {artifact.children.map((child: any) => renderArtifactNode(child, level + 1))}
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

  const hierarchicalArtifacts = buildArtifactHierarchy(typedArtifacts);

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <Zap className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Project Datasets Context */}
      {typedProjectDatasets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connected Datasets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {typedProjectDatasets.map((pd: any) => (
                <Badge key={pd.datasetId} variant="secondary" data-testid={`badge-dataset-${pd.datasetId}`}>
                  <Database className="w-3 h-3 mr-1" />
                  {pd.dataset?.name || pd.datasetId}
                  {pd.role && ` (${pd.role})`}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Artifact Timeline */}
      <div className="space-y-0">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
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
              {hierarchicalArtifacts.map(artifact => renderArtifactNode(artifact))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Workflow Guidance */}
      {typedArtifacts.length > 0 && (
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