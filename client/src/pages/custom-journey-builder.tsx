import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import {
  Sliders,
  CheckCircle,
  AlertTriangle,
  Clock,
  Zap,
  ArrowRight,
  Lock,
  Info,
} from "lucide-react";

interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  toolNames: string[];
  featureIds?: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  estimatedDuration: string;
  requiredCapabilities?: string[];
  minSubscriptionTier?: 'trial' | 'starter' | 'professional' | 'enterprise';
  useCases: string[];
  exampleOutput: string;
  technicalLevel: 'beginner' | 'intermediate' | 'advanced';
}

interface CapabilityCategory {
  [key: string]: Capability[];
}

interface CustomJourneyBuilderProps {
  user?: any;
}

const CATEGORY_LABELS: Record<string, string> = {
  data_preparation: 'Data Preparation',
  statistical_analysis: 'Statistical Analysis',
  machine_learning: 'Machine Learning',
  llm_fine_tuning: 'LLM Fine-Tuning',
  visualization: 'Visualization',
  business_intelligence: 'Business Intelligence',
  big_data: 'Big Data Processing'
};

export default function CustomJourneyBuilder({ user }: CustomJourneyBuilderProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { data: capabilitiesData, isLoading } = useQuery({
    queryKey: ['/api/custom-journey/capabilities'],
    queryFn: async () => {
      const response = await fetch('/api/custom-journey/capabilities', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch capabilities');
      return response.json();
    },
    enabled: !!user
  });

  const { data: validationData } = useQuery({
    queryKey: ['/api/custom-journey/validate', selectedCapabilities],
    queryFn: async () => {
      const response = await fetch('/api/custom-journey/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCapabilityIds: selectedCapabilities,
          datasetInfo: { recordCount: 1000, sizeGB: 0.001 }
        })
      });
      if (!response.ok) throw new Error('Failed to validate capabilities');
      return response.json();
    },
    enabled: selectedCapabilities.length > 0
  });

  const capabilities: Capability[] = capabilitiesData?.capabilities || [];
  const categories: CapabilityCategory = capabilitiesData?.categories || {};
  const userTier = capabilitiesData?.userTier || 'trial';

  const handleCapabilityToggle = (capabilityId: string) => {
    setSelectedCapabilities(prev => {
      if (prev.includes(capabilityId)) {
        return prev.filter(id => id !== capabilityId);
      } else {
        return [...prev, capabilityId];
      }
    });
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast({
        title: 'Project name required',
        description: 'Please enter a name for your custom journey project',
        variant: 'destructive'
      });
      return;
    }

    if (selectedCapabilities.length === 0) {
      toast({
        title: 'No capabilities selected',
        description: 'Please select at least one capability for your journey',
        variant: 'destructive'
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/custom-journey/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCapabilityIds: selectedCapabilities,
          name: projectName,
          description: projectDescription || undefined
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create project');
      }

      const result = await response.json();

      toast({
        title: 'Custom Journey Created!',
        description: `Project "${projectName}" has been created successfully`,
      });

      // Navigate to the project page
      setLocation(`/projects/${result.project.id}`);
    } catch (error: any) {
      toast({
        title: 'Failed to create project',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              Please sign in to build your custom analytics journey
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation('/auth/login')}>
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-gray-600">Loading capabilities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="inline-block bg-indigo-50 px-4 py-2 rounded-full mb-4">
          <span className="text-sm font-medium text-indigo-700 flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Build Your Own Journey
          </span>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Select Your Analytics Capabilities
        </h1>
        <p className="text-lg text-gray-600 max-w-3xl">
          Choose exactly what you need. Pay only for the capabilities you use.
          Your subscription tier: <Badge variant="secondary">{userTier}</Badge>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Capabilities Selection */}
        <div className="lg:col-span-2 space-y-6">
          {Object.entries(categories).map(([category, caps]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-xl">
                  {CATEGORY_LABELS[category] || category}
                </CardTitle>
                <CardDescription>
                  {caps.length} capability{caps.length !== 1 ? 'ies' : ''} available
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {caps.map((capability) => {
                    const isSelected = selectedCapabilities.includes(capability.id);
                    const isLocked = capability.minSubscriptionTier &&
                      ['trial', 'starter', 'professional', 'enterprise'].indexOf(userTier) <
                      ['trial', 'starter', 'professional', 'enterprise'].indexOf(capability.minSubscriptionTier);

                    return (
                      <div
                        key={capability.id}
                        className={`border rounded-lg p-4 transition-all ${
                          isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                        } ${isLocked ? 'opacity-60' : 'hover:border-indigo-300'}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={capability.id}
                            checked={isSelected}
                            onCheckedChange={() => !isLocked && handleCapabilityToggle(capability.id)}
                            disabled={isLocked}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Label
                                htmlFor={capability.id}
                                className="text-sm font-semibold cursor-pointer"
                              >
                                {capability.name}
                              </Label>
                              <Badge variant={
                                capability.complexity === 'basic' ? 'secondary' :
                                capability.complexity === 'intermediate' ? 'default' : 'destructive'
                              } className="text-xs">
                                {capability.complexity}
                              </Badge>
                              {isLocked && (
                                <Badge variant="outline" className="text-xs">
                                  <Lock className="w-3 h-3 mr-1" />
                                  {capability.minSubscriptionTier}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              {capability.description}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {capability.estimatedDuration}
                              </span>
                              <span className="flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                {capability.technicalLevel}
                              </span>
                            </div>
                            {capability.requiredCapabilities && capability.requiredCapabilities.length > 0 && (
                              <div className="mt-2 flex items-center gap-1 text-xs text-yellow-700">
                                <Info className="w-3 h-3" />
                                Requires: {capability.requiredCapabilities.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary Panel */}
        <div className="space-y-6">
          {/* Selected Capabilities */}
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-lg">Your Custom Journey</CardTitle>
              <CardDescription>
                {selectedCapabilities.length} capability{selectedCapabilities.length !== 1 ? 'ies' : ''} selected
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedCapabilities.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Select capabilities from the left to build your journey
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {selectedCapabilities.map(capId => {
                      const cap = capabilities.find(c => c.id === capId);
                      if (!cap) return null;
                      return (
                        <div key={capId} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>{cap.name}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Validation Status */}
                  {validationData && (
                    <>
                      {!validationData.valid && validationData.missingDependencies && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                            <div className="text-xs text-yellow-700">
                              <p className="font-semibold mb-1">Missing Dependencies</p>
                              <p>{validationData.missingDependencies.join(', ')}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {validationData.valid && (
                        <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm">
                            <span className="text-gray-600">Estimated Duration:</span>
                            <span className="ml-2 font-semibold">{validationData.estimatedDuration} min</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-600">Tool Executions:</span>
                            <span className="ml-2 font-semibold">{validationData.toolExecutions}</span>
                          </div>
                          {validationData.eligibility && (
                            <div className={`text-sm p-2 rounded ${
                              validationData.eligibility.canProceed
                                ? 'bg-green-50 text-green-700'
                                : 'bg-red-50 text-red-700'
                            }`}>
                              {validationData.eligibility.canProceed ? (
                                <><CheckCircle className="w-4 h-4 inline mr-1" />Eligible to proceed</>
                              ) : (
                                <><AlertTriangle className="w-4 h-4 inline mr-1" />{validationData.eligibility.reason}</>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Project Configuration */}
                  <div className="space-y-3 pt-4 border-t">
                    <div>
                      <Label htmlFor="projectName" className="text-sm">
                        Project Name *
                      </Label>
                      <Input
                        id="projectName"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="My Custom Analysis"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="projectDescription" className="text-sm">
                        Description (Optional)
                      </Label>
                      <Input
                        id="projectDescription"
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder="Brief description..."
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Create Button */}
                  <Button
                    className="w-full"
                    onClick={handleCreateProject}
                    disabled={!validationData?.valid || isCreating || !projectName.trim()}
                  >
                    {isCreating ? 'Creating...' : 'Create Custom Journey'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
