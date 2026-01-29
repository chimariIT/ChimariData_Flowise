import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useProject } from "@/hooks/useProject";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Search,
    Database,
    Brain,
    Activity,
    Clock,
    Server,
    FileJson,
    Eye,
    History,
    Link,
    Settings,
    Bot,
    RefreshCw,
    RotateCcw,
    Beaker,
    AlertTriangle,
    CheckCircle2,
    User,
    Zap
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DecisionAudit {
    id: string;
    projectId: string;
    agent: string;
    decisionType: string;
    decision: string;
    reasoning: string;
    confidence: number;
    impact: 'low' | 'medium' | 'high';
    timestamp: string;
    context?: Record<string, any>;
}

interface ActiveAgent {
    id: string;
    name: string;
    type: string;
    status: string;
    currentTasks: number;
    maxConcurrentTasks: number;
    health: any;
    lastActivity: string;
    averageResponseTime: number;
}

// FIX: Check if running in production to warn users about dangerous operations
const isProduction = import.meta.env.MODE === 'production' || import.meta.env.PROD;

export default function ProjectStateInspector() {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("json-viewer");
    const [targetPhase, setTargetPhase] = useState("prepare");
    const [clearData, setClearData] = useState(false);
    // FIX: Add confirmation dialog state for dangerous operations
    // showMergeTestConfirm removed - atomic merge test disabled for production safety
    const queryClient = useQueryClient();

    // Fetch all projects for selection
    const { data: projectsData, isLoading: projectsLoading } = useQuery({
        queryKey: ['/api/projects/admin-list'],
        queryFn: async () => {
            const response = await apiClient.get('/api/projects');
            return response.projects || [];
        }
    });

    // Fetch specific project state
    const { project, journeyProgress, isLoading: projectLoading } = useProject(selectedProjectId || undefined);

    // Helper to refresh project data
    const refetchProject = () => {
        queryClient.invalidateQueries({ queryKey: ["project", selectedProjectId] });
    };

    // Fetch decision trail for selected project
    const { data: decisionTrailData, isLoading: decisionsLoading, refetch: refetchDecisions } = useQuery({
        queryKey: ['admin', 'decision-trail', selectedProjectId],
        queryFn: async () => {
            if (!selectedProjectId) return { decisions: [] };
            return apiClient.get(`/api/admin/projects/${selectedProjectId}/decision-trail`);
        },
        enabled: !!selectedProjectId && activeTab === 'audit-log'
    });

    // Fetch active agents
    const { data: activeAgentsData, isLoading: agentsLoading, refetch: refetchAgents } = useQuery({
        queryKey: ['admin', 'agents', 'active'],
        queryFn: () => apiClient.get('/api/admin/agents/active'),
        enabled: activeTab === 'active-agents',
        refetchInterval: activeTab === 'active-agents' ? 5000 : false
    });

    // Force sync mutation
    const forceSyncMutation = useMutation({
        mutationFn: async (projectId: string) => {
            return apiClient.post(`/api/admin/projects/${projectId}/force-sync`);
        },
        onSuccess: () => {
            refetchProject();
            refetchDecisions();
        }
    });

    // Reset phase mutation
    const resetPhaseMutation = useMutation({
        mutationFn: async ({ projectId, targetPhase, clearData }: { projectId: string; targetPhase: string; clearData: boolean }) => {
            return apiClient.post(`/api/admin/projects/${projectId}/reset-phase`, { targetPhase, clearData });
        },
        onSuccess: () => {
            refetchProject();
            refetchDecisions();
        }
    });

    // Atomic merge test mutation removed - endpoint disabled for production safety

    const filteredProjects = projectsData?.filter((p: any) =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.id?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    // Extract semantic references from journeyProgress
    const semanticReferences = (journeyProgress as any)?.requirementsDocument?.semanticReferences || {};
    const dataElementIds = semanticReferences.dataElementIds || [];
    const transformationIds = semanticReferences.transformationIds || [];
    const questionElementLinkIds = semanticReferences.questionElementLinkIds || [];

    const getImpactColor = (impact: string) => {
        switch (impact) {
            case 'high': return 'bg-red-100 text-red-800 border-red-200';
            case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'low': return 'bg-green-100 text-green-800 border-green-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getAgentIcon = (agent: string) => {
        switch (agent.toLowerCase()) {
            case 'project manager': return <Brain className="w-4 h-4" />;
            case 'data scientist': return <Beaker className="w-4 h-4" />;
            case 'data engineer': return <Database className="w-4 h-4" />;
            case 'user': return <User className="w-4 h-4" />;
            case 'admin': return <Settings className="w-4 h-4" />;
            default: return <Bot className="w-4 h-4" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6">
                {/* Project Selector sidebar */}
                <Card className="w-full md:w-1/3">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Database className="w-5 h-5 text-indigo-600" />
                            Project Explorer
                        </CardTitle>
                        <CardDescription>Select a project to inspect its SSOT state</CardDescription>
                        <div className="relative mt-2">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search projects by name or ID..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[600px] border-t">
                            <div className="p-1">
                                {projectsLoading ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">Loading projects...</div>
                                ) : filteredProjects.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">No projects found</div>
                                ) : (
                                    filteredProjects.map((p: any) => (
                                        <button
                                            key={p.id}
                                            className={`w-full text-left p-3 rounded-md transition-colors hover:bg-slate-100 ${selectedProjectId === p.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                                }`}
                                            onClick={() => setSelectedProjectId(p.id)}
                                        >
                                            <div className="font-medium text-sm truncate">{p.name || 'Unnamed Project'}</div>
                                            <div className="text-xs text-muted-foreground font-mono truncate">{p.id}</div>
                                            <div className="flex gap-2 mt-1">
                                                <Badge variant="outline" className="text-[10px] py-0">{p.status || 'unknown'}</Badge>
                                                <Badge variant="secondary" className="text-[10px] py-0">{p.journeyType || 'none'}</Badge>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* State Inspector main view with tabs */}
                <Card className="flex-1 overflow-hidden flex flex-col min-h-[700px]">
                    <CardHeader className="border-b bg-slate-50">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-indigo-600" />
                                    Technical State Viewer (DEC-010)
                                </CardTitle>
                                <CardDescription>
                                    {selectedProjectId ? `Inspecting: ${project?.name || selectedProjectId}` : 'Select a project to begin inspection'}
                                </CardDescription>
                            </div>
                            {selectedProjectId && (
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => refetchProject()}>
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        Refresh
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => window.open(`/project/${selectedProjectId}`, '_blank')}>
                                        Open in Portal
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardHeader>

                    {selectedProjectId ? (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                            <TabsList className="mx-4 mt-4 grid grid-cols-5">
                                <TabsTrigger value="json-viewer" className="flex items-center gap-1">
                                    <FileJson className="w-4 h-4" />
                                    JSON
                                </TabsTrigger>
                                <TabsTrigger value="audit-log" className="flex items-center gap-1">
                                    <History className="w-4 h-4" />
                                    Audit Log
                                </TabsTrigger>
                                <TabsTrigger value="pipeline-insights" className="flex items-center gap-1">
                                    <Link className="w-4 h-4" />
                                    Pipeline
                                </TabsTrigger>
                                <TabsTrigger value="admin-controls" className="flex items-center gap-1">
                                    <Settings className="w-4 h-4" />
                                    Controls
                                </TabsTrigger>
                                <TabsTrigger value="active-agents" className="flex items-center gap-1">
                                    <Bot className="w-4 h-4" />
                                    Agents
                                </TabsTrigger>
                            </TabsList>

                            {/* JSON Viewer Tab */}
                            <TabsContent value="json-viewer" className="flex-1 overflow-hidden flex flex-col m-0">
                                {projectLoading ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-12">
                                        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
                                        <p className="text-muted-foreground">Hydrating SSOT data...</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-hidden flex flex-col">
                                        {/* Highlights */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border-b bg-white">
                                            <Card className="p-3 bg-blue-50 border-blue-100 shadow-none">
                                                <div className="text-xs text-blue-600 font-bold mb-1 flex items-center gap-1 uppercase tracking-tighter">
                                                    <Brain className="w-3 h-3" /> Questions
                                                </div>
                                                <div className="text-lg font-mono font-bold">{(journeyProgress as any)?.userQuestions?.length || 0}</div>
                                            </Card>
                                            <Card className="p-3 bg-green-50 border-green-100 shadow-none">
                                                <div className="text-xs text-green-600 font-bold mb-1 flex items-center gap-1 uppercase tracking-tighter">
                                                    <Clock className="w-3 h-3" /> Checkpoints
                                                </div>
                                                <div className="text-lg font-mono font-bold">{(journeyProgress as any)?.checkpointHistory?.length || 0}</div>
                                            </Card>
                                            <Card className="p-3 bg-purple-50 border-purple-100 shadow-none">
                                                <div className="text-xs text-purple-600 font-bold mb-1 flex items-center gap-1 uppercase tracking-tighter">
                                                    <Server className="w-3 h-3" /> Dataset IDs
                                                </div>
                                                <div className="text-lg font-mono font-bold">{(journeyProgress as any)?.uploadedDatasetIds?.length || 0}</div>
                                            </Card>
                                            <Card className="p-3 bg-amber-50 border-amber-100 shadow-none">
                                                <div className="text-xs text-amber-600 font-bold mb-1 flex items-center gap-1 uppercase tracking-tighter">
                                                    <FileJson className="w-3 h-3" /> Schema v
                                                </div>
                                                <div className="text-lg font-mono font-bold">{(journeyProgress as any)?.version || 1}</div>
                                            </Card>
                                        </div>

                                        {/* RAW JSON View */}
                                        <ScrollArea className="flex-1 bg-slate-900 border-t border-slate-800">
                                            <div className="p-6 space-y-6 pb-20">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-indigo-400 font-bold uppercase tracking-widest text-[11px] flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                                                            journeyProgress (The Single Source of Truth)
                                                        </h3>
                                                        <Badge variant="outline" className="text-slate-400 border-slate-700 font-mono text-[10px]">JSONB</Badge>
                                                    </div>
                                                    <div className="relative group">
                                                        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-xs overflow-x-auto selection:bg-indigo-500/30">
                                                            {JSON.stringify(journeyProgress || {}, null, 2)}
                                                        </pre>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">project metadata</h3>
                                                        <Badge variant="outline" className="text-slate-500 border-slate-800 font-mono text-[10px]">SQL_TABLE</Badge>
                                                    </div>
                                                    <pre className="p-4 bg-slate-950/50 border border-slate-800/50 rounded-lg text-slate-400 font-mono text-xs overflow-x-auto">
                                                        {JSON.stringify({
                                                            id: project?.id,
                                                            name: project?.name,
                                                            status: project?.status,
                                                            journeyType: project?.journeyType,
                                                            createdAt: project?.createdAt,
                                                            lastModified: project?.lastModified,
                                                            userId: project?.userId
                                                        }, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        </ScrollArea>
                                    </div>
                                )}
                            </TabsContent>

                            {/* Audit Log Tab */}
                            <TabsContent value="audit-log" className="flex-1 overflow-hidden m-0">
                                <ScrollArea className="h-[550px]">
                                    <div className="p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <History className="w-5 h-5 text-indigo-600" />
                                                Decision Audit Trail
                                            </h3>
                                            <Button variant="outline" size="sm" onClick={() => refetchDecisions()}>
                                                <RefreshCw className="w-4 h-4 mr-1" />
                                                Refresh
                                            </Button>
                                        </div>

                                        {decisionsLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                                            </div>
                                        ) : !decisionTrailData?.decisions?.length ? (
                                            <Alert>
                                                <AlertDescription>No decision audits recorded for this project yet.</AlertDescription>
                                            </Alert>
                                        ) : (
                                            <div className="space-y-3">
                                                {decisionTrailData.decisions.map((decision: DecisionAudit) => (
                                                    <Card key={decision.id} className="p-4">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {getAgentIcon(decision.agent)}
                                                                <span className="font-medium">{decision.agent}</span>
                                                                <Badge variant="outline" className="text-[10px]">{decision.decisionType}</Badge>
                                                                <Badge className={`text-[10px] ${getImpactColor(decision.impact)}`}>
                                                                    {decision.impact}
                                                                </Badge>
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {new Date(decision.timestamp).toLocaleString()}
                                                            </div>
                                                        </div>
                                                        <div className="mt-2">
                                                            <p className="text-sm font-medium">{decision.decision}</p>
                                                            <p className="text-sm text-muted-foreground mt-1">{decision.reasoning}</p>
                                                        </div>
                                                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                                                            <span>Confidence: {decision.confidence}%</span>
                                                            {decision.context && Object.keys(decision.context).length > 0 && (
                                                                <span>Context: {JSON.stringify(decision.context).slice(0, 50)}...</span>
                                                            )}
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            {/* Pipeline Insights Tab */}
                            <TabsContent value="pipeline-insights" className="flex-1 overflow-hidden m-0">
                                <ScrollArea className="h-[550px]">
                                    <div className="p-4 space-y-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Link className="w-5 h-5 text-indigo-600" />
                                            <h3 className="font-semibold">Semantic Pipeline References (DEC-006)</h3>
                                        </div>

                                        {/* Data Elements */}
                                        <Card className="p-4">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Database className="w-4 h-4 text-blue-600" />
                                                    Data Element IDs
                                                    <Badge variant="secondary" className="ml-auto">{dataElementIds.length}</Badge>
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                {dataElementIds.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {dataElementIds.map((id: string) => (
                                                            <Badge key={id} variant="outline" className="font-mono text-[10px]">{id}</Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">No data elements extracted yet</p>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Transformations */}
                                        <Card className="p-4">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Zap className="w-4 h-4 text-purple-600" />
                                                    Transformation IDs
                                                    <Badge variant="secondary" className="ml-auto">{transformationIds.length}</Badge>
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                {transformationIds.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {transformationIds.map((id: string) => (
                                                            <Badge key={id} variant="outline" className="font-mono text-[10px]">{id}</Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">No transformations inferred yet</p>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Question Element Links */}
                                        <Card className="p-4">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Brain className="w-4 h-4 text-green-600" />
                                                    Question-Element Link IDs
                                                    <Badge variant="secondary" className="ml-auto">{questionElementLinkIds.length}</Badge>
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                {questionElementLinkIds.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {questionElementLinkIds.map((id: string) => (
                                                            <Badge key={id} variant="outline" className="font-mono text-[10px]">{id}</Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">No question-element links created yet</p>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Evidence Chain Status */}
                                        <Card className="p-4 bg-slate-50">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-sm">Evidence Chain Status (DEC-007)</CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                <div className="flex items-center gap-4">
                                                    {dataElementIds.length > 0 && questionElementLinkIds.length > 0 ? (
                                                        <>
                                                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                                                            <span className="text-sm text-green-700">Evidence chain is complete - "How We Answered" traces available</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                                                            <span className="text-sm text-amber-700">Evidence chain incomplete - Run semantic pipeline to populate</span>
                                                        </>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            {/* Admin Controls Tab */}
                            <TabsContent value="admin-controls" className="flex-1 overflow-hidden m-0">
                                <ScrollArea className="h-[550px]">
                                    <div className="p-4 space-y-6">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Settings className="w-5 h-5 text-indigo-600" />
                                            <h3 className="font-semibold">Administrative Controls</h3>
                                        </div>

                                        {/* Force Sync */}
                                        <Card className="p-4">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <RefreshCw className="w-4 h-4 text-blue-600" />
                                                    Force Sync (DEC-002)
                                                </CardTitle>
                                                <CardDescription>
                                                    Trigger lazy migration to consolidate project state from all sources
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="p-0 pt-2">
                                                <Button
                                                    onClick={() => forceSyncMutation.mutate(selectedProjectId!)}
                                                    disabled={forceSyncMutation.isPending}
                                                >
                                                    {forceSyncMutation.isPending ? (
                                                        <>
                                                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                                            Syncing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RefreshCw className="w-4 h-4 mr-2" />
                                                            Force Sync State
                                                        </>
                                                    )}
                                                </Button>
                                                {forceSyncMutation.isSuccess && (
                                                    <Alert className="mt-2">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        <AlertDescription>State synced successfully</AlertDescription>
                                                    </Alert>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Phase Reset */}
                                        <Card className="p-4">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <RotateCcw className="w-4 h-4 text-amber-600" />
                                                    Phase Reset
                                                </CardTitle>
                                                <CardDescription>
                                                    Reset the project to a specific journey phase
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="p-0 pt-2 space-y-4">
                                                <div className="flex gap-4 items-end">
                                                    <div className="flex-1">
                                                        <Label className="text-xs">Target Phase</Label>
                                                        <Select value={targetPhase} onValueChange={setTargetPhase}>
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="prepare">Prepare</SelectItem>
                                                                <SelectItem value="data">Data Upload</SelectItem>
                                                                <SelectItem value="verify">Verification</SelectItem>
                                                                <SelectItem value="transform">Transformation</SelectItem>
                                                                <SelectItem value="plan">Planning</SelectItem>
                                                                <SelectItem value="execute">Execution</SelectItem>
                                                                <SelectItem value="results">Results</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Switch id="clearData" checked={clearData} onCheckedChange={setClearData} />
                                                        <Label htmlFor="clearData" className="text-xs">Clear subsequent phases</Label>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="destructive"
                                                    onClick={() => resetPhaseMutation.mutate({ projectId: selectedProjectId!, targetPhase, clearData })}
                                                    disabled={resetPhaseMutation.isPending}
                                                >
                                                    {resetPhaseMutation.isPending ? (
                                                        <>
                                                            <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                                                            Resetting...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RotateCcw className="w-4 h-4 mr-2" />
                                                            Reset to {targetPhase}
                                                        </>
                                                    )}
                                                </Button>
                                                {resetPhaseMutation.isSuccess && (
                                                    <Alert className="mt-2">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        <AlertDescription>Phase reset completed</AlertDescription>
                                                    </Alert>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Atomic Merge Test - Disabled (backend endpoint removed for safety) */}
                                        <Card className="p-4 opacity-50">
                                            <CardHeader className="p-0 pb-3">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Beaker className="w-4 h-4 text-gray-400" />
                                                    Atomic Merge Test (Disabled)
                                                </CardTitle>
                                                <CardDescription>
                                                    This test has been disabled to prevent accidental data modification in production.
                                                </CardDescription>
                                            </CardHeader>
                                        </Card>
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            {/* Active Agents Tab */}
                            <TabsContent value="active-agents" className="flex-1 overflow-hidden m-0">
                                <ScrollArea className="h-[550px]">
                                    <div className="p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold flex items-center gap-2">
                                                <Bot className="w-5 h-5 text-indigo-600" />
                                                Active Agents Monitor
                                                <Badge variant="secondary" className="animate-pulse">Live</Badge>
                                            </h3>
                                            <Button variant="outline" size="sm" onClick={() => refetchAgents()}>
                                                <RefreshCw className="w-4 h-4 mr-1" />
                                                Refresh
                                            </Button>
                                        </div>

                                        {agentsLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                                            </div>
                                        ) : !activeAgentsData?.activeAgents?.length ? (
                                            <Alert>
                                                <Bot className="w-4 h-4" />
                                                <AlertDescription>No agents are currently active. Agents become active when processing tasks.</AlertDescription>
                                            </Alert>
                                        ) : (
                                            <>
                                                {/* Queue Status Summary */}
                                                {activeAgentsData.queueStatus && (
                                                    <Card className="p-4 bg-slate-50">
                                                        <div className="grid grid-cols-3 gap-4 text-center">
                                                            <div>
                                                                <div className="text-2xl font-bold text-indigo-600">{activeAgentsData.queueStatus.pending || 0}</div>
                                                                <div className="text-xs text-muted-foreground">Pending Tasks</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-2xl font-bold text-green-600">{activeAgentsData.queueStatus.processing || 0}</div>
                                                                <div className="text-xs text-muted-foreground">Processing</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-2xl font-bold text-blue-600">{activeAgentsData.totalActive || 0}</div>
                                                                <div className="text-xs text-muted-foreground">Active Agents</div>
                                                            </div>
                                                        </div>
                                                    </Card>
                                                )}

                                                {/* Active Agents List */}
                                                <div className="space-y-3">
                                                    {activeAgentsData.activeAgents.map((agent: ActiveAgent) => (
                                                        <Card key={agent.id} className="p-4">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-3 h-3 rounded-full ${agent.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                                                                    <div>
                                                                        <div className="font-medium">{agent.name}</div>
                                                                        <div className="text-xs text-muted-foreground">{agent.type}</div>
                                                                    </div>
                                                                </div>
                                                                <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                                                                    {agent.status}
                                                                </Badge>
                                                            </div>
                                                            <div className="mt-3 grid grid-cols-4 gap-4 text-xs">
                                                                <div>
                                                                    <span className="text-muted-foreground">Tasks:</span>
                                                                    <span className="ml-1 font-medium">{agent.currentTasks}/{agent.maxConcurrentTasks}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-muted-foreground">Avg Response:</span>
                                                                    <span className="ml-1 font-medium">{agent.averageResponseTime?.toFixed(0) || 0}ms</span>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <span className="text-muted-foreground">Last Activity:</span>
                                                                    <span className="ml-1 font-medium">
                                                                        {agent.lastActivity ? new Date(agent.lastActivity).toLocaleTimeString() : 'N/A'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </Card>
                                                    ))}
                                                </div>

                                                <div className="text-xs text-muted-foreground text-center pt-4">
                                                    Last updated: {activeAgentsData.timestamp ? new Date(activeAgentsData.timestamp).toLocaleTimeString() : 'N/A'}
                                                    <span className="mx-2">•</span>
                                                    Auto-refreshing every 5 seconds
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-24 text-center">
                            <div className="relative mb-6">
                                <Eye className="w-16 h-16 text-slate-200" />
                                <Activity className="w-6 h-6 text-indigo-400 absolute -bottom-1 -right-1" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-900 mb-2">Ready to Inspect</h3>
                            <p className="text-slate-500 max-w-xs mx-auto">
                                Select a project from the explorer to see exactly what state the agents are managing in real-time.
                            </p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
