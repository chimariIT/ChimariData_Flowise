import { useState, useEffect } from "react";
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
  Settings,
  DollarSign,
  FolderOpen,
  Receipt,
  MessageCircle,
  Lightbulb,
  Beaker,
  Eye
} from "lucide-react";
import PrepareStep from "@/pages/prepare-step";
import ProjectSetupStep from "@/pages/project-setup-step";
import DataStep from "@/pages/data-step";
import DataVerificationStep from "@/pages/data-verification-step";
import ExecuteStep from "@/pages/execute-step";
import ResultsPreviewStep from "@/pages/results-preview-step";
import PricingStep from "@/pages/pricing-step";
import ResultsStep from "@/pages/results-step";

interface JourneyStep {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: any;
  completed: boolean;
}

interface JourneyWizardProps {
  journeyType: string;
  currentStage: string;
}

export function JourneyWizard({ journeyType, currentStage }: JourneyWizardProps) {
  const [, setLocation] = useLocation();
  
  const steps: JourneyStep[] = [
    {
      id: 'prepare',
      title: 'Analysis Preparation',
      description: 'Define goals and analysis questions with AI assistance',
      route: `/journeys/${journeyType}/prepare`,
      icon: Target,
      completed: false
    },
    {
      id: 'project-setup',
      title: 'Project Setup',
      description: 'Create project and confirm analysis approach',
      route: `/journeys/${journeyType}/project-setup`,
      icon: FolderOpen,
      completed: false
    },
    {
      id: 'data',
      title: 'Data Upload', 
      description: 'Upload your data files',
      route: `/journeys/${journeyType}/data`,
      icon: Database,
      completed: false
    },
    {
      id: 'data-verification',
      title: 'Data Verification',
      description: 'Review data quality, schema, and privacy',
      route: `/journeys/${journeyType}/data-verification`,
      icon: CheckCircle,
      completed: false
    },
    {
      id: 'execute',
      title: 'Analysis Configuration',
      description: 'Configure analysis parameters and execute',
      route: `/journeys/${journeyType}/execute`,
      icon: BarChart3,
      completed: false
    },
    {
      id: 'preview',
      title: 'Preview Results',
      description: 'See what you will get before payment',
      route: `/journeys/${journeyType}/preview`,
      icon: Eye,
      completed: false
    },
    {
      id: 'pricing',
      title: 'Pricing & Payment',
      description: 'Review costs and complete payment',
      route: `/journeys/${journeyType}/pricing`,
      icon: DollarSign,
      completed: false
    },
    {
      id: 'results',
      title: 'Results & Artifacts',
      description: 'View insights and download artifacts',
      route: `/journeys/${journeyType}/results`,
      icon: Receipt,
      completed: false
    }
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStage);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

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
    if (currentStepIndex < steps.length - 1) {
      const nextStep = steps[currentStepIndex + 1];
      setLocation(nextStep.route);
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      const prevStep = steps[currentStepIndex - 1];
      setLocation(prevStep.route);
    }
  };

  const handleBackToJourneys = () => {
    setLocation('/');
  };

  return (
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
                {currentStage === 'prepare' && 'Define your analysis goals and requirements without worrying about costs'}
                {currentStage === 'project-setup' && 'Create your project and confirm the analysis approach'}
                {currentStage === 'data' && 'Upload your data files to the platform'}
                {currentStage === 'data-verification' && 'Review data quality, schema, and privacy before analysis'}
                {currentStage === 'execute' && 'Configure analysis parameters and run the analysis'}
                {currentStage === 'preview' && 'Preview what you will get before proceeding to payment'}
                {currentStage === 'pricing' && 'Review final costs based on your completed analysis requirements'}
                {currentStage === 'results' && 'View your results and download artifacts'}
              </p>
            </div>
          </div>

          {/* Steps Navigation */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:flex lg:items-center gap-2 lg:gap-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = step.id === currentStage;
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
                    className={`flex items-center p-2 lg:p-3 rounded-lg border-2 transition-all w-full text-left ${
                      isActive
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
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        isCompleted
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
                        <h3 className={`font-medium text-sm truncate ${
                          isActive ? 'text-blue-900' : isCompleted ? 'text-green-900' : 'text-gray-700'
                        }`}>
                          {step.title}
                        </h3>
                        <p className={`text-xs truncate ${
                          isActive ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-500'
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
        {currentStage === 'pricing' && (
          <div className="mb-6">
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-900">
                  <DollarSign className="w-5 h-5" />
                  Ready for Pricing
                </CardTitle>
                <CardDescription className="text-green-700">
                  All analysis requirements are now defined. Review the final pricing before proceeding.
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
        <div className="step-content">
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
                <PrepareStep journeyType={journeyType} />
                {/* Inline role hint under prepare */}
                {journeyType === 'business' && (
                  <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                    Tip: Selecting a template here will pre-configure KPIs and suggested dashboards.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {currentStage === 'project-setup' && (
            <Card data-testid="card-step-content">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  Project Setup & Requirements
                </CardTitle>
                <CardDescription>
                  Create project and confirm analysis approach based on your goals
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProjectSetupStep journeyType={journeyType} />
              </CardContent>
            </Card>
          )}
          
          {currentStage === 'data' && (
            <DataStep 
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
          
          {currentStage === 'execute' && (
            <ExecuteStep 
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          )}

          {currentStage === 'preview' && (
            <ResultsPreviewStep 
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
              renderAsContent={true}
            />
          )}

          {currentStage === 'pricing' && (
            <PricingStep 
              journeyType={journeyType}
              onNext={handleNext}
              onPrevious={handlePrevious}
            />
          )}

          {currentStage === 'results' && (
            <ResultsStep 
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
            disabled={currentStepIndex === 0}
            data-testid="button-previous-step"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <div className="flex items-center space-x-2">
            {steps.map((_, index) => (
              <Circle
                key={index}
                className={`w-2 h-2 ${
                  index <= currentStepIndex ? 'text-blue-500 fill-current' : 'text-gray-300'
                }`}
              />
            ))}
          </div>

          <Button
            onClick={handleNext}
            disabled={currentStepIndex === steps.length - 1}
            data-testid="button-next-step"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}