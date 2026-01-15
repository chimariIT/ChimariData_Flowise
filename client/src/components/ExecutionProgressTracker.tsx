import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, Loader2, XCircle, Clock } from 'lucide-react';
import type { ExecutionStep, AnalysisExecutionState, StepOperation } from '@shared/progress-types';
import { webSocketManager } from '@/lib/websocket';

interface ExecutionProgressTrackerProps {
    executionState: AnalysisExecutionState;
    showOperations?: boolean;
    compact?: boolean;
    projectId?: string;
    onStateChange?: (newState: AnalysisExecutionState) => void;
}

export function ExecutionProgressTracker({
    executionState: initialState,
    showOperations = true,
    compact = false,
    projectId,
    onStateChange
}: ExecutionProgressTrackerProps) {
    const [executionState, setExecutionState] = useState<AnalysisExecutionState>(initialState);
    const [elapsedTime, setElapsedTime] = useState(0);

    // Sync with prop updates
    useEffect(() => {
        setExecutionState(initialState);
    }, [initialState]);

    // Real-time updates
    useEffect(() => {
        if (!projectId) return;

        const handleProgress = (event: any) => {
            if (event.sourceType === 'analysis' && event.projectId === projectId && event.data) {
                setExecutionState(prevState => {
                    const newState = { ...prevState, ...event.data };
                    onStateChange?.(newState);
                    return newState;
                });
            }
        };

        webSocketManager.connect();
        webSocketManager.subscribe(`project:${projectId}`);
        webSocketManager.on('progress', handleProgress);

        return () => {
            webSocketManager.off('progress', handleProgress);
            webSocketManager.unsubscribe(`project:${projectId}`);
        };
    }, [projectId, onStateChange]);

    useEffect(() => {
        if (executionState.status === 'running') {
            const interval = setInterval(() => {
                const start = new Date(executionState.startedAt).getTime();
                const now = Date.now();
                setElapsedTime(Math.floor((now - start) / 1000));
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [executionState.status, executionState.startedAt]);

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getStepIcon = (status: ExecutionStep['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-5 w-5 text-green-600" />;
            case 'running':
                return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
            case 'failed':
                return <XCircle className="h-5 w-5 text-red-600" />;
            case 'pending':
                return <Circle className="h-5 w-5 text-gray-400" />;
            case 'skipped':
                return <Circle className="h-5 w-5 text-gray-300" />;
        }
    };

    const getStatusBadge = (status: AnalysisExecutionState['status']) => {
        const variants = {
            idle: { label: 'Idle', className: 'bg-gray-100 text-gray-600' },
            initializing: { label: 'Initializing', className: 'bg-blue-100 text-blue-800' },
            running: { label: 'Running', className: 'bg-blue-100 text-blue-800' },
            completed: { label: 'Completed', className: 'bg-green-100 text-green-800' },
            failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
            cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800' }
        };

        const variant = variants[status];
        return <Badge className={variant.className}>{variant.label}</Badge>;
    };

    if (compact) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {getStatusBadge(executionState.status)}
                                <span className="text-sm font-medium">
                                    {executionState.currentStep.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Clock className="h-4 w-4" />
                                {formatTime(elapsedTime)}
                            </div>
                        </div>
                        <Progress value={executionState.overallProgress} className="h-2" />
                        {executionState.currentStep.description && (
                            <p className="text-sm text-gray-600">
                                {executionState.currentStep.description}
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            Analysis Execution
                            {getStatusBadge(executionState.status)}
                        </CardTitle>
                        <CardDescription>
                            {executionState.analysisTypes.join(', ')}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-gray-600">
                            <Clock className="h-4 w-4" />
                            <span>{formatTime(elapsedTime)}</span>
                        </div>
                        {executionState.estimatedCompletionAt && (
                            <div className="text-gray-600">
                                ETA: {new Date(executionState.estimatedCompletionAt).toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Overall Progress */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium">Overall Progress</span>
                        <span className="text-gray-600">{executionState.overallProgress}%</span>
                    </div>
                    <Progress value={executionState.overallProgress} className="h-3" />
                </div>

                {/* Steps */}
                <div className="space-y-4">
                    <h4 className="font-medium text-sm">Execution Steps</h4>
                    <div className="space-y-3">
                        {/* Completed Steps */}
                        {executionState.completedSteps.map((step) => (
                            <StepItem key={step.id} step={step} showOperations={showOperations} />
                        ))}

                        {/* Current Step */}
                        <StepItem
                            key={executionState.currentStep.id}
                            step={executionState.currentStep}
                            showOperations={showOperations}
                            isActive
                        />

                        {/* Pending Steps */}
                        {executionState.pendingSteps.map((step) => (
                            <StepItem key={step.id} step={step} showOperations={false} />
                        ))}
                    </div>
                </div>

                {/* Error Display */}
                {executionState.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start gap-2">
                            <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-900">Execution Error</p>
                                <p className="text-sm text-red-700 mt-1">{executionState.error}</p>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

interface StepItemProps {
    step: ExecutionStep;
    showOperations?: boolean;
    isActive?: boolean;
}

function StepItem({ step, showOperations = true, isActive = false }: StepItemProps) {
    const getOperationIcon = (status: StepOperation['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'running':
                return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-600" />;
            case 'pending':
                return <Circle className="h-4 w-4 text-gray-400" />;
        }
    };

    return (
        <div className={`border rounded-lg p-4 ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
            <div className="flex items-start gap-3">
                <div className="mt-0.5">
                    {getOperationIcon(step.status)}
                </div>
                <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                        <h5 className="font-medium">{step.name}</h5>
                        {step.status === 'running' && step.progress !== undefined && (
                            <span className="text-sm text-gray-600">{step.progress}%</span>
                        )}
                    </div>

                    {step.description && (
                        <p className="text-sm text-gray-600">{step.description}</p>
                    )}

                    {step.status === 'running' && step.progress !== undefined && (
                        <Progress value={step.progress} className="h-2" />
                    )}

                    {showOperations && step.operations && step.operations.length > 0 && (
                        <div className="mt-3 space-y-2">
                            {step.operations.map((op, index) => (
                                <div key={index} className="flex items-center gap-2 text-sm">
                                    {getOperationIcon(op.status)}
                                    <span className={op.status === 'completed' ? 'text-gray-600' : 'text-gray-900'}>
                                        {op.description}
                                    </span>
                                    {op.duration && (
                                        <span className="text-gray-500 text-xs ml-auto">
                                            {(op.duration / 1000).toFixed(1)}s
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {step.error && (
                        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                            {step.error}
                        </div>
                    )}

                    {step.completedAt && step.startedAt && (
                        <div className="text-xs text-gray-500 mt-2">
                            Completed in {((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000).toFixed(1)}s
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
