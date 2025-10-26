import React from 'react';
import { Loader2, CheckCircle, AlertCircle, Clock, Zap, Database, Brain, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingState {
  isLoading: boolean;
  progress?: number;
  currentStep?: string;
  totalSteps?: number;
  estimatedTime?: string;
  status?: 'idle' | 'loading' | 'success' | 'error';
}

export interface FeedbackMessage {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <Loader2 className={cn('animate-spin', sizeClasses[size], className)} />
  );
}

interface ProgressIndicatorProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  className?: string;
}

export function ProgressIndicator({ 
  progress, 
  label, 
  showPercentage = true, 
  className 
}: ProgressIndicatorProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          {showPercentage && (
            <span className="text-muted-foreground">{Math.round(progress)}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-secondary rounded-full h-2">
        <div 
          className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}

interface StepIndicatorProps {
  steps: Array<{
    id: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  currentStep: number;
  completedSteps?: number[];
  className?: string;
}

export function StepIndicator({ 
  steps, 
  currentStep, 
  completedSteps = [], 
  className 
}: StepIndicatorProps) {
  return (
    <div className={cn('flex items-center space-x-2', className)}>
      {steps.map((step, index) => {
        const StepIcon = step.icon || Clock;
        const isCompleted = completedSteps.includes(index);
        const isCurrent = index === currentStep;
        const isUpcoming = index > currentStep;

        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center space-x-2">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                isCompleted 
                  ? 'bg-green-500 text-white' 
                  : isCurrent 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              )}>
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4" />
                ) : isCurrent ? (
                  <LoadingSpinner size="sm" className="text-primary-foreground" />
                ) : (
                  <StepIcon className="w-4 h-4" />
                )}
              </div>
              <span className={cn(
                'text-sm font-medium',
                isCompleted 
                  ? 'text-green-700' 
                  : isCurrent 
                  ? 'text-primary' 
                  : 'text-muted-foreground'
              )}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={cn(
                'w-8 h-px',
                isCompleted ? 'bg-green-500' : 'bg-muted'
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface OperationStatusProps {
  operation: string;
  status: LoadingState['status'];
  progress?: number;
  currentStep?: string;
  estimatedTime?: string;
  className?: string;
}

export function OperationStatus({ 
  operation, 
  status, 
  progress, 
  currentStep, 
  estimatedTime,
  className 
}: OperationStatusProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <LoadingSpinner className="text-primary" />;
      case 'success':
        return <CheckCircle className="text-green-500" />;
      case 'error':
        return <AlertCircle className="text-red-500" />;
      default:
        return <Clock className="text-muted-foreground" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'text-primary';
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center space-x-3">
        {getStatusIcon()}
        <div className="flex-1">
          <div className={cn('font-medium', getStatusColor())}>
            {operation}
          </div>
          {currentStep && (
            <div className="text-sm text-muted-foreground">
              {currentStep}
            </div>
          )}
          {estimatedTime && status === 'loading' && (
            <div className="text-xs text-muted-foreground">
              Estimated time: {estimatedTime}
            </div>
          )}
        </div>
      </div>
      
      {progress !== undefined && status === 'loading' && (
        <ProgressIndicator progress={progress} />
      )}
    </div>
  );
}

interface AgentActivityProps {
  agent: 'pm' | 'de' | 'ds' | 'ba';
  activity: string;
  status: 'idle' | 'working' | 'complete' | 'error';
  progress?: number;
  className?: string;
}

export function AgentActivity({ 
  agent, 
  activity, 
  status, 
  progress, 
  className 
}: AgentActivityProps) {
  const getAgentInfo = () => {
    switch (agent) {
      case 'pm':
        return { name: 'Project Manager', icon: Zap, color: 'text-blue-600' };
      case 'de':
        return { name: 'Data Engineer', icon: Database, color: 'text-green-600' };
      case 'ds':
        return { name: 'Data Scientist', icon: Brain, color: 'text-purple-600' };
      case 'ba':
        return { name: 'Business Agent', icon: BarChart3, color: 'text-orange-600' };
    }
  };

  const { name, icon: Icon, color } = getAgentInfo();

  const getStatusIcon = () => {
    switch (status) {
      case 'working':
        return <LoadingSpinner size="sm" className={color} />;
      case 'complete':
        return <CheckCircle className="text-green-500" />;
      case 'error':
        return <AlertCircle className="text-red-500" />;
      default:
        return <Icon className={cn('w-4 h-4', color)} />;
    }
  };

  return (
    <div className={cn('flex items-center space-x-3 p-3 rounded-lg border', className)}>
      {getStatusIcon()}
      <div className="flex-1">
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-muted-foreground">{activity}</div>
        {progress !== undefined && status === 'working' && (
          <div className="mt-1">
            <ProgressIndicator progress={progress} showPercentage={false} />
          </div>
        )}
      </div>
    </div>
  );
}

interface FeedbackToastProps {
  message: FeedbackMessage;
  onDismiss?: () => void;
  className?: string;
}

export function FeedbackToast({ message, onDismiss, className }: FeedbackToastProps) {
  const getIcon = () => {
    switch (message.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Clock className="w-5 h-5 text-blue-600" />;
    }
  };

  const getBackgroundColor = () => {
    switch (message.type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className={cn(
      'p-4 rounded-lg border flex items-start space-x-3',
      getBackgroundColor(),
      className
    )}>
      {getIcon()}
      <div className="flex-1">
        <div className="font-medium text-sm">{message.title}</div>
        <div className="text-sm text-muted-foreground mt-1">{message.message}</div>
        {message.action && (
          <button
            onClick={message.action.onClick}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            {message.action.label}
          </button>
        )}
      </div>
      {message.dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      )}
    </div>
  );
}

interface MultiAgentStatusProps {
  agents: Array<{
    id: 'pm' | 'de' | 'ds' | 'ba';
    activity: string;
    status: 'idle' | 'working' | 'complete' | 'error';
    progress?: number;
  }>;
  overallStatus: 'idle' | 'working' | 'complete' | 'error';
  className?: string;
}

export function MultiAgentStatus({ agents, overallStatus, className }: MultiAgentStatusProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center space-x-2">
        <div className="text-sm font-medium">Agent Coordination</div>
        {overallStatus === 'working' && (
          <LoadingSpinner size="sm" />
        )}
        {overallStatus === 'complete' && (
          <CheckCircle className="w-4 h-4 text-green-500" />
        )}
        {overallStatus === 'error' && (
          <AlertCircle className="w-4 h-4 text-red-500" />
        )}
      </div>
      
      <div className="space-y-2">
        {agents.map((agent) => (
          <AgentActivity
            key={agent.id}
            agent={agent.id}
            activity={agent.activity}
            status={agent.status}
            progress={agent.progress}
          />
        ))}
      </div>
    </div>
  );
}

interface PerformanceIndicatorProps {
  operation: string;
  duration: number;
  threshold: number;
  className?: string;
}

export function PerformanceIndicator({ 
  operation, 
  duration, 
  threshold, 
  className 
}: PerformanceIndicatorProps) {
  const isSlow = duration > threshold;
  const percentage = Math.min(100, (duration / threshold) * 100);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{operation}</span>
        <span className={cn(
          'font-medium',
          isSlow ? 'text-red-600' : 'text-green-600'
        )}>
          {duration}ms
        </span>
      </div>
      <div className="w-full bg-muted rounded-full h-1">
        <div 
          className={cn(
            'h-1 rounded-full transition-all duration-300',
            isSlow ? 'bg-red-500' : 'bg-green-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isSlow && (
        <div className="text-xs text-red-600">
          ⚠️ Exceeds threshold ({threshold}ms)
        </div>
      )}
    </div>
  );
}
