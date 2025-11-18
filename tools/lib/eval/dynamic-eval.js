import { writeFileSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

/**
 * Run dynamic criteria evaluation with LLM
 */
export async function runDynamicEvaluation(
  outputDir, testDef, evalAgent, skipAgentInvocation = false,
) {
  console.log('\n=== Dynamic Criteria Evaluation ===\n');

  if (skipAgentInvocation) {
    console.log('Mode: Generate prompt only (agent invocation skipped)\n');
  } else {
    console.log(`Using agent: ${evalAgent}\n`);
  }

  const results = {
    markdown_report: null,
  };

  const criteria = testDef.dynamic_criteria || testDef.flexible_criteria || [];

  if (criteria.length === 0) {
    console.log('  ℹ No dynamic criteria defined');
    return results;
  }

  console.log(`Evaluating ${criteria.length} criteria...\n`);

  try {
    // Build evaluation prompt
    const prompt = buildEvaluationPrompt(outputDir, testDef, criteria);

    // Save prompt to file for reference
    const promptPath = join(outputDir, 'evaluation-prompt.txt');
    writeFileSync(promptPath, prompt);
    console.log(`  ✓ Saved evaluation prompt: ${promptPath}`);

    // Also write to eval-task.txt for compatibility
    const evalPromptFile = join(outputDir, 'eval-task.txt');
    writeFileSync(evalPromptFile, prompt);

    // If skipping agent invocation, return early with empty results
    if (skipAgentInvocation) {
      console.log('  ℹ Skipping agent invocation (prompt generated for review)\n');
      return results;
    }

    // Invoke the evaluation agent
    console.log(`  ℹ Invoking ${evalAgent} for evaluation...\n`);

    try {
      let agentCommand;
      let agentArgs = [];

      switch (evalAgent) {
        case 'claude-code':
          agentCommand = 'claude';
          agentArgs = [
            '--permission-mode', 'bypassPermissions',
            '--output-format', 'json',
            '--print', prompt,
          ];
          break;
        case 'cursor-cli':
          agentCommand = 'cursor-agent';
          agentArgs = ['--force', prompt];
          break;
        case 'codex-cli':
          agentCommand = 'codex';
          agentArgs = ['exec', '--dangerously-bypass-approvals-and-sandbox', '--json', prompt];
          break;
        default:
          throw new Error(`Unknown eval agent: ${evalAgent}`);
      }

      console.log(`  Running: ${agentCommand} ${agentArgs.slice(0, 3).join(' ')}...`);

      const evalResult = spawnSync(agentCommand, agentArgs, {
        cwd: outputDir,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 300000, // 5 minutes
      });

      if (evalResult.error) {
        throw new Error(`Failed to run ${evalAgent}: ${evalResult.error.message}`);
      }

      // Save raw output
      writeFileSync(join(outputDir, 'eval-agent-output.txt'), `${evalResult.stdout}\n\n${evalResult.stderr}`);

      // Extract markdown response from output
      try {
        const output = evalResult.stdout.trim();
        let markdownResponse = output;

        // Check if this is claude-code wrapped format (JSON with result field)
        try {
          const parsedOutput = JSON.parse(output);
          if (parsedOutput.result && typeof parsedOutput.result === 'string') {
            markdownResponse = parsedOutput.result;
          }
        } catch (e) {
          // Not JSON, use output as-is
        }

        console.log('  ✓ Received evaluation from agent\n');

        // Save the markdown response
        writeFileSync(join(outputDir, 'eval-agent-response.md'), markdownResponse);

        // Store markdown in results for report generation
        results.markdown_report = markdownResponse;
      } catch (error) {
        console.log(`  ⚠ Error processing agent response: ${error.message}`);
        console.log('  Response saved to eval-agent-output.txt\n');

        results.markdown_report = `# Evaluation Error\n\nCould not process agent response. See eval-agent-output.txt for raw output.\n\nError: ${error.message}`;
      }
    } catch (error) {
      console.log(`  ✗ Error running eval agent: ${error.message}\n`);

      results.markdown_report = `# Evaluation Error\n\nCould not run evaluation agent.\n\nError: ${error.message}`;
    }
  } catch (error) {
    console.log(`  ✗ Error in dynamic evaluation: ${error.message}`);
    results.markdown_report = `# Evaluation Error\n\nError during evaluation: ${error.message}`;
  }

  return results;
}

/**
 * Build evaluation prompt for LLM
 */
function buildEvaluationPrompt(outputDir, testDef, criteria) {
  // Read test-info.json to get agent name
  let agentName = 'unknown';
  try {
    const testInfoPath = join(outputDir, 'test-info.json');
    const testInfo = JSON.parse(readFileSync(testInfoPath, 'utf8'));
    agentName = testInfo.agent || 'unknown';
  } catch (error) {
    // If we can't read test-info.json, continue with 'unknown'
  }

  let prompt = `You are an expert in AEM Edge Delivery Services coding and architecture. Your job is to judge how well coding agents are able to perform tasks. Your judgement should always be fair and impartial, based only on the task given and the criteria specified.

# Agent Skills Task Evaluation

You are evaluating the results of an agent skills task. Your task is to assess the agent's performance based on the dynamic criteria defined for this task.

## Task Information

**Task Name:** ${testDef.name}
**Description:** ${testDef.description || 'N/A'}
**Agent Under Evaluation:** ${agentName}
**Task Prompt:** ${testDef.task}`;

  // Add expected outcome if provided
  if (testDef.expected_outcome) {
    prompt += `
**Expected Outcome:** ${testDef.expected_outcome}`;
  }

  prompt += `

## Evaluation Criteria

You will evaluate the following criteria, organized by priority:

`;

  // Group criteria by priority
  const byPriority = { high: [], medium: [], low: [] };
  for (const criterion of criteria) {
    const priority = criterion.priority || 'medium';
    byPriority[priority].push(criterion);
  }

  for (const priority of ['high', 'medium', 'low']) {
    if (byPriority[priority].length > 0) {
      prompt += `### ${priority.toUpperCase()} Priority\n\n`;
      for (const criterion of byPriority[priority]) {
        prompt += `- **${criterion.name}**: ${criterion.description}\n`;
      }
      prompt += '\n';
    }
  }

  prompt += `## Artifacts to Review

The following artifacts are available in the output directory:

`;

  // List available artifacts
  try {
    const files = readdirSync(outputDir);
    const relevantFiles = files.filter((f) => f === 'code-diff.patch'
             || f === 'stdout.jsonl'
             || f === 'stderr.txt'
             || f === 'lint-result.json'
             || f === 'git-status.txt');

    for (const file of relevantFiles) {
      prompt += `- ${file}\n`;
    }
  } catch (error) {
    prompt += '- (Error listing files)\n';
  }

  prompt += `
## Your Task

Assess the agent's overall performance and report on how well it completed the task.

Think carefully about both the overall agent output (code changes made, final response delivered to the user) and the steps the agent took to get there (tools used, decisions made, approach taken).

Consider all of this in context of the evaluation criteria specified above and the expected outcome. Then provide a report that highlights strengths, weaknesses, issues, and notable observations.

## Guidelines

- Provide a holistic assessment, not just a checklist
- Be specific with examples from the artifacts
- Consider the criteria priorities but organize naturally
- Acknowledge when multiple approaches are valid
- Be constructive and fair in your judgment

## Output Format

Provide your evaluation as markdown with the following structure:

### Executive Summary

[Overall assessment - did the agent succeed? How well? How does the output compare to the expected outcome?]

### Strengths

- [What went well - organized naturally, not forced into rigid criterion boxes]
- [Good decisions, proper approach, quality output]
- [Effective tool usage, solid implementation choices]

### Areas for Improvement

- [Issues, weaknesses, missed opportunities]
- [What could have been done better]
- [Anti-patterns or problematic approaches]

### Detailed Analysis

[Free-form commentary providing deeper context. You may organize this by priority level, by theme, or chronologically - whatever makes the most sense for conveying your assessment clearly.]

#### High Priority Observations

[Commentary on high-priority criteria and critical aspects of the task]

#### Medium Priority Observations

[Commentary on medium-priority criteria and important aspects]

#### Low Priority Observations

[Commentary on low-priority criteria and nice-to-have aspects]

### Conclusion

[Final verdict and key takeaways about the agent's performance on this task]

IMPORTANT: Respond with ONLY the markdown content above. Do not include any other text, explanations, or commentary outside of the requested markdown format.
`;

  return prompt;
}
