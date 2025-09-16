import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  DollarSign, 
  Clock, 
  Shield, 
  AlertTriangle, 
  CheckCircle,
  Loader2 
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface PricingEstimate {
  success: boolean;
  estimateId: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discounts: number;
  total: number;
  currency: string;
  signature: string;
  validUntil: Date;
  expiresInMs: number;
  error?: string;
}

interface EligibilityCheck {
  success: boolean;
  eligible: boolean;
  checkId: string;
  blockedFeatures: Array<{
    feature: string;
    reason: string;
    requiredTier?: string;
    upgradeRequired: boolean;
  }>;
  currentTier: string;
  upgradeRecommendation?: string;
  error?: string;
}

interface PricingBannerProps {
  journeyType: 'guided' | 'business' | 'technical';
  features: string[];
  dataSizeMB: number;
  complexityLevel: 'basic' | 'intermediate' | 'advanced';
  expectedQuestions: number;
  onConfirm?: (estimate: PricingEstimate) => void;
  className?: string;
}

export function PricingBanner({
  journeyType,
  features,
  dataSizeMB,
  complexityLevel,
  expectedQuestions,
  onConfirm,
  className = '',
}: PricingBannerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Generate pricing estimate
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

  // Check eligibility
  const eligibilityMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/eligibility/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journeyType,
          features,
          dataSizeMB,
        }),
      });
      if (!response.ok) throw new Error('Failed to check eligibility');
      return await response.json() as EligibilityCheck;
    },
  });

  // Trigger mutations when parameters change
  useEffect(() => {
    if (features.length > 0) {
      estimateMutation.mutate();
      eligibilityMutation.mutate();
    }
  }, [journeyType, JSON.stringify(features), dataSizeMB, complexityLevel, expectedQuestions]);

  const estimate = estimateMutation.data;
  const estimateLoading = estimateMutation.isPending;
  const estimateError = estimateMutation.error;
  const eligibility = eligibilityMutation.data;
  const eligibilityLoading = eligibilityMutation.isPending;

  // Update countdown timer
  useEffect(() => {
    if (!estimate?.validUntil) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(estimate.validUntil).getTime();
      const remaining = expiry - now;

      if (remaining <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const minutes = Math.floor(remaining / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      setTimeLeft(`${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [estimate?.validUntil]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getJourneyTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'guided': return 'bg-blue-100 text-blue-800';
      case 'business': return 'bg-green-100 text-green-800';
      case 'technical': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (features.length === 0) {
    return (
      <Card className={`border-2 border-dashed border-gray-300 ${className}`} data-testid="pricing-banner-empty">
        <CardContent className="text-center py-8">
          <DollarSign className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">Select features to see pricing estimate</p>
        </CardContent>
      </Card>
    );
  }

  if (estimateLoading || eligibilityLoading) {
    return (
      <Card className={`border-2 border-blue-200 ${className}`} data-testid="pricing-banner-loading">
        <CardContent className="text-center py-8">
          <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-2 animate-spin" />
          <p className="text-blue-600">Calculating pricing...</p>
        </CardContent>
      </Card>
    );
  }

  if (estimateError || estimate?.error) {
    return (
      <Alert className={`border-red-200 ${className}`} data-testid="pricing-banner-error">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to calculate pricing: {estimateError?.message || estimate?.error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!eligibility?.eligible) {
    return (
      <Alert className={`border-orange-200 bg-orange-50 ${className}`} data-testid="pricing-banner-blocked">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        <AlertDescription>
          <div className="space-y-2">
            <p className="font-medium text-orange-800">Features not available</p>
            {eligibility?.blockedFeatures.map((blocked, index) => (
              <p key={index} className="text-sm text-orange-700">
                <strong>{blocked.feature}:</strong> {blocked.reason}
              </p>
            ))}
            {eligibility?.upgradeRecommendation && (
              <p className="text-sm text-orange-700 mt-2">
                💡 {eligibility.upgradeRecommendation}
              </p>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (!estimate?.success || !estimate.total) {
    return (
      <Alert className={`border-gray-200 ${className}`} data-testid="pricing-banner-unavailable">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Pricing estimate unavailable
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className={`border-2 border-green-200 bg-green-50 ${className}`} data-testid="pricing-banner-estimate">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-green-600" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-bold text-green-900" data-testid="text-total-cost">
                    {formatCurrency(estimate.total)}
                  </span>
                  <Badge className={getJourneyTypeBadgeColor(journeyType)} data-testid="badge-journey-type">
                    {journeyType.charAt(0).toUpperCase() + journeyType.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2 text-sm text-green-700">
                  <CheckCircle className="w-4 h-4" />
                  <span>Secure estimate • Expires in {timeLeft}</span>
                  <Clock className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              data-testid="button-toggle-details"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
            {onConfirm && (
              <Button
                onClick={() => onConfirm(estimate)}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-confirm-pricing"
              >
                Confirm & Continue
              </Button>
            )}
          </div>
        </div>

        {showDetails && (
          <div className="mt-4 pt-4 border-t border-green-200" data-testid="pricing-details">
            <div className="space-y-3">
              <h4 className="font-medium text-green-900">Cost Breakdown</h4>
              
              {estimate.items.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-green-700">{item.description}</span>
                  <span className="font-medium text-green-900">
                    {formatCurrency(item.total)}
                  </span>
                </div>
              ))}

              <div className="border-t border-green-200 pt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-green-700">Subtotal</span>
                  <span className="font-medium text-green-900">
                    {formatCurrency(estimate.subtotal)}
                  </span>
                </div>
                
                {estimate.discounts > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-700">Multi-feature discount</span>
                    <span className="font-medium text-green-900">
                      -{formatCurrency(estimate.discounts)}
                    </span>
                  </div>
                )}
                
                <div className="flex justify-between text-lg font-bold border-t border-green-200 pt-2">
                  <span className="text-green-900">Total</span>
                  <span className="text-green-900">{formatCurrency(estimate.total)}</span>
                </div>
              </div>

              <div className="text-xs text-green-600 mt-2">
                <p>✓ Estimate ID: {estimate.estimateId}</p>
                <p>✓ Cryptographically signed</p>
                <p>✓ Valid until {new Date(estimate.validUntil).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}