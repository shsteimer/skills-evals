import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseArgs(argv) {
  const result = {
    baselineDir: null,
    candidateDir: null,
    outputDir: null,
    showHelp: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
    } else if (arg === '--output-dir' && i + 1 < argv.length) {
      result.outputDir = argv[++i];
    } else if (!arg.startsWith('-') && !result.baselineDir) {
      result.baselineDir = arg;
    } else if (!arg.startsWith('-') && !result.candidateDir) {
      result.candidateDir = arg;
    }
  }

  return result;
}

function showHelp() {
  console.log(`
Usage: npm run compare-batches -- <baseline-dir> <candidate-dir> [options]

Compare two batch summaries to identify improvements and regressions.

Arguments:
  <baseline-dir>     Path to baseline batch directory
  <candidate-dir>    Path to candidate batch directory

Options:
  --output-dir <path>  Output directory (default: results/comparisons/<timestamp>)
  -h, --help           Show this help message
`);
}

export function generateTimestamp() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export async function loadBatchSummary(batchDir) {
  const summaryPath = path.join(path.resolve(batchDir), 'batch-summary.json');
  const content = await fs.readFile(summaryPath, 'utf-8');
  return JSON.parse(content);
}

export function matchGroups(baselineGroups, candidateGroups) {
  const baselineKeys = new Set(Object.keys(baselineGroups));
  const candidateKeys = new Set(Object.keys(candidateGroups));

  const matched = [];
  const baselineOnly = [];
  const candidateOnly = [];

  for (const key of baselineKeys) {
    if (candidateKeys.has(key)) {
      matched.push(key);
    } else {
      baselineOnly.push(key);
    }
  }

  for (const key of candidateKeys) {
    if (!baselineKeys.has(key)) {
      candidateOnly.push(key);
    }
  }

  return { matched, baselineOnly, candidateOnly };
}

function safeDelta(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return b - a;
  return null;
}

export function compareGroup(baselineGroup, candidateGroup) {
  const bs = baselineGroup.stats;
  const cs = candidateGroup.stats;

  return {
    scoreDelta: safeDelta(bs.meanScore, cs.meanScore),
    successRateDelta: safeDelta(bs.successRate, cs.successRate),
    tokensDelta: safeDelta(bs.meanTokens, cs.meanTokens),
    durationDelta: safeDelta(bs.meanDurationMs, cs.meanDurationMs)
  };
}

