import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, ArrowUpRight, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api';

interface QuotaStatus {
  quota: number;
  used: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
}

interface SubscriptionStatus {
  tier: string;
  status: string;
  displayName: string;
  expiresAt: string | null;
}

interface QuotaStatusIndicatorProps {
  featureId?: string;
  complexity?: 'small' | 'medium' | 'large' | 'extra_large';
  showCard?: boolean;
  className?: string;
}

/**
 * QuotaStatusIndicator Component
 * Displays user's current subscription tier and quota usage
 * Aligned with the unified billing system
 */
export function QuotaStatusIndicator({
  featureId = 'statistical_analysis',
  complexity = 'small',
  showCard = false,
  className = ''
}: QuotaStatusIndicatorProps) {
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch subscription status
        const subResponse = await apiClient.get('/api/billing/subscription-status');
        if (subResponse.success) {
          setSubscription(subResponse.subscription);
        }

        // Fetch quota status for specific feature
        const quotaResponse = await apiClient.get(`/api/billing/quota-status/${featureId}?complexity=${complexity}`);
        if (quotaResponse.success) {
          setQuotaStatus({
            quota: quotaResponse.quota || 0,
            used: quotaResponse.used || 0,
            remaining: quotaResponse.remaining || 0,
            percentUsed: quotaResponse.percentUsed || 0,
            isExceeded: quotaResponse.isExceeded || false
          });
        }
      } catch (err: any) {
        console.error('Failed to fetch billing status:', err);
        setError(err.message || 'Failed to load billing status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [featureId, complexity]);

  // Determine tier color
  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'enterprise':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'professional':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'starter':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'trial':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Determine quota bar color
  const getQuotaColor = (percentUsed: number) => {
    if (percentUsed >= 100) return 'bg-red-500';
    if (percentUsed >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error) {
    return null; // Silently fail - don't block the UI
  }

  // Simple inline display (default)
  if (!showCard) {
    return (
      <TooltipProvider>
        <div className={`flex items-center gap-3 ${className}`}>
          {/* Subscription Tier Badge */}
          {subscription && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className={getTierColor(subscription.tier)}>
                  {subscription.displayName || subscription.tier}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Your subscription tier</p>
                {subscription.status !== 'active' && (
                  <p className="text-yellow-600">Status: {subscription.status}</p>
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Quota Progress */}
          {quotaStatus && quotaStatus.quota > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-20">
                <Progress
                  value={Math.min(quotaStatus.percentUsed, 100)}
                  className="h-2"
                />
              </div>
              <span className="text-xs text-gray-500">
                {quotaStatus.remaining}/{quotaStatus.quota}
              </span>
              {quotaStatus.isExceeded && (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
            </div>
          )}

          {/* Unlimited for enterprise */}
          {quotaStatus && quotaStatus.quota === -1 && (
            <div className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-600">Unlimited</span>
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // Card display (for settings/billing pages)
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Subscription & Usage</CardTitle>
          {subscription && (
            <Badge variant="outline" className={getTierColor(subscription.tier)}>
              {subscription.displayName || subscription.tier}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quota Usage */}
        {quotaStatus && quotaStatus.quota > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Analysis Quota</span>
              <span className={quotaStatus.isExceeded ? 'text-red-600 font-medium' : 'text-gray-900'}>
                {quotaStatus.used} / {quotaStatus.quota}
              </span>
            </div>
            <Progress
              value={Math.min(quotaStatus.percentUsed, 100)}
              className={`h-2 ${getQuotaColor(quotaStatus.percentUsed)}`}
            />
            {quotaStatus.isExceeded && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Quota exceeded. Upgrade or pay per analysis.
              </p>
            )}
          </div>
        )}

        {/* Unlimited indicator */}
        {quotaStatus && quotaStatus.quota === -1 && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Unlimited analyses included</span>
          </div>
        )}

        {/* Upgrade CTA */}
        {subscription && subscription.tier !== 'enterprise' && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => window.location.href = '/billing/upgrade'}
          >
            Upgrade Plan
            <ArrowUpRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Subscription Required Banner
 * Shows when user needs to subscribe or upgrade to access a feature
 */
export function SubscriptionRequiredBanner({
  message,
  minimumTier,
  onUpgrade,
  onPayPerUse
}: {
  message?: string;
  minimumTier?: string;
  onUpgrade?: () => void;
  onPayPerUse?: () => void;
}) {
  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-yellow-800">
            Subscription Required
          </h4>
          <p className="text-sm text-yellow-700 mt-1">
            {message || `This feature requires a ${minimumTier || 'paid'} subscription or higher.`}
          </p>
          <div className="flex gap-2 mt-3">
            {onUpgrade && (
              <Button size="sm" onClick={onUpgrade} className="bg-yellow-600 hover:bg-yellow-700">
                Upgrade Now
              </Button>
            )}
            {onPayPerUse && (
              <Button size="sm" variant="outline" onClick={onPayPerUse}>
                Pay for This Analysis
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Quota Exceeded Banner
 * Shows when user has exceeded their quota
 */
export function QuotaExceededBanner({
  quotaStatus,
  options,
  onUpgrade,
  onPayOverage,
  onPayPerProject
}: {
  quotaStatus?: QuotaStatus;
  options?: {
    payOverage?: { cost: number; url: string };
    upgradeTier?: { url: string; recommendedTier: string };
    payPerProject?: { url: string };
  };
  onUpgrade?: () => void;
  onPayOverage?: () => void;
  onPayPerProject?: () => void;
}) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-red-800">
            Quota Exceeded
          </h4>
          <p className="text-sm text-red-700 mt-1">
            You've used {quotaStatus?.used || 0} of your {quotaStatus?.quota || 0} allocated analyses this period.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {onUpgrade && (
              <Button size="sm" onClick={onUpgrade} className="bg-red-600 hover:bg-red-700">
                Upgrade to {options?.upgradeTier?.recommendedTier || 'Higher Tier'}
              </Button>
            )}
            {onPayOverage && options?.payOverage && (
              <Button size="sm" variant="outline" onClick={onPayOverage}>
                Pay Overage (${options.payOverage.cost?.toFixed(2)})
              </Button>
            )}
            {onPayPerProject && (
              <Button size="sm" variant="outline" onClick={onPayPerProject}>
                Pay for This Project
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuotaStatusIndicator;
