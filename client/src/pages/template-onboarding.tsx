import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lightbulb, Sparkles, CheckCircle, AlertTriangle, Loader2, FileText } from "lucide-react";

export default function TemplateOnboarding() {
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedTemplate, setGeneratedTemplate] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [approved, setApproved] = useState(false);

  const industries = [
    { value: "retail", label: "Retail" },
    { value: "finance", label: "Finance" },
    { value: "healthcare", label: "Healthcare" },
    { value: "hr", label: "Human Resources" },
    { value: "manufacturing", label: "Manufacturing" },
    { value: "marketing", label: "Marketing" },
    { value: "technology", label: "Technology" }
  ];

  const handleGenerateTemplate = async () => {
    if (!description.trim()) {
      alert("Please enter a description");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/template-onboarding/generate-from-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          industry: industry || undefined
        })
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedTemplate(data.template);
        setMetadata(data.metadata);
        setValidation(null);
        setApproved(false);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error: any) {
      alert('Failed to generate template: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateTemplate = async () => {
    if (!generatedTemplate) return;

    setLoading(true);
    try {
      const response = await fetch('/api/template-onboarding/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: generatedTemplate,
          metadata
        })
      });

      const data = await response.json();

      if (data.success) {
        setValidation(data.onboarding);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error: any) {
      alert('Failed to validate template: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveTemplate = async () => {
    if (!generatedTemplate) return;

    setLoading(true);
    try {
      const response = await fetch('/api/template-onboarding/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: generatedTemplate
        })
      });

      const data = await response.json();

      if (data.success) {
        setApproved(true);
        alert('Template approved and registered successfully!');
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error: any) {
      alert('Failed to approve template: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return "text-green-600";
    if (confidence >= 0.7) return "text-yellow-600";
    return "text-red-600";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800 border-green-300';
      case 'review_needed': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'draft': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-purple-600" />
        <h1 className="text-3xl font-bold">Business Template Onboarding</h1>
      </div>

      <p className="text-gray-600">
        Use AI to research and generate new business analysis templates based on industry best practices.
      </p>

      {/* Step 1: Describe Template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            Step 1: Describe Your Template
          </CardTitle>
          <CardDescription>
            Describe the business analysis use case in natural language
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="description">Template Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., I want to predict which customers are likely to churn based on their usage patterns and demographics..."
              rows={4}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="industry">Industry (Optional)</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger id="industry" className="mt-2">
                <SelectValue placeholder="Auto-detect industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Auto-detect</SelectItem>
                {industries.map(ind => (
                  <SelectItem key={ind.value} value={ind.value}>
                    {ind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerateTemplate}
            disabled={loading || !description.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Template...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Template
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Review Generated Template */}
      {generatedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Step 2: Review Generated Template
            </CardTitle>
            <CardDescription>
              Review the AI-generated template details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Name */}
            <div>
              <Label className="text-sm font-semibold">Template Name</Label>
              <p className="text-lg font-medium">{generatedTemplate.name}</p>
            </div>

            {/* Description */}
            <div>
              <Label className="text-sm font-semibold">Description</Label>
              <p className="text-gray-700">{generatedTemplate.description}</p>
            </div>

            {/* Metadata */}
            {metadata && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold">Confidence</Label>
                  <p className={`text-lg font-medium ${getConfidenceColor(metadata.confidence)}`}>
                    {(metadata.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Market Demand</Label>
                  <Badge variant="outline" className="capitalize">
                    {metadata.marketDemand}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Complexity</Label>
                  <Badge variant="outline" className="capitalize">
                    {metadata.implementationComplexity}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Est. Popularity</Label>
                  <p className="text-lg font-medium">{metadata.estimatedPopularity}</p>
                </div>
              </div>
            )}

            {/* Workflow Steps */}
            <div>
              <Label className="text-sm font-semibold">Workflow Steps ({generatedTemplate.workflow?.length || 0})</Label>
              <div className="mt-2 space-y-2">
                {generatedTemplate.workflow?.map((step: any, index: number) => (
                  <div key={index} className="p-3 bg-gray-50 rounded border">
                    <p className="font-medium">{step.name}</p>
                    <p className="text-sm text-gray-600">Component: {step.component}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Fields */}
            <div>
              <Label className="text-sm font-semibold">Required Data Fields ({generatedTemplate.requiredDataFields?.length || 0})</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {generatedTemplate.requiredDataFields?.map((field: any, index: number) => (
                  <Badge key={index} variant="secondary">
                    {field.fieldName} ({field.dataType})
                  </Badge>
                ))}
              </div>
            </div>

            {/* Tags */}
            {generatedTemplate.tags && (
              <div>
                <Label className="text-sm font-semibold">Tags</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {generatedTemplate.tags.map((tag: string, index: number) => (
                    <Badge key={index} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleValidateTemplate}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Validate Template
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Validation Results */}
      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Step 3: Validation Results
            </CardTitle>
            <CardDescription>
              Template validation and quality assessment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div>
              <Label className="text-sm font-semibold">Status</Label>
              <Badge className={`mt-1 ${getStatusColor(validation.status)}`}>
                {validation.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>

            {/* Validation Errors */}
            {validation.validationErrors && validation.validationErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Validation Errors:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {validation.validationErrors.map((error: string, index: number) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Recommendations */}
            {validation.recommendations && validation.recommendations.length > 0 && (
              <Alert>
                <Lightbulb className="w-4 h-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Recommendations:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {validation.recommendations.map((rec: string, index: number) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Impact Estimates */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded border border-blue-200">
                <Label className="text-sm text-blue-700">Potential Users</Label>
                <p className="text-2xl font-bold text-blue-900">{validation.estimatedImpact.potentialUsers}</p>
              </div>
              <div className="p-4 bg-green-50 rounded border border-green-200">
                <Label className="text-sm text-green-700">Industry Relevance</Label>
                <p className="text-2xl font-bold text-green-900">{validation.estimatedImpact.industryRelevance}%</p>
              </div>
              <div className="p-4 bg-purple-50 rounded border border-purple-200">
                <Label className="text-sm text-purple-700">Uniqueness</Label>
                <p className="text-2xl font-bold text-purple-900">{validation.estimatedImpact.uniqueness}%</p>
              </div>
            </div>

            {/* Approve Button */}
            {validation.status !== 'rejected' && !approved && (
              <Button
                onClick={handleApproveTemplate}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve & Register Template
                  </>
                )}
              </Button>
            )}

            {approved && (
              <Alert>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription className="text-green-700 font-semibold">
                  Template has been approved and registered successfully!
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
