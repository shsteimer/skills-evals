# Benchmarking

This repo needs two benchmark classes, and they should not be mixed:

1. **Compatibility replay**
   - Old result folders kept to prove newer scripts can still summarize and compare legacy artifacts.
   - These are useful for regression detection in the framework.
   - They are **not** decision-grade evidence for quality or token-efficiency claims.

2. **Decision-grade benchmark runs**
   - Fresh baseline/candidate pairs collected under the current pipeline.
   - These are the runs used to decide whether a branch actually improved quality, efficiency, or consistency.

The machine-readable source of truth is [config/benchmark-manifest.json](/tmp/skills-evals-proposal.vqsfQX/config/benchmark-manifest.json).

## Benchmark Suites

The manifest defines three forward-looking suites plus one legacy replay suite:

- `legacy-replay-feb-2026`
  - Replay-only. Used to prove backward compatibility of the scripted summary/compare path.
- `current-pipeline-smoke`
  - Fast confidence suite for fresh runs.
  - One iteration per task-agent pair.
- `current-pipeline-core`
  - Main branch comparison suite.
  - Three iterations per task-agent pair.
- `current-pipeline-stress`
  - Higher-cost suite for timeout-prone or tool-heavy scenarios.

## What Good Benchmark Data Looks Like

Each decision-grade run should retain at least these artifacts:

- `task.json`
- `criteria.txt`
- `changes.diff`
- `commits.json`
- `run-metrics.json`
- `output.jsonl`
- `check-results.json`
- `run-report.json`

Each summarized batch should retain:

- `batch.json`
- `batch-summary.json`
- `batch-focus.json`

Each comparison should retain:

- `comparison.json`
- `comparison-focus.json`
- `compare-data.js`

Without that artifact coverage, the compare stage can still run, but the conclusions are weaker.

## Curation Rules

When collecting a baseline/candidate pair:

- Use the same task set for both batches.
- Use the same agent set for both batches.
- Use the same iteration count for both batches.
- Change one intended variable at a time.
- Do not use replay-only batches for headline claims.

For branch decisions, prefer at least `3` iterations per task-agent pair. A single iteration is acceptable for smoke checks, but not for final judgment.

## Recommended Readout

Every decision-grade comparison should answer these questions:

- Did `meanScorePct` improve or regress?
- Did `successRate` improve or regress?
- Did `meanTokens` improve or regress?
- Did `meanDurationMs` improve or regress?
- How many `focusGroups` and `focusRuns` were produced?
- What percentage of total runs were flagged for the final compare-stage LLM pass?
- Were regressions isolated to one task-agent group or spread broadly?

The key token-efficiency metric for this branch is not only raw token delta. It is:

`focusRunRate = comparison-focus.focusRuns / total candidate+baseline runs considered`

That is the clearest measure of whether the pipeline is actually shrinking the amount of evidence the final analytical pass needs to inspect.

## Suggested Workflow

### 1. Run the benchmark suite

Smoke:

```bash
npm run run-tasks -- --agents claude,codex,cursor --task hello-world,build-block,fix-block-bug,modify-block --times 1
```

Core:

```bash
npm run run-tasks -- --agents claude,codex,cursor --task hello-world,build-block,fix-block-bug,modify-block,skill-check --times 3
```

### 2. Evaluate each run

Use the `eval-run` skill or the repo's normal run-evaluation workflow so each result folder gets judged output plus `run-report.json`.

### 3. Summarize each batch

```bash
node scripts/summarize-batch.js results/<baseline-timestamp>
node scripts/summarize-batch.js results/<candidate-timestamp>
```

### 4. Compare the batches

```bash
node scripts/compare-batches.js \
  results/<baseline-timestamp> \
  results/<candidate-timestamp> \
  --output-dir results/comparisons/<timestamp>-current-pipeline-core
```

### 5. Record the decision context

For every benchmark pair, record:

- suite id
- branch name
- commit SHA
- purpose
- agents
- iteration count
- augmentation set
- intended variable change

If this is not captured somewhere durable, the comparison will be hard to trust later.

## Practical Recommendation

Keep the February 25, 2026 batches as compatibility replay data only.

For future branch work, curate one stable, fresh benchmark corpus under the current pipeline and reuse it consistently:

- `smoke` on every meaningful pipeline change
- `core` before merging evaluation/runtime changes
- `stress` when the change touches timeouts, tool access, prompt size, or long-running tasks

That gives Sean a clean split:

- old data proves the framework did not break
- new data proves the framework got better
