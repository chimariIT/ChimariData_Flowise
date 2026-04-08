import { describe, it, expect } from '@jest/globals';
import {
  isValidUUID,
  isValidEmail,
  isNotEmpty,
  validationSuccess,
  validationFailed,
} from '../../../server/shared/utils/validation';

describe('Validation Utilities', () => {
  describe('isValidUUID', () => {
    it('validates correct UUID format', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects invalid UUID format', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('validates correct email format', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    it('rejects invalid email format', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
    });
  });

  describe('isNotEmpty', () => {
    it('returns true for non-empty values', () => {
      expect(isNotEmpty('test')).toBe(true);
      expect(isNotEmpty(0)).toBe(true);
      expect(isNotEmpty(false)).toBe(true);
    });

    it('returns false for empty values', () => {
      expect(isNotEmpty(null)).toBe(false);
      expect(isNotEmpty(undefined)).toBe(false);
      expect(isNotEmpty('')).toBe(false);
    });
  });

  describe('validationSuccess', () => {
    it('creates successful validation result', () => {
      const result = validationSuccess({ data: 'test' });
      expect(result).toEqual({ success: true, data: { data: 'test' } });
    });
  });

  describe('validationFailed', () => {
    it('creates failed validation result', () => {
      const errors = [{ field: 'name', message: 'Required' }];
      const result = validationFailed(errors);
      expect(result).toEqual({ success: false, errors });
    });
  });
});
