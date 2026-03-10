# Token-Efficient Batch Compare Proposal

## Summary

The current pipeline spends LLM tokens at three layers:

1. `eval-run` analyzes every run
2. `summarize-batch` analyzes every batch
3. `compare-batches` analyzes baseline vs candidate

That is expensive and duplicative. The first two layers are mostly mechanical: they collect facts, aggregate counts, compute deltas, and surface obvious outliers. Those steps should be scripted. The LLM should be reserved for the final comparison step, where it can read the scripted outputs, inspect only the flagged runs, and produce a recommendation with reasoning.

## Goals

- Reduce token usage by removing mandatory run-level and batch-level analytical subagent passes
- Preserve the current batch and comparison viewer model
- Keep enough run-level data for drill-down and debugging
- Make historical re-analysis reproducible from the result folders alone
- Reduce cognitive debt in the current architecture while doing the refactor

## Non-goals

- Eliminate all agent reasoning from the system
- Remove subjective comparison entirely
- Rewrite the viewer stack in this phase
- Redesign every task rubric immediately

## Current Pipeline

```text
run-tasks
  -> run artifact capture
  -> eval-run skill
       -> reconstruct workspace
       -> resolve checks
       -> launch evaluation subagent
       -> assemble eval result
  -> summarize-batch skill
       -> summarize-batch.js
       -> launch analysis subagent
       -> assemble-batch-summary.js
  -> compare-batches skill
       -> compare-batches.js
       -> launch comparison subagent
       -> assemble-comparison.js
```

## Proposed Pipeline

```text
run-tasks
  -> run artifact capture
  -> scripted run report assembly
  -> scripted batch summary
  -> scripted batch comparison
  -> single compare-batches skill
       -> reads comparison + focus list
       -> inspects only flagged runs/groups
       -> writes final recommendation
```

## High-Level Architecture

### 1. Replace run-level judgment with scripted run reports

The system should stop treating each run as something that needs a narrative LLM evaluation. Instead, each run should produce a deterministic `run-report.json` assembled from artifacts already captured during `run-tasks`.

Suggested contents:

- task metadata from `task.json`
- check results from `check-results.json`
- resolved check-linked criteria from `criteria.txt`
- test outcomes from `test-results.json`
- timeout status from `run-metrics.json`
- token and duration metrics from `run-metrics.json`
- git activity summary from `changes.diff` and `commits.json`
- parsed agent activity summary from `output.jsonl`
- browser evidence summary if screenshots or browser actions exist
- warnings and anomalies such as:
  - timed out
  - no commits
  - no diff
  - no tests run
  - checks-script error

This is the run artifact that batch summarization should consume.

### 2. Make batch summarization fully scripted

`scripts/summarize-batch.js` should become the canonical source of truth for batch-level insights. It already computes means, success rates, common failures, token averages, and durations. Extend it so it also emits:

- top regressions and top improvements by group
- unstable groups based on variance and success spread
- timeout-heavy groups
- groups with repeated deterministic failures
- groups with suspicious evidence gaps
  - missing screenshots
  - missing diff
  - zero commits
  - empty check coverage

This should remove the need for the `summarize-batch` analytical subagent entirely.

### 3. Keep the LLM only at comparison time

`compare-batches` remains the one analytical stage. The script layer should first produce a deterministic comparison file with:

- score and success deltas
- token and duration deltas
- variance shifts
- timeout deltas
- evidence-gap deltas
- a ranked `focusGroups` list
- a ranked `focusRuns` list

The compare skill then uses those ranked lists to inspect a bounded number of runs, for example:

- all groups with score delta beyond a threshold
- all groups with success-rate regressions
- the top 3 token regressions
- any timeout-heavy groups
- any groups flagged as ambiguous by scripted rules

This is the only place where subjective reasoning is necessary.

## Concrete File-Level Proposal

### A. Add a scripted run-report stage

Add:

- `scripts/assemble-run-report.js`
- `tests/assemble-run-report.test.js`

Responsibilities:

- read `task.json`, `criteria.txt`, `check-results.json`, `test-results.json`, `run-metrics.json`, `commits.json`, `changes.diff`, and `output.jsonl`
- call `scripts/resolve-checks.js`
- compute a mechanical score based only on resolved criteria
- emit:
  - `run-report.json`
  - `run-report-data.js`

Important:

- This file should read `criteria.txt` from the result folder, not the live task definition
- It should not create strengths, weaknesses, or narrative text

### B. Re-scope `resolve-checks.js`

Keep `scripts/resolve-checks.js`, but change it to:

- read `criteria.txt` from the result folder
- return both:
  - `resolved`
  - `unresolved`

That makes it reusable by both scripted reporting and any future targeted LLM pass.

### C. Move `summarize-batch.js` to run-report input

Update `scripts/summarize-batch.js` to consume `run-report.json` instead of `eval-result.json`.

Add batch-level outputs:

- `batch-summary.json`
- `batch-summary-data.js`
- `batch-focus.json`

`batch-focus.json` should be a deterministic triage artifact containing:

- `focusGroups`
- `focusRuns`
- `reasons`
- thresholds that triggered each item

This file becomes the input boundary for the comparison skill.

### D. Extend `compare-batches.js`

Update `scripts/compare-batches.js` to merge:

