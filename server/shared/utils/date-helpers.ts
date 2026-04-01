/**
 * Date Helper Utilities
 */

/**
 * Format date to ISO string
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toISOString();
}

/**
 * Parse ISO string to Date
 */
export function parseDate(isoString: string): Date {
  return new Date(isoString);
}

/**
 * Get current timestamp
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Add days to date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date | string): boolean {
  return new Date(date) < new Date();
}

/**
 * Format date for display
 */
export function formatDisplayDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
