import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  RotateCcw,
  Sparkles, 
  Briefcase, 
  Settings,
  Users,
  Upload,
  BarChart3,
  Brain,
  FileText,
  CheckCircle,
  ArrowRight,
  Database,
  TrendingUp,
  Zap
} from "lucide-react";
import { Link } from "wouter";

interface DemoStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  duration: number;
  action?: string;
}

interface JourneyDemo {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badge: string;
  steps: DemoStep[];
  estimatedTime: string;
}

const JOURNEY_DEMOS: JourneyDemo[] = [
  {
    id: 'non-tech',
    title: 'AI-Guided Journey',
    subtitle: 'Complete automation for non-technical users',
    description: 'Watch how AI orchestrates the entire analytics workflow from start to finish.',
    icon: Sparkles,
    color: 'bg-purple-50 border-purple-200',
    badge: 'Beginner Friendly',
    estimatedTime: '5-10 minutes',
    steps: [
      {
        id: 'upload',
        title: 'Upload Your Data',
        description: 'Simply drag and drop your CSV, Excel, or JSON file',
        icon: Upload,
        duration: 2000,
        action: 'File uploaded successfully'
      },
      {
        id: 'ai-analyze',
        title: 'AI Analyzes Structure',
        description: 'Our AI automatically detects data types and patterns',
        icon: Brain,
        duration: 3000,
        action: 'Found 12 columns, 1,500 rows'
      },
      {
        id: 'suggest',
        title: 'AI Suggests Analysis',
        description: 'Receive smart recommendations based on your data',
        icon: Sparkles,
        duration: 2500,
        action: 'Suggested 4 analysis types'
      },
      {
        id: 'auto-process',
        title: 'Automated Processing',
        description: 'AI runs statistical analysis and creates visualizations',
        icon: BarChart3,
        duration: 4000,
        action: 'Generated 6 insights'
      },
      {
        id: 'results',
        title: 'Plain English Results',
        description: 'Get insights explained in simple, actionable language',
        icon: FileText,
        duration: 2000,
        action: 'Analysis complete!'
      }
    ]
  },
  {
    id: 'business',
    title: 'Template-Based Analysis',
    subtitle: 'Business scenarios and guided workflows',
    description: 'See how business templates streamline common analytics tasks.',
    icon: Briefcase,
    color: 'bg-blue-50 border-blue-200',
    badge: 'Most Popular',
    estimatedTime: '10-15 minutes',
    steps: [
      {
        id: 'upload',
        title: 'Upload Data',
        description: 'Upload your business data file',
        icon: Upload,
        duration: 2000,
        action: 'Data uploaded'
      },
      {
        id: 'template-select',
        title: 'Choose Template',
        description: 'Select from sales, marketing, HR, or financial templates',
        icon: Briefcase,
        duration: 3000,
        action: 'Sales Performance template selected'
      },
      {
        id: 'configure',
        title: 'Configure Analysis',
        description: 'Map your data fields to template requirements',
        icon: Settings,
        duration: 2500,
        action: 'Fields mapped successfully'
      },
      {
        id: 'guided-analysis',
        title: 'Guided Analysis',
        description: 'Follow step-by-step business-focused analysis',
        icon: TrendingUp,
        duration: 4000,
        action: 'Generated KPI dashboard'
      },
      {
        id: 'report',
        title: 'Executive Report',
        description: 'Get presentation-ready business insights',
        icon: FileText,
        duration: 2000,
        action: 'Report generated!'
      }
    ]
  },
  {
    id: 'technical',
    title: 'Self-Service Analytics',
    subtitle: 'Full control with expert AI guidance',
    description: 'Explore advanced features for technical users who want complete control.',
    icon: Settings,
    color: 'bg-green-50 border-green-200',
    badge: 'Advanced Features',
    estimatedTime: '15-30 minutes',
    steps: [
      {
        id: 'upload',
        title: 'Data Import',
        description: 'Import from multiple sources: files, databases, APIs',
        icon: Database,
        duration: 2000,
        action: 'Connected to PostgreSQL'
      },
      {
        id: 'transform',
        title: 'Data Transformation',
        description: 'Clean, filter, and reshape data with Python tools',
        icon: Zap,
        duration: 3500,
        action: 'Applied 5 transformations'
      },
      {
        id: 'custom-analysis',
        title: 'Custom Analysis',
        description: 'Choose from 20+ statistical methods and ML algorithms',
        icon: Settings,
        duration: 4000,
        action: 'Running ANOVA analysis'
      },
      {
        id: 'advanced-viz',
        title: 'Advanced Visualizations',
        description: 'Create interactive charts with full customization',
        icon: BarChart3,
        duration: 3000,
        action: 'Created heatmap visualization'
      },
      {
        id: 'ai-insights',
        title: 'AI Expert Guidance',
        description: 'Get expert-level interpretation of your results',
        icon: Brain,
        duration: 2500,
        action: 'AI insights generated'
      }
    ]
  }
];

