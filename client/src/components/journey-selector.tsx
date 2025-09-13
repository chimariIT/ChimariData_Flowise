import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Briefcase, 
  Settings,
  ArrowRight,
  Sparkles,
  BarChart3,
  Wrench,
  Brain,
  Target,
  TrendingUp,
  CheckCircle
} from "lucide-react";

interface JourneySelectorProps {
  user?: any;
  onJourneySelect: (journey: 'non-tech' | 'business' | 'technical' | 'consultation', config?: any, skipToast?: boolean) => void;
}

interface Journey {
  id: 'non-tech' | 'business' | 'technical' | 'consultation';
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string;
  features: string[];
  userType: string;
  workflow: string;
  buttonText: string;
  badge: string;
}

const JOURNEYS: Journey[] = [
  {
    id: 'non-tech',
    title: 'AI-Guided Journey',
    subtitle: 'Let AI do the heavy lifting',
    description: 'Perfect for users who want insights without technical complexity. Our AI agent orchestrates the entire analysis workflow.',
    icon: Sparkles,
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
    features: [
      'AI orchestrates entire workflow',
      'Natural language questions',
      'Automated analysis selection',
      'Plain English insights',
      'One-click visualizations'
    ],
    userType: 'Non-Technical User',
    workflow: 'AI Agent Orchestrated',
    buttonText: 'Start AI Journey',
    badge: 'Recommended for Beginners'
  },
  {
    id: 'business',
    title: 'Template-Based Analysis',
    subtitle: 'Business scenarios and guided workflows',
    description: 'Ideal for business users who need proven analytics templates and AI guidance for common business scenarios.',
    icon: Briefcase,
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    features: [
      'Pre-built business templates',
      'Guided analysis workflows',
      'Role-based scenarios',
      'AI-assisted interpretation',
      'Executive-ready reports'
    ],
    userType: 'Line of Business User',
    workflow: 'Template-Based + AI Guided',
    buttonText: 'Browse Templates',
    badge: 'Most Popular'
  },
  {
    id: 'technical',
    title: 'Self-Service Analytics',
    subtitle: 'Full control with expert guidance',
    description: 'For technical users who want complete control over their analysis with optional AI assistance and advanced features.',
    icon: Settings,
    color: 'bg-green-50 border-green-200 hover:bg-green-100',
    features: [
      'Full parameter control',
      'Advanced statistical tools',
      'Custom analysis pipelines',
      'Expert AI guidance on demand',
      'Raw data export options'
    ],
    userType: 'Technical User',
    workflow: 'Self-Service + Optional Guidance',
    buttonText: 'Access Full Platform',
    badge: 'Advanced Features'
  },
  {
    id: 'consultation',
    title: 'Expert Consultation',
    subtitle: 'Work with data science experts',
    description: 'Perfect for complex projects requiring expert guidance. Get 1-on-1 consultation with senior data scientists.',
    icon: Users,
    color: 'bg-orange-50 border-orange-200 hover:bg-orange-100',
    features: [
      'Video consultation with experts',
      'Custom analysis strategy',
      'Real-time collaboration',
      'Follow-up summary report',
      'Priority scheduling available'
    ],
    userType: 'Consultation Client',
    workflow: 'Expert-Led Consultation',
    buttonText: 'Book Consultation',
    badge: 'Expert Support'
  }
];

