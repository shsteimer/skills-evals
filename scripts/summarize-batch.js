import fs from 'fs/promises';
import path from 'path';

export function parseArgs(argv) {
  const result = {
    batchDir: null,
    showHelp: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
    } else if (!arg.startsWith('-') && !result.batchDir) {
      result.batchDir = arg;
    }
  }

  return result;
}

function showHelp() {
  console.log(`
Usage: npm run summarize-batch -- <batch-dir>

Summarize evaluation results for all runs in a batch directory.

Arguments:
  <batch-dir>    Path to batch directory (e.g. results/20260308-135305)

Options:
  -h, --help     Show this help message
`);
}

async function safeReadJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function normalizeRunFromRunReport(folderName, taskJson, runReport) {
  const metrics = runReport.runMetrics || null;
  return {
    folderName,
    task: taskJson.name,
    agent: taskJson.agent,
    iteration: taskJson.iteration ?? 1,
    score: runReport.mechanicalScore ?? null,
    maxScore: runReport.mechanicalMaxScore ?? null,
    overallSuccess: runReport.mechanicalSuccess ?? null,
    totalTokens: metrics?.tokenUsage?.totalTokens ?? null,
    durationMs: metrics?.durationMs ?? null,
    timedOut: metrics?.timedOut ?? runReport.timedOut ?? false,
    criteriaChecks: runReport.resolvedCriteria ?? [],
    unresolvedCriteriaCount: runReport.unresolvedCriteriaCount ?? 0,
    warnings: runReport.warnings ?? [],
    evaluationMode: runReport.evaluationMode ?? 'scripted',
    reportSource: 'run-report'
  };
}

function normalizeRunFromEvalResult(folderName, taskJson, evalResult, metrics) {
  return {
    folderName,
    task: taskJson.name,
    agent: taskJson.agent,
    iteration: taskJson.iteration ?? 1,
    score: evalResult.score ?? null,
    maxScore: evalResult.maxScore ?? null,
    overallSuccess: evalResult.overallSuccess ?? null,
    totalTokens: metrics?.tokenUsage?.totalTokens ?? null,
    durationMs: metrics?.durationMs ?? null,
    timedOut: metrics?.timedOut ?? false,
    criteriaChecks: evalResult.criteriaChecks ?? [],
    unresolvedCriteriaCount: null,
    warnings: [],
    evaluationMode: 'judged',
    reportSource: 'eval-result'
  };
}

export async function loadBatchRuns(batchDir) {
  const targetDir = path.resolve(batchDir);
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory());
  const runs = [];

  for (const dir of dirs) {
    const runDir = path.join(targetDir, dir.name);
    const taskJson = await safeReadJson(path.join(runDir, 'task.json'));
    if (!taskJson) continue;

    const runReport = await safeReadJson(path.join(runDir, 'run-report.json'));
    if (runReport) {
      runs.push(normalizeRunFromRunReport(dir.name, taskJson, runReport));
      continue;
    }

    const evalResult = await safeReadJson(path.join(runDir, 'eval-result.json'));
    if (!evalResult) continue;

    const metrics = await safeReadJson(path.join(runDir, 'run-metrics.json'));
    runs.push(normalizeRunFromEvalResult(dir.name, taskJson, evalResult, metrics));
  }

  return runs;
}

export function groupRuns(runs) {
  const groups = {};

  for (const run of runs) {
    const key = `${run.task}::${run.agent}`;
    if (!groups[key]) {
      groups[key] = { task: run.task, agent: run.agent, runs: [] };
    }
    groups[key].runs.push(run);
  }

  return groups;
}

