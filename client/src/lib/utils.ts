import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ==========================================
// P3-5 FIX: Shared Currency Formatting
// ==========================================

/**
 * Format a currency amount for display.
 * Supports both cents (integer) and dollars (float) input.
 *
 * @param amount - The amount to format
 * @param options.isCents - If true, amount is in cents and will be divided by 100 (default: false)
 * @param options.currency - ISO 4217 currency code (default: 'USD')
 * @param options.locale - BCP 47 locale string (default: 'en-US')
 * @returns Formatted currency string (e.g., "$12.50") or "—" for null/undefined
 */
export function formatCurrency(
  amount: number | null | undefined,
  options?: { isCents?: boolean; currency?: string; locale?: string }
): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';

  const { isCents = false, currency = 'USD', locale = 'en-US' } = options || {};
  const value = isCents ? amount / 100 : amount;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format cents as currency (convenience wrapper).
 * Equivalent to formatCurrency(cents, { isCents: true }).
 *
 * @param cents - Amount in cents
 * @param currency - ISO 4217 currency code (default: 'USD')
 * @returns Formatted currency string
 */
export function formatCents(
  cents: number | null | undefined,
  currency = 'USD'
): string {
  return formatCurrency(cents, { isCents: true, currency });
}

// Route storage utilities for post-auth navigation
export const routeStorage = {
  // Store the route user intended to visit before authentication
  setIntendedRoute: (route: string) => {
    localStorage.setItem('intended_route', route);
  },
  
  // Get and clear the intended route after successful authentication
  getAndClearIntendedRoute: (): string | null => {
    const route = localStorage.getItem('intended_route');
    if (route) {
      localStorage.removeItem('intended_route');
      return route;
    }
    return null;
  },
  
  // Clear intended route without returning it
  clearIntendedRoute: () => {
    localStorage.removeItem('intended_route');
  }
};

// User greeting utilities
export const userGreetings = {
  // Get formatted user name for display
  getDisplayName: (user: any): string => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    } else if (user?.firstName) {
      return user.firstName;
    } else if (user?.username) {
      return user.username;
    } else if (user?.email) {
      return user.email.split('@')[0]; // Use email prefix as fallback
    }
    return 'User';
  },
  
  // Store user info for logout message
  storeUserForGoodbye: (user: any) => {
    if (user) {
      localStorage.setItem('logout_user_name', userGreetings.getDisplayName(user));
    }
  },
  
  // Get and clear user info for goodbye message
  getAndClearGoodbyeName: (): string | null => {
    const name = localStorage.getItem('logout_user_name');
    if (name) {
      localStorage.removeItem('logout_user_name');
      return name;
    }
    return null;
  }
};

// ==========================================
// ✅ FIX 2.3: Dataset Row Count Utilities
// ==========================================

/**
 * Get the accurate row count for a dataset, prioritizing transformed data
 * @param dataset - Dataset object from API
 * @returns number - The most accurate row count available
 */
export function getDatasetRowCount(dataset: any): number {
  if (!dataset) return 0;

  // Priority: transformedRecordCount > transformedRowCount > recordCount > data.length
  return (
    dataset?.ingestionMetadata?.transformedRecordCount ||
    dataset?.ingestionMetadata?.transformedRowCount ||
    dataset?.recordCount ||
    dataset?.data?.length ||
    dataset?.preview?.length ||
    0
  );
}

/**
 * Get a display string for row count, showing both transformed and original if different
 * @param dataset - Dataset object from API
 * @returns string - Human-readable row count with context
 */
export function getDatasetRowCountDisplay(dataset: any): string {
  if (!dataset) return '0 rows';

  const transformedCount =
    dataset?.ingestionMetadata?.transformedRecordCount ||
    dataset?.ingestionMetadata?.transformedRowCount;

  const originalCount =
    dataset?.recordCount ||
    dataset?.data?.length ||
    dataset?.preview?.length ||
    0;

  if (transformedCount && transformedCount !== originalCount) {
    return `${transformedCount.toLocaleString()} rows (from ${originalCount.toLocaleString()} original)`;
  }

  return `${originalCount.toLocaleString()} rows`;
}

/**
 * Check if a dataset has been transformed
 * @param dataset - Dataset object from API
 * @returns boolean
 */
export function hasDatasetBeenTransformed(dataset: any): boolean {
  if (!dataset) return false;

  return (
    dataset?.ingestionMetadata?.transformationApplied === true ||
    !!dataset?.ingestionMetadata?.transformedData ||
    !!dataset?.ingestionMetadata?.transformedAt
  );
}

/**
 * Get total row count across multiple datasets
 * @param datasets - Array of dataset objects
 * @returns number - Total rows across all datasets
 */
export function getTotalRowCount(datasets: any[]): number {
  if (!datasets || !Array.isArray(datasets)) return 0;

  return datasets.reduce((total, ds) => {
    const dataset = (ds as any)?.dataset || ds;
    return total + getDatasetRowCount(dataset);
  }, 0);
}

/**
 * Format large numbers with appropriate suffixes (K, M, B)
 * @param num - Number to format
 * @returns string - Formatted number string
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

// ==========================================
// P2-1 FIX: Confidence Score Normalization
// ==========================================

/**
 * Normalize a confidence score to 0-1 range
 * Handles both 0-100 (percentage) and 0-1 (decimal) input formats
 *
 * @param confidence - Confidence value (can be 0-100 or 0-1)
 * @returns number - Normalized confidence in 0-1 range
 */
export function normalizeConfidence(confidence: number | null | undefined): number {
  if (confidence === null || confidence === undefined || isNaN(confidence)) {
    return 0;
  }

  // If > 1, assume it's a percentage (0-100) and normalize
  if (confidence > 1) {
    return Math.min(Math.max(confidence / 100, 0), 1);
  }

  // Already in 0-1 range
  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Convert a normalized 0-1 confidence to display percentage
 *
 * @param confidence - Confidence value (0-1 or 0-100)
 * @returns number - Percentage value for display (0-100)
 */
export function confidenceToPercentage(confidence: number | null | undefined): number {
  const normalized = normalizeConfidence(confidence);
  return Math.round(normalized * 100);
}

/**
 * Format confidence for display as a string (e.g., "85%")
 *
 * @param confidence - Confidence value (0-1 or 0-100)
 * @returns string - Formatted percentage string
 */
export function formatConfidence(confidence: number | null | undefined): string {
  return `${confidenceToPercentage(confidence)}%`;
}

/**
 * Get confidence level category (high, medium, low)
 *
 * @param confidence - Confidence value (0-1 or 0-100)
 * @returns 'high' | 'medium' | 'low'
 */
export function getConfidenceLevel(confidence: number | null | undefined): 'high' | 'medium' | 'low' {
  const normalized = normalizeConfidence(confidence);
  if (normalized >= 0.7) return 'high';
  if (normalized >= 0.4) return 'medium';
  return 'low';
}

/**
 * Get appropriate badge variant for confidence level
 *
 * @param confidence - Confidence value (0-1 or 0-100)
 * @returns Badge variant string
 */
export function getConfidenceBadgeVariant(confidence: number | null | undefined): 'default' | 'secondary' | 'destructive' {
  const level = getConfidenceLevel(confidence);
  switch (level) {
    case 'high': return 'default';
    case 'medium': return 'secondary';
    case 'low': return 'destructive';
  }
}
