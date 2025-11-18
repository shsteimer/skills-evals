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
    by_priority: {
      high: {},
      medium: {},
      low: {},
    },
    overall_notes: [],
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

      // Try to parse JSON from output
      let evaluationData;
      try {
        const output = evalResult.stdout.trim();

        // Try to parse as JSON
        let parsedOutput;
        try {
          parsedOutput = JSON.parse(output);
        } catch (e) {
          // Extract JSON from text
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedOutput = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Could not find JSON in output');
          }
        }

        // Check if this is claude-code wrapped format
        if (parsedOutput.result && typeof parsedOutput.result === 'string') {
          // Extract JSON from markdown code block
          const codeBlockMatch = parsedOutput.result.match(/```json\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            evaluationData = JSON.parse(codeBlockMatch[1]);
          } else {
            const jsonMatch = parsedOutput.result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              evaluationData = JSON.parse(jsonMatch[0]);
            } else {
              evaluationData = parsedOutput;
            }
          }
        } else {
          evaluationData = parsedOutput;
        }

        console.log('  ✓ Received evaluation from agent\n');

        // Validate structure
        if (evaluationData.by_priority) {
          results.by_priority = evaluationData.by_priority;
        }
        if (evaluationData.overall_notes) {
          results.overall_notes = evaluationData.overall_notes;
        }

        // Save parsed evaluation
        writeFileSync(join(outputDir, 'eval-agent-response.json'), JSON.stringify(evaluationData, null, 2));
      } catch (parseError) {
        console.log(`  ⚠ Could not parse agent response as JSON: ${parseError.message}`);
        console.log('  Creating placeholder results instead\n');

        // Fall back to placeholder results
        for (const criterion of criteria) {
          const priority = criterion.priority || 'medium';

          if (!results.by_priority[priority]) {
            results.by_priority[priority] = {};
          }

          results.by_priority[priority][criterion.name] = {
            strengths: ['[Could not parse agent response]'],
            issues: [],
            notes: ['Agent output saved to eval-agent-output.txt', `Criterion: ${criterion.description}`],
          };
        }

        results.overall_notes.push('Note: Agent response could not be parsed. See eval-agent-output.txt for raw output.');
      }
    } catch (error) {
      console.log(`  ✗ Error running eval agent: ${error.message}\n`);

      // Create placeholder results
      for (const criterion of criteria) {
        const priority = criterion.priority || 'medium';

        if (!results.by_priority[priority]) {
          results.by_priority[priority] = {};
        }

        results.by_priority[priority][criterion.name] = {
          strengths: [],
          issues: [`Evaluation agent failed: ${error.message}`],
          notes: [`Criterion: ${criterion.description}`],
        };
      }

      results.overall_notes.push(`Error: Could not run evaluation agent - ${error.message}`);
    }
  } catch (error) {
    console.log(`  ✗ Error in dynamic evaluation: ${error.message}`);
    results.overall_notes.push(`Error during evaluation: ${error.message}`);
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

# Agent Skills Test Evaluation

You are evaluating the results of an agent skills test. Your task is to assess the agent's performance based on the dynamic criteria defined for this test.

## Test Information

**Test Name:** ${testDef.name}
**Description:** ${testDef.description || 'N/A'}
**Agent Under Evaluation:** ${agentName}
**Task:** ${testDef.task}

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

Think carefully about both the overall agent output (code changes made, final response delivered to the user) and the steps the agent took to get there (tools used, decisions made, approach taken).

For each criterion, provide:

1. **Strengths**: What went well? What did the agent do correctly?
2. **Issues**: What didn't go well? What could be improved?
3. **Notes**: Additional observations or context

## Important Guidelines

- Focus on qualitative assessment, not scores
- Consider the specific task and context
- Acknowledge that there may be multiple valid approaches
- Note both successes and areas for improvement
- Be constructive and specific in your feedback

## Output Format

Provide your evaluation as markdown with the following structure:

### Overall Notes

[Start with an overall assessment including:
- General observations about the agent's performance
- Summary of strengths and weaknesses
- Notable patterns or behaviors
- Overall assessment of task completion]

### HIGH Priority

#### [criterion_name]

**Strengths:**

- [strength 1]
- [strength 2]

**Issues:**

- [issue 1]
- [issue 2]

**Notes:**

- [note 1]
- [note 2]

[Repeat for each HIGH priority criterion]

### MEDIUM Priority

[Same structure as HIGH priority]

### LOW Priority

[Same structure as HIGH priority]

IMPORTANT: Respond with ONLY the markdown content above. Do not include any other text, explanations, or commentary outside of the requested markdown format.
`;

  return prompt;
}
