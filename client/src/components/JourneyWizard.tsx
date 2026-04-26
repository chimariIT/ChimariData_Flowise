import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft,
  ChevronRight,
  Target,
  Database,
  BarChart3,
  CheckCircle,
  Circle,
  DollarSign,
  Receipt,
  MessageCircle,
  Lightbulb,
  Beaker,
  RefreshCw,
  Loader2
} from "lucide-react";
import PrepareStep from "@/pages/prepare-step";
import DataUploadStep from "@/pages/data-upload-step";
import DataVerificationStep from "@/pages/data-verification-step";
import DataTransformationStep from "@/pages/data-transformation-step";
import PlanStep from "@/pages/plan-step";
import ExecuteStep from "@/pages/execute-step";
import PricingStep from "@/pages/pricing-step";
import DashboardStep from "@/pages/dashboard-step";
import { JourneyDataProvider } from "@/contexts/JourneyDataContext";

interface JourneyStep {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: any;
  completed: boolean;
  stageIds?: string[];
}

interface JourneyWizardProps {
  journeyType: string;
  currentStage: string;
}

export function JourneyWizard({ journeyType, currentStage }: JourneyWizardProps) {
  const [, setLocation] = useLocation();
  const [transitioning, setTransitioning] = useState(false);

  const isSimplifiedJourney = ['guided', 'non-tech', 'business'].includes(journeyType);

  const steps: JourneyStep[] = isSimplifiedJourney
    ? [
        {
          id: 'goals-data',
          title: 'Goals & Data',
          description: 'Set goals, upload files, confirm privacy fields',
          route: `/journeys/${journeyType}/data`,
          icon: Database,
          completed: false,
          stageIds: ['data', 'prepare', 'data-verification', 'data-transformation'],
        },
        {
          id: 'review-pay',
          title: 'Review & Pay',
          description: 'Review what we will answer and confirm payment',
          route: `/journeys/${journeyType}/pricing`,
          icon: DollarSign,
          completed: false,
          stageIds: ['plan', 'pricing', 'preview'],
        },
        {
          id: 'running-analysis',
          title: 'Running Analysis',
          description: 'We run your analysis and show progress',
          route: `/journeys/${journeyType}/execute`,
          icon: BarChart3,
          completed: false,
          stageIds: ['execute'],
        },
        {
          id: 'results',
          title: 'Results',
          description: 'View insights, Q&A, and downloads',
          route: `/journeys/${journeyType}/results`,
          icon: Receipt,
          completed: false,
          stageIds: ['results'],
        },
      ]
    : [
        {
          id: 'data',
          title: '1. Data Upload & Setup',
          description: 'Create project, upload files, review privacy fields, join datasets',
          route: `/journeys/${journeyType}/data`,
          icon: Database,
          completed: false,
        },
        {
          id: 'prepare',
          title: '2. Analysis Preparation',
          description: 'Define goals, questions, get analysis recommendations',
          route: `/journeys/${journeyType}/prepare`,
          icon: Target,
          completed: false,
        },
        {
          id: 'data-verification',
          title: '3. Data Verification',
          description: 'Map data elements to columns, confirm quality',
          route: `/journeys/${journeyType}/data-verification`,
          icon: CheckCircle,
          completed: false,
        },
        {
          id: 'data-transformation',
          title: '4. Data Transformation',
          description: 'Transform data for each planned analysis',
          route: `/journeys/${journeyType}/data-transformation`,
          icon: RefreshCw,
          completed: false,
        },
        {
          id: 'plan',
          title: '5. Analysis Plan',
          description: 'Review execution plan, expected artifacts, costs',
          route: `/journeys/${journeyType}/plan`,
          icon: Lightbulb,
          completed: false,
        },
        {
          id: 'execute',
          title: '6. Execution',
          description: 'Run analyses with approval checkpoints',
          route: `/journeys/${journeyType}/execute`,
          icon: BarChart3,
          completed: false,
        },
        {
          id: 'pricing',
          title: '7. Billing & Payment',
          description: 'Preview results, review costs, complete payment',
          route: `/journeys/${journeyType}/pricing`,
          icon: DollarSign,
          completed: false,
          stageIds: ['pricing', 'preview'],
        },
        {
          id: 'results',
          title: '8. Dashboard',
          description: 'View all results, artifacts, and exports',
          route: `/journeys/${journeyType}/results`,
          icon: Receipt,
          completed: false,
        },
      ];

  const isActiveStep = (step: JourneyStep) =>
    step.stageIds?.length ? step.stageIds.includes(currentStage) : step.id === currentStage;

  const matchedStepIndex = steps.findIndex((step) => isActiveStep(step));
  const currentStepIndex = matchedStepIndex >= 0 ? matchedStepIndex : 0;
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const canonicalStageSequence = ['data', 'prepare', 'data-verification', 'data-transformation', 'plan', 'execute', 'pricing', 'results'];
  const normalizedCurrentStage = currentStage === 'preview' ? 'pricing' : currentStage;
  const canonicalStageIndex = canonicalStageSequence.indexOf(normalizedCurrentStage);
  const activeStepId = steps[currentStepIndex]?.id;

  const currentFocusMessage = isSimplifiedJourney
    ? (() => {
        switch (activeStepId) {
          case 'goals-data':
            return 'Describe your goals, upload your data, and confirm privacy fields. Record link fields stay included automatically.';
          case 'review-pay':
            return 'Review what we will deliver, then confirm payment to start analysis.';
          case 'running-analysis':
            return 'Your AI data scientist is running the analysis now. Progress updates appear here automatically.';
          case 'results':
            return 'Review insights, ask follow-up questions, and download outputs for your team.';
          default:
            return 'Follow each step to complete your analysis.';
        }
      })()
    : (() => {
        switch (currentStage) {
          case 'data':
            return 'Create your project, upload files, review privacy fields, and approve joined dataset';
          case 'prepare':
            return 'Define your analysis goals and get AI-powered recommendations';
          case 'data-verification':
            return 'Map data elements to columns and confirm data quality';
          case 'data-transformation':
            return 'Transform data for each planned analysis';
          case 'plan':
            return 'Review the execution plan, expected artifacts, and cost estimates';
          case 'execute':
            return 'Run analyses with approval checkpoints at each step';
          case 'pricing':
          case 'preview':
            return 'Preview results, review final costs, and complete payment';
          case 'results':
            return 'View all results, artifacts, and export options';
          default:
            return 'Follow each step to complete your analysis.';
        }
      })();

  const getJourneyTypeTitle = (type: string) => {
    switch (type) {
      case 'guided':
      case 'non-tech': return 'Non-Technical Guided Journey';
      case 'business': return 'Business Templates Journey';
      case 'technical': return 'Technical Pro Journey';
      default: return 'Data Analysis Journey';
    }
  };

  const getJourneyTypeDescription = (type: string) => {
    switch (type) {
      case 'guided': return 'AI-assisted analysis for non-technical users with guided workflows';
      case 'business': return 'Pre-built templates for common business analytics scenarios';
      case 'technical': return 'Advanced analytics with full customization for data professionals';
      default: return 'Professional data analysis workflow';
    }
  };

  const handleStepNavigation = (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (step) {
      setLocation(step.route);
    }
  };

  const handleNext = () => {
    if (canonicalStageIndex >= 0 && canonicalStageIndex < canonicalStageSequence.length - 1) {
      setTransitioning(true);
      const nextStage = canonicalStageSequence[canonicalStageIndex + 1];
      setLocation(`/journeys/${journeyType}/${nextStage}`);
      setTimeout(() => setTransitioning(false), 300);
    }
  };

  const handlePrevious = () => {
    if (canonicalStageIndex > 0) {
      setTransitioning(true);
      const previousStage = canonicalStageSequence[canonicalStageIndex - 1];
      setLocation(`/journeys/${journeyType}/${previousStage}`);
      setTimeout(() => setTransitioning(false), 300);
    }
  };

  const handleBackToJourneys = () => {
    setLocation('/');
  };

  return (
    <JourneyDataProvider>
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={handleBackToJourneys}
              data-testid="button-back-to-journeys"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Journeys
            </Button>
            <Badge variant="secondary" data-testid="badge-journey-type">
              {journeyType.charAt(0).toUpperCase() + journeyType.slice(1)} Journey
            </Badge>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2" data-testid="text-journey-title">
              {getJourneyTypeTitle(journeyType)}
            </h1>
            <p className="text-gray-600" data-testid="text-journey-description">
              {getJourneyTypeDescription(journeyType)}
            </p>

            {/* Role-specific nudge */}
            {journeyType === 'non-tech' && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2" data-testid="nudge-nontech">
                <MessageCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                <p className="text-sm text-blue-700">
                  Prefer plain language? Use the chat prompts in each step—no jargon required. We’ll translate your goals into analysis.
                </p>
              </div>
            )}
            {journeyType === 'business' && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2" data-testid="nudge-business">
                <Lightbulb className="w-4 h-4 text-green-600 mt-0.5" />
                <p className="text-sm text-green-700">
                  Save time with templates. Pick one in Prepare or Project Setup to pre-load KPIs and recommended visuals.
                </p>
              </div>
            )}
            {journeyType === 'technical' && (
              <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-start gap-2" data-testid="nudge-technical">
                <Beaker className="w-4 h-4 text-purple-600 mt-0.5" />
                <p className="text-sm text-purple-700">
                  Need advanced methods? Jump to Execute to configure models, or export code from Results.
                </p>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <span className="text-sm text-gray-500">
                {Math.round(progress)}% Complete
              </span>
            </div>
            <Progress value={progress} className="h-2" data-testid="progress-journey" />
          </div>

          {/* Workflow Progress Info */}
          <div className="mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Current Focus</span>
              </div>
              <p className="text-sm text-blue-700">
                {currentFocusMessage}
              </p>
            </div>
          </div>

          {/* Steps Navigation */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:flex lg:items-center gap-2 lg:gap-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = isActiveStep(step);
              const isCompleted = index < currentStepIndex;
              const isAccessible = index <= currentStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-center ${index < steps.length - 1 ? 'lg:flex-1' : ''}`}
                >
                  <button
                    onClick={() => isAccessible && handleStepNavigation(step.id)}
                    disabled={!isAccessible}
                    className={`flex items-center p-2 lg:p-3 rounded-lg border-2 transition-all w-full text-left ${isActive
                      ? 'border-blue-500 bg-blue-50'
                      : isCompleted
                        ? 'border-green-500 bg-green-50 hover:bg-green-100'
                        : isAccessible
                          ? 'border-gray-300 bg-white hover:bg-gray-50'
                          : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                      }`}
                    data-testid={`button-step-${step.id}`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isCompleted
                        ? 'bg-green-500 text-white'
                        : isActive
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                        }`}>
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <h3 className={`font-medium text-sm truncate ${isActive ? 'text-blue-900' : isCompleted ? 'text-green-900' : 'text-gray-700'
                          }`}>
                          {step.title}
                        </h3>
                        <p className={`text-xs truncate ${isActive ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-500'
                          }`}>
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </button>
                  {index < steps.length - 1 && (
                    <div className="flex-1 h-px bg-gray-300 mx-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Step-specific information */}
        {(currentStage === 'pricing' || currentStage === 'preview') && (
          <div className="mb-6">
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-900">
                  <DollarSign className="w-5 h-5" />
                  Review & Pay
                </CardTitle>
                <CardDescription className="text-green-700">
                  Review readiness, pricing, and payment details before proceeding.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Role-specific quick links near Execute for technical users */}
        {journeyType === 'technical' && currentStage !== 'pricing' && (
          <div className="mb-6">
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <Beaker className="w-5 h-5" />
                  Advanced Methods & Tools
                </CardTitle>
                <CardDescription className="text-purple-700">
                  Explore statistical tests, ML pipelines, and code export in upcoming steps.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Render step-specific content based on currentStage */}
        <div className="step-content relative">
          {transitioning && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-lg">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          )}
          {currentStage === 'prepare' && (
            <Card data-testid="card-step-content">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Analysis Preparation
                </CardTitle>
                <CardDescription>
                  Define goals and analysis questions with AI assistance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PrepareStep
                  journeyType={journeyType}
                  onNext={handleNext}
                  onPrevious={handlePrevious}
                />
                {/* Inline role hint under prepare */}
                {journeyType === 'business' && (
                  <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                    Tip: Selecting a template here will pre-configure KPIs and suggested dashboards.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {currentStage === 'data' && (
            <DataUploadStep
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
              renderAsContent={true}
            />
          )}

          {currentStage === 'data-verification' && (
            <DataVerificationStep
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
              renderAsContent={true}
            />
          )}

          {currentStage === 'data-transformation' && (
            <DataTransformationStep
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          )}

          {currentStage === 'plan' && (
            <PlanStep
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
              renderAsContent={true}
            />
          )}

          {currentStage === 'execute' && (
            <ExecuteStep
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          )}

          {(currentStage === 'pricing' || currentStage === 'preview') && (
            <PricingStep
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          )}

          {currentStage === 'results' && (
            <DashboardStep
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          )}
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={canonicalStageIndex <= 0}
            data-testid="button-previous-step"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>

          <div className="flex items-center space-x-2">
            {steps.map((_, index) => (
              <Circle
                key={index}
                className={`w-2 h-2 ${index <= currentStepIndex ? 'text-blue-500 fill-current' : 'text-gray-300'
                  }`}
              />
            ))}
          </div>

          <Button
            onClick={handleNext}
            disabled={canonicalStageIndex < 0 || canonicalStageIndex === canonicalStageSequence.length - 1}
            data-testid="button-next-step"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
    </JourneyDataProvider>
  );
}