export function computeGroupStats(group) {
  const { runs } = group;
  const scores = runs.map(r => r.score).filter(s => typeof s === 'number');
  const successes = runs.map(r => r.overallSuccess).filter(s => typeof s === 'boolean');
  const tokens = runs.map(r => r.totalTokens).filter(t => typeof t === 'number');
  const durations = runs.map(r => r.durationMs).filter(d => typeof d === 'number');

  const mean = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const meanScore = mean(scores);
  const minScore = scores.length > 0 ? Math.min(...scores) : null;
  const maxScore = scores.length > 0 ? Math.max(...scores) : null;

  // Score as percentage of maxScore — comparable across tasks with different point totals
  const scorePcts = runs
    .filter(r => typeof r.score === 'number' && typeof r.maxScore === 'number' && r.maxScore > 0)
    .map(r => r.score / r.maxScore);
  const meanScorePct = mean(scorePcts);

  let stddev = 0;
  if (scores.length > 1) {
    const variance = scores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0) / scores.length;
    stddev = Math.sqrt(variance);
  }

  const successRate = successes.length > 0
    ? successes.filter(Boolean).length / successes.length
    : null;

  // Common failures: criteria failing in >50% of iterations
  const failureCounts = {};
  const totalWithChecks = runs.filter(r => r.criteriaChecks && r.criteriaChecks.length > 0).length;

  for (const run of runs) {
    if (!run.criteriaChecks) continue;
    for (const check of run.criteriaChecks) {
      if (!check.met) {
        failureCounts[check.name] = (failureCounts[check.name] || 0) + 1;
      }
    }
  }

  const commonFailures = totalWithChecks > 0
    ? Object.entries(failureCounts)
      .filter(([, count]) => count / totalWithChecks > 0.5)
      .map(([name]) => name)
    : [];

  const timedOutCount = runs.filter(r => r.timedOut).length;
  const warningCounts = {};
  let unresolvedCriteriaRunCount = 0;

  for (const run of runs) {
    if (typeof run.unresolvedCriteriaCount === 'number' && run.unresolvedCriteriaCount > 0) {
      unresolvedCriteriaRunCount++;
    }
    for (const warning of run.warnings || []) {
      warningCounts[warning] = (warningCounts[warning] || 0) + 1;
    }
  }

  const commonWarnings = Object.entries(warningCounts)
    .filter(([, count]) => count / runs.length >= 0.5)
    .map(([warning]) => warning);

  return {
    runCount: runs.length,
    meanScore,
    meanScorePct,
    stddev,
    minScore,
    maxScore,
    successRate,
    meanTokens: mean(tokens),
    meanDurationMs: mean(durations),
    timedOutCount,
    commonFailures,
    commonWarnings,
    unresolvedCriteriaRunCount
  };
}

export function computeBatchStats(groups) {
  const entries = Object.values(groups);
  let totalScorePct = 0;
  let totalSuccessRate = 0;
  let totalTokens = 0;
  let totalDuration = 0;
  let totalRuns = 0;
  let scorePctCount = 0;
  let tokenCount = 0;
  let durationCount = 0;

  for (const g of entries) {
    const s = g.stats;
    totalRuns += s.runCount;
    if (s.meanScorePct !== null) { totalScorePct += s.meanScorePct * s.runCount; scorePctCount += s.runCount; }
    if (s.successRate !== null) totalSuccessRate += s.successRate * s.runCount;
    if (s.meanTokens !== null) { totalTokens += s.meanTokens * s.runCount; tokenCount += s.runCount; }
    if (s.meanDurationMs !== null) { totalDuration += s.meanDurationMs * s.runCount; durationCount += s.runCount; }
  }

  return {
    totalRuns,
    meanScorePct: scorePctCount > 0 ? totalScorePct / scorePctCount : null,
    successRate: totalRuns > 0 ? totalSuccessRate / totalRuns : null,
    meanTokens: tokenCount > 0 ? totalTokens / tokenCount : null,
    meanDurationMs: durationCount > 0 ? totalDuration / durationCount : null
  };
}

export function deriveBatchFocus(groups) {
  const focusGroups = [];
  const focusRuns = [];

  for (const [key, group] of Object.entries(groups)) {
    const reasons = [];
    const { stats, runs } = group;

    if (stats.successRate !== null && stats.successRate < 0.5) {
      reasons.push('low-success-rate');
    }
    if (stats.meanScorePct !== null && stats.meanScorePct < 0.7) {
      reasons.push('low-score');
    }
    if (stats.timedOutCount > 0 && stats.timedOutCount / stats.runCount >= 0.5) {
      reasons.push('timeout-heavy');
    }
    if ((stats.commonFailures || []).length > 0) {
      reasons.push('common-failures');
    }
    if ((stats.commonWarnings || []).length > 0) {
      reasons.push('common-warnings');
    }
    if ((stats.unresolvedCriteriaRunCount || 0) > 0) {
      reasons.push('unresolved-criteria');
    }
    if (stats.stddev > 1) {
      reasons.push('high-variance');
    }

    if (reasons.length > 0) {
      focusGroups.push({
        key,
        task: group.task,
        agent: group.agent,
        reasons,
        stats
      });
    }

    for (const run of runs) {
      const runReasons = [];
      if (run.timedOut) {
        runReasons.push('timed-out');
      }
      if (run.overallSuccess === false) {
        runReasons.push('failed');
      }
      if ((run.warnings || []).length > 0) {
        runReasons.push(...run.warnings);
      }
      if (typeof run.unresolvedCriteriaCount === 'number' && run.unresolvedCriteriaCount > 0) {
        runReasons.push('unresolved-criteria');
      }

      if (runReasons.length > 0) {
        focusRuns.push({
          key,
          folderName: run.folderName,
          task: run.task,
          agent: run.agent,
          iteration: run.iteration,
          reasons: Array.from(new Set(runReasons))
        });
      }
    }
  }

  focusGroups.sort((a, b) => b.reasons.length - a.reasons.length || a.key.localeCompare(b.key));
  focusRuns.sort((a, b) => b.reasons.length - a.reasons.length || a.folderName.localeCompare(b.folderName));

  return {
    mode: 'scripted',
    focusGroups,
    focusRuns
  };
}