export function compareBatches(baselineSummary, candidateSummary) {
  const { matched, baselineOnly, candidateOnly } = matchGroups(
    baselineSummary.groups,
    candidateSummary.groups
  );

  const matchedResults = matched.map(key => {
    const baselineGroup = baselineSummary.groups[key];
    const candidateGroup = candidateSummary.groups[key];
    const deltas = compareGroup(baselineGroup, candidateGroup);

    return {
      key,
      task: baselineGroup.task,
      agent: baselineGroup.agent,
      baseline: baselineGroup.stats,
      candidate: candidateGroup.stats,
      ...deltas
    };
  });

  const overallScorePctDelta = safeDelta(
    baselineSummary.batchStats.meanScorePct,
    candidateSummary.batchStats.meanScorePct
  );
  const overallSuccessRateDelta = safeDelta(
    baselineSummary.batchStats.successRate,
    candidateSummary.batchStats.successRate
  );
  const overallTokensDelta = safeDelta(
    baselineSummary.batchStats.meanTokens,
    candidateSummary.batchStats.meanTokens
  );
  const overallDurationDelta = safeDelta(
    baselineSummary.batchStats.meanDurationMs,
    candidateSummary.batchStats.meanDurationMs
  );

  return {
    mode: 'aggregate',
    baselineDir: baselineSummary.batchDir,
    candidateDir: candidateSummary.batchDir,
    baselineBatch: baselineSummary.batch,
    candidateBatch: candidateSummary.batch,
    baselineStats: baselineSummary.batchStats,
    candidateStats: candidateSummary.batchStats,
    analysis: {
      mode: 'scripted',
      focus: {
        focusGroups: [],
        focusRuns: []
      }
    },
    overallScorePctDelta,
    overallSuccessRateDelta,
    overallTokensDelta,
    overallDurationDelta,
    matched: matchedResults,
    baselineOnly,
    candidateOnly
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getBatchFocus(summary, batchRole) {
  const focus = summary?.analysis?.focus || {};
  return {
    groups: safeArray(focus.focusGroups).map((entry) => ({ ...entry, batchRole })),
    runs: safeArray(focus.focusRuns).map((entry) => ({ ...entry, batchRole }))
  };
}

export function deriveComparisonFocus(comparison, baselineSummary, candidateSummary) {
  const baselineFocus = getBatchFocus(baselineSummary, 'baseline');
  const candidateFocus = getBatchFocus(candidateSummary, 'candidate');

  const groupMap = new Map();
  const addGroupReasons = (key, task, agent, reasons, sourceLabel = null) => {
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, task, agent, reasons: [] });
    }
    const entry = groupMap.get(key);
    for (const reason of reasons) {
      entry.reasons.push(sourceLabel ? `${sourceLabel}:${reason}` : reason);
    }
  };

  for (const group of comparison.matched) {
    const reasons = [];
    if (typeof group.scoreDelta === 'number') {
      if (group.scoreDelta <= -0.5) reasons.push('score-regression');
      if (group.scoreDelta >= 0.5) reasons.push('score-improvement');
    }
    if (typeof group.successRateDelta === 'number') {
      if (group.successRateDelta < 0) reasons.push('success-regression');
      if (group.successRateDelta > 0) reasons.push('success-improvement');
    }
    if (typeof group.tokensDelta === 'number') {
      if (group.tokensDelta > 0) reasons.push('token-regression');
      if (group.tokensDelta < 0) reasons.push('token-improvement');
    }
    if (typeof group.durationDelta === 'number') {
      if (group.durationDelta > 0) reasons.push('duration-regression');
      if (group.durationDelta < 0) reasons.push('duration-improvement');
    }
    if (
      typeof group.baseline?.stddev === 'number' &&
      typeof group.candidate?.stddev === 'number' &&
      group.candidate.stddev > group.baseline.stddev + 0.25
    ) {
      reasons.push('stability-regression');
    }

    if (reasons.length > 0) {
      addGroupReasons(group.key, group.task, group.agent, reasons);
    }
  }

  for (const group of baselineFocus.groups) {
    addGroupReasons(group.key, group.task, group.agent, group.reasons || [], 'baseline');
  }
  for (const group of candidateFocus.groups) {
    addGroupReasons(group.key, group.task, group.agent, group.reasons || [], 'candidate');
  }

  const focusGroups = Array.from(groupMap.values()).map((entry) => ({
    ...entry,
    reasons: Array.from(new Set(entry.reasons))
  }));

  const focusGroupKeys = new Set(focusGroups.map((group) => group.key));
  const focusRuns = [...baselineFocus.runs, ...candidateFocus.runs]
    .filter((run) => focusGroupKeys.has(run.key))
    .map((run) => ({
      key: run.key,
      task: run.task,
      agent: run.agent,
      iteration: run.iteration,
      folderName: run.folderName,
      batchRole: run.batchRole,
      reasons: Array.from(new Set(run.reasons || []))
    }));

  focusGroups.sort((a, b) => b.reasons.length - a.reasons.length || a.key.localeCompare(b.key));
  focusRuns.sort((a, b) => b.reasons.length - a.reasons.length || a.folderName.localeCompare(b.folderName));

  return {
    mode: 'scripted',
    focusGroups,
    focusRuns
  };
}

