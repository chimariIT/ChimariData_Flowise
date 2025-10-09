import React, { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Loading fallback component
const LoadingFallback = ({ message = "Loading..." }: { message?: string }) => (
  <div className="flex items-center justify-center p-8">
    <div className="text-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  </div>
);

// Lazy load heavy components
export const LazyAIInsightsPanel = lazy(() => import('./ai-insights-panel'));
export const LazyAIChat = lazy(() => import('./ai-chat'));
export const LazyAdvancedAnalysisModal = lazy(() => import('./advanced-analysis-modal'));
export const LazyVisualizationWorkshop = lazy(() => import('./visualization-workshop'));
export const LazyDescriptiveStats = lazy(() => import('./descriptive-stats'));
export const LazyTimeSeriesAnalysis = lazy(() => import('./time-series-analysis'));
export const LazyDataTransformation = lazy(() => import('./data-transformation'));
export const LazySchemaAnalysis = lazy(() => import('./SchemaAnalysis'));

// Wrapped lazy components with Suspense
export const AIInsightsPanelLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading AI insights..." />}>
    <LazyAIInsightsPanel {...props} />
  </Suspense>
);

export const AIChatLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading AI chat..." />}>
    <LazyAIChat {...props} />
  </Suspense>
);

export const AdvancedAnalysisModalLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading analysis tools..." />}>
    <LazyAdvancedAnalysisModal {...props} />
  </Suspense>
);

export const VisualizationWorkshopLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading visualization tools..." />}>
    <LazyVisualizationWorkshop {...props} />
  </Suspense>
);

export const DescriptiveStatsLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading statistical analysis..." />}>
    <LazyDescriptiveStats {...props} />
  </Suspense>
);

export const TimeSeriesAnalysisLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading time series analysis..." />}>
    <LazyTimeSeriesAnalysis {...props} />
  </Suspense>
);

export const DataTransformationLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading data transformation..." />}>
    <LazyDataTransformation {...props} />
  </Suspense>
);

export const SchemaAnalysisLazy = (props: any) => (
  <Suspense fallback={<LoadingFallback message="Loading schema analysis..." />}>
    <LazySchemaAnalysis {...props} />
  </Suspense>
);

// Progressive loading component for results pages
export const ProgressiveResultsLoader = ({ 
  stages, 
  currentStage, 
  projectId 
}: { 
  stages: string[]; 
  currentStage: number; 
  projectId: string; 
}) => {
  const progress = ((currentStage + 1) / stages.length) * 100;
  
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Loading Analysis Results</h3>
          <p className="text-muted-foreground">Preparing your data insights...</p>
        </div>
        
        <div className="space-y-3">
          {stages.map((stage, index) => (
            <div 
              key={stage} 
              className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 ${
                index <= currentStage 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                index < currentStage 
                  ? 'bg-green-500 text-white' 
                  : index === currentStage 
                    ? 'bg-blue-500 text-white animate-pulse' 
                    : 'bg-gray-300 text-gray-500'
              }`}>
                {index < currentStage ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : index === currentStage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-xs font-semibold">{index + 1}</span>
                )}
              </div>
              <span className={`font-medium ${
                index <= currentStage ? 'text-green-800' : 'text-gray-500'
              }`}>
                {stage}
              </span>
            </div>
          ))}
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="text-center text-sm text-muted-foreground">
          {currentStage < stages.length - 1 
            ? `Step ${currentStage + 1} of ${stages.length}` 
            : 'Finalizing results...'}
        </div>
      </div>
    </div>
  );
};

// Optimized results display component
export const OptimizedResultsDisplay = ({ 
  projectId, 
  onStageComplete 
}: { 
  projectId: string; 
  onStageComplete: (stage: number) => void; 
}) => {
  const stages = [
    'Loading project data',
    'Preparing analysis components',
    'Generating visualizations',
    'Computing statistics',
    'Finalizing results'
  ];
  
  // Simulate progressive loading
  const [currentStage, setCurrentStage] = React.useState(0);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStage(prev => {
        const nextStage = prev + 1;
        if (nextStage < stages.length) {
          onStageComplete(nextStage);
          return nextStage;
        } else {
          clearInterval(interval);
          return prev;
        }
      });
    }, 1500); // 1.5 seconds per stage
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <ProgressiveResultsLoader 
      stages={stages}
      currentStage={currentStage}
      projectId={projectId}
    />
  );
};
