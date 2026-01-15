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
import { Lock, CheckCircle, AlertCircle, Eye, Download } from 'lucide-react';
import { useLocation } from 'wouter';

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
  className?: string;
}

export function PaymentStatusBanner({
  projectId,
  isPaid,
  isPreview,
  previewLimits,
  className = ''
}: PaymentStatusBannerProps) {
  const [, navigate] = useLocation();

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