export async function writeComparisonArtifacts(outputDir, comparison, focus) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fs.mkdir(resolvedOutputDir, { recursive: true });

  const enrichedComparison = {
    ...comparison,
    analysis: {
      ...(comparison.analysis || {}),
      mode: 'scripted',
      focus
    }
  };

  const jsonPath = path.join(resolvedOutputDir, 'comparison.json');
  await fs.writeFile(jsonPath, JSON.stringify(enrichedComparison, null, 2), 'utf-8');

  const focusPath = path.join(resolvedOutputDir, 'comparison-focus.json');
  await fs.writeFile(focusPath, JSON.stringify(focus, null, 2), 'utf-8');

  const dataJsPath = path.join(resolvedOutputDir, 'compare-data.js');
  await fs.writeFile(dataJsPath, `const compareData = ${JSON.stringify(enrichedComparison, null, 2)};\n`, 'utf-8');

  return { enrichedComparison, jsonPath, focusPath, dataJsPath };
}

function formatSummary(comparison) {
  const lines = [];
  lines.push('# Batch Comparison');
  lines.push('');
  lines.push(`Baseline: ${comparison.baselineDir}`);
  lines.push(`Candidate: ${comparison.candidateDir}`);
  lines.push('');

  const fmtDelta = (v, digits = 2) => {
    if (v == null) return 'n/a';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(digits)}`;
  };
  const fmtPctDelta = (v) => {
    if (v == null) return 'n/a';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${(v * 100).toFixed(1)}%`;
  };

  lines.push('## Overall Deltas');
  lines.push(`  Score %: ${fmtPctDelta(comparison.overallScorePctDelta)}`);
  lines.push(`  Success rate: ${fmtPctDelta(comparison.overallSuccessRateDelta)}`);
  lines.push(`  Tokens: ${fmtDelta(comparison.overallTokensDelta, 0)}`);
  lines.push(`  Duration: ${comparison.overallDurationDelta != null ? fmtDelta(comparison.overallDurationDelta / 1000, 1) + 's' : 'n/a'}`);
  lines.push('');

  lines.push('## Per Group');
  for (const m of comparison.matched) {
    lines.push(`  ${m.key}: score ${fmtDelta(m.scoreDelta)}, success ${fmtPctDelta(m.successRateDelta)}, tokens ${fmtDelta(m.tokensDelta, 0)}`);
  }

  if (comparison.baselineOnly.length > 0) {
    lines.push(`\n  Baseline only: ${comparison.baselineOnly.join(', ')}`);
  }
  if (comparison.candidateOnly.length > 0) {
    lines.push(`  Candidate only: ${comparison.candidateOnly.join(', ')}`);
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.showHelp) {
    showHelp();
    return;
  }

  if (!args.baselineDir || !args.candidateDir) {
    console.error('Error: both baseline and candidate directories are required');
    console.error('Usage: npm run compare-batches -- <baseline-dir> <candidate-dir>');
    process.exit(1);
  }

  const baselineSummary = await loadBatchSummary(args.baselineDir);
  const candidateSummary = await loadBatchSummary(args.candidateDir);
  const comparison = compareBatches(baselineSummary, candidateSummary);
  const focus = deriveComparisonFocus(comparison, baselineSummary, candidateSummary);

  console.log(formatSummary(comparison));

  // Write output to a comparison directory
  const outputDir = path.resolve(args.outputDir || path.join('results', 'comparisons', generateTimestamp()));
  const { jsonPath, focusPath, dataJsPath } = await writeComparisonArtifacts(outputDir, comparison, focus);
  console.log(`\nJSON: ${jsonPath}`);
  console.log(`Focus: ${focusPath}`);

  console.log(`Data: ${dataJsPath}`);

  const toolsDir = path.join(__dirname, '..', 'tools', 'comparison-viewer');
  const relDataPath = path.relative(toolsDir, dataJsPath);
  console.log(`View: tools/comparison-viewer/index.html?data=${relDataPath}`);
  console.log(`Dir: ${outputDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
