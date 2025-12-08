import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEvalConfig } from './utils/env-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseArgs(argv) {
  const result = {
    resultDir: null,
    showHelp: false
  };

  // Skip first two args (node and script path)
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
    } else if (!arg.startsWith('-')) {
      // Positional argument - path to results folder
      result.resultDir = arg;
    }
  }

  return result;
}

function showHelp() {
  console.log(`
Usage: npm run eval-tasks [path]

Arguments:
  path                 Path to results folder (defaults to most recent in results/)

Options:
  -h, --help           Show this help message

Examples:
  npm run eval-tasks
  npm run eval-tasks results/20251204-074135
  npm run eval-tasks /absolute/path/to/results
`);
}

export async function findTaskResults(args, resultsBaseDir = null) {
  const baseDir = resultsBaseDir || path.join(__dirname, '..', 'results');
  
  // If no result dir specified, find the most recent one
  let targetDir;
  if (args.resultDir) {
    // User provided a path - use it as-is (relative to CWD or absolute)
    targetDir = path.resolve(args.resultDir);
  } else {
    // Find most recent results directory
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      const dirs = entries
        .filter(entry => entry.isDirectory())
        .map(dir => dir.name)
        .sort()
        .reverse();
      
      if (dirs.length === 0) {
        console.log('No results directories found');
        return [];
      }
      
      targetDir = path.join(baseDir, dirs[0]);
      console.log(`Using most recent results: ${dirs[0]}`);
    } catch (error) {
      console.log('No results directory found');
      return [];
    }
  }
  
  // Scan target directory for task result folders
  let taskFolders;
  try {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    taskFolders = entries.filter(entry => entry.isDirectory());
  } catch (error) {
    console.log(`Could not read results directory: ${targetDir}`);
    return [];
  }
  
  const taskResults = [];
  for (const folder of taskFolders) {
    const taskResultPath = path.join(targetDir, folder.name);
    const taskJsonPath = path.join(taskResultPath, 'task.json');
    
    try {
      // Read task.json
      const taskJsonContent = await fs.readFile(taskJsonPath, 'utf-8');
      const taskData = JSON.parse(taskJsonContent);
      
      // Read criteria.txt
      const criteriaPath = path.join(taskResultPath, 'criteria.txt');
      const criteria = await fs.readFile(criteriaPath, 'utf-8');
      
      // Read prompt.txt
      const promptPath = path.join(taskResultPath, 'prompt.txt');
      const prompt = await fs.readFile(promptPath, 'utf-8');
      
      taskResults.push({
        ...taskData,
        criteria,
        prompt,
        resultPath: taskResultPath,
        folderName: folder.name
      });
    } catch (error) {
      // Skip folders that don't have required files
      continue;
    }
  }
  
  return taskResults;
}

async function createEvalPrompt(taskResult, changes, lintResults, testResults, commits, log) {
  // Read template file
  const templatePath = path.join(__dirname, 'eval-prompt-template.txt');
  let template = await fs.readFile(templatePath, 'utf-8');
  
  // Replace placeholders
  template = template.replace('{{TASK_NAME}}', taskResult.name);
  template = template.replace('{{AGENT}}', taskResult.agent);
  template = template.replace('{{DESCRIPTION}}', taskResult.description || 'N/A');
  template = template.replace('{{PROMPT}}', taskResult.prompt);
  template = template.replace('{{CRITERIA}}', taskResult.criteria);
  template = template.replace('{{CHANGES}}', changes);
  template = template.replace('{{LINT_RESULTS}}', JSON.stringify(lintResults, null, 2));
  
  // Handle optional test results
  const testResultsSection = testResults ? `
# Test Results
\`\`\`json
${JSON.stringify(testResults, null, 2)}
\`\`\`
` : '';
  template = template.replace('{{TEST_RESULTS}}', testResultsSection);
  
  // Handle optional commits
  const commitsSection = commits && commits.length > 0 ? `
# Git Commits
${commits.map(c => `- ${c.hash.substring(0, 7)}: ${c.message}`).join('\n')}
` : '';
  template = template.replace('{{COMMITS}}', commitsSection);
  
  // Handle log
  template = template.replace('{{Log}}', log || '(No log available)');
  
  return template;
}

