import { describe, it, expect } from 'vitest';
import { extractAgentMetricsFromOutput } from '../scripts/utils/agent-metrics.js';

describe('extractAgentMetricsFromOutput', () => {
  it('should return empty metrics for empty output', () => {
    const metrics = extractAgentMetricsFromOutput('');
    expect(metrics.parsedLines).toBe(0);
    expect(metrics.usageEvents).toBe(0);
    expect(metrics.tokenUsage.totalTokens).toBe(0);
  });

  it('should aggregate token usage from json lines', () => {
    const output = [
      JSON.stringify({ type: 'event', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }),
      JSON.stringify({ usage: { prompt_tokens: 3, completion_tokens: 2 } })
    ].join('\n');

    const metrics = extractAgentMetricsFromOutput(output);
    expect(metrics.parsedLines).toBe(2);
    expect(metrics.usageEvents).toBe(2);
    expect(metrics.tokenUsage.inputTokens).toBe(13);
    expect(metrics.tokenUsage.outputTokens).toBe(7);
    expect(metrics.tokenUsage.totalTokens).toBe(20);
  });

  it('should ignore non-json lines safely', () => {
    const output = 'not-json\n{"usage":{"total_tokens":9}}';
    const metrics = extractAgentMetricsFromOutput(output);
    expect(metrics.parsedLines).toBe(1);
    expect(metrics.tokenUsage.totalTokens).toBe(9);
  });
});
