import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Brain, 
  Database, 
  BarChart3, 
  Zap, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Eye,
  TrendingUp,
  Users,
  Target
} from 'lucide-react';
import { 
  LoadingSpinner, 
  ProgressIndicator, 
  StepIndicator, 
  OperationStatus,
  MultiAgentStatus,
  FeedbackToast 
} from './ui/feedback';

interface AnalysisProgress {
  stage: 'upload' | 'schema' | 'analysis' | 'insights' | 'complete';
  progress: number;
  currentStep: string;
  estimatedTime?: string;
  agents: Array<{
    id: 'pm' | 'de' | 'ds' | 'ba';
    activity: string;
    status: 'idle' | 'working' | 'complete' | 'error';
    progress?: number;
  }>;
  insights?: Array<{
    type: 'data_quality' | 'statistical' | 'business' | 'technical';
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
  }>;
}

interface AnalysisFeedbackProps {
  projectId: string;
  onComplete?: (results: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function AnalysisFeedback({ 
  projectId, 
  onComplete, 
  onError, 
  className 
}: AnalysisFeedbackProps) {
  const [progress, setProgress] = useState<AnalysisProgress>({
    stage: 'upload',
    progress: 0,
    currentStep: 'Initializing analysis...',
    agents: [
      { id: 'pm', activity: 'Coordinating workflow', status: 'idle' },
      { id: 'de', activity: 'Waiting for data', status: 'idle' },
      { id: 'ds', activity: 'Ready for analysis', status: 'idle' },
      { id: 'ba', activity: 'Preparing insights', status: 'idle' }
    ]
  });
  const [messages, setMessages] = useState<Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    timestamp: Date;
  }>>([]);

  useEffect(() => {
    // Simulate analysis progress
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = { ...prev };
        
        // Update progress based on stage
        switch (newProgress.stage) {
          case 'upload':
            if (newProgress.progress >= 100) {
              newProgress.stage = 'schema';
              newProgress.progress = 0;
              newProgress.currentStep = 'Analyzing data schema...';
              newProgress.agents[1].status = 'working';
              newProgress.agents[1].activity = 'Detecting column types';
            } else {
              newProgress.progress += 10;
            }
            break;
            
          case 'schema':
            if (newProgress.progress >= 100) {
              newProgress.stage = 'analysis';
              newProgress.progress = 0;
              newProgress.currentStep = 'Running statistical analysis...';
              newProgress.agents[2].status = 'working';
              newProgress.agents[2].activity = 'Performing regression analysis';
            } else {
              newProgress.progress += 15;
              newProgress.agents[1].progress = newProgress.progress;
            }
            break;
            
          case 'analysis':
            if (newProgress.progress >= 100) {
              newProgress.stage = 'insights';
              newProgress.progress = 0;
              newProgress.currentStep = 'Generating business insights...';
              newProgress.agents[3].status = 'working';
              newProgress.agents[3].activity = 'Assessing business impact';
            } else {
              newProgress.progress += 20;
              newProgress.agents[2].progress = newProgress.progress;
            }
            break;
            
          case 'insights':
            if (newProgress.progress >= 100) {
              newProgress.stage = 'complete';
              newProgress.currentStep = 'Analysis complete!';
              newProgress.agents.forEach(agent => {
                agent.status = 'complete';
              });
              
              // Add completion message
              addMessage({
                type: 'success',
                title: 'Analysis Complete',
                message: 'Your data analysis has been completed successfully.'
              });
              
              onComplete?.({
                insights: newProgress.insights || [],
                agents: newProgress.agents
              });
            } else {
              newProgress.progress += 25;
              newProgress.agents[3].progress = newProgress.progress;
            }
            break;
        }
        
        return newProgress;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onComplete]);

  const addMessage = (message: Omit<typeof messages[0], 'id' | 'timestamp'>) => {
    const newMessage = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'upload':
        return Database;
      case 'schema':
        return Eye;
      case 'analysis':
        return Brain;
      case 'insights':
        return BarChart3;
      case 'complete':
        return CheckCircle;
      default:
        return Clock;
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'upload':
        return 'text-blue-600';
      case 'schema':
        return 'text-purple-600';
      case 'analysis':
        return 'text-green-600';
      case 'insights':
        return 'text-orange-600';
      case 'complete':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const steps = [
    { id: 'upload', label: 'Data Upload', icon: Database },
    { id: 'schema', label: 'Schema Analysis', icon: Eye },
    { id: 'analysis', label: 'Statistical Analysis', icon: Brain },
    { id: 'insights', label: 'Business Insights', icon: BarChart3 },
    { id: 'complete', label: 'Complete', icon: CheckCircle }
  ];

  const currentStepIndex = steps.findIndex(step => step.id === progress.stage);

  return (
    <div className={className}>
      {/* Progress Header */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            {React.createElement(getStageIcon(progress.stage), { 
              className: `w-5 h-5 ${getStageColor(progress.stage)}` 
            })}
            <span>Analysis Progress</span>
            <Badge variant="outline">
              {progress.stage.replace('_', ' ').toUpperCase()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <OperationStatus
              operation={progress.currentStep}
              status={progress.stage === 'complete' ? 'success' : 'loading'}
              progress={progress.progress}
              estimatedTime={progress.estimatedTime}
            />
            
            <StepIndicator
              steps={steps}
              currentStep={currentStepIndex}
              completedSteps={Array.from({ length: currentStepIndex }, (_, i) => i)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>Agent Coordination</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MultiAgentStatus
              agents={progress.agents}
              overallStatus={progress.stage === 'complete' ? 'complete' : 'working'}
            />
          </CardContent>
        </Card>

        {/* Insights Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5" />
              <span>Key Insights</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {progress.insights && progress.insights.length > 0 ? (
              <div className="space-y-3">
                {progress.insights.slice(0, 3).map((insight, index) => (
                  <div key={index} className="p-3 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">{insight.title}</div>
                      <Badge variant="outline">
                        {Math.round(insight.confidence * 100)}% confidence
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {insight.description}
                    </div>
                    {insight.actionable && (
                      <div className="mt-2 text-xs text-green-600">
                        ✓ Actionable insight
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="w-8 h-8 mx-auto mb-2" />
                <p>Insights will appear as analysis progresses</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>Analysis Updates</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {messages.slice(-5).map((message) => (
                <FeedbackToast
                  key={message.id}
                  message={{
                    type: message.type,
                    title: message.title,
                    message: message.message,
                    dismissible: false
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AnalysisFeedback;
