import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowLeft, Building2, Users, Clock, DollarSign } from "lucide-react";
import { Link } from "wouter";

const enterpriseFormSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  contactName: z.string().min(2, "Contact name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  projectDescription: z.string().min(10, "Please provide a detailed project description (minimum 10 characters)"),
  estimatedDataSize: z.string().min(1, "Please select an estimated data size"),
  timeline: z.string().min(1, "Please select a timeline"),
  budget: z.string().min(1, "Please select a budget range"),
  specificRequirements: z.string().optional(),
});

type EnterpriseFormData = z.infer<typeof enterpriseFormSchema>;

export default function EnterpriseContact() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const form = useForm<EnterpriseFormData>({
    resolver: zodResolver(enterpriseFormSchema),
    defaultValues: {
      companyName: "",
      contactName: "",
      email: "",
      phone: "",
      projectDescription: "",
      estimatedDataSize: "",
      timeline: "",
      budget: "",
      specificRequirements: "",
    },
  });

  const submitInquiry = useMutation({
    mutationFn: async (data: EnterpriseFormData) => {
      return apiRequest("POST", "/api/enterprise/inquiry", data);
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Enterprise Inquiry Submitted",
        description: "We'll contact you within 24 hours to discuss your project.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Please try again or contact us directly.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EnterpriseFormData) => {
    submitInquiry.mutate(data);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-8">
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Thank You!
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                Your enterprise inquiry has been submitted successfully. Our sales team will contact you within 24 hours to discuss your project requirements and provide a custom quote.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg mb-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                What happens next?
              </h3>
              <div className="space-y-3 text-left">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                    <span className="text-purple-600 dark:text-purple-300 text-sm font-bold">1</span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">Our team reviews your requirements</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                    <span className="text-purple-600 dark:text-purple-300 text-sm font-bold">2</span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">We schedule a consultation call</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                    <span className="text-purple-600 dark:text-purple-300 text-sm font-bold">3</span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">You receive a custom proposal and quote</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/pricing">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Pricing
                </Link>
              </Button>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Need immediate assistance? Email us at <a href="mailto:sales@chimaridata.com" className="text-purple-600 dark:text-purple-400 hover:underline">sales@chimaridata.com</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Enterprise Project Inquiry
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Tell us about your data analytics needs and we'll create a custom solution designed specifically for your organization.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <Card>
              <CardHeader className="text-center">
                <Building2 className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                <CardTitle>Custom Solutions</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Tailored analytics platforms designed to meet your specific business requirements and data workflows.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <Users className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                <CardTitle>Dedicated Support</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  24/7 phone and email support with a dedicated account manager and technical team.
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <Clock className="w-12 h-12 text-purple-600 mx-auto mb-4" />
                <CardTitle>Fast Implementation</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Rapid deployment with custom integrations, training, and onboarding for your team.
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl">Project Details</CardTitle>
              <CardDescription>
                Please provide information about your project so we can create an accurate proposal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Your company name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Your full name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address *</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="your.email@company.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 (555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="projectDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Description *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your data analytics needs, current challenges, and what you hope to achieve with our platform..."
                            rows={4}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="estimatedDataSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estimated Data Size *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="small">&lt; 1GB</SelectItem>
                              <SelectItem value="medium">1GB - 10GB</SelectItem>
                              <SelectItem value="large">10GB - 100GB</SelectItem>
                              <SelectItem value="enterprise">100GB+</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="timeline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timeline *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select timeline" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="immediate">Immediate (&lt; 1 month)</SelectItem>
                              <SelectItem value="short">1-3 months</SelectItem>
                              <SelectItem value="medium">3-6 months</SelectItem>
                              <SelectItem value="long">6+ months</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="budget"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Budget Range *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select budget" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="startup">$1K - $10K</SelectItem>
                              <SelectItem value="small">$10K - $50K</SelectItem>
                              <SelectItem value="medium">$50K - $200K</SelectItem>
                              <SelectItem value="large">$200K+</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="specificRequirements"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Specific Requirements</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Any specific technical requirements, integrations, compliance needs, or other considerations..."
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Button
                      type="submit"
                      disabled={submitInquiry.isPending}
                      className="flex-1"
                    >
                      {submitInquiry.isPending ? "Submitting..." : "Submit Inquiry"}
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <Link href="/pricing">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Pricing
                      </Link>
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <div className="text-center mt-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Questions? Contact us directly at{" "}
              <a href="mailto:sales@chimaridata.com" className="text-purple-600 dark:text-purple-400 hover:underline">
                sales@chimaridata.com
              </a>{" "}
              or call{" "}
              <a href="tel:+1-555-CHIMARI" className="text-purple-600 dark:text-purple-400 hover:underline">
                +1 (555) CHIMARI
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}