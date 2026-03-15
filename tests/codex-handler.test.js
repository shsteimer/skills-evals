import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../scripts/utils/env-config.js', () => ({
  getAgentConfig: vi.fn(() => ({ model: undefined, additionalArgs: '' })),
  parseAdditionalArgs: vi.fn(() => []),
  getSafehouseConfig: vi.fn(() => ({ bin: 'safehouse' })),
  getBotAuthConfig: vi.fn(() => ({
    ghToken: undefined,
    gitName: 'skills-evals-bot',
    gitEmail: 'skills-evals-bot@users.noreply.github.com',
  })),
}));

import { buildArgs } from '../scripts/handlers/codex.js';
import { getAgentConfig, parseAdditionalArgs } from '../scripts/utils/env-config.js';

describe('codex buildArgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAgentConfig.mockReturnValue({ model: undefined, additionalArgs: '' });
    parseAdditionalArgs.mockReturnValue([]);
  });

  it('should include exec subcommand', () => {
    const args = buildArgs();
    expect(args[0]).toBe('exec');
  });

  it('should include --dangerously-bypass-approvals-and-sandbox', () => {
    const args = buildArgs();
    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('should not include --full-auto (replaced by bypass mode)', () => {
    const args = buildArgs();
    expect(args).not.toContain('--full-auto');
  });

  it('should include --json', () => {
    const args = buildArgs();
    expect(args).toContain('--json');
  });

  it('should include model when configured', () => {
    getAgentConfig.mockReturnValue({ model: 'o3', additionalArgs: '' });
    const args = buildArgs();
    expect(args).toContain('--model');
    expect(args).toContain('o3');
  });

  it('should include additional args when configured', () => {
    parseAdditionalArgs.mockReturnValue(['--max-turns', '50']);
    const args = buildArgs();
    expect(args).toContain('--max-turns');
    expect(args).toContain('50');
  });
});
