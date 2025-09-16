import { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DollarSign, Loader2, AlertTriangle, Clock, Shield } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface CostChipProps {
  journeyType: 'guided' | 'business' | 'technical';
  features: string[];
  dataSizeMB?: number;
  complexityLevel?: 'basic' | 'intermediate' | 'advanced';
  expectedQuestions?: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

interface PricingEstimate {
  success: boolean;
  total: number;
  currency: string;
  expiresInMs: number;
  error?: string;
}

export function CostChip({
  journeyType,
  features,
  dataSizeMB = 0,
  complexityLevel = 'basic',
  expectedQuestions = 3,
  size = 'md',
  showIcon = true,
  className = '',
}: CostChipProps) {
  const estimateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/pricing/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journeyType,
          features,
          dataSizeMB,
          complexityLevel,
          expectedQuestions,
        }),
      });
      if (!response.ok) throw new Error('Failed to get pricing estimate');
      return await response.json() as PricingEstimate;
    },
  });

  // Trigger estimate when parameters change
  useEffect(() => {
    if (features.length > 0) {
      estimateMutation.mutate();
    }
  }, [journeyType, JSON.stringify(features), dataSizeMB, complexityLevel, expectedQuestions]);

  const estimate = estimateMutation.data;
  const isLoading = estimateMutation.isPending;
  const error = estimateMutation.error;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'text-xs px-2 py-1';
      case 'lg': return 'text-base px-4 py-2';
      default: return 'text-sm px-3 py-1.5';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm': return 'w-3 h-3';
      case 'lg': return 'w-5 h-5';
      default: return 'w-4 h-4';
    }
  };

  if (features.length === 0) {
    return (
      <Badge variant="outline" className={`${getSizeClasses()} ${className}`} data-testid="cost-chip-empty">
        {showIcon && <DollarSign className={`${getIconSize()} mr-1 text-gray-400`} />}
        Select features
      </Badge>
    );
  }

  if (isLoading) {
    return (
      <Badge variant="outline" className={`${getSizeClasses()} ${className}`} data-testid="cost-chip-loading">
        <Loader2 className={`${getIconSize()} mr-1 animate-spin text-blue-500`} />
        Calculating...
      </Badge>
    );
  }

  if (error || estimate?.error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className={`${getSizeClasses()} ${className}`} data-testid="cost-chip-error">
              {showIcon && <AlertTriangle className={`${getIconSize()} mr-1`} />}
              Error
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Failed to calculate pricing: {error?.message || estimate?.error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!estimate?.success || !estimate.total) {
    return (
      <Badge variant="outline" className={`${getSizeClasses()} ${className}`} data-testid="cost-chip-unavailable">
        {showIcon && <AlertTriangle className={`${getIconSize()} mr-1 text-gray-400`} />}
        N/A
      </Badge>
    );
  }

  const isExpiringSoon = estimate.expiresInMs < 2 * 60 * 1000; // Less than 2 minutes
  const chipVariant = isExpiringSoon ? 'destructive' : 'default';
  const chipColor = isExpiringSoon 
    ? 'bg-red-100 text-red-800 border-red-200' 
    : 'bg-green-100 text-green-800 border-green-200';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            className={`${getSizeClasses()} ${chipColor} ${className}`} 
            data-testid="cost-chip-estimate"
          >
            {showIcon && (
              <div className="flex items-center mr-1">
                {isExpiringSoon ? (
                  <Clock className={`${getIconSize()} text-red-600`} />
                ) : (
                  <Shield className={`${getIconSize()} text-green-600`} />
                )}
              </div>
            )}
            {formatCurrency(estimate.total)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{formatCurrency(estimate.total)} estimate</p>
            <p className="text-xs">Journey: {journeyType.charAt(0).toUpperCase() + journeyType.slice(1)}</p>
            <p className="text-xs">Features: {features.length}</p>
            <p className="text-xs">
              {isExpiringSoon 
                ? `⚠️ Expires in ${Math.floor(estimate.expiresInMs / 60000)}m`
                : '✓ Secure estimate with HMAC signature'
              }
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}