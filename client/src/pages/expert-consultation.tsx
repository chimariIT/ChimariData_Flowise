import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  Users, 
  CheckCircle, 
  ArrowRight,
  Calendar,
  Clock,
  Star,
  Zap,
  Target,
  TrendingUp,
  BarChart3
} from "lucide-react";

interface ExpertConsultationProps {
  onBack: () => void;
}

export default function ExpertConsultation({ onBack }: ExpertConsultationProps) {
  const [formData, setFormData] = useState({
    // Contact Information
    name: '',
    email: '',
    company: '',
    jobTitle: '',
    phone: '',
    
    // Project Details
    projectDescription: '',
    dataType: '',
    dataSources: [] as string[],
    dataVolume: '',
    currentChallenges: '',
    
    // AI Requirements
    analysisGoals: '',
    specificAINeeds: [] as string[],
    timeframe: '',
    budget: '',
    
    // Consultation Preferences
    consultationType: 'strategy',
    urgency: 'standard',
    preferredTime: '',
    additionalNotes: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const dataTypes = [
    'Sales & Revenue Data',
    'Customer Data & Analytics',
    'Marketing Campaign Data',
    'Financial & Accounting Data',
    'Operations & Supply Chain',
    'HR & Employee Data',
    'Product & Inventory Data',
    'Web & App Analytics',
    'IoT & Sensor Data',
    'Research & Survey Data',
    'Other'
  ];

  const aiNeeds = [
    'Predictive Analytics',
    'Customer Segmentation',
    'Anomaly Detection',
    'Natural Language Processing',
    'Computer Vision',
    'Recommendation Systems',
    'Fraud Detection',
    'Demand Forecasting',
    'Price Optimization',
    'Risk Assessment',
    'Automation & Process Mining',
    'Real-time Analytics'
  ];

  const consultationTypes = [
    { 
      id: 'strategy', 
      name: 'AI Strategy Consultation', 
      description: 'High-level AI roadmap and implementation strategy',
      duration: '90 minutes',
      price: '$299'
    },
    { 
      id: 'technical', 
      name: 'Technical Deep Dive', 
      description: 'Detailed technical assessment and solution design',
      duration: '2 hours',
      price: '$499'
    },
    { 
      id: 'implementation', 
      name: 'Implementation Planning', 
      description: 'Step-by-step implementation plan with timeline',
      duration: '3 hours',
      price: '$799'
    }
  ];

  const urgencyOptions = [
    { id: 'standard', name: 'Standard (5-7 days)', price: '+$0' },
    { id: 'priority', name: 'Priority (2-3 days)', price: '+$149' },
    { id: 'urgent', name: 'Urgent (24 hours)', price: '+$299' }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiSelectChange = (name: string, value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked 
        ? [...(prev[name as keyof typeof prev] as string[]), value]
        : (prev[name as keyof typeof prev] as string[]).filter(item => item !== value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.projectDescription) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Send consultation request via email
      const consultationData = {
        ...formData,
        submittedAt: new Date().toISOString(),
        consultationDetails: consultationTypes.find(c => c.id === formData.consultationType),
        urgencyDetails: urgencyOptions.find(u => u.id === formData.urgency)
      };

      // Create email content
      const emailBody = `
New Expert Consultation Request

CONTACT INFORMATION:
Name: ${formData.name}
Email: ${formData.email}
Company: ${formData.company}
Job Title: ${formData.jobTitle}
Phone: ${formData.phone}

PROJECT DETAILS:
Description: ${formData.projectDescription}
Data Type: ${formData.dataType}
Data Volume: ${formData.dataVolume}
Current Challenges: ${formData.currentChallenges}

AI REQUIREMENTS:
Analysis Goals: ${formData.analysisGoals}
Specific AI Needs: ${formData.specificAINeeds.join(', ')}
Timeframe: ${formData.timeframe}
Budget: ${formData.budget}

CONSULTATION PREFERENCES:
Type: ${consultationTypes.find(c => c.id === formData.consultationType)?.name}
Urgency: ${urgencyOptions.find(u => u.id === formData.urgency)?.name}
Preferred Time: ${formData.preferredTime}
Additional Notes: ${formData.additionalNotes}
      `.trim();

      // Open email client
      const mailto = `mailto:chimaridata@gmail.com?subject=Expert Consultation Request - ${formData.name}&body=${encodeURIComponent(emailBody)}`;
      window.location.href = mailto;

      setIsSubmitted(true);
      
      toast({
        title: "Consultation Request Sent",
        description: "We'll contact you within 24 hours to schedule your consultation",
      });

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit consultation request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-3">
                <Button variant="ghost" onClick={onBack}>
                  ← Back
                </Button>
                <div className="flex items-center space-x-2">
                  <Brain className="w-6 h-6 text-blue-600" />
                  <span className="text-xl font-bold text-slate-900">Expert Consultation</span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            Consultation Request Submitted
          </h1>
          
          <p className="text-lg text-slate-600 mb-8">
            Thank you for your interest in our expert consultation services. We've received your request and will contact you within 24 hours to schedule your consultation.
          </p>

          <div className="bg-white rounded-lg p-6 shadow-sm border mb-8">
            <h3 className="font-semibold text-slate-900 mb-4">What happens next?</h3>
            <div className="space-y-3 text-left">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-blue-600">1</span>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Review & Contact</div>
                  <div className="text-sm text-slate-600">Our experts will review your request and contact you to discuss details</div>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-blue-600">2</span>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Schedule Consultation</div>
                  <div className="text-sm text-slate-600">We'll find a time that works for your schedule and preferences</div>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-blue-600">3</span>
                </div>
                <div>
                  <div className="font-medium text-slate-900">Expert Session</div>
                  <div className="text-sm text-slate-600">Detailed consultation with actionable recommendations</div>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={onBack} variant="outline">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Button variant="ghost" onClick={onBack}>
                ← Back
              </Button>
              <div className="flex items-center space-x-2">
                <Brain className="w-6 h-6 text-blue-600" />
                <span className="text-xl font-bold text-slate-900">Expert Consultation</span>
              </div>
            </div>
            <div className="text-sm text-slate-600">
              Get personalized AI strategy from our experts
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            Consult with Our AI Experts
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Get personalized guidance on your AI and data strategy from seasoned professionals with 20+ years of experience
          </p>
        </div>

        {/* Consultation Types */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {consultationTypes.map((type) => (
            <Card 
              key={type.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                formData.consultationType === type.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
              onClick={() => handleSelectChange('consultationType', type.id)}
            >
              <CardHeader className="text-center">
                <CardTitle className="text-lg">{type.name}</CardTitle>
                <div className="text-2xl font-bold text-blue-600">{type.price}</div>
                <CardDescription>{type.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="flex items-center justify-center text-sm text-slate-600">
                    <Clock className="w-4 h-4 mr-1" />
                    {type.duration}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Consultation Request Form</CardTitle>
            <CardDescription>
              Tell us about your project and AI needs so we can provide the most relevant consultation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Contact Information */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input
                      id="jobTitle"
                      name="jobTitle"
                      value={formData.jobTitle}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              {/* Project Details */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Project Details</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="projectDescription">Project Description *</Label>
                    <Textarea
                      id="projectDescription"
                      name="projectDescription"
                      placeholder="Describe your current project, business goals, and what you're trying to achieve with AI"
                      rows={4}
                      value={formData.projectDescription}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="dataType">Primary Data Type</Label>
                      <Select value={formData.dataType} onValueChange={(value) => handleSelectChange('dataType', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select data type" />
                        </SelectTrigger>
                        <SelectContent>
                          {dataTypes.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="dataVolume">Data Volume</Label>
                      <Select value={formData.dataVolume} onValueChange={(value) => handleSelectChange('dataVolume', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select data volume" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small (&lt; 1GB)</SelectItem>
                          <SelectItem value="medium">Medium (1GB - 100GB)</SelectItem>
                          <SelectItem value="large">Large (100GB - 1TB)</SelectItem>
                          <SelectItem value="enterprise">Enterprise (&gt; 1TB)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="currentChallenges">Current Challenges</Label>
                    <Textarea
                      id="currentChallenges"
                      name="currentChallenges"
                      placeholder="What are the main challenges you're facing with your data or current analytics approach?"
                      rows={3}
                      value={formData.currentChallenges}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              {/* AI Requirements */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">AI & Analytics Requirements</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="analysisGoals">Analysis Goals</Label>
                    <Textarea
                      id="analysisGoals"
                      name="analysisGoals"
                      placeholder="What specific insights or outcomes are you hoping to achieve?"
                      rows={3}
                      value={formData.analysisGoals}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div>
                    <Label>Specific AI Needs (Select all that apply)</Label>
                    <div className="grid md:grid-cols-3 gap-3 mt-2">
                      {aiNeeds.map((need) => (
                        <div key={need} className="flex items-center space-x-2">
                          <Checkbox
                            id={need}
                            checked={formData.specificAINeeds.includes(need)}
                            onCheckedChange={(checked) => handleMultiSelectChange('specificAINeeds', need, !!checked)}
                          />
                          <Label htmlFor={need} className="text-sm">{need}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="timeframe">Project Timeframe</Label>
                      <Select value={formData.timeframe} onValueChange={(value) => handleSelectChange('timeframe', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immediate">Immediate (&lt; 1 month)</SelectItem>
                          <SelectItem value="short">Short-term (1-3 months)</SelectItem>
                          <SelectItem value="medium">Medium-term (3-6 months)</SelectItem>
                          <SelectItem value="long">Long-term (6+ months)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="budget">Estimated Budget Range</Label>
                      <Select value={formData.budget} onValueChange={(value) => handleSelectChange('budget', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select budget range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="startup">Startup (&lt; $10K)</SelectItem>
                          <SelectItem value="small">Small Business ($10K - $50K)</SelectItem>
                          <SelectItem value="medium">Medium Business ($50K - $200K)</SelectItem>
                          <SelectItem value="enterprise">Enterprise ($200K+)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Consultation Preferences */}
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Consultation Preferences</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="urgency">Urgency</Label>
                    <Select value={formData.urgency} onValueChange={(value) => handleSelectChange('urgency', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {urgencyOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} {option.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="preferredTime">Preferred Meeting Time</Label>
                    <Input
                      id="preferredTime"
                      name="preferredTime"
                      placeholder="e.g., Weekdays 2-4pm EST, or specific dates"
                      value={formData.preferredTime}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div>
                    <Label htmlFor="additionalNotes">Additional Notes</Label>
                    <Textarea
                      id="additionalNotes"
                      name="additionalNotes"
                      placeholder="Any additional information you'd like our experts to know before the consultation"
                      rows={3}
                      value={formData.additionalNotes}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
                {isSubmitting ? 'Submitting Request...' : 'Request Expert Consultation'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}