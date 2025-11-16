import { writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

/**
 * Run dynamic criteria evaluation with LLM
 */
export async function runDynamicEvaluation(outputDir, testDef, evalAgent) {
  console.log('\n=== Running Non-Deterministic Criteria Evaluation ===\n');
  console.log(`Using agent: ${evalAgent}\n`);

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
    console.log(`  ℹ Saved evaluation prompt: ${promptPath}`);

    // Run evaluation agent
    console.log(`  ℹ Running ${evalAgent} for evaluation...\n`);

    const evalPromptFile = join(outputDir, 'eval-task.txt');

    // Create a structured task for the agent
    const agentTask = `${prompt}

IMPORTANT: You must respond with ONLY a valid JSON object matching this schema:
{
  "by_priority": {
    "high": {
      "<criterion_name>": {
        "strengths": ["string"],
        "issues": ["string"],
        "notes": ["string"]
      }
    },
    "medium": { /* same structure */ },
    "low": { /* same structure */ }
  },
  "overall_notes": ["string"]
}

Do not include any other text before or after the JSON. The response must be valid JSON.`;

    writeFileSync(evalPromptFile, agentTask);

    // Invoke the evaluation agent
    console.log(`  Invoking ${evalAgent} for evaluation...\n`);

    try {
      let agentCommand;
      let agentArgs = [];

      switch (evalAgent) {
        case 'claude-code':
          agentCommand = 'claude';
          agentArgs = [
            '--permission-mode', 'bypassPermissions',
            '--output-format', 'json',
            '--print', agentTask,
          ];
          break;
        case 'cursor-cli':
          agentCommand = 'cursor-agent';
          agentArgs = ['--force', agentTask];
          break;
        case 'codex-cli':
          agentCommand = 'codex';
          agentArgs = ['exec', '--dangerously-bypass-approvals-and-sandbox', '--json', agentTask];
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
  let prompt = `# Agent Skills Test Evaluation

You are evaluating the results of an agent skills test. Your task is to assess the agent's performance based on the dynamic criteria defined for this test.

## Test Information

**Test Name:** ${testDef.name}
**Description:** ${testDef.description || 'N/A'}
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

For each criterion, provide:

1. **Strengths**: What went well? What did the agent do correctly?
2. **Issues**: What didn't go well? What could be improved?
3. **Notes**: Additional observations or context

Also provide **Overall Notes** with general observations about the agent's performance.

## Important Guidelines

- Focus on qualitative assessment, not scores
- Consider the specific task and context
- Acknowledge that there may be multiple valid approaches
- Note both successes and areas for improvement
- Be constructive and specific in your feedback

## Output Format

Organize your findings by priority (high/medium/low), with each criterion having:
- strengths: array of strings
- issues: array of strings
- notes: array of strings

Plus overall_notes as an array of general observations.
`;

  return prompt;
}
