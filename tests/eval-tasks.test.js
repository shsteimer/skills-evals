import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { evalTask, findTaskResults, parseArgs, parseEvaluationMarkdown } from '../scripts/eval-tasks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('parseArgs', () => {
  it('should parse result directory from positional argument', () => {
    const result = parseArgs(['node', 'eval-tasks.js', 'results/20251204-074135']);
    expect(result.resultDir).toBe('results/20251204-074135');
    expect(result.showHelp).toBe(false);
  });

  it('should set showHelp flag when --help is provided', () => {
    const result = parseArgs(['node', 'eval-tasks.js', '--help']);
    expect(result.showHelp).toBe(true);
  });

  it('should set showHelp flag when -h is provided', () => {
    const result = parseArgs(['node', 'eval-tasks.js', '-h']);
    expect(result.showHelp).toBe(true);
  });

  it('should handle no arguments', () => {
    const result = parseArgs(['node', 'eval-tasks.js']);
    expect(result.resultDir).toBe(null);
    expect(result.showHelp).toBe(false);
  });

  it('should default parallel to 3', () => {
    const result = parseArgs(['node', 'eval-tasks.js']);
    expect(result.parallel).toBe(3);
  });

  it('should parse --parallel flag', () => {
    const result = parseArgs(['node', 'eval-tasks.js', '--parallel', '5']);
    expect(result.parallel).toBe(5);
  });

  it('should throw error for non-numeric parallel value', () => {
    expect(() => parseArgs(['node', 'eval-tasks.js', '--parallel', 'abc'])).toThrow('--parallel must be a positive integer');
  });

  it('should throw error for negative parallel value', () => {
    expect(() => parseArgs(['node', 'eval-tasks.js', '--parallel', '-1'])).toThrow('--parallel must be a positive integer');
  });

  it('should throw error for zero parallel value', () => {
    expect(() => parseArgs(['node', 'eval-tasks.js', '--parallel', '0'])).toThrow('--parallel must be a positive integer');
  });
});

describe('findTaskResults', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'eval-tasks');
  
  beforeEach(async () => {
    // Create test fixtures
    await fs.mkdir(path.join(fixturesDir, '20251204-074135', 'hello-world-claude'), { recursive: true });
    await fs.writeFile(
      path.join(fixturesDir, '20251204-074135', 'hello-world-claude', 'task.json'),
      JSON.stringify({ name: 'hello-world', agent: 'claude', description: 'Test task' })
    );
    await fs.writeFile(
      path.join(fixturesDir, '20251204-074135', 'hello-world-claude', 'criteria.txt'),
      'Test criteria'
    );
    await fs.writeFile(
      path.join(fixturesDir, '20251204-074135', 'hello-world-claude', 'prompt.txt'),
      'Test prompt'
    );
  });

  afterEach(async () => {
    // Clean up fixtures
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  it('should find task results in specified directory', async () => {
    const args = { resultDir: path.join(fixturesDir, '20251204-074135') };
    const results = await findTaskResults(args, fixturesDir);
    
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('hello-world');
    expect(results[0].agent).toBe('claude');
    expect(results[0].criteria).toBe('Test criteria');
    expect(results[0].prompt).toBe('Test prompt');
  });

  it('should find most recent results when no directory specified', async () => {
    // Create another results directory
    await fs.mkdir(path.join(fixturesDir, '20251204-080000', 'test-task'), { recursive: true });
    await fs.writeFile(
      path.join(fixturesDir, '20251204-080000', 'test-task', 'task.json'),
      JSON.stringify({ name: 'test-task', agent: 'cursor' })
    );
    await fs.writeFile(
      path.join(fixturesDir, '20251204-080000', 'test-task', 'criteria.txt'),
      'Criteria'
    );
    await fs.writeFile(
      path.join(fixturesDir, '20251204-080000', 'test-task', 'prompt.txt'),
      'Prompt'
    );

    const args = { resultDir: null };
    const results = await findTaskResults(args, fixturesDir);
    
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('test-task');
    expect(results[0].agent).toBe('cursor');
  });

  it('should return empty array when no results directories exist', async () => {
    const emptyDir = path.join(fixturesDir, 'empty');
    await fs.mkdir(emptyDir, { recursive: true });
    
    const args = { resultDir: null };
    const results = await findTaskResults(args, emptyDir);
    
    expect(results).toEqual([]);
  });

  it('should skip folders without required files', async () => {
    // Create a folder without task.json
    await fs.mkdir(path.join(fixturesDir, '20251204-074135', 'incomplete-task'), { recursive: true });
    
    const args = { resultDir: path.join(fixturesDir, '20251204-074135') };
    const results = await findTaskResults(args, fixturesDir);
    
    // Should only find the complete task
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('hello-world');
  });
});