export function JourneySelector({ user, onJourneySelect }: JourneySelectorProps) {
  const [, setLocation] = useLocation();
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate journey preference from localStorage on mount
  useEffect(() => {
    if (hydratedRef.current) return; // Prevent repeated hydration

    const savedJourney = localStorage.getItem('selected_journey') as 'non-tech' | 'business' | 'technical' | 'consultation' | null;
    if (savedJourney && JOURNEYS.find(j => j.id === savedJourney)) {
      setSelectedJourney(savedJourney);
      hydratedRef.current = true;
      
      // Trigger the journey selection for routing (without toast) for all users
      const journey = JOURNEYS.find(j => j.id === savedJourney);
      if (journey) {
        onJourneySelect(savedJourney, {
          title: journey.title,
          workflow: journey.workflow,
          userType: journey.userType
        }, true); // skipToast = true for hydration
      }
    }
  }, [user, onJourneySelect]);

  const handleJourneySelect = (journey: Journey) => {
    setSelectedJourney(journey.id);
    
    // Always store journey preference in localStorage, regardless of auth status
    localStorage.setItem('selected_journey', journey.id);
    
    // Always call the parent handler to show workflow tabs for all users
    // Authentication gating happens at the feature level, not journey selection
    onJourneySelect(journey.id, {
      title: journey.title,
      workflow: journey.workflow,
      userType: journey.userType
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-block bg-blue-50 px-4 py-2 rounded-full mb-4">
          <span className="text-sm font-medium text-blue-700 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Choose Your Analytics Journey
          </span>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Three Ways to Unlock Your Data's Potential
        </h2>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto">
          Whether you're a data novice or expert, we have the perfect path for your analytics needs.
          Choose the journey that matches your experience and goals.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {JOURNEYS.map((journey) => {
          const IconComponent = journey.icon;
          const isSelected = selectedJourney === journey.id;

          return (
            <Card 
              key={journey.id}
              className={`relative transition-all duration-200 cursor-pointer ${journey.color} ${
                isSelected ? 'ring-2 ring-blue-500 scale-105' : ''
              }`}
              onClick={() => handleJourneySelect(journey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleJourneySelect(journey);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              data-testid={`journey-card-${journey.id}`}
            >
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center">
                    <IconComponent className="w-6 h-6 text-gray-700" />
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className="absolute top-4 right-4 text-xs"
                >
                  {journey.badge}
                </Badge>
                <CardTitle className="text-xl font-bold text-gray-900 mb-2">
                  {journey.title}
                </CardTitle>
                <CardDescription className="text-sm font-medium text-gray-600">
                  {journey.subtitle}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 leading-relaxed">
                  {journey.description}
                </p>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Users className="w-3 h-3" />
                    <span>{journey.userType}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <TrendingUp className="w-3 h-3" />
                    <span>{journey.workflow}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-800">Key Features:</h4>
                  <ul className="space-y-1">
                    {journey.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs text-gray-600">
                        <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button 
                  className="w-full mt-4 group"
                  variant={isSelected ? "default" : "outline"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJourneySelect(journey);
                  }}
                  data-testid={`button-${journey.id}`}
                >
                  {journey.buttonText}
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!user && (
        <div className={`text-center p-6 rounded-lg ${
          selectedJourney 
            ? 'bg-blue-50 border border-blue-200' 
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className={`w-5 h-5 ${
              selectedJourney ? 'text-blue-600' : 'text-yellow-600'
            }`} />
            <h3 className={`font-semibold ${
              selectedJourney ? 'text-blue-800' : 'text-yellow-800'
            }`}>
              {selectedJourney ? 'Great Choice! Ready to Begin?' : 'Ready to Get Started?'}
            </h3>
          </div>
          <p className={`text-sm mb-4 ${
            selectedJourney ? 'text-blue-700' : 'text-yellow-700'
          }`}>
            {selectedJourney 
              ? `You've selected the ${JOURNEYS.find(j => j.id === selectedJourney)?.title}. Sign up now to start your analytics journey!`
              : 'Sign up now to access your chosen analytics journey and start transforming your data into insights.'
            }
          </p>
          <div className="flex justify-center gap-3">
            <Button 
              onClick={() => setLocation('/auth/register')}
              className={`text-white ${
                selectedJourney 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-yellow-600 hover:bg-yellow-700'
              }`}
              data-testid="button-register"
            >
              Create Free Account
            </Button>
            <Button 
              variant="outline"
              onClick={() => setLocation('/auth/login')}
              data-testid="button-login"
            >
              Sign In
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}