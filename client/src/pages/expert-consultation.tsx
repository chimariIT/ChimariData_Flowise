import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  MessageSquare
} from "lucide-react";
import { Link } from "wouter";

interface ExpertConsultationProps {
  onBack: () => void;
}

export default function ExpertConsultation({ onBack }: ExpertConsultationProps) {
  const [bookingStep, setBookingStep] = useState(1);

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

  const expertProfiles = [
    {
      name: "Dr. Sarah Chen",
      title: "Senior Data Scientist",
      experience: "15+ years",
      specialties: ["Machine Learning", "Predictive Analytics", "Business Intelligence"],
      image: "https://images.unsplash.com/photo-1494790108755-2616b612b47c?w=150&h=150&fit=crop&crop=face"
    },
    {
      name: "Michael Rodriguez",
      title: "AI Strategy Consultant", 
      experience: "12+ years",
      specialties: ["AI Implementation", "Data Architecture", "ROI Optimization"],
      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face"
    },
    {
      name: "Dr. Emily Wang",
      title: "Analytics Director",
      experience: "18+ years",
      specialties: ["Statistical Analysis", "Research Design", "Data Visualization"],
      image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face"
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
          
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-purple-200">
            <div className="flex items-center justify-center mb-6">
              <div className="text-6xl font-bold text-purple-600">$150</div>
              <div className="ml-4 text-left">
                <div className="text-lg font-semibold text-slate-900">Per 1-hour session</div>
                <div className="text-slate-600">Includes follow-up summary</div>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <div className="flex items-center text-slate-700">
                <Video className="w-5 h-5 text-purple-600 mr-3" />
                Video consultation
              </div>
              <div className="flex items-center text-slate-700">
                <Clock className="w-5 h-5 text-blue-600 mr-3" />
                60 minutes duration
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
            
            <Button 
              size="lg"
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4"
              onClick={() => setBookingStep(1)}
            >
              Book Consultation Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Expert Profiles */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">
            Meet Our Data Experts
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {expertProfiles.map((expert, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-24 h-24 mx-auto mb-4 rounded-full overflow-hidden">
                    <img 
                      src={expert.image} 
                      alt={expert.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <CardTitle className="text-xl">{expert.name}</CardTitle>
                  <CardDescription className="text-purple-600 font-medium">
                    {expert.title}
                  </CardDescription>
                  <div className="flex items-center justify-center space-x-1 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                    <span className="text-sm text-slate-500 ml-2">{expert.experience}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-900">Specialties:</div>
                    {expert.specialties.map((specialty, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs mr-1 mb-1">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
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
                <Label htmlFor="name">Your Name</Label>
                <Input id="name" placeholder="Enter your full name" />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" placeholder="your@email.com" />
              </div>
              <div>
                <Label htmlFor="company">Company</Label>
                <Input id="company" placeholder="Your company name" />
              </div>
              <div>
                <Label htmlFor="challenge">Data Challenge Description</Label>
                <Textarea 
                  id="challenge" 
                  placeholder="Briefly describe your data challenge or what you'd like to discuss..."
                  rows={4}
                />
              </div>
              <Button className="w-full bg-purple-600 hover:bg-purple-700">
                Schedule Consultation ($150)
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