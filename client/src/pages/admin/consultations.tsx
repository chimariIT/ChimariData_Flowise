/**
 * Admin Consultation Management Page
 *
 * Allows admin users to:
 * - View pending consultation requests
 * - Create and send quotes
 * - View consultations ready for pickup
 * - Assign consultations to themselves or other admins
 * - Schedule sessions
 * - Mark consultations as complete
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign,
  Users,
  Clock,
  CheckCircle,
  Loader2,
  Send,
  Calendar,
  FileText,
  TrendingUp,
  AlertCircle
} from "lucide-react";

interface ConsultationRequest {
  id: string;
  userId: string;
  name: string;
  email: string;
  company?: string;
  challenge: string;
  analysisGoals?: string;
  businessQuestions?: string;
  consultationType: string;
  expertLevel: string;
  duration: number;
  status: string;
  quoteAmount?: number;
  quoteDetails?: any;
  quotedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  paymentStatus?: string;
  projectId?: string;
  assignedAdminId?: string;
  assignedAt?: string;
  scheduledAt?: string;
  completedAt?: string;
  dataUploadedAt?: string;
  createdAt: string;
}

interface ConsultationStats {
  total: number;
  pendingQuote: number;
  awaitingApproval: number;
  readyForAdmin: number;
  inProgress: number;
  completed: number;
  rejected: number;
  totalRevenue: number;
}

export default function AdminConsultations() {
  const [activeTab, setActiveTab] = useState("pending-quotes");
  const [pendingQuotes, setPendingQuotes] = useState<ConsultationRequest[]>([]);
  const [readyQueue, setReadyQueue] = useState<ConsultationRequest[]>([]);
  const [myAssignments, setMyAssignments] = useState<ConsultationRequest[]>([]);
  const [allRequests, setAllRequests] = useState<ConsultationRequest[]>([]);
  const [stats, setStats] = useState<ConsultationStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ConsultationRequest | null>(null);

  // Quote form state
  const [quoteForm, setQuoteForm] = useState({
    amount: "",
    message: "",
    breakdown: ""
  });
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);

  // Schedule form state
  const [scheduleDate, setScheduleDate] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  // Completion form state
  const [completionForm, setCompletionForm] = useState({
    notes: "",
    deliverables: ""
  });
  const [isCompleting, setIsCompleting] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const headers = {
        'Authorization': `Bearer ${token}`
      };

      switch (activeTab) {
        case 'pending-quotes':
          const quotesRes = await fetch('/api/admin/consultations/pending-quotes', { headers, credentials: 'include' });
          if (quotesRes.ok) {
            const data = await quotesRes.json();
            setPendingQuotes(data.requests || []);
          }
          break;

        case 'ready-queue':
          const queueRes = await fetch('/api/admin/consultations/ready-queue', { headers, credentials: 'include' });
          if (queueRes.ok) {
            const data = await queueRes.json();
            setReadyQueue(data.requests || []);
          }
          break;

        case 'my-assignments':
          const assignmentsRes = await fetch('/api/admin/consultations/my-assignments', { headers, credentials: 'include' });
          if (assignmentsRes.ok) {
            const data = await assignmentsRes.json();
            setMyAssignments(data.assignments || []);
          }
          break;

        case 'all':
          const allRes = await fetch('/api/admin/consultations/all', { headers, credentials: 'include' });
          if (allRes.ok) {
            const data = await allRes.json();
            setAllRequests(data.requests || []);
          }
          break;

        case 'stats':
          const statsRes = await fetch('/api/admin/consultations/stats', { headers, credentials: 'include' });
          if (statsRes.ok) {
            const data = await statsRes.json();
            setStats(data.stats);
          }
          break;
      }
    } catch (error) {
      console.error('Failed to load consultation data:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load consultation data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateQuote = async (requestId: string) => {
    if (!quoteForm.amount || parseFloat(quoteForm.amount) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid quote amount",
        variant: "destructive"
      });
      return;
    }

    setIsSubmittingQuote(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/admin/consultations/${requestId}/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          quoteAmount: parseFloat(quoteForm.amount),
          quoteDetails: {
            message: quoteForm.message,
            breakdown: quoteForm.breakdown
          }
        }),
      });

      if (response.ok) {
        toast({
          title: "Quote Sent",
          description: "Quote has been sent to the customer"
        });
        setSelectedRequest(null);
        setQuoteForm({ amount: "", message: "", breakdown: "" });
        loadData();
      } else {
        throw new Error('Failed to create quote');
      }
    } catch (error) {
      toast({
        title: "Quote Failed",
        description: "Failed to create and send quote",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  const handleAssign = async (requestId: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/admin/consultations/${requestId}/assign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
      });

      if (response.ok) {
        toast({
          title: "Assigned",
          description: "Consultation assigned to you"
        });
        loadData();
      } else {
        throw new Error('Failed to assign');
      }
    } catch (error) {
      toast({
        title: "Assignment Failed",
        description: "Failed to assign consultation",
        variant: "destructive"
      });
    }
  };

  const handleSchedule = async (requestId: string) => {
    if (!scheduleDate) {
      toast({
        title: "Validation Error",
        description: "Please select a date and time",
        variant: "destructive"
      });
      return;
    }

    setIsScheduling(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/admin/consultations/${requestId}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          scheduledAt: scheduleDate
        }),
      });

      if (response.ok) {
        toast({
          title: "Scheduled",
          description: "Consultation session has been scheduled"
        });
        setScheduleDate("");
        loadData();
      } else {
        throw new Error('Failed to schedule');
      }
    } catch (error) {
      toast({
        title: "Scheduling Failed",
        description: "Failed to schedule consultation",
        variant: "destructive"
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const handleComplete = async (requestId: string) => {
    setIsCompleting(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/admin/consultations/${requestId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          sessionNotes: completionForm.notes,
          deliverables: completionForm.deliverables ? JSON.parse(completionForm.deliverables) : null
        }),
      });

      if (response.ok) {
        toast({
          title: "Completed",
          description: "Consultation marked as complete"
        });
        setCompletionForm({ notes: "", deliverables: "" });
        setSelectedRequest(null);
        loadData();
      } else {
        throw new Error('Failed to complete');
      }
    } catch (error) {
      toast({
        title: "Completion Failed",
        description: "Failed to mark consultation as complete",
        variant: "destructive"
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string }> = {
      pending_quote: { color: "bg-yellow-100 text-yellow-800", label: "Pending Quote" },
      awaiting_approval: { color: "bg-blue-100 text-blue-800", label: "Awaiting Approval" },
      approved: { color: "bg-green-100 text-green-800", label: "Approved" },
      rejected: { color: "bg-red-100 text-red-800", label: "Rejected" },
      ready_for_admin: { color: "bg-purple-100 text-purple-800", label: "Ready for Pickup" },
      in_progress: { color: "bg-indigo-100 text-indigo-800", label: "In Progress" },
      completed: { color: "bg-gray-100 text-gray-800", label: "Completed" },
    };

    const variant = variants[status] || { color: "bg-gray-100 text-gray-800", label: status };
    return <Badge className={variant.color}>{variant.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Consultation Management</h1>
          <p className="text-slate-600">Manage customer consultation requests and assignments</p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full mb-8">
            <TabsTrigger value="pending-quotes">Pending Quotes ({pendingQuotes.length})</TabsTrigger>
            <TabsTrigger value="ready-queue">Ready Queue ({readyQueue.length})</TabsTrigger>
            <TabsTrigger value="my-assignments">My Assignments ({myAssignments.length})</TabsTrigger>
            <TabsTrigger value="all">All Requests</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          {/* Pending Quotes Tab */}
          <TabsContent value="pending-quotes">
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-600" />
              </div>
            ) : pendingQuotes.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Pending Quotes</h3>
                  <p className="text-slate-600">All consultation requests have been quoted</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingQuotes.map((request) => (
                  <Card key={request.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{request.name} - {request.email}</CardTitle>
                          <CardDescription>
                            {request.company && `${request.company} • `}
                            Submitted {new Date(request.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        <div className="text-sm font-medium text-slate-900 mb-2">Challenge:</div>
                        <p className="text-sm text-slate-600">{request.challenge}</p>
                      </div>

                      {request.analysisGoals && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-slate-900 mb-2">Goals:</div>
                          <p className="text-sm text-slate-600">{request.analysisGoals}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-slate-50 rounded-lg">
                        <div>
                          <div className="text-xs text-slate-500">Type</div>
                          <div className="font-medium">{request.consultationType}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Expert Level</div>
                          <div className="font-medium">{request.expertLevel}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Duration</div>
                          <div className="font-medium">{request.duration}h</div>
                        </div>
                      </div>

                      {selectedRequest?.id === request.id ? (
                        <div className="space-y-4 border-t pt-4">
                          <div>
                            <Label>Quote Amount ($)</Label>
                            <Input
                              type="number"
                              placeholder="150"
                              value={quoteForm.amount}
                              onChange={(e) => setQuoteForm(prev => ({ ...prev, amount: e.target.value }))}
                            />
                          </div>

                          <div>
                            <Label>Message to Customer</Label>
                            <Textarea
                              placeholder="Brief explanation of the quote..."
                              rows={3}
                              value={quoteForm.message}
                              onChange={(e) => setQuoteForm(prev => ({ ...prev, message: e.target.value }))}
                            />
                          </div>

                          <div>
                            <Label>Cost Breakdown (Optional)</Label>
                            <Textarea
                              placeholder="Itemized breakdown of costs..."
                              rows={2}
                              value={quoteForm.breakdown}
                              onChange={(e) => setQuoteForm(prev => ({ ...prev, breakdown: e.target.value }))}
                            />
                          </div>

                          <div className="flex gap-3">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedRequest(null);
                                setQuoteForm({ amount: "", message: "", breakdown: "" });
                              }}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={() => handleCreateQuote(request.id)}
                              disabled={isSubmittingQuote}
                              className="flex-1"
                            >
                              {isSubmittingQuote ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4 mr-2" />
                                  Send Quote
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setSelectedRequest(request)}
                          className="w-full"
                        >
                          <DollarSign className="w-4 h-4 mr-2" />
                          Create Quote
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Ready Queue Tab */}
          <TabsContent value="ready-queue">
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-600" />
              </div>
            ) : readyQueue.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Consultations Ready</h3>
                  <p className="text-slate-600">No consultations are waiting for expert assignment</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {readyQueue.map((request) => (
                  <Card key={request.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{request.name}</CardTitle>
                          <CardDescription>
                            Quote: ${request.quoteAmount} • Paid • Data uploaded {new Date(request.dataUploadedAt!).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        <div className="text-sm font-medium text-slate-900 mb-2">Challenge:</div>
                        <p className="text-sm text-slate-600">{request.challenge}</p>
                      </div>

                      <Button
                        onClick={() => handleAssign(request.id)}
                        className="w-full"
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Assign to Me
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Assignments Tab */}
          <TabsContent value="my-assignments">
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-600" />
              </div>
            ) : myAssignments.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Active Assignments</h3>
                  <p className="text-slate-600">You don't have any assigned consultations</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {myAssignments.map((request) => (
                  <Card key={request.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{request.name} - {request.company || 'Individual'}</CardTitle>
                          <CardDescription>
                            Assigned {new Date(request.assignedAt!).toLocaleDateString()}
                            {request.scheduledAt && ` • Scheduled for ${new Date(request.scheduledAt).toLocaleDateString()}`}
                          </CardDescription>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4">
                        <div className="text-sm font-medium text-slate-900 mb-2">Challenge:</div>
                        <p className="text-sm text-slate-600">{request.challenge}</p>
                      </div>

                      {request.projectId && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="text-sm font-medium text-green-900">Project ID: {request.projectId}</div>
                          <div className="text-xs text-green-700">Customer has uploaded data</div>
                        </div>
                      )}

                      <div className="space-y-3">
                        {!request.scheduledAt && (
                          <div className="space-y-2">
                            <Label>Schedule Consultation</Label>
                            <Input
                              type="datetime-local"
                              value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                            />
                            <Button
                              onClick={() => handleSchedule(request.id)}
                              disabled={isScheduling}
                              className="w-full"
                            >
                              {isScheduling ? 'Scheduling...' : 'Schedule Session'}
                            </Button>
                          </div>
                        )}

                        {request.scheduledAt && selectedRequest?.id !== request.id && (
                          <Button
                            onClick={() => setSelectedRequest(request)}
                            variant="outline"
                            className="w-full"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark as Complete
                          </Button>
                        )}

                        {selectedRequest?.id === request.id && (
                          <div className="space-y-4 border-t pt-4">
                            <div>
                              <Label>Session Notes</Label>
                              <Textarea
                                placeholder="Summary of the consultation session..."
                                rows={4}
                                value={completionForm.notes}
                                onChange={(e) => setCompletionForm(prev => ({ ...prev, notes: e.target.value }))}
                              />
                            </div>

                            <div>
                              <Label>Deliverables (JSON format)</Label>
                              <Textarea
                                placeholder='{"reports": [], "recommendations": ""}'
                                rows={3}
                                value={completionForm.deliverables}
                                onChange={(e) => setCompletionForm(prev => ({ ...prev, deliverables: e.target.value }))}
                              />
                            </div>

                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedRequest(null);
                                  setCompletionForm({ notes: "", deliverables: "" });
                                }}
                                className="flex-1"
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => handleComplete(request.id)}
                                disabled={isCompleting}
                                className="flex-1"
                              >
                                {isCompleting ? 'Completing...' : 'Complete Consultation'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* All Requests Tab */}
          <TabsContent value="all">
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-600" />
              </div>
            ) : (
              <div className="space-y-4">
                {allRequests.map((request) => (
                  <Card key={request.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{request.name}</CardTitle>
                          <CardDescription>{request.email} • {new Date(request.createdAt).toLocaleDateString()}</CardDescription>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-slate-500">Type</div>
                          <div className="font-medium">{request.consultationType}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Duration</div>
                          <div className="font-medium">{request.duration}h</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Quote</div>
                          <div className="font-medium">{request.quoteAmount ? `$${request.quoteAmount}` : '-'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Payment</div>
                          <div className="font-medium">{request.paymentStatus || '-'}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats">
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-600" />
              </div>
            ) : stats ? (
              <div className="grid md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Total Consultations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-gray-800">{stats.total}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Total Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-green-600">${stats.totalRevenue}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Completed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-blue-600">{stats.completed}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Pending Quote</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{stats.pendingQuote}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Awaiting Approval</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{stats.awaitingApproval}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Ready for Admin</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">{stats.readyForAdmin}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">In Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-indigo-600">{stats.inProgress}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Rejected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