- aggregate deltas from `batch-summary.json`
- focus candidates from baseline and candidate `batch-focus.json`

Emit:

- `comparison.json`
- `compare-data.js`
- `comparison-focus.json`

`comparison-focus.json` should identify exactly which groups and runs the LLM should inspect.

### E. Narrow the compare skill

Update `.claude/skills/compare-batches/SKILL.md` so the subagent no longer tries to discover important groups from scratch. Instead, it should:

1. read `comparison.json`
2. read `comparison-focus.json`
3. inspect only the flagged run folders
4. write:
   - recommendation
   - confidence
   - per-group verdicts
   - concise reasoning

This keeps the thoughtful part while sharply limiting token spend.

## Viewer Contract Adjustments

The viewers do not need to disappear, but the data model needs to shift.

### Eval viewer

Today it assumes a judged run with narrative fields. Under the new model it should present:

- mechanical score
- resolved criteria
- checks
- tests
- timings and tokens
- anomalies
- links to conversation and diff viewers

Add fields such as:

- `evaluationMode: "scripted"`
- `mechanicalScore`
- `resolvedCriteriaCount`
- `unresolvedCriteriaCount`
- `warnings`

### Batch viewer

The batch viewer should emphasize:

- aggregate quality and efficiency metrics
- focus groups
- instability indicators
- evidence-gap indicators

The current analysis panels should become optional. In the new model the scripted summary is primary.

### Comparison viewer

This stays the main narrative viewer. It should combine:

- deterministic deltas
- focus groups/runs
- final LLM recommendation

## Migration Plan

### Phase 1: Introduce scripted run reports in parallel

- add `assemble-run-report.js`
- keep current `eval-run` flow intact for now
- generate `run-report.json` alongside `eval-result.json`
- validate that run reports contain all evidence needed for batch summary

### Phase 2: Make batch summary fully scripted

- switch `summarize-batch.js` to `run-report.json`
- remove the required analysis subagent from `summarize-batch`
- keep viewer compatibility by emitting the same top-level shape where possible

### Phase 3: Make compare the only LLM stage

- generate `comparison-focus.json`
- simplify `compare-batches` skill to inspect only focus items
- remove the requirement that every run be individually judged first

### Phase 4: Retire per-run LLM evaluation for compare-mode tasks

- deprecate `eval-run` as the default comparison path
- keep it only for:
  - debugging a single run
  - manual deep review
  - tasks that still require subjective per-run scoring

## Suggested Script and Skill Changes

### Scripts

- add `scripts/assemble-run-report.js`
- extend `scripts/resolve-checks.js`
- extend `scripts/summarize-batch.js`
- extend `scripts/compare-batches.js`
- optionally add `scripts/derive-focus.js` if focus logic gets too large

### Skills

- re-scope `eval-run` as optional deep review, not required pipeline infrastructure
- remove required analytical pass from `summarize-batch`
- narrow `compare-batches` to focused investigation only

### Tests

Add or extend tests for:

- `resolve-checks.js` using result-folder `criteria.txt`
- `assemble-run-report.js`
- batch summarization from run reports
- focus-list generation
- comparison behavior when some groups lack prior judged data
- viewer contract snapshots for scripted mode

## Guardrails From Current Review Findings

This refactor should explicitly fix the issues found in the current branch review:

1. **Use the result folder as the source of truth**
   - `resolve-checks.js` must read `resultFolder/criteria.txt`
   - no historical re-analysis should depend on live task files

2. **Do not leave skill wiring implicit**
   - if a script is required, the skill must call it explicitly
   - the artifact contract should not rely on undocumented manual steps

3. **Share workspace bootstrap logic**
   - `run-tasks.js` and `reconstruct-workspace.js` should use the same augmentation/bootstrap helper
   - reconstruction drift is an existing hotspot and will keep recurring otherwise

4. **Avoid workspace collisions**
   - `.eval-workspaces/` paths should include batch timestamp or a unique hash, not only the run folder basename

5. **Make viewer contracts explicit**
   - add schema checks or integration tests for `*-data.js` payloads

## Expected Token Reduction

For a 20-run baseline and 20-run candidate comparison:

### Current model

- 40 run-level eval agent passes
- 2 batch-summary agent passes
- 1 comparison agent pass
- total: **43 analytical agent invocations**

### Proposed model

- 0 run-level eval agent passes
- 0 batch-summary agent passes
- 1 comparison agent pass
- optional: a few targeted deep-review passes only when requested
- total default: **1 analytical agent invocation**

The exact token savings depend on task size and viewer drill-down behavior, but the architectural reduction is large enough to matter immediately.

## Acceptance Criteria

The proposal should be considered implemented when:

- running a batch does not require an LLM pass per run
- summarizing a batch is fully scripted
- comparing two batches uses one LLM stage by default
- the compare skill consumes an explicit focus list rather than scanning everything
- historical result folders remain reproducible even after task definitions evolve
- viewer data contracts are validated by tests

## Recommendation

Base this work on Sean's latest branch and treat it as a focused pipeline simplification effort, not a viewer rewrite. The shortest path to value is:

1. add scripted `run-report.json`
2. make `summarize-batch.js` consume it
3. narrow `compare-batches` to the only required LLM stage

That gets the token-cost win without discarding the existing result artifacts, viewers, or comparison workflow.
