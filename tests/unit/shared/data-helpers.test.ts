import { describe, it, expect } from '@jest/globals';
import {
  deepClone,
  removeEmpty,
  isNotEmptyArray,
  chunkArray,
  unique,
} from '../../../server/shared/utils/data-helpers';

describe('Data Helpers', () => {
  describe('deepClone', () => {
    it('creates deep clone of object', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });
  });

  describe('removeEmpty', () => {
    it('removes null and undefined values', () => {
      const obj = { a: 1, b: null, c: undefined, d: 2 };
      const result = removeEmpty(obj);

      expect(result).toEqual({ a: 1, d: 2 });
    });
  });

  describe('isNotEmptyArray', () => {
    it('returns true for non-empty array', () => {
      expect(isNotEmptyArray([1, 2, 3])).toBe(true);
    });

    it('returns false for empty/null/undefined', () => {
      expect(isNotEmptyArray([])).toBe(false);
      expect(isNotEmptyArray(null)).toBe(false);
      expect(isNotEmptyArray(undefined)).toBe(false);
    });
  });

  describe('chunkArray', () => {
    it('chunks array into smaller arrays', () => {
      const arr = [1, 2, 3, 4, 5, 6];
      const chunks = chunkArray(arr, 2);

      expect(chunks).toEqual([[1, 2], [3, 4], [5, 6]]);
    });
  });

  describe('unique', () => {
    it('returns unique values from array', () => {
      const arr = [1, 2, 2, 3, 3, 3];
      const result = unique(arr);

      expect(result).toEqual([1, 2, 3]);
    });
  });
});
