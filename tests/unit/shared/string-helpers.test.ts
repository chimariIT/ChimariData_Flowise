import { describe, it, expect } from '@jest/globals';
import {
  capitalize,
  snakeToCamel,
  camelToSnake,
  truncate,
  slugify,
} from '../../../server/shared/utils/string-helpers';

describe('String Helpers', () => {
  describe('capitalize', () => {
    it('capitalizes first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('')).toBe('');
    });
  });

  describe('snakeToCamel', () => {
    it('converts snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
      expect(snakeToCamel('hello_world_test')).toBe('helloWorldTest');
    });
  });

  describe('camelToSnake', () => {
    it('converts camelCase to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
      expect(camelToSnake('helloWorldTest')).toBe('hello_world_test');
    });
  });

  describe('truncate', () => {
    it('truncates long strings', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
      expect(truncate('hi', 10)).toBe('hi');
    });
  });

  describe('slugify', () => {
    it('creates slug from string', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Hello  World  Test')).toBe('hello-world-test');
    });
  });
});
