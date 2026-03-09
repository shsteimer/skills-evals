import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Assemble a final eval-result.json from subagent output and check-resolved criteria.
 *
 * Takes:
 *  - resultFolder: path to the task result folder
 *  - subagentOutput: parsed JSON from the evaluator subagent (criteriaChecks, summary, etc.)
 *  - resolvedChecks: array of criteria resolved by checks (optional, may be empty)
 *
 * Computes scores, merges sources, writes eval-result.json + eval-data.js + eval-result.html.
 */
export async function assembleEval(resultFolder, subagentOutput, resolvedChecks = []) {
  // Merge check-resolved and judgment criteria
  const allChecks = [
    ...resolvedChecks.map(c => ({ ...c, source: 'check' })),
    ...subagentOutput.criteriaChecks.map(c => ({ ...c, source: 'judgment' }))
  ];

  // Compute scores
  let score = 0;
  let maxScore = 0;
  let criticalUnmet = false;

  for (const c of allChecks) {
    score += c.points || 0;
    if (c.priority === 'critical') {
      maxScore += 2;
      if (!c.met) criticalUnmet = true;
    } else if (c.priority === 'important') {
      maxScore += 1;
    }
  }

  const overallSuccess = !criticalUnmet && score >= 0.8 * maxScore;

  // Read task metadata
  const taskJson = JSON.parse(await fs.readFile(path.join(resultFolder, 'task.json'), 'utf-8'));

  const evalResult = {
    task: taskJson.name,
    agent: taskJson.agent,
    score,
    maxScore,
    overallSuccess,
    summary: subagentOutput.summary,
    strengths: subagentOutput.strengths,
    weaknesses: subagentOutput.weaknesses,
    observations: subagentOutput.observations,
    screenshots: subagentOutput.screenshots || [],
    criteriaChecks: allChecks
  };

  // Write eval-result.json
  await fs.writeFile(
    path.join(resultFolder, 'eval-result.json'),
    JSON.stringify(evalResult, null, 2),
    'utf-8'
  );

  // Read run metrics
  let runMetrics = null;
  try {
    runMetrics = JSON.parse(await fs.readFile(path.join(resultFolder, 'run-metrics.json'), 'utf-8'));
  } catch {
    // optional
  }

  // Write eval-data.js
  const dataJs = `const evalData = ${JSON.stringify(evalResult, null, 2)};\nconst runMetrics = ${JSON.stringify(runMetrics, null, 2)};\n`;
  await fs.writeFile(path.join(resultFolder, 'eval-data.js'), dataJs, 'utf-8');

  // Copy HTML template
  const templatePath = path.join(__dirname, 'report', 'eval-template.html');
  await fs.copyFile(templatePath, path.join(resultFolder, 'eval-result.html'));

  return evalResult;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const resultFolder = process.argv[2];
  const subagentJsonPath = process.argv[3];

  if (!resultFolder || !subagentJsonPath) {
    console.error('Usage: node scripts/assemble-eval.js <result-folder> <subagent-output.json>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(resultFolder);
  const subagentOutput = JSON.parse(await fs.readFile(path.resolve(subagentJsonPath), 'utf-8'));

  // Check for check-resolved criteria
  let resolvedChecks = [];
  const checkResultsPath = path.join(resolvedPath, 'check-resolved-criteria.json');
  try {
    resolvedChecks = JSON.parse(await fs.readFile(checkResultsPath, 'utf-8'));
  } catch {
    // no check-resolved criteria
  }

  const result = await assembleEval(resolvedPath, subagentOutput, resolvedChecks);
  console.log(`Score: ${result.score}/${result.maxScore} (${result.overallSuccess ? 'PASS' : 'FAIL'})`);
  console.log(`Criteria: ${result.criteriaChecks.length} total`);
  console.log(`  Met: ${result.criteriaChecks.filter(c => c.met).length}`);
  console.log(`  Not met: ${result.criteriaChecks.filter(c => !c.met).length}`);
  console.log(`  Check-resolved: ${result.criteriaChecks.filter(c => c.source === 'check').length}`);
  console.log(`  Judgment: ${result.criteriaChecks.filter(c => c.source === 'judgment').length}`);
}