async function countTotalRuns(batchDir) {
  const targetDir = path.resolve(batchDir);
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const taskJson = await safeReadJson(path.join(targetDir, entry.name, 'task.json'));
    if (taskJson) count++;
  }
  return count;
}

export async function summarizeBatch(batchDir) {
  const targetDir = path.resolve(batchDir);

  // Load batch metadata (may not exist for older batches)
  const batch = await safeReadJson(path.join(targetDir, 'batch.json'));

  // Count total runs (dirs with task.json) to determine missing evals
  const totalRuns = await countTotalRuns(batchDir);

  // Load and group runs (only those with eval-result.json)
  const runs = await loadBatchRuns(batchDir);
  const groups = groupRuns(runs);

  // Compute per-group stats
  for (const [, group] of Object.entries(groups)) {
    group.stats = computeGroupStats(group);
  }

  // Compute overall batch stats
  const batchStats = computeBatchStats(groups);
  const focus = deriveBatchFocus(groups);

  return {
    batchDir: targetDir,
    batch,
    batchStats,
    analysis: {
      mode: 'scripted',
      focus
    },
    groups: Object.fromEntries(
      Object.entries(groups).map(([key, g]) => [key, {
        task: g.task,
        agent: g.agent,
        stats: g.stats,
        runs: g.runs.map(r => ({
          folderName: r.folderName,
          iteration: r.iteration,
          score: r.score,
          maxScore: r.maxScore,
          overallSuccess: r.overallSuccess,
          warnings: r.warnings
        }))
      }])
    ),
    runCount: totalRuns,
    evaluatedCount: runs.length,
    missingEvalCount: totalRuns - runs.length
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.showHelp) {
    showHelp();
    return;
  }

  if (!args.batchDir) {
    console.error('Error: batch directory is required');
    console.error('Usage: node scripts/summarize-batch.js <batch-dir>');
    process.exit(1);
  }

  const summary = await summarizeBatch(args.batchDir);
  const targetDir = path.resolve(args.batchDir);

  // Write batch-summary.json (raw stats only — batch-summary-data.js is
  // produced here for scripted-only summaries; assemble-batch-summary.js can
  // still merge optional narrative analysis later.
  const summaryPath = path.join(targetDir, 'batch-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Wrote ${summaryPath}`);

  const focusPath = path.join(targetDir, 'batch-focus.json');
  await fs.writeFile(focusPath, JSON.stringify(summary.analysis.focus, null, 2), 'utf-8');
  console.log(`Wrote ${focusPath}`);

  const dataPath = path.join(targetDir, 'batch-summary-data.js');
  await fs.writeFile(
    dataPath,
    `const batchSummaryData = ${JSON.stringify(summary, null, 2)};\n`,
    'utf-8'
  );
  console.log(`Wrote ${dataPath}`);

  // Print summary
  console.log(`\nBatch: ${targetDir}`);
  console.log(`Runs evaluated: ${summary.evaluatedCount}`);
  console.log(`Mean score: ${summary.batchStats.meanScorePct != null ? (summary.batchStats.meanScorePct * 100).toFixed(1) + '%' : 'n/a'}`);
  console.log(`Success rate: ${summary.batchStats.successRate != null ? (summary.batchStats.successRate * 100).toFixed(1) + '%' : 'n/a'}`);
  console.log(`Mean tokens: ${summary.batchStats.meanTokens != null ? Math.round(summary.batchStats.meanTokens).toLocaleString() : 'n/a'}`);

  // Print per-group table
  console.log('\nPer task+agent:');
  for (const [key, g] of Object.entries(summary.groups)) {
    const s = g.stats;
    const scoreStr = s.meanScore != null ? `${s.meanScore.toFixed(1)} ± ${s.stddev.toFixed(1)}` : 'n/a';
    const successStr = s.successRate != null ? `${(s.successRate * 100).toFixed(0)}%` : 'n/a';
    console.log(`  ${key}: score=${scoreStr}, success=${successStr}, n=${s.runCount}`);
    if (s.commonFailures.length > 0) {
      console.log(`    common failures: ${s.commonFailures.join(', ')}`);
    }
    if (s.commonWarnings.length > 0) {
      console.log(`    common warnings: ${s.commonWarnings.join(', ')}`);
    }
  }

}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
