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
  Circle
} from "lucide-react";

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
      id: 'data',
      title: 'Data Preparation', 
      description: 'Upload, validate, and transform your data',
      route: `/journeys/${journeyType}/data`,
      icon: Database,
      completed: false
    },
    {
      id: 'execute',
      title: 'Analysis Execution',
      description: 'Run analysis and generate insights with artifacts',
      route: `/journeys/${journeyType}/execute`,
      icon: BarChart3,
      completed: false
    }
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStage);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const getJourneyTypeTitle = (type: string) => {
    switch (type) {
      case 'guided': return 'Non-Technical Guided Journey';
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
    setLocation('/journeys');
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

          {/* Steps Navigation */}
          <div className="flex items-center space-x-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = step.id === currentStage;
              const isCompleted = index < currentStepIndex;
              const isAccessible = index <= currentStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
                >
                  <button
                    onClick={() => isAccessible && handleStepNavigation(step.id)}
                    disabled={!isAccessible}
                    className={`flex items-center p-3 rounded-lg border-2 transition-all min-w-0 ${
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
        <Card data-testid="card-step-content">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {(() => {
                const currentStep = steps[currentStepIndex];
                const Icon = currentStep?.icon;
                return (
                  <>
                    {Icon && <Icon className="w-5 h-5" />}
                    {currentStep?.title}
                  </>
                );
              })()}
            </CardTitle>
            <CardDescription>
              {steps[currentStepIndex]?.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Render step-specific content based on currentStage */}
            {currentStage === 'prepare' && (
              <div className="space-y-6" data-testid="content-prepare-step">
                <div className="text-center py-12">
                  <Target className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Analysis Preparation</h3>
                  <p className="text-gray-600 max-w-md mx-auto mb-6">
                    Define your analysis goals and questions with AI assistance. 
                    This step helps create a focused analysis plan tailored to your needs.
                  </p>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                    <h4 className="font-medium text-blue-900 mb-2">Coming Soon</h4>
                    <p className="text-blue-700 text-sm">
                      AI-assisted goal extraction, question formulation, and suggested analysis paths
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStage === 'data' && (
              <div className="space-y-6" data-testid="content-data-step">
                <div className="text-center py-12">
                  <Database className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Data Preparation</h3>
                  <p className="text-gray-600 max-w-md mx-auto mb-6">
                    Upload your data from multiple sources, validate data quality, 
                    and apply necessary transformations for analysis.
                  </p>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md mx-auto">
                    <h4 className="font-medium text-green-900 mb-2">Coming Soon</h4>
                    <p className="text-green-700 text-sm">
                      Enhanced upload interface, schema validation, and data transformation tools
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStage === 'execute' && (
              <div className="space-y-6" data-testid="content-execute-step">
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 text-purple-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Analysis Execution</h3>
                  <p className="text-gray-600 max-w-md mx-auto mb-6">
                    Execute your analysis plan with guided workflows, 
                    generate insights, and export results with professional artifacts.
                  </p>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 max-w-md mx-auto">
                    <h4 className="font-medium text-purple-900 mb-2">Coming Soon</h4>
                    <p className="text-purple-700 text-sm">
                      Step-by-step analysis execution, interactive results, and comprehensive export options
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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