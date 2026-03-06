import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EPSILON = 1e-9;

export function parseArgs(argv) {
  const result = {
    baselineDir: null,
    candidateDir: null,
    minMeasurableGains: 1,
    requireGain: true,
    maxQualityRegressions: 0,
    outputJsonPath: null,
    outputHtmlPath: null,
    relevanceFile: null,
    manifestFile: null,
    contextFile: null,
    softFailOnInfra: false,
    showHelp: false
  };

  const parseBooleanArg = (value, flagName) => {
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
    throw new Error(`${flagName} must be a boolean (true/false)`);
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
    } else if (arg === '--min-gain' && i + 1 < argv.length) {
      result.minMeasurableGains = Number(argv[++i]);
    } else if (arg === '--require-gain' && i + 1 < argv.length) {
      result.requireGain = parseBooleanArg(argv[++i], '--require-gain');
    } else if (arg === '--max-regressions' && i + 1 < argv.length) {
      result.maxQualityRegressions = Number(argv[++i]);
    } else if (arg === '--output-json' && i + 1 < argv.length) {
      result.outputJsonPath = argv[++i];
    } else if (arg === '--output-html' && i + 1 < argv.length) {
      result.outputHtmlPath = argv[++i];
    } else if (arg === '--relevance-file' && i + 1 < argv.length) {
      result.relevanceFile = argv[++i];
    } else if (arg === '--manifest' && i + 1 < argv.length) {
      result.manifestFile = argv[++i];
    } else if (arg === '--context-file' && i + 1 < argv.length) {
      result.contextFile = argv[++i];
    } else if (arg === '--soft-fail-on-infra' && i + 1 < argv.length) {
      result.softFailOnInfra = parseBooleanArg(argv[++i], '--soft-fail-on-infra');
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
Usage: npm run compare-runs -- <baseline-results-dir> <candidate-results-dir> [options]

Options:
  --min-gain <n>         Minimum measurable gains required (default: 1)
  --require-gain <bool>  Require measurable gains for pass/fail (default: true)
  --max-regressions <n>  Maximum allowed quality regressions (default: 0)
  --soft-fail-on-infra <bool> Soft-pass when only scoring failures are present (default: false)
  --output-json <path>   Write machine-readable summary JSON to file
  --output-html <path>   Write HTML report to file (default: comparison-report.html in results parent)
  --manifest <path>      Optional gate manifest with blocking/relevance hints
  --context-file <path>  Optional text file for keyword-based relevance matching
  --relevance-file <path> Optional explicit per-task relevance overrides
  -h, --help             Show this help message
`);
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

function toRunKey(taskJson) {
  const iteration = taskJson.iteration ?? 1;
  return `${taskJson.name}::${taskJson.agent}::${iteration}`;
}

async function loadRuns(resultsDir) {
  const targetDir = path.resolve(resultsDir);
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  const runs = new Map();

  for (const dir of dirs) {
    const runDir = path.join(targetDir, dir.name);
    const taskJson = await safeReadJson(path.join(runDir, 'task.json'));
    if (!taskJson) {
      continue;
    }

    const evalResult = await safeReadJson(path.join(runDir, 'eval-result.json'));
    const metrics = await safeReadJson(path.join(runDir, 'run-metrics.json'));

    const key = toRunKey(taskJson);
    runs.set(key, {
      key,
      folderName: dir.name,
      task: taskJson.name,
      agent: taskJson.agent,
      iteration: taskJson.iteration ?? 1,
      score: evalResult?.score ?? null,
      scoreDisplay: evalResult?.scoreDisplay ?? null,
      overallSuccess: evalResult?.overallSuccess ?? null,
      totalTokens: metrics?.tokenUsage?.totalTokens ?? null,
      durationMs: metrics?.durationMs ?? null
    });
  }

  return runs;
}

function summarizeTotals(runs) {
  const values = Array.from(runs.values());
  const scores = values.map((run) => run.score).filter((score) => typeof score === 'number');
  const successes = values
    .map((run) => run.overallSuccess)
    .filter((success) => typeof success === 'boolean');
  const totalTokens = values
    .map((run) => run.totalTokens)
    .filter((tokens) => typeof tokens === 'number')
    .reduce((sum, value) => sum + value, 0);

  return {
    runCount: values.length,
    avgScore: scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    successRate: successes.length > 0 ? successes.filter(Boolean).length / successes.length : null,
    totalTokens: totalTokens || null
  };
}

function normalizeTaskConfigMap(input) {
  if (!input || typeof input !== 'object') {
    return {};
  }
  if (input.tasks && typeof input.tasks === 'object') {
    return input.tasks;
  }
  return input;
}

function resolveTaskPolicy(taskName, manifestMap, relevanceMap, contextText) {
  const manifest = manifestMap[taskName] || {};
  const override = relevanceMap[taskName] || {};

  let relevant = override.relevant ?? true;
  const blocking = override.blocking ?? manifest.blocking ?? true;
  let reason = override.reason ?? null;

  const keywords = manifest.relevanceKeywords;
  if (override.relevant === undefined && Array.isArray(keywords) && keywords.length > 0 && contextText) {
    const haystack = contextText.toLowerCase();
    const hasMatch = keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
    relevant = hasMatch;
    if (!hasMatch) {
      reason = reason || `No relevance keyword match (${keywords.join(', ')})`;
    }
  }

  return { relevant, blocking, reason };
}

export function compareRuns(baselineRuns, candidateRuns, options = {}) {
  const keys = Array.from(baselineRuns.keys()).filter((key) => candidateRuns.has(key)).sort();
  const comparisons = [];
  const manifestMap = normalizeTaskConfigMap(options.manifestMap || {});
  const relevanceMap = normalizeTaskConfigMap(options.relevanceMap || {});
  const contextText = options.contextText || '';

  for (const key of keys) {
    const baseline = baselineRuns.get(key);
    const candidate = candidateRuns.get(key);
    const policy = resolveTaskPolicy(baseline.task, manifestMap, relevanceMap, contextText);

    if (!policy.relevant) {
      comparisons.push({
        key,
        task: baseline.task,
        agent: baseline.agent,
        iteration: baseline.iteration,
        baseline,
        candidate,
        relevant: false,
        blocking: policy.blocking,
        skipReason: policy.reason || 'Marked not relevant',
        qualityRegressed: false,
        measurableGain: false,
        scoringFailure: false
      });
      continue;
    }

    let qualityDelta = null;
    let qualityRegressed = false;
    let qualityEqual = false;
    let qualityImproved = false;
    let scoringFailure = false;
    let scoringFailureReason = null;

    if (typeof baseline.score === 'number' && typeof candidate.score === 'number') {
      qualityDelta = candidate.score - baseline.score;
      qualityRegressed = qualityDelta < -EPSILON;
      qualityEqual = Math.abs(qualityDelta) <= EPSILON;
      qualityImproved = qualityDelta > EPSILON;
    } else if (typeof baseline.overallSuccess === 'boolean' && typeof candidate.overallSuccess === 'boolean') {
      qualityRegressed = baseline.overallSuccess && !candidate.overallSuccess;
      qualityImproved = !baseline.overallSuccess && candidate.overallSuccess;
      qualityEqual = baseline.overallSuccess === candidate.overallSuccess;
    } else {
      scoringFailure = true;
      scoringFailureReason = 'Missing comparable score/success fields';
      if (policy.blocking) {
        qualityRegressed = true;
      }
    }

    const tokenDelta =
      typeof baseline.totalTokens === 'number' && typeof candidate.totalTokens === 'number'
        ? candidate.totalTokens - baseline.totalTokens
        : null;

    const durationDelta =
      typeof baseline.durationMs === 'number' && typeof candidate.durationMs === 'number'
        ? candidate.durationMs - baseline.durationMs
        : null;

    const stableQuality = !scoringFailure && qualityEqual;
    const tokenGainWithStableQuality = stableQuality && typeof tokenDelta === 'number' && tokenDelta < 0;
    const durationGainWithStableQuality = stableQuality && typeof durationDelta === 'number' && durationDelta < 0;
    const efficiencyGain = tokenGainWithStableQuality || durationGainWithStableQuality;

    comparisons.push({
      key,
      task: baseline.task,
      agent: baseline.agent,
      iteration: baseline.iteration,
      baseline,
      candidate,
      relevant: true,
      blocking: policy.blocking,
      qualityDelta,
      tokenDelta,
      durationDelta,
      qualityImproved,
      qualityRegressed,
      tokenGainWithStableQuality,
      durationGainWithStableQuality,
      efficiencyGain,
      measurableGain: qualityImproved || efficiencyGain,
      scoringFailure,
      scoringFailureReason
    });
  }

  const relevantComparisons = comparisons.filter((item) => item.relevant);
  const skippedNotRelevant = comparisons.filter((item) => !item.relevant).length;
  const qualityRegressions = relevantComparisons.filter((item) => item.qualityRegressed).length;
  const measurableGains = relevantComparisons.filter((item) => item.measurableGain).length;
  const scoringFailures = relevantComparisons.filter((item) => item.scoringFailure).length;

  return {
    comparisons,
    relevantComparisons,
    skippedNotRelevant,
    qualityRegressions,
    measurableGains,
    scoringFailures
  };
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  return value.toFixed(digits);
}

function renderSummary(summary) {
  const lines = [];
  lines.push('# Compare Runs Summary');
  lines.push('');
  lines.push(`- Runs compared: ${summary.comparedCount}`);
  lines.push(`- Skipped not relevant: ${summary.skippedNotRelevant}`);
  lines.push(`- Scoring failures: ${summary.scoringFailures}`);
  lines.push(`- Quality regressions: ${summary.qualityRegressions}`);
  lines.push(`- Measurable gains: ${summary.measurableGains}`);
  lines.push(`- Require measurable gain: ${summary.requireGain ? 'yes' : 'no'}`);
  lines.push(`- Gate result: ${summary.passed ? 'PASS' : 'FAIL'}`);
  if (summary.softFailed) {
    lines.push(`- Soft-fail mode: PASS (${summary.softFailReason})`);
  }
  lines.push('');
  lines.push('## Aggregate Metrics');
  lines.push('');
  lines.push('| Variant | Runs | Avg Score | Success Rate | Total Tokens |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  lines.push(
    `| Baseline | ${summary.baselineTotals.runCount} | ${formatNumber(summary.baselineTotals.avgScore)} | ${formatPercent(summary.baselineTotals.successRate)} | ${summary.baselineTotals.totalTokens ?? 'n/a'} |`
  );
  lines.push(
    `| Candidate | ${summary.candidateTotals.runCount} | ${formatNumber(summary.candidateTotals.avgScore)} | ${formatPercent(summary.candidateTotals.successRate)} | ${summary.candidateTotals.totalTokens ?? 'n/a'} |`
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.showHelp) {
    showHelp();
    return;
  }

  if (!args.baselineDir || !args.candidateDir) {
    throw new Error('Both baseline and candidate results directories are required.');
  }

  const baselineRuns = await loadRuns(args.baselineDir);
  const candidateRuns = await loadRuns(args.candidateDir);
  const manifestMap = args.manifestFile ? await safeReadJson(path.resolve(args.manifestFile)) : {};
  const relevanceMap = args.relevanceFile ? await safeReadJson(path.resolve(args.relevanceFile)) : {};
  const contextText = args.contextFile ? await safeReadText(path.resolve(args.contextFile)) : '';

  const diff = compareRuns(baselineRuns, candidateRuns, { manifestMap, relevanceMap, contextText });
  const baselineTotals = summarizeTotals(baselineRuns);
  const candidateTotals = summarizeTotals(candidateRuns);

  const resolvedBaseline = path.resolve(args.baselineDir);
  const resolvedCandidate = path.resolve(args.candidateDir);

  const summary = {
    baselineDir: resolvedBaseline,
    candidateDir: resolvedCandidate,
    baselineDirName: path.basename(resolvedBaseline),
    candidateDirName: path.basename(resolvedCandidate),
    comparedCount: diff.relevantComparisons.length,
    skippedNotRelevant: diff.skippedNotRelevant,
    scoringFailures: diff.scoringFailures,
    qualityRegressions: diff.qualityRegressions,
    measurableGains: diff.measurableGains,
    requireGain: args.requireGain,
    minMeasurableGains: args.minMeasurableGains,
    maxQualityRegressions: args.maxQualityRegressions,
    passed: false,
    softFailed: false,
    softFailReason: null,
    baselineTotals,
    candidateTotals,
    comparisons: diff.comparisons
  };

  const hasQualityRegression = diff.qualityRegressions > args.maxQualityRegressions;
  const hasInsufficientGain = args.requireGain && diff.measurableGains < args.minMeasurableGains;
  summary.passed = !hasQualityRegression && !hasInsufficientGain;

  if (!summary.passed && args.softFailOnInfra) {
    const hasHardRegression = diff.relevantComparisons.some(
      (item) => item.qualityRegressed && !item.scoringFailure
    );
    const hasScoringFailures = diff.scoringFailures > 0;
    if (!hasHardRegression && hasScoringFailures) {
      summary.softFailed = true;
      summary.softFailReason = 'Only scoring failures detected; treat as transient infrastructure issue.';
      summary.passed = true;
    }
  }

  console.log(renderSummary(summary));

  if (args.outputJsonPath) {
    const outputPath = path.resolve(args.outputJsonPath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\nWrote ${outputPath}`);
  }

  // Generate HTML comparison report
  const htmlPath = args.outputHtmlPath
    ? path.resolve(args.outputHtmlPath)
    : path.join(path.resolve(args.candidateDir), '..', 'comparison-report.html');
  const templatePath = path.join(__dirname, 'report', 'comparison-template.html');
  const template = await fs.readFile(templatePath, 'utf-8');
  const html = template.replace('/*__COMPARE_DATA__*/', JSON.stringify(summary, null, 2));
  await fs.mkdir(path.dirname(htmlPath), { recursive: true });
  await fs.writeFile(htmlPath, html, 'utf-8');
  console.log(`\nReport: ${htmlPath}`);

  if (!summary.passed) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
