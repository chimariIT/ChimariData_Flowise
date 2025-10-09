// client/src/components/agent-checkpoints.tsx

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  MessageSquare, 
  ThumbsUp, 
  ThumbsDown,
  Bot,
  User,
  PlayCircle,
  XCircle
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';

interface AgentCheckpoint {
  id: string;
  projectId: string;
  agentType: 'project_manager' | 'technical_ai' | 'business';
  stepName: string;
  status: 'pending' | 'in_progress' | 'waiting_approval' | 'approved' | 'completed' | 'rejected';
  message: string;
  data?: any;
  userFeedback?: string;
  timestamp: string;
  requiresUserInput: boolean;
}

interface AgentCheckpointsProps {
  projectId: string;
}

const statusConfig = {
  pending: { icon: Clock, color: 'bg-gray-100 text-gray-800', label: 'Pending' },
  in_progress: { icon: PlayCircle, color: 'bg-blue-100 text-blue-800', label: 'In Progress' },
  waiting_approval: { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-800', label: 'Waiting for Approval' },
  approved: { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Approved' },
  completed: { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Completed' },
  rejected: { icon: XCircle, color: 'bg-red-100 text-red-800', label: 'Rejected' },
};

const agentConfig = {
  project_manager: { name: 'Project Manager', icon: Bot, color: 'text-purple-600' },
  technical_ai: { name: 'Technical AI', icon: Bot, color: 'text-blue-600' },
  business: { name: 'Business Agent', icon: Bot, color: 'text-green-600' },
};

export default function AgentCheckpoints({ projectId }: AgentCheckpointsProps) {
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  // Query to get checkpoints
  const { data: checkpoints = [], isLoading, error } = useQuery({
    queryKey: ['/api/projects', projectId, 'checkpoints'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/checkpoints`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch checkpoints');
      }
      const result = await response.json();
      return result.checkpoints || [];
    },
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
  });

  // Mutation to submit feedback
  const feedbackMutation = useMutation({
    mutationFn: async ({ checkpointId, feedback, approved }: { 
      checkpointId: string; 
      feedback: string; 
      approved: boolean; 
    }) => {
      const response = await fetch(`/api/projects/${projectId}/checkpoints/${checkpointId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ feedback, approved }),
      });
      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'checkpoints'] });
      toast({
        title: 'Feedback submitted',
        description: 'Your feedback has been processed by the AI agent.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleFeedback = (checkpointId: string, approved: boolean) => {
    const feedback = feedbackText[checkpointId] || '';
    feedbackMutation.mutate({ checkpointId, feedback, approved });
    setFeedbackText(prev => ({ ...prev, [checkpointId]: '' }));
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusIcon = (status: string) => {
    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;
    const Icon = config.icon;
    return <Icon className="w-4 h-4" />;
  };

  const getAgentInfo = (agentType: string) => {
    const config = agentConfig[agentType as keyof typeof agentConfig];
    if (!config) return { name: agentType, icon: Bot, color: 'text-gray-600' };
    return config;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            AI Agent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-600">Loading agent activity...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            AI Agent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Failed to load agent activity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (checkpoints.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            AI Agent Activity
          </CardTitle>
          <CardDescription>
            AI agents will appear here as they work on your project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">No agent activity yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Upload data to start working with AI agents
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          AI Agent Activity
        </CardTitle>
        <CardDescription>
          Real-time collaboration with AI agents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {checkpoints.map((checkpoint, index) => {
              const agentInfo = getAgentInfo(checkpoint.agentType);
              const statusInfo = statusConfig[checkpoint.status as keyof typeof statusConfig];
              const AgentIcon = agentInfo.icon;
              
              return (
                <div key={checkpoint.id} className="relative">
                  {index !== checkpoints.length - 1 && (
                    <div className="absolute left-6 top-12 bottom-0 w-px bg-gray-200" />
                  )}
                  
                  <div className="flex gap-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center ${agentInfo.color}`}>
                      <AgentIcon className="w-6 h-6" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{agentInfo.name}</span>
                            <Badge variant="outline" className={`text-xs ${statusInfo?.color}`}>
                              {getStatusIcon(checkpoint.status)}
                              <span className="ml-1">{statusInfo?.label}</span>
                            </Badge>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(checkpoint.timestamp)}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-700 mb-3">
                          {checkpoint.message}
                        </p>
                        
                        {checkpoint.data?.suggestedNextSteps && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-600 mb-1">Suggested Next Steps:</p>
                            <ul className="text-xs text-gray-600 space-y-1">
                              {checkpoint.data.suggestedNextSteps.map((step: string, i: number) => (
                                <li key={i} className="flex items-start gap-1">
                                  <span className="w-1 h-1 bg-gray-400 rounded-full mt-2 flex-shrink-0" />
                                  {step}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {checkpoint.data?.estimatedTimeframe && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-600">
                              <Clock className="w-3 h-3 inline mr-1" />
                              Estimated time: {checkpoint.data.estimatedTimeframe}
                            </p>
                          </div>
                        )}
                        
                        {checkpoint.userFeedback && (
                          <div className="mt-3 p-3 bg-blue-50 rounded border-l-4 border-blue-200">
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-4 h-4 text-blue-600" />
                              <span className="text-xs font-medium text-blue-800">Your Feedback</span>
                            </div>
                            <p className="text-xs text-blue-700">{checkpoint.userFeedback}</p>
                          </div>
                        )}
                        
                        {checkpoint.status === 'waiting_approval' && checkpoint.requiresUserInput && (
                          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-3">
                              <MessageSquare className="w-4 h-4 text-yellow-600" />
                              <span className="text-sm font-medium text-yellow-800">Your Response Needed</span>
                            </div>
                            
                            <Textarea
                              placeholder="Provide feedback or ask questions..."
                              value={feedbackText[checkpoint.id] || ''}
                              onChange={(e) => setFeedbackText(prev => ({ 
                                ...prev, 
                                [checkpoint.id]: e.target.value 
                              }))}
                              className="mb-3 bg-white"
                              rows={3}
                            />
                            
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleFeedback(checkpoint.id, true)}
                                disabled={feedbackMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <ThumbsUp className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleFeedback(checkpoint.id, false)}
                                disabled={feedbackMutation.isPending}
                                className="border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <ThumbsDown className="w-4 h-4 mr-1" />
                                Request Changes
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}