describe('evalTask - log support', () => {
  const fixturesDir = path.join(__dirname, 'fixtures', 'eval-tasks-log');
  let taskResult;
  let originalFetch;

  beforeEach(async () => {
    // Mock fetch to avoid actual API calls
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '# Evaluation Results\n\n**Task:** test-task\n**Agent:** claude\n**Overall Success:** Yes\n\n## Summary\n\nTest evaluation\n\n## Detailed Analysis\n\nThe agent performed well.'
              }
            ]
          }
        ]
      })
    });

    // Mock environment variable
    process.env.OPENAI_API_KEY = 'test-key';

    // Create test fixtures
    const taskDir = path.join(fixturesDir, 'test-task');
    await fs.mkdir(taskDir, { recursive: true });
    
    taskResult = {
      name: 'test-task',
      agent: 'claude',
      description: 'Test task',
      criteria: 'Test criteria',
      prompt: 'Test prompt',
      resultPath: taskDir,
      folderName: 'test-task'
    };

    // Create required files
    await fs.writeFile(path.join(taskDir, 'changes.diff'), 'test changes');
    await fs.writeFile(path.join(taskDir, 'lint-results.json'), '{}');
    await fs.writeFile(path.join(taskDir, 'output.jsonl'), 'test log output');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    await fs.rm(fixturesDir, { recursive: true, force: true });
  });

  it('should include log in eval prompt when output.jsonl exists', async () => {
    // Run evaluation
    const result = await evalTask(taskResult);

    // Check that eval-prompt.txt was created and contains the log
    const evalPromptPath = path.join(taskResult.resultPath, 'eval-prompt.txt');
    const evalPrompt = await fs.readFile(evalPromptPath, 'utf-8');
    
    expect(evalPrompt).toContain('test log output');
    
    // Check that final-result.md was created
    const finalResultPath = path.join(taskResult.resultPath, 'final-result.md');
    const finalResult = await fs.readFile(finalResultPath, 'utf-8');
    
    expect(finalResult).toContain('Evaluation Results');
    expect(finalResult).toContain('**Overall Success:** Yes');
    const evalResultPath = path.join(taskResult.resultPath, 'eval-result.json');
    const evalResult = JSON.parse(await fs.readFile(evalResultPath, 'utf-8'));
    expect(evalResult.score).toBeNull();
    expect(evalResult.overallSuccess).toBe(true);
    expect(result.markdown).toBeTruthy();
  });

  it('should handle missing log gracefully', async () => {
    // Remove the log file
    await fs.unlink(path.join(taskResult.resultPath, 'output.jsonl'));

    // Run evaluation
    const result = await evalTask(taskResult);

    // Check that eval-prompt.txt contains fallback text
    const evalPromptPath = path.join(taskResult.resultPath, 'eval-prompt.txt');
    const evalPrompt = await fs.readFile(evalPromptPath, 'utf-8');
    
    expect(evalPrompt).toContain('(No log available)');
    
    // Check that final-result.md was created
    const finalResultPath = path.join(taskResult.resultPath, 'final-result.md');
    const finalResult = await fs.readFile(finalResultPath, 'utf-8');
    
    expect(finalResult).toContain('Evaluation Results');
    expect(result.markdown).toBeTruthy();
  });
});

describe('parseEvaluationMarkdown', () => {
  it('should parse score and success from markdown format', () => {
    const parsed = parseEvaluationMarkdown('**Score:** 8.5\n\n**Overall Success:** Yes');
    expect(parsed.score).toBe(8.5);
    expect(parsed.overallSuccess).toBe(true);
  });

  it('should parse score format with /10', () => {
    const parsed = parseEvaluationMarkdown('**Score:** **9/10**');
    expect(parsed.score).toBe(9);
  });

  it('should parse json style fields when present', () => {
    const parsed = parseEvaluationMarkdown('{"score":7,"overallSuccess":false}');
    expect(parsed.score).toBe(7);
    expect(parsed.overallSuccess).toBe(false);
  });

  it('should return nulls when no structured fields are found', () => {
    const parsed = parseEvaluationMarkdown('No explicit score given');
    expect(parsed.score).toBeNull();
    expect(parsed.overallSuccess).toBeNull();
  });

  it('should infer success from met/not met fallback', () => {
    const parsed = parseEvaluationMarkdown('Criteria A: Met\nCriteria B: Met\nCriteria C: Not Met');
    expect(parsed.overallSuccess).toBe(false);
  });
});
