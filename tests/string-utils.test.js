import { describe, it, expect } from 'vitest';
import { sanitizeName, getCurrentTimestamp } from '../scripts/utils/string-utils.js';

describe('string-utils', () => {
  describe('sanitizeName', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeName('HelloWorld')).toBe('helloworld');
      expect(sanitizeName('UPPERCASE')).toBe('uppercase');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeName('hello world')).toBe('hello-world');
      expect(sanitizeName('multiple   spaces')).toBe('multiple-spaces');
      expect(sanitizeName('  leading and trailing  ')).toBe('-leading-and-trailing-');
    });

    it('should remove special characters', () => {
      expect(sanitizeName('hello@world')).toBe('helloworld');
      expect(sanitizeName('test!@#$%^&*()file')).toBe('testfile');
      expect(sanitizeName('file_name.txt')).toBe('filenametxt');
    });

    it('should preserve hyphens', () => {
      expect(sanitizeName('already-hyphenated')).toBe('already-hyphenated');
      expect(sanitizeName('test-with-multiple-hyphens')).toBe('test-with-multiple-hyphens');
    });

    it('should preserve numbers', () => {
      expect(sanitizeName('test123')).toBe('test123');
      expect(sanitizeName('file-v2.0')).toBe('file-v20');
    });

    it('should handle empty string', () => {
      expect(sanitizeName('')).toBe('');
    });

    it('should handle complex mixed input', () => {
      expect(sanitizeName('My Test File v1.2!')).toBe('my-test-file-v12');
      expect(sanitizeName('Claude 3.5 Sonnet (Preview)')).toBe('claude-35-sonnet-preview');
    });

    it('should handle strings with only special characters', () => {
      expect(sanitizeName('!@#$%^&*()')).toBe('');
      expect(sanitizeName('   ')).toBe('-');
    });

    it('should handle underscores', () => {
      expect(sanitizeName('hello_world')).toBe('helloworld');
      expect(sanitizeName('test_file_name')).toBe('testfilename');
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return timestamp in correct format', () => {
      const timestamp = getCurrentTimestamp();
      
      // Format: YYYYMMDD-HHMMSS
      expect(timestamp).toMatch(/^\d{8}-\d{6}$/);
    });

    it('should have correct date components', () => {
      const timestamp = getCurrentTimestamp();
      const now = new Date();
      
      const year = timestamp.substring(0, 4);
      const month = timestamp.substring(4, 6);
      const day = timestamp.substring(6, 8);
      
      expect(year).toBe(String(now.getFullYear()));
      expect(parseInt(month)).toBeGreaterThanOrEqual(1);
      expect(parseInt(month)).toBeLessThanOrEqual(12);
      expect(parseInt(day)).toBeGreaterThanOrEqual(1);
      expect(parseInt(day)).toBeLessThanOrEqual(31);
    });

    it('should have correct time components', () => {
      const timestamp = getCurrentTimestamp();
      
      const hours = timestamp.substring(9, 11);
      const minutes = timestamp.substring(11, 13);
      const seconds = timestamp.substring(13, 15);
      
      expect(parseInt(hours)).toBeGreaterThanOrEqual(0);
      expect(parseInt(hours)).toBeLessThanOrEqual(23);
      expect(parseInt(minutes)).toBeGreaterThanOrEqual(0);
      expect(parseInt(minutes)).toBeLessThanOrEqual(59);
      expect(parseInt(seconds)).toBeGreaterThanOrEqual(0);
      expect(parseInt(seconds)).toBeLessThanOrEqual(59);
    });

    it('should pad single digit values with zero', () => {
      const timestamp = getCurrentTimestamp();
      
      // All components should be 2 digits
      const parts = timestamp.split('-');
      expect(parts[0]).toHaveLength(8); // YYYYMMDD
      expect(parts[1]).toHaveLength(6); // HHMMSS
    });

    it('should generate unique timestamps when called sequentially', () => {
      const timestamp1 = getCurrentTimestamp();
      // Small delay to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 1100) {
        // Wait for at least 1 second
      }
      const timestamp2 = getCurrentTimestamp();
      
      expect(timestamp1).not.toBe(timestamp2);
    });
  });
});