export default function DemosPage() {
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);

  const currentDemo = selectedDemo ? JOURNEY_DEMOS.find(d => d.id === selectedDemo) : null;

  // Auto-advance demo steps
  useEffect(() => {
    if (!isPlaying || !currentDemo) return;

    const currentStepData = currentDemo.steps[currentStep];
    if (!currentStepData) return;

    const interval = setInterval(() => {
      setStepProgress(prev => {
        if (prev >= 100) {
          // Move to next step
          if (currentStep < currentDemo.steps.length - 1) {
            setCurrentStep(prev => prev + 1);
            setProgress(((currentStep + 1) / currentDemo.steps.length) * 100);
            return 0;
          } else {
            // Demo complete
            setIsPlaying(false);
            return 100;
          }
        }
        return prev + (100 / (currentStepData.duration / 50));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, currentStep, currentDemo]);

  const resetDemo = () => {
    setCurrentStep(0);
    setProgress(0);
    setStepProgress(0);
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  if (selectedDemo && currentDemo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Button 
              variant="outline" 
              onClick={() => setSelectedDemo(null)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Demos
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <currentDemo.icon className="w-8 h-8 text-primary" />
                {currentDemo.title}
              </h1>
              <p className="text-gray-600 mt-1">{currentDemo.subtitle}</p>
            </div>
            <Badge variant="secondary">{currentDemo.badge}</Badge>
          </div>

          {/* Demo Player */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Live Demo</CardTitle>
                  <CardDescription>
                    Estimated time: {currentDemo.estimatedTime}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={resetDemo}
                    variant="outline" 
                    size="sm"
                    data-testid="button-reset-demo"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button 
                    onClick={togglePlayPause}
                    className="flex items-center gap-2"
                    data-testid="button-play-pause-demo"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Overall progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>

              {/* Current step display */}
              <div className="bg-white rounded-lg p-6 border-2 border-primary/20">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    {React.createElement(currentDemo.steps[currentStep].icon, {
                      className: "w-6 h-6 text-primary"
                    })}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Step {currentStep + 1}: {currentDemo.steps[currentStep].title}
                    </h3>
                    <p className="text-gray-600">
                      {currentDemo.steps[currentStep].description}
                    </p>
                  </div>
                </div>

                {/* Step progress */}
                <div className="space-y-2">
                  <Progress value={stepProgress} className="w-full" />
                  {currentDemo.steps[currentStep].action && stepProgress > 50 && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      {currentDemo.steps[currentStep].action}
                    </div>
                  )}
                </div>
              </div>

              {/* Step list */}
              <div className="space-y-2">
                {currentDemo.steps.map((step, index) => (
                  <div 
                    key={step.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      index === currentStep 
                        ? 'bg-primary/10 border border-primary/20' 
                        : index < currentStep 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      index < currentStep 
                        ? 'bg-green-500 text-white' 
                        : index === currentStep 
                          ? 'bg-primary text-white' 
                          : 'bg-gray-300 text-gray-600'
                    }`}>
                      {index < currentStep ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{step.title}</div>
                      <div className="text-sm text-gray-600">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Call to action */}
          <div className="text-center">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Ready to try {currentDemo.title}?
              </h3>
              <p className="text-gray-600 mb-4">
                Start your own analysis with this journey type
              </p>
              <Link href="/">
                <Button className="inline-flex items-center gap-2" data-testid="button-get-started">
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Demo selection page
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Interactive Demos
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See how each user journey works with live, interactive demonstrations. 
            Choose your path and watch the magic happen.
          </p>
        </div>

        {/* Demo cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {JOURNEY_DEMOS.map((demo) => (
            <Card 
              key={demo.id}
              className={`${demo.color} hover:shadow-xl transition-all duration-300 hover:scale-105 cursor-pointer`}
              onClick={() => setSelectedDemo(demo.id)}
              data-testid={`card-demo-${demo.id}`}
            >
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 bg-white/80 rounded-full flex items-center justify-center mx-auto mb-4">
                  <demo.icon className="w-8 h-8 text-primary" />
                </div>
                <Badge variant="secondary" className="mb-2 w-fit mx-auto">
                  {demo.badge}
                </Badge>
                <CardTitle className="text-xl text-gray-900">
                  {demo.title}
                </CardTitle>
                <CardDescription className="text-gray-700">
                  {demo.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 text-center">
                  {demo.description}
                </p>
                
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Demo Steps ({demo.steps.length})
                  </div>
                  {demo.steps.slice(0, 3).map((step, index) => (
                    <div key={step.id} className="flex items-center gap-2 text-sm">
                      <div className="w-5 h-5 bg-white/60 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium">{index + 1}</span>
                      </div>
                      <span className="text-gray-700">{step.title}</span>
                    </div>
                  ))}
                  {demo.steps.length > 3 && (
                    <div className="text-xs text-gray-500 ml-7">
                      +{demo.steps.length - 3} more steps
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-white/40">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Estimated time:</span>
                    <span className="font-medium text-gray-800">{demo.estimatedTime}</span>
                  </div>
                </div>

                <Button 
                  className="w-full bg-white/20 hover:bg-white/30 text-gray-800 border-white/30"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDemo(demo.id);
                  }}
                  data-testid={`button-watch-demo-${demo.id}`}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Watch Demo
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Back to home */}
        <div className="text-center">
          <Link href="/">
            <Button variant="outline" className="inline-flex items-center gap-2" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}