async function cleanupEvalArtifacts(resultPath) {
  const artifactsToClean = [
    'eval-prompt.txt',
    'eval-result.json',
    'final-result.md'
  ];
  
  for (const artifact of artifactsToClean) {
    try {
      await fs.unlink(path.join(resultPath, artifact));
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }
}

export async function evalTask(taskResult) {
  console.log(`\nEvaluating: ${taskResult.folderName}`);
  console.log(`Task: ${taskResult.name}`);
  console.log(`Agent: ${taskResult.agent}`);
  
  // Clean up any previous evaluation artifacts
  await cleanupEvalArtifacts(taskResult.resultPath);
  
  // Read additional files
  const changesPath = path.join(taskResult.resultPath, 'changes.diff');
  const lintPath = path.join(taskResult.resultPath, 'lint-results.json');
  const testPath = path.join(taskResult.resultPath, 'test-results.json');
  const commitsPath = path.join(taskResult.resultPath, 'commits.json');
  const logPath = path.join(taskResult.resultPath, 'output.jsonl');
  
  let changes = '';
  let lintResults = null;
  let testResults = null;
  let commits = null;
  let log = '';
  
  try {
    changes = await fs.readFile(changesPath, 'utf-8');
  } catch (error) {
    console.log('  Warning: No changes.diff found');
  }
  
  try {
    lintResults = JSON.parse(await fs.readFile(lintPath, 'utf-8'));
  } catch (error) {
    console.log('  Warning: No lint-results.json found');
  }
  
  try {
    testResults = JSON.parse(await fs.readFile(testPath, 'utf-8'));
  } catch (error) {
    // Test results are optional
  }
  
  try {
    commits = JSON.parse(await fs.readFile(commitsPath, 'utf-8'));
  } catch (error) {
    // Commits are optional
  }
  
  try {
    log = await fs.readFile(logPath, 'utf-8');
  } catch (error) {
    console.log('  Warning: No output.jsonl found');
  }
  
  // Create evaluation prompt
  const evalPrompt = await createEvalPrompt(taskResult, changes, lintResults, testResults, commits, log);
  
  // Write eval prompt to file
  const evalPromptPath = path.join(taskResult.resultPath, 'eval-prompt.txt');
  await fs.writeFile(evalPromptPath, evalPrompt, 'utf-8');
  console.log('  ✓ Created eval-prompt.txt');
  
  // Call LLM API for evaluation
  try {
    const markdown = await callLLMForEvaluation(evalPrompt);
    
    // Write final result
    const finalResultPath = path.join(taskResult.resultPath, 'final-result.md');
    await fs.writeFile(finalResultPath, markdown, 'utf-8');
    console.log('  ✓ Evaluation complete');
    
    return { markdown };
  } catch (error) {
    console.error(`  ✗ Evaluation failed: ${error.message}`);
    throw error;
  }
}

async function callLLMForEvaluation(prompt) {
  // Get evaluation config from environment
  const config = getEvalConfig();
  
  // Read system prompt from file
  const systemPromptPath = path.join(__dirname, 'eval-system-prompt.txt');
  const systemPrompt = await fs.readFile(systemPromptPath, 'utf-8');
  
  // Call OpenAI Responses API
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      instructions: systemPrompt.trim(),
      input: prompt
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  
  // Extract text from responses API output structure
  const messageOutput = data.output.find(item => item.type === 'message');
  if (!messageOutput || !messageOutput.content || messageOutput.content.length === 0) {
    throw new Error('API response missing message content');
  }
  
  const textContent = messageOutput.content.find(item => item.type === 'output_text');
  if (!textContent || !textContent.text) {
    throw new Error('API response missing text content');
  }
  
  return textContent.text;
}

async function evalTasks() {
  const args = parseArgs(process.argv);
  
  if (args.showHelp) {
    showHelp();
    return;
  }
  
  const taskResults = await findTaskResults(args);
  
  if (taskResults.length === 0) {
    console.log('No task results found to evaluate');
    return;
  }
  
  console.log(`Found ${taskResults.length} task result(s) to evaluate\n`);
  
  for (const taskResult of taskResults) {
    await evalTask(taskResult);
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  evalTasks();
}
