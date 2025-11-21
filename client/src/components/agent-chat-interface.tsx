import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Send,
  Brain,
  Users,
  BarChart3,
  MessageCircle,
  CheckCircle,
  Clock,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Lightbulb,
  Settings,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface ConversationMessage {
  id: string;
  speaker: 'user' | 'project_manager_agent' | 'data_scientist_agent' | 'business_agent';
  message: string;
  messageType: 'question' | 'clarification' | 'suggestion' | 'confirmation' | 'explanation';
  relatedGoals?: string[];
  confidence?: number;
  timestamp: Date;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  requiresResponse?: boolean;
  context?: any;
}

interface MessageAttachment {
  type: 'goal_candidate' | 'analysis_preview' | 'decision_explanation' | 'data_sample';
  title: string;
  content: any;
  actions?: AttachmentAction[];
}

interface AttachmentAction {
  id: string;
  label: string;
  type: 'approve' | 'reject' | 'modify' | 'more_info';
  payload?: any;
}

interface MessageReaction {
  type: 'helpful' | 'not_helpful' | 'need_clarification';
  timestamp: Date;
}

interface GoalCandidate {
  id: string;
  statement: string;
  confidence: number;
  category: string;
  priority: 'high' | 'medium' | 'low';
  clarifications: string[];
  status: 'proposed' | 'confirmed' | 'refined' | 'rejected';
}

interface AgentChatProps {
  conversationId?: string;
  projectId?: string;
  initialGoals?: string[];
  onGoalsConfirmed?: (goals: GoalCandidate[]) => void;
  minimized?: boolean;
  onMinimizeToggle?: (minimized: boolean) => void;
}

