import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../scripts/utils/env-config.js', () => ({
  getAgentConfig: vi.fn(() => ({ model: undefined, additionalArgs: '' })),
  parseAdditionalArgs: vi.fn(() => []),
}));

import { buildArgs } from '../scripts/handlers/cursor.js';
import { getAgentConfig, parseAdditionalArgs } from '../scripts/utils/env-config.js';

describe('cursor buildArgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAgentConfig.mockReturnValue({ model: undefined, additionalArgs: '' });
    parseAdditionalArgs.mockReturnValue([]);
  });

  it('should include --trust flag', () => {
    const args = buildArgs();
    expect(args).toContain('--trust');
  });

  it('should NOT include --force flag', () => {
    const args = buildArgs();
    expect(args).not.toContain('--force');
  });

  it('should include output format', () => {
    const args = buildArgs();
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
  });

  it('should include model when configured', () => {
    getAgentConfig.mockReturnValue({ model: 'gpt-4o', additionalArgs: '' });
    const args = buildArgs();
    expect(args).toContain('--model');
    expect(args).toContain('gpt-4o');
  });

  it('should not include model when not configured', () => {
    const args = buildArgs();
    expect(args).not.toContain('--model');
  });

  it('should include additional args when configured', () => {
    parseAdditionalArgs.mockReturnValue(['--max-turns', '50']);
    const args = buildArgs();
    expect(args).toContain('--max-turns');
    expect(args).toContain('50');
  });
});
