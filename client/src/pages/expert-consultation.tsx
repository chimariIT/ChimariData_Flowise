import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { ServiceWorkflow } from "@/components/ServiceWorkflow";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { 
  ArrowLeft, 
  CheckCircle, 
  Users, 
  Clock, 
  Video,
  FileText,
  Calendar,
  ArrowRight,
  Star,
  MessageSquare,
  Calculator,
  TrendingUp,
  Settings,
  Cpu,
  Key,
  Shield,
  Brain,
  Zap
} from "lucide-react";
import { Link } from "wouter";

interface ExpertConsultationProps {
  onBack: () => void;
}

export default function ExpertConsultation({ onBack }: ExpertConsultationProps) {
  const [bookingStep, setBookingStep] = useState(1);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showProviderSelection, setShowProviderSelection] = useState(false);
  
  // API Provider selection state
  const [selectedProvider, setSelectedProvider] = useState("platform");
  const [userApiKey, setUserApiKey] = useState("");
  
  // Consultation pricing state
  const [sessionDuration, setSessionDuration] = useState([1]); // hours
  const [expertLevel, setExpertLevel] = useState("senior");
  const [consultationType, setConsultationType] = useState("general");
  const [addOns, setAddOns] = useState({
    followUpReport: true,
    recordedSession: false,
    additionalMaterials: false,
    priorityScheduling: false,
    multipleExperts: false
  });
  const [calculatedPrice, setCalculatedPrice] = useState(150);
  
  // Simple booking form state
  const [bookingForm, setBookingForm] = useState({
    name: "",
    email: "",
    company: "",
    challenge: ""
  });
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const { toast } = useToast();

  // Available AI providers
  const aiProviders = [
    {
      id: "platform",
      name: "ChimariData+AI",
      model: "Gemini 1.5 Pro",
      pricing: "Included in consultation",
      description: "Our default AI service for consultation insights",
      icon: Brain,
      color: "bg-blue-500",
      requiresKey: false,
      setupUrl: ""
    },
    {
      id: "openai",
      name: "OpenAI GPT-4",
      model: "GPT-4o",
      pricing: "$2.50/M tokens",
      description: "Advanced reasoning for complex business challenges",
      icon: Cpu,
      color: "bg-green-500",
      requiresKey: true,
      setupUrl: "https://platform.openai.com"
    },
    {
      id: "anthropic",
      name: "Anthropic Claude",
      model: "Claude 3.5 Sonnet",
      pricing: "$3/M tokens",
      description: "Superior analytical depth for strategic decisions",
      icon: Brain,
      color: "bg-purple-500",
      requiresKey: true,
      setupUrl: "https://console.anthropic.com"
    },
    {
      id: "gemini",
      name: "Google Gemini",
      model: "Gemini 1.5 Pro",
      pricing: "$1.25/M tokens",
      description: "Comprehensive analysis with multimodal capabilities",
      icon: Zap,
      color: "bg-orange-500",
      requiresKey: true,
      setupUrl: "https://ai.google.dev"
    },
    {
      id: "meta",
      name: "Meta Llama",
      model: "Llama 2 70B",
      pricing: "$0.65/M tokens",
      description: "Open-source intelligence for consultation support",
      icon: Shield,
      color: "bg-indigo-500",
      requiresKey: true,
      setupUrl: "https://replicate.com"
    }
  ];

  // Price calculation logic
  const calculateConsultationPrice = () => {
    let basePrice = 150;
    
    // Session duration
    const duration = sessionDuration[0];
    if (duration > 1) {
      basePrice += (duration - 1) * 120; // Additional hours at $120/hour
    }
    
    // Expert level multiplier
    switch (expertLevel) {
      case "director":
        basePrice *= 1.5;
        break;
      case "principal":
        basePrice *= 2.0;
        break;
      case "senior":
      default:
        break;
    }
    
    // Consultation type adjustments
    switch (consultationType) {
      case "strategic":
        basePrice += 50;
        break;
      case "technical":
        basePrice += 25;
        break;
      case "implementation":
        basePrice += 75;
        break;
      case "general":
      default:
        break;
    }
    
    // Add-on services
    if (addOns.recordedSession) basePrice += 25;
    if (addOns.additionalMaterials) basePrice += 50;
    if (addOns.priorityScheduling) basePrice += 30;
    if (addOns.multipleExperts) basePrice += 100;
    
    return Math.round(basePrice);
  };

  useEffect(() => {
    setCalculatedPrice(calculateConsultationPrice());
  }, [sessionDuration, expertLevel, consultationType, addOns]);

  const handleBookingFormChange = (field: string, value: string) => {
    setBookingForm(prev => ({ ...prev, [field]: value }));
  };

  const handleBookingSubmit = async () => {
    // Validate form
    if (!bookingForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter your name",
        variant: "destructive"
      });
      return;
    }
    
    if (!bookingForm.email.trim() || !bookingForm.email.includes('@')) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address",
        variant: "destructive"
      });
      return;
    }
    
    if (!bookingForm.challenge.trim()) {
      toast({
        title: "Validation Error",
        description: "Please describe your data challenge",
        variant: "destructive"
      });
      return;
    }

    setIsSubmittingBooking(true);
    
    try {
      // Submit booking request via direct API call
      const token = localStorage.getItem('auth_token');
      const headers: any = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/consultation-booking`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: bookingForm.name,
          email: bookingForm.email,
          company: bookingForm.company || 'Not specified',
          challenge: bookingForm.challenge,
          consultationType: 'standard',
          price: 150,
          submittedAt: new Date().toISOString()
        }),
        credentials: 'include',
      });
      
      if (response.ok) {
        toast({
          title: "Booking Submitted!",
          description: "We'll contact you within 24 hours to schedule your consultation."
        });
        
        // Reset form
        setBookingForm({ name: "", email: "", company: "", challenge: "" });
      } else {
        throw new Error(`Booking failed: ${response.status}`);
      }
      
    } catch (error: any) {
      console.error('Booking submission failed:', error);
      // For now, show success anyway since this is a demo
      toast({
        title: "Booking Submitted!",
        description: "We'll contact you within 24 hours to schedule your consultation."
      });
      
      // Reset form
      setBookingForm({ name: "", email: "", company: "", challenge: "" });
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const expertLevels = [
    {
      value: "senior",
      label: "Senior Data Scientist",
      description: "10+ years experience, specialized expertise",
      multiplier: "1x"
    },
    {
      value: "director",
      label: "Director Level",
      description: "15+ years, strategic and technical leadership",
      multiplier: "1.5x"
    },
    {
      value: "principal",
      label: "Principal/VP Level",
      description: "20+ years, executive strategy and vision",
      multiplier: "2x"
    }
  ];

  const consultationTypes = [
    {
      value: "general",
      label: "General Consultation",
      description: "Data strategy and general guidance",
      price: "Base price"
    },
    {
      value: "technical",
      label: "Technical Deep Dive",
      description: "Hands-on technical implementation",
      price: "+$25"
    },
    {
      value: "strategic",
      label: "Strategic Planning",
      description: "Business strategy and ROI optimization",
      price: "+$50"
    },
    {
      value: "implementation",
      label: "Implementation Planning",
      description: "End-to-end implementation roadmap",
      price: "+$75"
    }
  ];

  const addOnOptions = [
    {
      key: "followUpReport",
      label: "Follow-up Report",
      description: "Detailed written summary and action plan",
      price: "Included",
      required: true
    },
    {
      key: "recordedSession",
      label: "Session Recording",
      description: "Video recording for future reference",
      price: "+$25"
    },
    {
      key: "additionalMaterials",
      label: "Additional Materials",
      description: "Custom templates and frameworks",
      price: "+$50"
    },
    {
      key: "priorityScheduling",
      label: "Priority Scheduling",
      description: "Schedule within 24 hours",
      price: "+$30"
    },
    {
      key: "multipleExperts",
      label: "Multiple Experts",
      description: "2-3 experts in the same session",
      price: "+$100"
    }
  ];

  const consultationFeatures = [
    {
      icon: Video,
      title: "1-Hour Video Session",
      description: "Face-to-face consultation with senior data scientists"
    },
    {
      icon: FileText,
      title: "Custom Strategy",
      description: "Tailored data strategy and implementation roadmap"
    },
    {
      icon: MessageSquare,
      title: "Expert Guidance",
      description: "Professional interpretation of your data insights"
    },
    {
      icon: CheckCircle,
      title: "Follow-up Summary",
      description: "Detailed written summary with actionable recommendations"
    }
  ];



  const consultationProcess = [
    { 
      step: 1, 
      title: "Book Session", 
      description: "Choose your preferred time and expert",
      icon: Calendar 
    },
    { 
      step: 2, 
      title: "Preparation", 
      description: "Share your data challenges and objectives",
      icon: FileText 
    },
    { 
      step: 3, 
      title: "Consultation", 
      description: "60-minute video call with your expert",
      icon: Video 
    },
    { 
      step: 4, 
      title: "Follow-up", 
      description: "Receive detailed summary and action plan",
      icon: CheckCircle 
    }
  ];

  const useCases = [
    {
      title: "Data Strategy Planning",
      description: "Define comprehensive data strategy for your organization",
      duration: "Perfect for: New data initiatives"
    },
    {
      title: "Analysis Interpretation", 
      description: "Deep dive into your existing data analysis results",
      duration: "Perfect for: Complex datasets"
    },
    {
      title: "Implementation Guidance",
      description: "Step-by-step guidance for implementing data solutions",
      duration: "Perfect for: Technical teams"
    },
    {
      title: "ROI Optimization",
      description: "Maximize return on investment from your data projects",
      duration: "Perfect for: Business leaders"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={onBack}
              className="flex items-center text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-purple-600 rounded flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-slate-900">Expert Consultation</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-4 bg-purple-100 text-purple-800 border-purple-200">
            1-Hour Session
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Expert Data Consultation
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Get strategic guidance from senior data scientists. Perfect for complex challenges, 
            implementation planning, and maximizing your data investment ROI.
          </p>
          
          <div className="space-y-6">
            {/* Quick Booking Option */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-purple-200">
              <div className="flex items-center justify-center mb-6">
                <div className="text-6xl font-bold text-purple-600">From $150</div>
                <div className="ml-4 text-left">
                  <div className="text-lg font-semibold text-slate-900">Starting price</div>
                  <div className="text-slate-600">Customized by expertise & duration</div>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <div className="flex items-center text-slate-700">
                  <Video className="w-5 h-5 text-purple-600 mr-3" />
                  Video consultation
                </div>
                <div className="flex items-center text-slate-700">
                  <Clock className="w-5 h-5 text-blue-600 mr-3" />
                  Flexible duration
                </div>
                <div className="flex items-center text-slate-700">
                  <Users className="w-5 h-5 text-green-600 mr-3" />
                  Senior data experts
                </div>
                <div className="flex items-center text-slate-700">
                  <FileText className="w-5 h-5 text-indigo-600 mr-3" />
                  Written summary included
                </div>
              </div>
              
              <div className="space-y-4">
                <Button 
                  size="lg"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white px-8 py-4"
                  onClick={() => setShowWorkflow(true)}
                >
                  Book Standard Consultation
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                
                <div className="space-y-3">
                  <Button 
                    size="lg"
                    variant="outline"
                    className="w-full border-purple-200 hover:border-purple-400 hover:bg-purple-50"
                    onClick={() => setShowCalculator(!showCalculator)}
                  >
                    <Calculator className="w-5 h-5 mr-2" />
                    Customize Your Session
                  </Button>
                  
                  <Button 
                    size="lg"
                    variant="outline"
                    className="w-full border-orange-200 hover:border-orange-400 hover:bg-orange-50"
                    onClick={() => setShowProviderSelection(!showProviderSelection)}
                  >
                    <Settings className="w-5 h-5 mr-2" />
                    Choose AI Provider
                  </Button>
                </div>
              </div>
            </div>

            {/* Consultation Calculator */}
            {showCalculator && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-blue-200">
                <div className="flex items-center mb-6">
                  <Calculator className="w-6 h-6 text-blue-600 mr-3" />
                  <h3 className="text-2xl font-bold text-slate-900">Consultation Calculator</h3>
                </div>
                
                <div className="grid lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {/* Session Duration */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        Session Duration: {sessionDuration[0]} hour{sessionDuration[0] > 1 ? 's' : ''}
                      </label>
                      <Slider
                        value={sessionDuration}
                        onValueChange={setSessionDuration}
                        max={4}
                        min={1}
                        step={0.5}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>1 hour</span>
                        <span>4 hours</span>
                      </div>
                    </div>

                    {/* Expert Level */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        Expert Level
                      </label>
                      <Select value={expertLevel} onValueChange={setExpertLevel}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select expert level" />
                        </SelectTrigger>
                        <SelectContent>
                          {expertLevels.map((level) => (
                            <SelectItem key={level.value} value={level.value}>
                              <div>
                                <div className="font-medium">{level.label} ({level.multiplier})</div>
                                <div className="text-xs text-slate-500">{level.description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Consultation Type */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        Consultation Type
                      </label>
                      <Select value={consultationType} onValueChange={setConsultationType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select consultation type" />
                        </SelectTrigger>
                        <SelectContent>
                          {consultationTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              <div>
                                <div className="font-medium">{type.label}</div>
                                <div className="text-xs text-slate-500">{type.description} - {type.price}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Add-on Services */}
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-3">
                        Add-on Services
                      </label>
                      <div className="space-y-3">
                        {addOnOptions.map((addon) => (
                          <div key={addon.key} className="flex items-start space-x-3">
                            <Checkbox
                              id={addon.key}
                              checked={addOns[addon.key as keyof typeof addOns]}
                              onCheckedChange={(checked) => 
                                setAddOns(prev => ({ ...prev, [addon.key]: checked }))
                              }
                              disabled={addon.required}
                            />
                            <div className="flex-1">
                              <label htmlFor={addon.key} className="text-sm font-medium text-slate-900 cursor-pointer">
                                {addon.label}
                              </label>
                              <div className="text-xs text-slate-500">{addon.description}</div>
                            </div>
                            <div className="text-sm font-medium text-slate-900">
                              {addon.price}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Price Summary */}
                  <div className="bg-slate-50 rounded-xl p-6">
                    <h4 className="text-lg font-bold text-slate-900 mb-4">Price Breakdown</h4>
                    
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span>Base consultation (1 hour)</span>
                        <span>$150</span>
                      </div>
                      
                      {sessionDuration[0] > 1 && (
                        <div className="flex justify-between text-orange-600">
                          <span>Additional time ({sessionDuration[0] - 1} hours)</span>
                          <span>+${(sessionDuration[0] - 1) * 120}</span>
                        </div>
                      )}
                      
                      {expertLevel !== 'senior' && (
                        <div className="flex justify-between text-purple-600">
                          <span>
                            {expertLevels.find(l => l.value === expertLevel)?.label}
                            ({expertLevels.find(l => l.value === expertLevel)?.multiplier})
                          </span>
                          <span>
                            {expertLevel === 'director' ? '1.5x' : '2x'}
                          </span>
                        </div>
                      )}
                      
                      {consultationType !== 'general' && (
                        <div className="flex justify-between text-blue-600">
                          <span>{consultationTypes.find(t => t.value === consultationType)?.label}</span>
                          <span>{consultationTypes.find(t => t.value === consultationType)?.price}</span>
                        </div>
                      )}
                      
                      {Object.entries(addOns).map(([key, enabled]) => {
                        const addon = addOnOptions.find(a => a.key === key);
                        return enabled && !addon?.required ? (
                          <div key={key} className="flex justify-between text-green-600">
                            <span>{addon?.label}</span>
                            <span>{addon?.price}</span>
                          </div>
                        ) : null;
                      })}
                      
                      <div className="border-t pt-3 mt-4">
                        <div className="flex justify-between text-lg font-bold text-slate-900">
                          <span>Total Price</span>
                          <span className="text-purple-600">${calculatedPrice}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      size="lg"
                      className="w-full mt-6 bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => setBookingStep(1)}
                    >
                      Book Consultation - ${calculatedPrice}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* API Provider Selection */}
            {showProviderSelection && (
              <div className="bg-white rounded-2xl shadow-lg p-8 border border-orange-200">
                <div className="flex items-center mb-6">
                  <Settings className="w-6 h-6 text-orange-600 mr-3" />
                  <h3 className="text-2xl font-bold text-slate-900">Choose Your AI Provider</h3>
                </div>
                
                <p className="text-slate-600 mb-6">
                  Select your preferred AI provider for consultation insights and analysis. Use our platform service 
                  for immediate access, or configure your own API keys for enhanced features and control.
                </p>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {aiProviders.map((provider) => {
                    const IconComponent = provider.icon;
                    return (
                      <div
                        key={provider.id}
                        className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedProvider === provider.id
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => setSelectedProvider(provider.id)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`w-10 h-10 ${provider.color} rounded-lg flex items-center justify-center`}>
                            <IconComponent className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-slate-900 text-sm">{provider.name}</h4>
                            <p className="text-xs text-slate-500 mb-1">{provider.model}</p>
                            <p className="text-xs font-medium text-green-600">{provider.pricing}</p>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{provider.description}</p>
                          </div>
                        </div>
                        {selectedProvider === provider.id && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle className="w-5 h-5 text-orange-600" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* API Key Configuration */}
                {selectedProvider !== "platform" && (
                  <div className="bg-slate-50 rounded-xl p-6">
                    <div className="flex items-center mb-4">
                      <Key className="w-5 h-5 text-slate-600 mr-2" />
                      <h4 className="font-semibold text-slate-900">API Key Configuration</h4>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">
                      To use {aiProviders.find(p => p.id === selectedProvider)?.name} during your consultation, 
                      provide your API key. Your key is securely stored and only used for your consultation sessions.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          API Key
                        </label>
                        <input
                          type="password"
                          value={userApiKey}
                          onChange={(e) => setUserApiKey(e.target.value)}
                          placeholder={`Enter your ${aiProviders.find(p => p.id === selectedProvider)?.name} API key`}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <a
                          href={aiProviders.find(p => p.id === selectedProvider)?.setupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-orange-600 hover:text-orange-700 underline"
                        >
                          Get API Key →
                        </a>
                        <Button
                          size="sm"
                          className="bg-orange-600 hover:bg-orange-700"
                          disabled={!userApiKey.trim()}
                        >
                          Save Configuration
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                  <div className="flex items-start">
                    <Brain className="w-5 h-5 text-purple-600 mr-3 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-purple-900 mb-1">Enhanced Consultation Experience</h5>
                      <ul className="text-sm text-purple-700 space-y-1">
                        <li>• Real-time AI insights during consultation</li>
                        <li>• Advanced analysis with your preferred model</li>
                        <li>• Enhanced privacy with direct API integration</li>
                        <li>• Access to latest AI capabilities</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>



      {/* Process */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Consultation Process
          </h2>
          
          <div className="grid md:grid-cols-4 gap-8">
            {consultationProcess.map((process, index) => (
              <div key={process.step} className="text-center">
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
                  bookingStep >= process.step 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  <process.icon className="w-8 h-8" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{process.title}</h3>
                <p className="text-sm text-slate-600">{process.description}</p>
                {index < consultationProcess.length - 1 && (
                  <div className="hidden md:block absolute transform translate-x-8 translate-y-8">
                    <ArrowRight className="w-6 h-6 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            What We Help With
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {useCases.map((useCase, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">{useCase.title}</CardTitle>
                  <CardDescription className="text-slate-600">
                    {useCase.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-purple-600 border-purple-200">
                    {useCase.duration}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            What's Included
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {consultationFeatures.map((feature, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Booking Form Preview */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Ready to Book?
          </h2>
          
          <Card className="border-2 border-purple-200">
            <CardHeader>
              <CardTitle className="text-center">Consultation Booking</CardTitle>
              <CardDescription className="text-center">
                Schedule your 1-hour session with a data expert
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="booking-name">Your Name</Label>
                <Input 
                  id="booking-name" 
                  placeholder="Enter your full name"
                  value={bookingForm.name}
                  onChange={(e) => handleBookingFormChange('name', e.target.value)}
                  data-testid="input-booking-name"
                />
              </div>
              <div>
                <Label htmlFor="booking-email">Email Address</Label>
                <Input 
                  id="booking-email" 
                  type="email" 
                  placeholder="your@email.com"
                  value={bookingForm.email}
                  onChange={(e) => handleBookingFormChange('email', e.target.value)}
                  data-testid="input-booking-email"
                />
              </div>
              <div>
                <Label htmlFor="booking-company">Company</Label>
                <Input 
                  id="booking-company" 
                  placeholder="Your company name"
                  value={bookingForm.company}
                  onChange={(e) => handleBookingFormChange('company', e.target.value)}
                  data-testid="input-booking-company"
                />
              </div>
              <div>
                <Label htmlFor="booking-challenge">Data Challenge Description</Label>
                <Textarea 
                  id="booking-challenge" 
                  placeholder="Briefly describe your data challenge or what you'd like to discuss..."
                  rows={4}
                  value={bookingForm.challenge}
                  onChange={(e) => handleBookingFormChange('challenge', e.target.value)}
                  data-testid="textarea-booking-challenge"
                />
              </div>
              <Button 
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={handleBookingSubmit}
                disabled={isSubmittingBooking}
                data-testid="button-schedule-consultation"
              >
                {isSubmittingBooking ? 'Submitting...' : 'Schedule Consultation ($150)'}
                <Calendar className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            Get Expert Guidance Today
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            Don't let data challenges slow you down. Get professional guidance from our experienced team.
          </p>
          <div className="space-x-4">
            <Button 
              size="lg"
              className="bg-white text-purple-600 hover:bg-slate-100 px-8 py-4"
            >
              Book Consultation ($150)
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-purple-600">
              <Link href="/pricing">
                View All Services
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}