import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Brain,
  Database,
  BarChart3,
  Users,
  MessageCircle,
  Eye,
  ChevronRight,
  PlayCircle,
  PauseCircle,
  Zap,
  TrendingUp,
  FileText,
  Settings
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface DecisionAudit {
  id: string;
  agent: 'project_manager' | 'data_scientist' | 'business_agent' | 'system';
  decisionType: string;
  decision: string;
  reasoning: string;
  alternatives: string[];
  confidence: number;
  context: any;
  userInput?: string;
  impact: 'low' | 'medium' | 'high';
  reversible: boolean;
  timestamp: Date;
}

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  agent: string;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration: number;
  actualDuration?: number;
  decisions: DecisionAudit[];
  artifacts: any[];
  dependencies: string[];
}

interface AgentActivity {
  id: string;
  agent: 'project_manager' | 'data_scientist' | 'business_agent';
  activity: string;
  status: 'active' | 'idle' | 'waiting_for_user';
  currentTask: string;
  progress: number;
  estimatedCompletion: Date;
  lastUpdate: Date;
}

interface WorkflowTransparencyProps {
  projectId: string;
  conversationId?: string;
  subscriptionId?: string;
}

export function WorkflowTransparencyDashboard({
  projectId,
  conversationId,
  subscriptionId
}: WorkflowTransparencyProps) {
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<DecisionAudit | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);

  // Check if user is authenticated
  const isAuthenticated = !!localStorage.getItem('auth_token');

  // Fetch workflow data
  const { data: workflowData, isLoading } = useQuery({
    queryKey: ['workflow', projectId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/workflow/transparency/${projectId}`);
      // API returns the workflow object directly, not wrapped in data
      return response ?? null;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: isAuthenticated && !!projectId // Only fetch if authenticated and projectId exists
  });

  // Fetch agent activities
  const { data: agentActivities } = useQuery({
    queryKey: ['agent-activities', projectId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/agents/activities/${projectId}`);
      if (Array.isArray(response?.data)) {
        return response.data;
      }
      if (Array.isArray(response)) {
        return response;
      }
      return [];
    },
    refetchInterval: 3000, // More frequent updates for agent activities
    enabled: isAuthenticated && !!projectId // Only fetch if authenticated and projectId exists
  });

  // Fetch decision audit trail
  const { data: decisionAudit } = useQuery({
    queryKey: ['decision-audit', projectId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/workflow/decisions/${projectId}`);
      if (Array.isArray(response)) {
        return response;
      }
      if (Array.isArray(response?.data)) {
        return response.data;
      }
      return [];
    },
    enabled: isAuthenticated && !!projectId // Only fetch if authenticated and projectId exists
  });
  // Use real data only - don't show hard-coded fallbacks
  const workflowDataSafe = workflowData && (workflowData.steps?.length || 0) > 0 ? workflowData : null;
  const agentActivitiesSafe: AgentActivity[] = agentActivities && agentActivities.length > 0 ? agentActivities : [];
  const decisionAuditSafe: DecisionAudit[] = Array.isArray(decisionAudit) ? decisionAudit : [];

  useEffect(() => {
    if (selectedDecision && !decisionAuditSafe.some((decision) => decision.id === selectedDecision.id)) {
      setSelectedDecision(null);
    }
  }, [decisionAuditSafe, selectedDecision]);

  const getStepIcon = (step: WorkflowStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <PlayCircle className="w-5 h-5 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getAgentIcon = (agent: string) => {
    switch (agent) {
      case 'project_manager':
        return <Users className="w-5 h-5 text-purple-500" />;
      case 'data_scientist':
        return <BarChart3 className="w-5 h-5 text-blue-500" />;
      case 'business_agent':
        return <Brain className="w-5 h-5 text-green-500" />;
      default:
        return <Settings className="w-5 h-5 text-gray-500" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="workflow-transparency-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Workflow Transparency</h2>
          <p className="text-gray-600">Real-time view of your analysis pipeline</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="flex items-center space-x-1">
            <Zap className="w-3 h-3" />
            <span>Live Updates</span>
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agent Activities</TabsTrigger>
          <TabsTrigger value="decisions">Decision Trail</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Progress Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>Analysis Progress</span>
              </CardTitle>
              <CardDescription>
                Current status of your analysis pipeline
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Overall Progress</span>
                  <span className="text-sm text-gray-500">
                    {workflowData?.completedSteps || 0} of {workflowData?.totalSteps || 0} steps
                  </span>
                </div>
                <Progress
                  value={workflowDataSafe ? (workflowDataSafe.completedSteps / workflowDataSafe.totalSteps) * 100 : 0}
                  className="h-2"
                  data-testid="workflow-progress"
                />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Estimated completion: {
                      workflowDataSafe?.estimatedCompletion 
                        ? workflowDataSafe.estimatedCompletion 
                        : 'Not available - workflow not started'
                    }
                  </span>
                  <span className="text-gray-500">
                    {workflowDataSafe?.currentPhase || 'No active workflow'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workflow Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow Steps</CardTitle>
              <CardDescription>
                Detailed view of each analysis step
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workflowDataSafe?.steps && workflowDataSafe.steps.length > 0 ? (
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {workflowDataSafe.steps.map((step: WorkflowStep, index: number) => (
                      <div
                        key={step.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedStep?.id === step.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedStep(step)}
                        data-testid="workflow-step"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {getStepIcon(step)}
                            <div>
                              <h4 className="font-medium">{step.title}</h4>
                              <p className="text-sm text-gray-600">{step.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline">{step.agent}</Badge>
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>

                        {step.status === 'in_progress' && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span>Progress</span>
                              <span>{Math.round(((step.actualDuration || 0) / step.estimatedDuration) * 100)}%</span>
                            </div>
                            <Progress
                              value={((step.actualDuration || 0) / step.estimatedDuration) * 100}
                              className="h-1"
                            />
                          </div>
                        )}

                        {step.decisions.length > 0 && (
                          <div className="mt-3 flex items-center space-x-2">
                            <Badge variant="secondary" className="text-xs">
                              {step.decisions.length} decisions
                            </Badge>
                            {step.artifacts.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {step.artifacts.length} artifacts
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  <p>No workflow steps available yet.</p>
                  <p className="text-sm mt-2">Workflow steps will appear here once the journey is initialized.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Activities Tab */}
        <TabsContent value="agents" className="space-y-6">
          {agentActivitiesSafe.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <p>No agent activities available yet.</p>
                <p className="text-sm mt-2">Agent activities will appear here once the journey progresses.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {agentActivitiesSafe.map((agent: AgentActivity) => {
                const nameMap: Record<string, string> = {
                  project_manager: 'project-manager',
                  data_scientist: 'data-scientist',
                  business_agent: 'business-agent'
                };
                const testId = `agent-card-${nameMap[agent.agent] || agent.agent}`;
                return (
                  <Card key={agent.id} data-testid={testId}>
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {getAgentIcon(agent.agent)}
                          <CardTitle className="text-lg capitalize">
                            {agent.agent.replace('_', ' ')}
                          </CardTitle>
                        </div>
                        <Badge
                          variant={agent.status === 'active' ? 'default' : 'secondary'}
                          className="capitalize"
                          data-testid="activity-status"
                        >
                          {agent.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-1">Current Activity</h4>
                          <p className="text-sm text-gray-600" data-testid="current-task">{agent.activity}</p>
                        </div>

                        <div>
                          <h4 className="font-medium mb-1">Current Task</h4>
                          <p className="text-sm text-gray-600">{agent.currentTask}</p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span>Task Progress</span>
                            <span>{agent.progress ?? 0}%</span>
                          </div>
                          <Progress value={agent.progress ?? 0} className="h-1" data-testid="task-progress" />
                        </div>

                        {agent.estimatedCompletion && (
                          <div className="text-xs text-gray-500">
                            Estimated completion: {new Date(agent.estimatedCompletion).toLocaleTimeString()}
                          </div>
                        )}
                        {!agent.estimatedCompletion && agent.status === 'active' && (
                          <div className="text-xs text-gray-400 italic">
                            Calculating completion time...
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Decision Trail Tab */}
        <TabsContent value="decisions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Eye className="w-5 h-5" />
                <span>Decision Audit Trail</span>
              </CardTitle>
              <CardDescription>
                Complete log of all agent decisions and reasoning
              </CardDescription>
            </CardHeader>
            <CardContent>
              {decisionAuditSafe.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <p>No decisions recorded yet.</p>
                  <p className="text-sm mt-2">Agents will log decisions as the workflow progresses.</p>
                </div>
              ) : (
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {decisionAuditSafe.map((decision: DecisionAudit) => (
                      <div
                        key={decision.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedDecision?.id === decision.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedDecision(decision)}
                        data-testid="decision-entry"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            {getAgentIcon(decision.agent)}
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <h4 className="font-medium" data-testid="decision-text">{decision.decision}</h4>
                                <Badge
                                  variant="outline"
                                  className={getImpactColor(decision.impact)}
                                >
                                  {decision.impact} impact
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mt-1" data-testid="decision-reasoning">
                                {decision.reasoning}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">
                              {new Date(decision.timestamp).toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-600 mt-1" data-testid="decision-confidence">
                              {decision.confidence}% confidence
                            </div>
                          </div>
                        </div>

                        {decision.alternatives.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-700 mb-1">
                              Alternatives Considered:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {decision.alternatives.map((alt, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {alt}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {decision.reversible && (
                          <div className="mt-2">
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowQuestionDialog(true)}>
                              <MessageCircle className="w-3 h-3 icon-gap" />
                              Question this decision
                            </Button>
                            {showQuestionDialog && (
                              <div data-testid="question-decision-dialog" className="mt-2 p-2 border rounded bg-gray-50 text-sm">
                                Tell us why you are questioning this decision.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Artifacts Tab */}
        <TabsContent value="artifacts" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflowData?.artifacts?.map((artifact: any, index: number) => (
              <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <Badge variant="outline">{artifact.type}</Badge>
                  </div>
                  <CardTitle className="text-base">{artifact.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">
                      Generated by: {artifact.agent}
                    </div>
                    <div className="text-xs text-gray-500">
                      Created: {new Date(artifact.createdAt).toLocaleString()}
                    </div>
                    {artifact.audienceProfile && (
                      <Badge variant="secondary" className="text-xs">
                        For: {artifact.audienceProfile.role}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Selected Step Details Modal/Sidebar */}
      {selectedStep && (
        <Card className="fixed right-4 top-4 bottom-4 w-96 shadow-lg z-50 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                {getStepIcon(selectedStep)}
                <span>{selectedStep.title}</span>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStep(null)}
              >
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-gray-600">{selectedStep.description}</p>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-2">Timing</h4>
                  <div className="text-sm space-y-1">
                    <div>Started: {selectedStep.startedAt ? new Date(selectedStep.startedAt).toLocaleString() : 'Not started'}</div>
                    <div>Estimated duration: {selectedStep.estimatedDuration} minutes</div>
                    {selectedStep.actualDuration && (
                      <div>Actual duration: {selectedStep.actualDuration} minutes</div>
                    )}
                  </div>
                </div>

                {selectedStep.decisions.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Decisions Made</h4>
                      <div className="space-y-2">
                        {selectedStep.decisions.map((decision) => (
                          <div key={decision.id} className="p-2 border rounded text-sm">
                            <div className="font-medium">{decision.decision}</div>
                            <div className="text-gray-600 text-xs mt-1">{decision.reasoning}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {selectedStep.dependencies.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Dependencies</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedStep.dependencies.map((dep, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {dep}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}