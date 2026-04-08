/**
 * Data Helper Utilities
 */

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Remove undefined/null values from object
 */
export function removeEmpty<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Check if array is not empty
 */
export function isNotEmptyArray<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * Chunk an array into smaller arrays
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get unique values from array
 */
export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