export function AgentChatInterface({
  conversationId,
  projectId,
  initialGoals,
  onGoalsConfirmed,
  minimized = false,
  onMinimizeToggle
}: AgentChatProps) {
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [currentPhase, setCurrentPhase] = useState<'goal_discovery' | 'requirement_refinement' | 'solution_design' | 'execution_planning'>('goal_discovery');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Check if user is authenticated
  const isAuthenticated = !!localStorage.getItem('auth_token');

  // Fetch conversation messages
  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const response = await apiClient.get(`/api/conversation/${conversationId}`);
      return response.data;
    },
    enabled: isAuthenticated && !!conversationId, // Only fetch if authenticated and conversationId exists
    refetchInterval: 2000 // Check for new messages every 2 seconds
  });

  // Start conversation mutation
  const startConversationMutation = useMutation({
    mutationFn: async (initialDescription: string) => {
      const response = await apiClient.post('/api/conversation/start', {
        projectId,
        initialDescription,
        journeyId: projectId
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      toast({
        title: 'Conversation Started',
        description: 'I\'m here to help you define and refine your analysis goals.'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to start conversation. Please try again.',
        variant: 'destructive'
      });
    }
  });

  // Continue conversation mutation
  const continueConversationMutation = useMutation({
    mutationFn: async ({ message, relatedGoals }: { message: string; relatedGoals?: string[] }) => {
      const response = await apiClient.post(`/api/conversation/${conversationId}/continue`, {
        message,
        relatedGoals
      });
      return response.data;
    },
    onSuccess: () => {
      setCurrentMessage('');
      setSelectedGoals([]);
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive'
      });
    }
  });

  // React to message mutation
  const reactToMessageMutation = useMutation({
    mutationFn: async ({ messageId, reaction }: { messageId: string; reaction: string }) => {
      const response = await apiClient.post(`/api/conversation/${conversationId}/react`, {
        messageId,
        reaction
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.conversationHistory]);

  // Update current phase based on conversation state
  useEffect(() => {
    if (conversation?.currentPhase) {
      setCurrentPhase(conversation.currentPhase);
    }
  }, [conversation?.currentPhase]);

  const handleSendMessage = () => {
    if (!currentMessage.trim()) return;

    if (!conversationId) {
      // Start new conversation
      startConversationMutation.mutate(currentMessage);
    } else {
      // Continue existing conversation
      continueConversationMutation.mutate({
        message: currentMessage,
        relatedGoals: selectedGoals.length > 0 ? selectedGoals : undefined
      });
    }
  };

  const handleGoalAction = (goalId: string, action: string, payload?: any) => {
    // Handle goal-related actions (approve, reject, modify)
    const actionMessage = `${action.toUpperCase()}: Goal "${goalId}"${payload ? ` - ${payload}` : ''}`;

    continueConversationMutation.mutate({
      message: actionMessage,
      relatedGoals: [goalId]
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getAgentInfo = (speaker: string) => {
    switch (speaker) {
      case 'project_manager_agent':
        return {
          name: 'Project Manager',
          icon: <Users className="w-4 h-4" />,
          color: 'bg-purple-500',
          description: 'Orchestrating your analysis journey'
        };
      case 'data_scientist_agent':
        return {
          name: 'Data Scientist',
          icon: <BarChart3 className="w-4 h-4" />,
          color: 'bg-blue-500',
          description: 'Designing technical analysis approach'
        };
      case 'business_agent':
        return {
          name: 'Business Analyst',
          icon: <Brain className="w-4 h-4" />,
          color: 'bg-green-500',
          description: 'Providing business context and insights'
        };
      default:
        return {
          name: 'You',
          icon: <MessageCircle className="w-4 h-4" />,
          color: 'bg-gray-500',
          description: 'User'
        };
    }
  };

  const getPhaseInfo = (phase: string) => {
    switch (phase) {
      case 'goal_discovery':
        return {
          title: 'Goal Discovery',
          description: 'Understanding what you want to achieve',
          progress: 25,
          color: 'bg-blue-500'
        };
      case 'requirement_refinement':
        return {
          title: 'Requirement Refinement',
          description: 'Clarifying details and constraints',
          progress: 50,
          color: 'bg-yellow-500'
        };
      case 'solution_design':
        return {
          title: 'Solution Design',
          description: 'Designing the analysis approach',
          progress: 75,
          color: 'bg-orange-500'
        };
      case 'execution_planning':
        return {
          title: 'Execution Planning',
          description: 'Ready to start your analysis',
          progress: 100,
          color: 'bg-green-500'
        };
      default:
        return {
          title: 'Initializing',
          description: 'Starting conversation',
          progress: 0,
          color: 'bg-gray-500'
        };
    }
  };

  if (minimized) {
    return (
      <Card className="fixed bottom-4 right-4 w-80 shadow-lg z-50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageCircle className="w-4 h-4" />
              <CardTitle className="text-sm">Agent Chat</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMinimizeToggle?.(false)}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-sm text-gray-600">
            {conversation?.conversationHistory?.length || 0} messages
          </div>
          {isTyping && (
            <div className="flex items-center space-x-1 text-xs text-blue-600 mt-1">
              <div className="animate-pulse">Agent is typing...</div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 h-[600px] shadow-lg z-50 flex flex-col" data-testid="agent-chat-interface">
      {/* Header */}
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageCircle className="w-5 h-5 text-blue-500" />
            <CardTitle className="text-lg">Agent Conversation</CardTitle>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMinimizeToggle?.(true)}
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Phase Progress */}
        {conversation && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{getPhaseInfo(currentPhase).title}</span>
              <span className="text-gray-500">{getPhaseInfo(currentPhase).progress}%</span>
            </div>
            <Progress
              value={getPhaseInfo(currentPhase).progress}
              className="h-1"
              data-testid="conversation-progress"
            />
            <p className="text-xs text-gray-600">
              {getPhaseInfo(currentPhase).description}
            </p>
          </div>
        )}
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full p-4">
          <div className="space-y-4">
            {!conversation && !conversationId && (
              <div className="text-center text-gray-500 py-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-sm">Start a conversation to refine your analysis goals</p>
              </div>
            )}

            {conversation?.conversationHistory?.map((message: ConversationMessage) => {
              const agentInfo = getAgentInfo(message.speaker);
              const isUser = message.speaker === 'user';

              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] ${
                      isUser
                        ? 'bg-blue-500 text-white rounded-lg rounded-br-sm'
                        : 'bg-gray-100 text-gray-900 rounded-lg rounded-bl-sm'
                    } p-3`}
                    data-testid={isUser ? 'chat-message' : 'agent-message'}
                  >
                    {!isUser && (
                      <div className="flex items-center space-x-2 mb-2">
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className={`${agentInfo.color} text-white text-xs`}>
                            {agentInfo.icon}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{agentInfo.name}</span>
                        {message.confidence && (
                          <Badge variant="outline" className="text-xs">
                            {Math.round(message.confidence * 100)}% confident
                          </Badge>
                        )}
                      </div>
                    )}

                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>

                    {message.attachments?.map((attachment, index) => (
                      <div key={index} className="mt-3 p-2 border rounded bg-white/10">
                        <div className="text-xs font-medium mb-1">{attachment.title}</div>

                        {attachment.type === 'goal_candidate' && (
                          <div className="space-y-2">
                            <div className="text-xs text-gray-600">
                              Goal: {attachment.content.statement}
                            </div>
                            <div className="flex space-x-1">
                              {attachment.actions?.map((action) => (
                                <Button
                                  key={action.id}
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-6"
                                  onClick={() => handleGoalAction(attachment.content.id, action.type, action.payload)}
                                  data-testid="goal-candidate"
                                >
                                  {action.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs opacity-75">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>

                      {!isUser && (
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-75 hover:opacity-100"
                            onClick={() => reactToMessageMutation.mutate({
                              messageId: message.id,
                              reaction: 'helpful'
                            })}
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-75 hover:opacity-100"
                            onClick={() => reactToMessageMutation.mutate({
                              messageId: message.id,
                              reaction: 'not_helpful'
                            })}
                          >
                            <ThumbsDown className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg rounded-bl-sm p-3" data-testid="agent-typing">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                    <span className="text-xs text-gray-500">Agent is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>

      {/* Goal Selection */}
      {conversation?.goalCandidates?.length > 0 && selectedGoals.length > 0 && (
        <div className="px-4 py-2 border-t bg-gray-50">
          <div className="text-xs font-medium mb-1">Selected goals for discussion:</div>
          <div className="flex flex-wrap gap-1">
            {selectedGoals.map((goalId) => {
              const goal = conversation.goalCandidates.find((g: GoalCandidate) => g.id === goalId);
              return (
                <Badge
                  key={goalId}
                  variant="secondary"
                  className="text-xs cursor-pointer"
                  onClick={() => setSelectedGoals(prev => prev.filter(id => id !== goalId))}
                >
                  {goal?.statement.slice(0, 20)}...
                  <span className="ml-1">×</span>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex space-x-2">
          <Textarea
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              !conversation
                ? "Describe what you want to analyze..."
                : "Ask a question or provide clarification..."
            }
            className="min-h-[40px] resize-none"
            rows={2}
          />
          <Button
            onClick={handleSendMessage}
            disabled={
              !currentMessage.trim() ||
              startConversationMutation.status === 'pending' ||
              continueConversationMutation.status === 'pending'
            }
            size="sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

        {/* Quick Actions */}
  <div className="flex items-center justify-between mt-2" data-testid="quick-actions">
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6"
              onClick={() => setCurrentMessage("I need help understanding the analysis approach")}
            >
              <Lightbulb className="w-3 h-3 icon-gap" />
              Need help
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6"
              onClick={() => setCurrentMessage("Can you explain this decision?")}
            >
              <AlertCircle className="w-3 h-3 icon-gap" />
              Explain
            </Button>
          </div>

          {conversation?.goalCandidates?.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6"
              onClick={() => {
                const confirmedGoals = conversation.goalCandidates.filter((g: GoalCandidate) => g.status === 'confirmed');
                if (confirmedGoals.length > 0) {
                  onGoalsConfirmed?.(confirmedGoals);
                  toast({
                    title: 'Goals Confirmed',
                    description: `${confirmedGoals.length} goals ready for analysis`
                  });
                }
              }}
            >
              <CheckCircle className="w-3 h-3 icon-gap" />
              Proceed ({conversation.goalCandidates.filter((g: GoalCandidate) => g.status === 'confirmed').length})
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default AgentChatInterface;