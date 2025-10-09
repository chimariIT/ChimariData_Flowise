import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUserRole, UserRole, TechnicalLevel } from "@/hooks/useUserRole";
import {
  Users,
  Briefcase,
  Settings,
  MessageSquare,
  ArrowRight,
  Sparkles,
  BarChart3,
  Wrench,
  Brain,
  Target,
  TrendingUp,
  CheckCircle,
  ArrowLeft
} from "lucide-react";

interface UserTypeOption {
  id: UserRole;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  features: string[];
  idealFor: string[];
  examples: string[];
}

const USER_TYPE_OPTIONS: UserTypeOption[] = [
  {
    id: 'non-tech',
    title: 'Non-Technical User',
    subtitle: 'I want AI to guide me through data analysis',
    description: 'Perfect for users who want insights without technical complexity. Our AI handles the heavy lifting.',
    icon: Sparkles,
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
    features: [
      'AI-guided analysis workflow',
      'Natural language questions',
      'Automated chart selection',
      'Plain-English insights',
      'No coding required'
    ],
    idealFor: [
      'Business managers',
      'Marketing professionals',
      'Operations staff',
      'Students'
    ],
    examples: [
      'Analyzing sales data trends',
      'Understanding customer feedback',
      'Tracking KPI performance'
    ]
  },
  {
    id: 'business',
    title: 'Business User',
    subtitle: 'I need business-focused analysis templates',
    description: 'Streamlined workflows with pre-built templates for common business analysis scenarios.',
    icon: Briefcase,
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    features: [
      'Business intelligence templates',
      'KPI dashboards',
      'ROI analysis tools',
      'Executive reporting',
      'Industry benchmarks'
    ],
    idealFor: [
      'Business analysts',
      'Department heads',
      'Consultants',
      'C-suite executives'
    ],
    examples: [
      'Market research analysis',
      'Financial performance review',
      'Competitive analysis'
    ]
  },
  {
    id: 'technical',
    title: 'Technical User',
    subtitle: 'I want full control over analysis parameters',
    description: 'Advanced tools for users who understand data science and want granular control.',
    icon: Settings,
    color: 'bg-green-50 border-green-200 hover:bg-green-100',
    features: [
      'Advanced statistical methods',
      'Custom model parameters',
      'Code generation (Python/R)',
      'Raw data access',
      'API integrations'
    ],
    idealFor: [
      'Data scientists',
      'Research analysts',
      'Software developers',
      'Academic researchers'
    ],
    examples: [
      'Machine learning experiments',
      'Statistical hypothesis testing',
      'Custom algorithm development'
    ]
  },
  {
    id: 'consultation',
    title: 'Expert Consultation',
    subtitle: 'I need expert guidance for my analysis',
    description: 'Work directly with data science experts for complex projects requiring specialized knowledge.',
    icon: MessageSquare,
    color: 'bg-orange-50 border-orange-200 hover:bg-orange-100',
    features: [
      '1-on-1 expert sessions',
      'Custom analysis design',
      'Collaborative workspace',
      'Methodology guidance',
      'Results interpretation'
    ],
    idealFor: [
      'Complex research projects',
      'Strategic initiatives',
      'Regulatory compliance',
      'First-time data projects'
    ],
    examples: [
      'Clinical trial analysis',
      'Risk assessment modeling',
      'Predictive analytics strategy'
    ]
  }
];

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing',
  'Education', 'Marketing', 'Real Estate', 'Non-profit', 'Government',
  'Consulting', 'Research', 'Other'
];

const TECHNICAL_LEVELS = [
  { value: 'beginner', label: 'Beginner - New to data analysis' },
  { value: 'intermediate', label: 'Intermediate - Some experience with data' },
  { value: 'advanced', label: 'Advanced - Comfortable with statistics' },
  { value: 'expert', label: 'Expert - Data science professional' }
];

interface UserTypeOnboardingProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export function UserTypeOnboarding({ onComplete, onSkip }: UserTypeOnboardingProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { updateUserRole, userRoleData } = useUserRole();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedUserType, setSelectedUserType] = useState<UserRole | null>(null);
  const [technicalLevel, setTechnicalLevel] = useState<TechnicalLevel>('beginner');
  const [industry, setIndustry] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalSteps = 3;
  const progress = (currentStep / totalSteps) * 100;

  useEffect(() => {
    // If user already has a role configured, show current step
    if (userRoleData?.userRole && userRoleData.userRole !== 'non-tech') {
      setSelectedUserType(userRoleData.userRole);
      setTechnicalLevel(userRoleData.technicalLevel);
      setIndustry(userRoleData.industry || '');
    }
  }, [userRoleData]);

  const handleUserTypeSelect = (userType: UserRole) => {
    setSelectedUserType(userType);
    setCurrentStep(2);
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!selectedUserType) return;

    setIsSubmitting(true);
    try {
      await updateUserRole(selectedUserType, technicalLevel);

      // Update user industry if provided
      if (industry) {
        // API call to update industry - this would need to be implemented
        // await apiClient.post('/api/user/update-profile', { industry });
      }

      toast({
        title: "Setup Complete!",
        description: `Your account is now configured for ${selectedUserType} workflows.`,
      });

      onComplete();
    } catch (error) {
      toast({
        title: "Setup Failed",
        description: "There was an error setting up your account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      setLocation('/dashboard');
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Choose Your Analysis Style</h2>
        <p className="text-gray-600">
          Tell us how you prefer to work with data so we can customize your experience.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {USER_TYPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Card
              key={option.id}
              className={`cursor-pointer transition-all hover:shadow-md ${option.color} ${
                selectedUserType === option.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => handleUserTypeSelect(option.id)}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{option.title}</CardTitle>
                    <CardDescription className="text-sm">
                      {option.subtitle}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">{option.description}</p>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700">Key Features:</p>
                  <div className="flex flex-wrap gap-1">
                    {option.features.slice(0, 3).map((feature, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Tell Us About Your Experience</h2>
        <p className="text-gray-600">
          This helps us provide the right level of guidance and tools.
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-6">
        <div className="space-y-2">
          <Label htmlFor="technical-level">Technical Experience Level</Label>
          <Select value={technicalLevel} onValueChange={(value) => setTechnicalLevel(value as TechnicalLevel)}>
            <SelectTrigger>
              <SelectValue placeholder="Select your experience level" />
            </SelectTrigger>
            <SelectContent>
              {TECHNICAL_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry">Industry (Optional)</Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger>
              <SelectValue placeholder="Select your industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind.toLowerCase()}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button onClick={handleNext}>
          Next
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => {
    const selectedOption = USER_TYPE_OPTIONS.find(opt => opt.id === selectedUserType);

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Ready to Get Started!</h2>
          <p className="text-gray-600">
            Review your setup and start your data analysis journey.
          </p>
        </div>

        {selectedOption && (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <selectedOption.icon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle>{selectedOption.title}</CardTitle>
                  <CardDescription>
                    {TECHNICAL_LEVELS.find(l => l.value === technicalLevel)?.label}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">What you'll get:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {selectedOption.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                {industry && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Industry:</p>
                    <p className="text-sm text-gray-600 capitalize">{industry}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleComplete} disabled={isSubmitting}>
            {isSubmitting ? (
              "Setting up..."
            ) : (
              <>
                Complete Setup
                <CheckCircle className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Badge variant="outline">
              Step {currentStep} of {totalSteps}
            </Badge>
            {onSkip && (
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Skip for now
              </Button>
            )}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-8">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}