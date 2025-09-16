import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface IntelligentEstimate {
  total: number;
  currency: string;
  expiresInMs: number;
  breakdown: Array<{
    component: string;
    description: string;
    type: string;
    complexity: string;
    estimatedHours: number;
    baseCost: number;
    finalCost: number;
    reasoning: string;
  }>;
  confidence: number;
  workComponents: any[];
  recommendations: string[];
  riskAdjustment?: number;
  estimatedHours?: number;
  complexityScore?: number;
}

export interface IntelligentPricingRequest {
  journeyId?: string;
  goals?: string[];
  questions?: string[];
  journeyType: string;
  dataContext?: {
    sizeInMB?: number;
    recordCount?: number;
    columns?: string[];
    complexity?: string;
  };
}

export interface QuickEstimateRequest {
  goalCount: number;
  questionCount: number;
  journeyType: string;
  complexity?: 'basic' | 'intermediate' | 'advanced';
}

export function useIntelligentPricing() {
  const [lastRequest, setLastRequest] = useState<IntelligentPricingRequest | null>(null);
  
  // Full intelligent estimate (requires authentication)
  const intelligentEstimateMutation = useMutation({
    mutationFn: async (request: IntelligentPricingRequest) => {
      console.log('Requesting intelligent estimate:', request);
      const response = await apiRequest('POST', '/api/cost-estimates/intelligent', request);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get intelligent estimate');
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log('Intelligent estimate received:', data);
    },
    onError: (error) => {
      console.error('Intelligent estimate failed:', error);
    }
  });

  // Quick estimate (no authentication required)
  const quickEstimateMutation = useMutation({
    mutationFn: async (request: QuickEstimateRequest) => {
      console.log('Requesting quick estimate:', request);
      const response = await fetch('/api/cost-estimates/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get quick estimate');
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log('Quick estimate received:', data);
    },
    onError: (error) => {
      console.error('Quick estimate failed:', error);
    }
  });

  // Get intelligent estimate for goals and questions
  const getIntelligentEstimate = useCallback(async (request: IntelligentPricingRequest) => {
    setLastRequest(request);
    return intelligentEstimateMutation.mutateAsync(request);
  }, [intelligentEstimateMutation]);

  // Get quick estimate for counts
  const getQuickEstimate = useCallback(async (request: QuickEstimateRequest) => {
    return quickEstimateMutation.mutateAsync(request);
  }, [quickEstimateMutation]);

  // Auto-refresh estimate when it's close to expiring
  const { data: refreshedEstimate } = useQuery({
    queryKey: ['intelligent-estimate-refresh', lastRequest],
    queryFn: () => lastRequest ? intelligentEstimateMutation.mutateAsync(lastRequest) : null,
    enabled: !!lastRequest && !!intelligentEstimateMutation.data?.success && 
             intelligentEstimateMutation.data?.estimate?.expiresInMs < 60000, // Refresh when < 1 minute left
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Get current estimate data
  const getCurrentEstimate = (): IntelligentEstimate | null => {
    const estimate = refreshedEstimate?.estimate || intelligentEstimateMutation.data?.estimate;
    return estimate || null;
  };

  // Get current quick estimate data
  const getCurrentQuickEstimate = () => {
    return quickEstimateMutation.data?.estimate || null;
  };

  // Format currency
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  // Check if estimate is expiring soon
  const isEstimateExpiring = () => {
    const estimate = getCurrentEstimate();
    return estimate ? estimate.expiresInMs < 120000 : false; // Less than 2 minutes
  };

  return {
    // Functions
    getIntelligentEstimate,
    getQuickEstimate,
    formatCurrency,
    
    // Data
    intelligentEstimate: getCurrentEstimate(),
    quickEstimate: getCurrentQuickEstimate(),
    
    // Status
    isLoadingIntelligent: intelligentEstimateMutation.isPending,
    isLoadingQuick: quickEstimateMutation.isPending,
    isLoading: intelligentEstimateMutation.isPending || quickEstimateMutation.isPending,
    
    // Errors
    intelligentError: intelligentEstimateMutation.error?.message,
    quickError: quickEstimateMutation.error?.message,
    hasError: !!intelligentEstimateMutation.error || !!quickEstimateMutation.error,
    
    // Success states
    hasIntelligentEstimate: !!intelligentEstimateMutation.data?.success,
    hasQuickEstimate: !!quickEstimateMutation.data?.success,
    
    // Estimate metadata
    isExpiring: isEstimateExpiring(),
    confidence: getCurrentEstimate()?.confidence || 0,
    recommendations: getCurrentEstimate()?.recommendations || [],
    breakdown: getCurrentEstimate()?.breakdown || [],
    
    // Reset function
    reset: () => {
      intelligentEstimateMutation.reset();
      quickEstimateMutation.reset();
      setLastRequest(null);
    }
  };
}

// Hook for approach-specific cost estimates
export function useApproachCostEstimates(
  goals: any[],
  questions: any[],
  journeyType: string,
  approaches: any[]
) {
  const { getQuickEstimate, isLoading, hasError } = useIntelligentPricing();
  const [approachCosts, setApproachCosts] = useState<Record<string, number>>({});

  // Calculate costs for each approach
  useEffect(() => {
    if (!goals.length && !questions.length) return;
    if (!approaches.length) return;

    const calculateApproachCosts = async () => {
      const costs: Record<string, number> = {};

      for (const approach of approaches) {
        try {
          // Map approach complexity to estimate complexity
          const complexityMap = {
            'basic': 'basic' as const,
            'intermediate': 'intermediate' as const,
            'advanced': 'advanced' as const
          };

          const complexity = complexityMap[approach.complexity] || 'intermediate';

          const result = await getQuickEstimate({
            goalCount: goals.length,
            questionCount: questions.length,
            journeyType,
            complexity
          });

          if (result.success) {
            costs[approach.id] = result.estimate.total;
          }
        } catch (error) {
          console.error(`Failed to estimate cost for approach ${approach.id}:`, error);
          // Use fallback calculation
          costs[approach.id] = calculateFallbackCost(approach, goals.length, questions.length);
        }
      }

      setApproachCosts(costs);
    };

    calculateApproachCosts();
  }, [goals.length, questions.length, journeyType, approaches.length, getQuickEstimate]);

  return {
    approachCosts,
    isLoading,
    hasError,
    formatCurrency: (cents: number) => new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  };
}

// Fallback cost calculation for when API fails
function calculateFallbackCost(approach: any, goalCount: number, questionCount: number): number {
  const baseRate = {
    'basic': 2500,
    'intermediate': 3500,
    'advanced': 5000
  }[approach.complexity] || 3500;

  const goalFactor = goalCount * 1000;
  const questionFactor = questionCount * 500;
  
  return baseRate + goalFactor + questionFactor;
}