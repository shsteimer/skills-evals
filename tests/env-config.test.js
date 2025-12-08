import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEnv, getRequiredEnv, getAgentConfig, getEvalConfig, parseAdditionalArgs } from '../scripts/utils/env-config.js';

describe('env-config', () => {
  let originalEnv;
  
  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
  });
  
  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });
  
  describe('getEnv', () => {
    it('returns environment variable value when set', () => {
      process.env.TEST_VAR = 'test-value';
      expect(getEnv('TEST_VAR')).toBe('test-value');
    });
    
    it('returns default value when env var not set', () => {
      delete process.env.TEST_VAR;
      expect(getEnv('TEST_VAR', 'default')).toBe('default');
    });
    
    it('returns undefined when env var not set and no default', () => {
      delete process.env.TEST_VAR;
      expect(getEnv('TEST_VAR')).toBeUndefined();
    });
  });
  
  describe('getRequiredEnv', () => {
    it('returns environment variable value when set', () => {
      process.env.REQUIRED_VAR = 'required-value';
      expect(getRequiredEnv('REQUIRED_VAR')).toBe('required-value');
    });
    
    it('throws error when env var not set', () => {
      delete process.env.REQUIRED_VAR;
      expect(() => getRequiredEnv('REQUIRED_VAR')).toThrow('REQUIRED_VAR environment variable is not set');
    });
  });
  
  describe('getAgentConfig', () => {
    it('returns config for agent with model and additional args', () => {
      process.env.CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
      process.env.CLAUDE_ADDITIONAL_ARGS = '--verbose --max-tokens 1000';
      
      const config = getAgentConfig('claude');
      
      expect(config.model).toBe('claude-3-5-sonnet-20241022');
      expect(config.additionalArgs).toBe('--verbose --max-tokens 1000');
    });
    
    it('returns empty string for additionalArgs when not set', () => {
      delete process.env.CURSOR_MODEL;
      delete process.env.CURSOR_ADDITIONAL_ARGS;
      
      const config = getAgentConfig('cursor');
      
      expect(config.model).toBeUndefined();
      expect(config.additionalArgs).toBe('');
    });
    
    it('handles agent name case-insensitively', () => {
      process.env.CODEX_MODEL = 'gpt-4';
      
      const config = getAgentConfig('codex');
      
      expect(config.model).toBe('gpt-4');
    });
  });
  
  describe('getEvalConfig', () => {
    it('returns eval config with all settings', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.EVAL_MODEL = 'gpt-4-turbo';
      
      const config = getEvalConfig();
      
      expect(config.apiKey).toBe('test-api-key');
      expect(config.model).toBe('gpt-4-turbo');
    });
    
    it('uses default values when not set', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      delete process.env.EVAL_MODEL;
      
      const config = getEvalConfig();
      
      expect(config.apiKey).toBe('test-api-key');
      expect(config.model).toBe('gpt-5-mini');
    });
    
    it('throws error when OPENAI_API_KEY not set', () => {
      delete process.env.OPENAI_API_KEY;
      
      expect(() => getEvalConfig()).toThrow('OPENAI_API_KEY environment variable is not set');
    });
  });
  
  describe('parseAdditionalArgs', () => {
    it('parses space-separated arguments', () => {
      const args = parseAdditionalArgs('--verbose --max-tokens 1000');
      expect(args).toEqual(['--verbose', '--max-tokens', '1000']);
    });
    
    it('returns empty array for empty string', () => {
      expect(parseAdditionalArgs('')).toEqual([]);
      expect(parseAdditionalArgs('  ')).toEqual([]);
    });
    
    it('returns empty array for undefined', () => {
      expect(parseAdditionalArgs(undefined)).toEqual([]);
    });
    
    it('handles multiple spaces', () => {
      const args = parseAdditionalArgs('--flag1    --flag2     value');
      expect(args).toEqual(['--flag1', '--flag2', 'value']);
    });
  });
});



