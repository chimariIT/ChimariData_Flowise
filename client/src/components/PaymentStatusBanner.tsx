/**
 * PaymentStatusBanner Component
 *
 * FIX 3.3: Visual indicator for payment status in project results
 * Shows different banners for:
 * - Paid users (full access)
 * - Preview mode (limited access)
 * - Payment required (no access yet)
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Lock, CheckCircle, AlertCircle, Eye, Download, Coins, Clock } from 'lucide-react';
import { useLocation } from 'wouter';

export interface TrialCreditsInfo {
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;
  expired: boolean;
  expiresAt: string | null;
}

export interface PaymentStatusBannerProps {
  projectId: string;
  isPaid: boolean;
  isPreview?: boolean;
  previewLimits?: {
    insightsShown: number;
    totalInsights: number;
    chartsShown: number;
    totalCharts: number;
    answersShown?: number;
    totalAnswers?: number;
  };
  trialCredits?: TrialCreditsInfo | null;
  className?: string;
}

export function PaymentStatusBanner({
  projectId,
  isPaid,
  isPreview,
  previewLimits,
  trialCredits,
  className = ''
}: PaymentStatusBannerProps) {
  const [, navigate] = useLocation();

  // Format expiration date
  const formatExpirationDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) return 'Expired';
    if (daysUntil === 1) return '1 day left';
    if (daysUntil <= 7) return `${daysUntil} days left`;
    return date.toLocaleDateString();
  };

  // Paid users - show success banner
  if (isPaid) {
    return (
      <Alert className={`mb-4 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800 ${className}`}>
        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-800 dark:text-green-200">Full Access</AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-300">
          <div className="flex items-center gap-2 flex-wrap">
            <span>You have full access to all analysis results, insights, and downloadable artifacts.</span>
            <div className="flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/50 px-2 py-0.5 rounded">
              <Download className="h-3 w-3" />
              <span>Downloads enabled</span>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Preview mode - show limited access warning
  if (isPreview) {
    return (
      <Alert className={`mb-4 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 ${className}`}>
        <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">Preview Mode</AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          <p className="mb-2">You're viewing a limited preview of your analysis results.</p>
          {previewLimits && (
            <ul className="list-disc ml-4 mb-3 text-sm space-y-1">
              <li>
                Showing <strong>{previewLimits.insightsShown}</strong> of{' '}
                <strong>{previewLimits.totalInsights}</strong> insights
              </li>
              <li>
                Showing <strong>{previewLimits.chartsShown}</strong> of{' '}
                <strong>{previewLimits.totalCharts}</strong> visualizations
              </li>
              {previewLimits.answersShown !== undefined && previewLimits.totalAnswers !== undefined && (
                <li>
                  Showing <strong>{previewLimits.answersShown}</strong> of{' '}
                  <strong>{previewLimits.totalAnswers}</strong> question answers (truncated)
                </li>
              )}
              <li>Evidence chains hidden</li>
              <li>Downloads disabled</li>
            </ul>
          )}
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => navigate(`/projects/${projectId}/payment`)}
          >
            <Lock className="h-3 w-3 mr-1" />
            Unlock Full Results
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Trial credits available - show credits status
  if (trialCredits && trialCredits.remaining > 0 && !trialCredits.expired) {
    const expirationText = formatExpirationDate(trialCredits.expiresAt);
    const isLowCredits = trialCredits.remaining <= 20;

    return (
      <Alert className={`mb-4 ${isLowCredits ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800' : 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800'} ${className}`}>
        <Coins className={`h-4 w-4 ${isLowCredits ? 'text-orange-600 dark:text-orange-400' : 'text-purple-600 dark:text-purple-400'}`} />
        <AlertTitle className={isLowCredits ? 'text-orange-800 dark:text-orange-200' : 'text-purple-800 dark:text-purple-200'}>
          Trial Credits
        </AlertTitle>
        <AlertDescription className={isLowCredits ? 'text-orange-700 dark:text-orange-300' : 'text-purple-700 dark:text-purple-300'}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span>
                <strong>{trialCredits.remaining}</strong> of <strong>{trialCredits.total}</strong> credits remaining
              </span>
              {expirationText && (
                <span className="flex items-center gap-1 text-xs opacity-75">
                  <Clock className="h-3 w-3" />
                  {expirationText}
                </span>
              )}
            </div>
            <Progress
              value={100 - trialCredits.percentUsed}
              className={`h-2 ${isLowCredits ? 'bg-orange-200 dark:bg-orange-900' : 'bg-purple-200 dark:bg-purple-900'}`}
            />
            <p className="text-xs">
              {isLowCredits
                ? 'Running low on credits! Upgrade to continue unlimited analysis.'
                : 'Use your free trial credits to run analyses. Upgrade anytime for more features.'
              }
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                className={isLowCredits ? 'border-orange-300 text-orange-700 hover:bg-orange-100' : 'border-purple-300 text-purple-700 hover:bg-purple-100'}
                onClick={() => navigate('/pricing')}
              >
                View Plans
              </Button>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Trial credits expired
  if (trialCredits && trialCredits.expired) {
    return (
      <Alert className={`mb-4 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800 ${className}`}>
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertTitle className="text-red-800 dark:text-red-200">Trial Expired</AlertTitle>
        <AlertDescription className="text-red-700 dark:text-red-300">
          <p className="mb-2">Your trial credits have expired. Upgrade to continue using the platform.</p>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => navigate('/pricing')}
          >
            Upgrade Now
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Trial credits exhausted
  if (trialCredits && trialCredits.remaining === 0) {
    return (
      <Alert className={`mb-4 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 ${className}`}>
        <Coins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">Credits Exhausted</AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          <p className="mb-2">You've used all your trial credits. Upgrade to continue running analyses.</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => navigate('/pricing')}
            >
              Upgrade Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/projects/${projectId}/payment`)}
            >
              Pay for this project
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Payment required - no access yet
  return (
    <Alert className={`mb-4 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 ${className}`}>
      <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <AlertTitle className="text-blue-800 dark:text-blue-200">Payment Required</AlertTitle>
      <AlertDescription className="text-blue-700 dark:text-blue-300">
        <span>Complete payment to access your analysis results.</span>
        <Button
          variant="link"
          className="px-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
          onClick={() => navigate(`/projects/${projectId}/payment`)}
        >
          Go to Payment &rarr;
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default PaymentStatusBanner;
