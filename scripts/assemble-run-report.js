import fs from 'fs/promises';
import path from 'path';
import { parseAgentLog } from './parse-agent-log.js';
import { writeCheckResolutionFiles } from './resolve-checks.js';

function summarizeChecks(checks) {
  if (!Array.isArray(checks)) {
    return { total: 0, passed: 0, failed: 0, failedChecks: [] };
  }

  const failedChecks = checks.filter((check) => !check.passed).map((check) => check.name);
  return {
    total: checks.length,
    passed: checks.filter((check) => check.passed).length,
    failed: failedChecks.length,
    failedChecks,
  };
}

function summarizeDiff(diffContent) {
  if (!diffContent || !diffContent.trim()) {
    return { hasDiff: false, changedFiles: 0 };
  }

  const changedFiles = (diffContent.match(/^diff --git /gm) || []).length;
  return {
    hasDiff: true,
    changedFiles,
  };
}

function summarizeActivity(jsonlContent) {
  if (!jsonlContent || !jsonlContent.trim()) {
    return {
      eventCount: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolsUsed: [],
    };
  }

  const events = parseAgentLog(jsonlContent);
  const toolsUsed = Array.from(
    new Set(events.filter((event) => event.type === 'tool_call').map((event) => event.tool))
  ).sort();

  return {
    eventCount: events.length,
    assistantMessages: events.filter((event) => event.type === 'assistant_text').length,
    toolCalls: events.filter((event) => event.type === 'tool_call').length,
    toolsUsed,
  };
}

function computeMechanicalScore(resolvedCriteria) {
  let mechanicalScore = 0;
  let mechanicalMaxScore = 0;
  let criticalUnmet = false;

  for (const criterion of resolvedCriteria) {
    mechanicalScore += criterion.points || 0;
    if (criterion.priority === 'critical') {
      mechanicalMaxScore += 2;
      if (!criterion.met) {
        criticalUnmet = true;
      }
    } else if (criterion.priority === 'important') {
      mechanicalMaxScore += 1;
    }
  }

  return {
    mechanicalScore,
    mechanicalMaxScore,
    mechanicalSuccess:
      mechanicalMaxScore > 0
        ? !criticalUnmet && mechanicalScore >= 0.8 * mechanicalMaxScore
        : null,
  };
}

function collectWarnings({ timedOut, commitCount, hasDiff, failedChecks }) {
  const warnings = [];

  if (timedOut) {
    warnings.push('timed-out');
  }
  if (commitCount === 0) {
    warnings.push('no-commits');
  }
  if (!hasDiff) {
    warnings.push('no-diff');
  }
  if (failedChecks.includes('checks-script-error')) {
    warnings.push('checks-script-error');
  }

  return warnings;
}

async function safeReadJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

async function safeReadText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export async function assembleRunReport(resultFolder) {
  const resolvedPath = path.resolve(resultFolder);
  const taskJson = JSON.parse(await fs.readFile(path.join(resolvedPath, 'task.json'), 'utf-8'));
  const checkResolution = await writeCheckResolutionFiles(resolvedPath);
  const checks = await safeReadJson(path.join(resolvedPath, 'check-results.json'));
  const tests = await safeReadJson(path.join(resolvedPath, 'test-results.json'));
  const runMetrics = await safeReadJson(path.join(resolvedPath, 'run-metrics.json'));
  const commits = await safeReadJson(path.join(resolvedPath, 'commits.json'));
  const diffContent = await safeReadText(path.join(resolvedPath, 'changes.diff'));
  const outputContent = await safeReadText(path.join(resolvedPath, 'output.jsonl'));

  const checksSummary = summarizeChecks(checks);
  const diffSummary = summarizeDiff(diffContent);
  const activitySummary = summarizeActivity(outputContent);
  const scoreSummary = computeMechanicalScore(checkResolution.resolved);
  const commitCount = Array.isArray(commits) ? commits.length : 0;
  const warnings = collectWarnings({
    timedOut: runMetrics?.timedOut === true,
    commitCount,
    hasDiff: diffSummary.hasDiff,
    failedChecks: checksSummary.failedChecks,
  });

  const report = {
    task: taskJson.name,
    agent: taskJson.agent,
    model: taskJson.model || null,
    augmentationSetName: taskJson.augmentationSetName || null,
    runSetId: taskJson.runSetId || taskJson.timestamp,
    iteration: taskJson.iteration || null,
    evaluationMode: 'scripted',
    timedOut: runMetrics?.timedOut === true,
    mechanicalScore: scoreSummary.mechanicalScore,
    mechanicalMaxScore: scoreSummary.mechanicalMaxScore,
    mechanicalSuccess: scoreSummary.mechanicalSuccess,
    resolvedCriteriaCount: checkResolution.resolved.length,
    unresolvedCriteriaCount: checkResolution.unresolved.length,
    warnings,
    resolvedCriteria: checkResolution.resolved,
    unresolvedCriteria: checkResolution.unresolved,
    checks: {
      summary: checksSummary,
      results: checks || [],
    },
    tests,
    runMetrics,
    git: {
      commitCount,
      commits: commits || [],
      changedFiles: diffSummary.changedFiles,
      hasDiff: diffSummary.hasDiff,
    },
    activitySummary,
  };

  await fs.writeFile(
    path.join(resolvedPath, 'run-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );
  await fs.writeFile(
    path.join(resolvedPath, 'run-report-data.js'),
    `const runReportData = ${JSON.stringify(report, null, 2)};\n`,
    'utf-8'
  );

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const resultFolder = process.argv[2];

  if (!resultFolder) {
    console.error('Usage: node scripts/assemble-run-report.js <result-folder>');
    process.exit(1);
  }

  const report = await assembleRunReport(path.resolve(resultFolder));
  console.log(`Mechanical score: ${report.mechanicalScore}/${report.mechanicalMaxScore}`);
  console.log(`Resolved criteria: ${report.resolvedCriteriaCount}`);
  console.log(`Unresolved criteria: ${report.unresolvedCriteriaCount}`);
}
