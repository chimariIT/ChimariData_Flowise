import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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
  MessageSquare,
  Calculator,
  Upload,
  DollarSign,
  X,
  Check,
  Loader2
} from "lucide-react";
import { Link, useLocation } from "wouter";

interface ExpertConsultationProps {
  onBack: () => void;
}

interface ConsultationRequest {
  id: string;
  status: string;
  consultationType: string;
  expertLevel: string;
  duration: number;
  quoteAmount?: number;
  quoteDetails?: any;
  quotedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  paymentStatus?: string;
  projectId?: string;
  createdAt: string;
}

export default function ExpertConsultation({ onBack }: ExpertConsultationProps) {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState<'form' | 'requests' | 'quote-review' | 'payment' | 'upload'>('form');
  const [myRequests, setMyRequests] = useState<ConsultationRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ConsultationRequest | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);

  // Consultation pricing state
  const [sessionDuration, setSessionDuration] = useState([1]); // hours
  const [expertLevel, setExpertLevel] = useState("senior");
  const [consultationType, setConsultationType] = useState("standard");
  const [calculatedPrice, setCalculatedPrice] = useState(150);

  // Booking form state
  const [bookingForm, setBookingForm] = useState({
    name: "",
    email: "",
    company: "",
    challenge: "",
    analysisGoals: "",
    businessQuestions: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { toast } = useToast();

  // Load user's existing consultation requests
  useEffect(() => {
    loadMyRequests();
  }, []);

  const loadMyRequests = async () => {
    setIsLoadingRequests(true);
    try {
      const response = await fetch('/api/consultation/my-requests', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setMyRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to load consultation requests:', error);
    } finally {
      setIsLoadingRequests(false);
    }
  };

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

    return Math.round(basePrice);
  };

  useEffect(() => {
    setCalculatedPrice(calculateConsultationPrice());
  }, [sessionDuration, expertLevel, consultationType]);

  const handleBookingFormChange = (field: string, value: string) => {
    setBookingForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitRequest = async () => {
    // Validation
    if (!bookingForm.name.trim()) {
      toast({ title: "Validation Error", description: "Please enter your name", variant: "destructive" });
      return;
    }

    if (!bookingForm.email.trim() || !bookingForm.email.includes('@')) {
      toast({ title: "Validation Error", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }

    if (!bookingForm.challenge.trim()) {
      toast({ title: "Validation Error", description: "Please describe your data challenge", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/consultation/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        credentials: 'include',
        body: JSON.stringify({
          name: bookingForm.name,
          email: bookingForm.email,
          company: bookingForm.company || undefined,
          challenge: bookingForm.challenge,
          analysisGoals: bookingForm.analysisGoals || undefined,
          businessQuestions: bookingForm.businessQuestions || undefined,
          consultationType,
          expertLevel,
          duration: sessionDuration[0],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Request Submitted!",
          description: "You will receive a quote within 24 hours."
        });

        // Reset form and reload requests
        setBookingForm({ name: "", email: "", company: "", challenge: "", analysisGoals: "", businessQuestions: "" });
        await loadMyRequests();
        setCurrentStep('requests');
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit request');
      }

    } catch (error: any) {
      console.error('Request submission failed:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveQuote = async (requestId: string) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/consultation/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setClientSecret(data.clientSecret);
        setCurrentStep('payment');

        toast({
          title: "Quote Approved",
          description: "Please complete payment to proceed"
        });
      } else {
        throw new Error('Failed to approve quote');
      }
    } catch (error) {
      toast({
        title: "Approval Failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectQuote = async (requestId: string) => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for rejection",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/consultation/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        credentials: 'include',
        body: JSON.stringify({ reason: rejectionReason }),
      });

      if (response.ok) {
        toast({
          title: "Quote Rejected",
          description: "Your consultation request has been declined"
        });
        await loadMyRequests();
        setCurrentStep('requests');
        setRejectionReason("");
      } else {
        throw new Error('Failed to reject quote');
      }
    } catch (error) {
      toast({
        title: "Rejection Failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string }> = {
      pending_quote: { color: "bg-yellow-100 text-yellow-800", label: "Pending Quote" },
      awaiting_approval: { color: "bg-blue-100 text-blue-800", label: "Awaiting Your Approval" },
      approved: { color: "bg-green-100 text-green-800", label: "Approved" },
      rejected: { color: "bg-red-100 text-red-800", label: "Rejected" },
      ready_for_admin: { color: "bg-purple-100 text-purple-800", label: "Ready for Expert" },
      in_progress: { color: "bg-indigo-100 text-indigo-800", label: "In Progress" },
      completed: { color: "bg-gray-100 text-gray-800", label: "Completed" },
    };

    const variant = variants[status] || { color: "bg-gray-100 text-gray-800", label: status };
    return <Badge className={variant.color}>{variant.label}</Badge>;
  };

  const expertLevels = [
    { value: "senior", label: "Senior Data Scientist", description: "10+ years experience", multiplier: "1x" },
    { value: "director", label: "Director Level", description: "15+ years, leadership", multiplier: "1.5x" },
    { value: "principal", label: "Principal/VP Level", description: "20+ years, executive", multiplier: "2x" }
  ];

  const consultationProcess = [
    { step: 1, title: "Submit Request", description: "Describe your data challenge", icon: FileText },
    { step: 2, title: "Receive Quote", description: "Get pricing within 24 hours", icon: DollarSign },
    { step: 3, title: "Approve & Pay", description: "Complete payment securely", icon: CheckCircle },
    { step: 4, title: "Upload Data", description: "Provide your dataset", icon: Upload },
    { step: 5, title: "Expert Analysis", description: "Work with assigned expert", icon: Users },
    { step: 6, title: "Receive Deliverables", description: "Get insights and recommendations", icon: FileText }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
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
            <div className="flex items-center space-x-4">
              <Button
                variant={currentStep === 'form' ? 'default' : 'outline'}
                onClick={() => setCurrentStep('form')}
                size="sm"
              >
                New Request
              </Button>
              <Button
                variant={currentStep === 'requests' ? 'default' : 'outline'}
                onClick={() => { setCurrentStep('requests'); loadMyRequests(); }}
                size="sm"
              >
                My Requests ({myRequests.length})
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Request Form */}
      {currentStep === 'form' && (
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <Badge className="mb-4 bg-gray-100 text-gray-800 border-gray-200">Expert Consultation</Badge>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
                Request Expert Consultation
              </h1>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Get strategic guidance from senior data scientists for your complex data challenges
              </p>
            </div>

            {/* Process Overview */}
            <div className="mb-12 grid grid-cols-2 md:grid-cols-6 gap-4">
              {consultationProcess.map((process) => (
                <div key={process.step} className="text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-2">
                    <process.icon className="w-6 h-6 text-slate-600" />
                  </div>
                  <div className="text-xs font-medium text-slate-900">{process.title}</div>
                  <div className="text-xs text-slate-500">{process.description}</div>
                </div>
              ))}
            </div>

            {/* Configuration Options */}
            {showCalculator && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Customize Your Consultation</CardTitle>
                  <CardDescription>Configure session duration and expert level</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
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

                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-3">Expert Level</label>
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

                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Estimated Price:</span>
                      <span className="text-2xl font-bold text-gray-800">${calculatedPrice}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Final price will be confirmed in your quote</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button
              variant="outline"
              onClick={() => setShowCalculator(!showCalculator)}
              className="w-full mb-8"
            >
              <Calculator className="w-4 h-4 mr-2" />
              {showCalculator ? 'Hide' : 'Show'} Pricing Calculator
            </Button>

            {/* Request Form */}
            <Card>
              <CardHeader>
                <CardTitle>Consultation Request</CardTitle>
                <CardDescription>Tell us about your data challenge and we'll provide a custom quote</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Your Name *</Label>
                    <Input
                      id="name"
                      placeholder="Full name"
                      value={bookingForm.name}
                      onChange={(e) => handleBookingFormChange('name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={bookingForm.email}
                      onChange={(e) => handleBookingFormChange('email', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    placeholder="Your company name"
                    value={bookingForm.company}
                    onChange={(e) => handleBookingFormChange('company', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="challenge">Data Challenge Description *</Label>
                  <Textarea
                    id="challenge"
                    placeholder="Describe your data challenge, business context, and what you hope to achieve..."
                    rows={4}
                    value={bookingForm.challenge}
                    onChange={(e) => handleBookingFormChange('challenge', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="goals">Analysis Goals (Optional)</Label>
                  <Textarea
                    id="goals"
                    placeholder="What specific insights or outcomes are you looking for?"
                    rows={3}
                    value={bookingForm.analysisGoals}
                    onChange={(e) => handleBookingFormChange('analysisGoals', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="questions">Business Questions (Optional)</Label>
                  <Textarea
                    id="questions"
                    placeholder="Any specific questions you want answered during the consultation?"
                    rows={3}
                    value={bookingForm.businessQuestions}
                    onChange={(e) => handleBookingFormChange('businessQuestions', e.target.value)}
                  />
                </div>

                <Button
                  className="w-full bg-gray-800 hover:bg-gray-900"
                  onClick={handleSubmitRequest}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Request
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* My Requests View */}
      {currentStep === 'requests' && (
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-8">My Consultation Requests</h2>

            {isLoadingRequests ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-600" />
                <p className="text-slate-600 mt-4">Loading your requests...</p>
              </div>
            ) : myRequests.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <MessageSquare className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Consultation Requests</h3>
                  <p className="text-slate-600 mb-6">You haven't submitted any consultation requests yet</p>
                  <Button onClick={() => setCurrentStep('form')}>Submit New Request</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {myRequests.map((request) => (
                  <Card key={request.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {request.consultationType.charAt(0).toUpperCase() + request.consultationType.slice(1)} Consultation
                          </CardTitle>
                          <CardDescription>
                            Submitted {new Date(request.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-500">Expert Level</div>
                          <div className="font-medium">
                            {expertLevels.find(l => l.value === request.expertLevel)?.label}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Duration</div>
                          <div className="font-medium">{request.duration} hour{request.duration > 1 ? 's' : ''}</div>
                        </div>
                        {request.quoteAmount && (
                          <div>
                            <div className="text-xs text-slate-500">Quote</div>
                            <div className="font-medium text-green-600">${request.quoteAmount}</div>
                          </div>
                        )}
                      </div>

                      {request.status === 'awaiting_approval' && (
                        <div className="mt-4 space-y-3">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 mb-2">Quote Received</h4>
                            <p className="text-sm text-blue-800">Amount: ${request.quoteAmount}</p>
                            {request.quoteDetails && (
                              <p className="text-sm text-blue-800 mt-1">{request.quoteDetails.message}</p>
                            )}
                          </div>

                          <div className="flex gap-3">
                            <Button
                              onClick={() => {
                                setSelectedRequest(request);
                                handleApproveQuote(request.id);
                              }}
                              className="flex-1 bg-green-600 hover:bg-green-700"
                              disabled={isSubmitting}
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Approve & Pay
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => {
                                setSelectedRequest(request);
                                setCurrentStep('quote-review');
                              }}
                              className="flex-1"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Decline Quote
                            </Button>
                          </div>
                        </div>
                      )}

                      {request.status === 'approved' && request.paymentStatus !== 'succeeded' && (
                        <div className="mt-4">
                          <Button
                            onClick={() => {
                              setSelectedRequest(request);
                              setCurrentStep('payment');
                            }}
                            className="w-full"
                          >
                            Complete Payment (${request.quoteAmount})
                          </Button>
                        </div>
                      )}

                      {request.projectId && (
                        <div className="mt-4">
                          <Button
                            variant="outline"
                            onClick={() => navigate(`/dashboard`)}
                            className="w-full"
                          >
                            View Project <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quote Rejection View */}
      {currentStep === 'quote-review' && selectedRequest && (
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Decline Quote</CardTitle>
                <CardDescription>Please provide a reason for declining this quote</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="rejection-reason">Reason for Decline</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="e.g., Budget constraints, different approach needed, etc."
                    rows={4}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCurrentStep('requests');
                      setRejectionReason("");
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleRejectQuote(selectedRequest.id)}
                    disabled={isSubmitting || !rejectionReason.trim()}
                    className="flex-1"
                  >
                    {isSubmitting ? 'Submitting...' : 'Confirm Decline'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Payment View */}
      {currentStep === 'payment' && selectedRequest && clientSecret && (
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Complete Payment</CardTitle>
                <CardDescription>
                  Pay ${selectedRequest.quoteAmount} to proceed with your consultation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                  <h4 className="font-semibold text-blue-900 mb-2">Stripe Payment Integration</h4>
                  <p className="text-sm text-blue-800 mb-4">
                    Stripe Elements would be integrated here using the client secret.
                  </p>
                  <code className="text-xs bg-white p-2 rounded block">
                    Client Secret: {clientSecret.substring(0, 30)}...
                  </code>
                </div>

                <div className="text-sm text-slate-600 mb-6">
                  <p className="mb-2">After payment completes:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Webhook updates payment status</li>
                    <li>You'll upload your data files</li>
                    <li>Expert will be assigned to your consultation</li>
                  </ol>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setCurrentStep('requests')}
                  className="w-full"
                >
                  Back to Requests
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
