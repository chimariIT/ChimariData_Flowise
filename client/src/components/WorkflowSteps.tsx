import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  Circle, 
  ArrowRight,
  HelpCircle,
  Upload,
  Shield,
  Database,
  BarChart3,
  FileCheck
} from "lucide-react";

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
}

interface WorkflowStepsProps {
  steps: WorkflowStep[];
  currentStepIndex: number;
  serviceType: string;
  onStepClick?: (stepId: string) => void;
}

const STEP_ICONS = {
  questions: HelpCircle,
  upload: Upload,
  scan: Shield,
  schema: Database,
  analysis: BarChart3,
  complete: FileCheck,
};

const STEP_COLORS = {
  questions: "bg-blue-500",
  upload: "bg-green-500",
  scan: "bg-yellow-500",
  schema: "bg-purple-500",
  analysis: "bg-orange-500",
  complete: "bg-emerald-500",
};

export function WorkflowSteps({ 
  steps, 
  currentStepIndex, 
  serviceType,
  onStepClick 
}: WorkflowStepsProps) {
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl">Service Workflow</CardTitle>
            <CardDescription>
              Complete these steps to process your data analysis
            </CardDescription>
          </div>
          <Badge variant="outline" className="capitalize">
            {serviceType.replace('_', ' ')}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Progress</span>
            <span>{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const IconComponent = STEP_ICONS[step.id] || Circle;
            const isActive = index === currentStepIndex;
            const isCompleted = step.completed;
            const isUpcoming = index > currentStepIndex;

            return (
              <div
                key={step.id}
                className={`flex items-start space-x-4 p-4 rounded-lg border transition-all cursor-pointer ${
                  isActive 
                    ? 'border-blue-300 bg-blue-50 shadow-sm' 
                    : isCompleted
                    ? 'border-green-300 bg-green-50'
                    : isUpcoming
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-200'
                }`}
                onClick={() => onStepClick?.(step.id)}
              >
                {/* Step Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  isCompleted 
                    ? 'bg-green-500 text-white'
                    : isActive
                    ? `${STEP_COLORS[step.id]} text-white`
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <IconComponent className="w-5 h-5" />
                  )}
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className={`font-semibold ${
                      isActive ? 'text-blue-900' : 
                      isCompleted ? 'text-green-900' : 
                      'text-slate-700'
                    }`}>
                      {step.title}
                    </h3>
                    {step.required && (
                      <Badge variant="secondary" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  <p className={`text-sm mt-1 ${
                    isActive ? 'text-blue-700' : 
                    isCompleted ? 'text-green-700' : 
                    'text-slate-500'
                  }`}>
                    {step.description}
                  </p>
                  
                  {/* Step Status */}
                  <div className="mt-2 flex items-center space-x-2">
                    {isCompleted && (
                      <Badge variant="outline" className="text-green-600 border-green-300">
                        ✓ Completed
                      </Badge>
                    )}
                    {isActive && (
                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                        In Progress
                      </Badge>
                    )}
                    {isUpcoming && (
                      <Badge variant="outline" className="text-slate-500 border-slate-300">
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Arrow for active step */}
                {isActive && (
                  <div className="flex-shrink-0">
                    <ArrowRight className="w-5 h-5 text-blue-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Service-specific notes */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <h4 className="font-medium text-slate-900 mb-2">
            {getServiceTitle(serviceType)} - What to Expect
          </h4>
          <div className="text-sm text-slate-600 space-y-1">
            {getServiceExpectations(serviceType).map((expectation, index) => (
              <div key={index} className="flex items-start space-x-2">
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0" />
                <span>{expectation}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getServiceTitle(serviceType: string): string {
  switch (serviceType) {
    case 'pay_per_analysis':
      return 'Pay-per-Analysis Service';
    case 'expert_consulting':
      return 'Expert Consulting Service';
    case 'automated_analysis':
      return 'Automated Analysis Service';
    case 'enterprise':
      return 'Enterprise Service';
    default:
      return 'Data Analysis Service';
  }
}

function getServiceExpectations(serviceType: string): string[] {
  switch (serviceType) {
    case 'pay_per_analysis':
      return [
        'One-time payment of $25+ based on complexity',
        'Analysis cost calculated based on data complexity',
        'Downloadable reports in multiple formats',
        'Basic to advanced analysis options available'
      ];
    case 'expert_consulting':
      return [
        'Professional consultation starting at $150',
        'Direct access to data science experts',
        'Custom analysis methodology',
        'Detailed recommendations and insights'
      ];
    case 'automated_analysis':
      return [
        'Subscription-based service with multiple tiers',
        'Automated insights and recommendations',
        'Regular analysis updates',
        'Advanced ML and AI capabilities'
      ];
    case 'enterprise':
      return [
        'Custom enterprise solutions',
        'Dedicated project management',
        'Advanced security and compliance',
        'Scalable infrastructure and support'
      ];
    default:
      return [
        'Professional data analysis service',
        'Secure data processing',
        'AI-powered insights',
        'Comprehensive reporting'
      ];
  }
}