---
name: summarize-batch
description: >
  Summarize evaluation results across all runs in a batch. Computes aggregate stats
  (mean scores, success rates, common failures) per task+agent group and overall.
  Use this skill when the user wants a batch overview, aggregate stats, or to understand
  how runs performed overall. Triggers on phrases like "summarize the batch",
  "batch overview", "how did the runs do overall", "summarize results", "aggregate stats".
  Do NOT trigger for running tasks (use run-tasks), evaluating individual runs (use eval-run),
  or comparing batches (use compare-batches).
---

# Summarize Batch

Summarize evaluation results for all runs in a batch directory. Produces aggregate statistics per task+agent group and overall batch metrics, plus a deterministic focus list for later comparison-stage drill-down.

## Pipeline

### Step 1: Identify target batch

Parse the user's request to find the batch directory:
- A specific path: `results/20260308-135305`
- "latest" or "most recent": scan `results/` for the most recent timestamp directory

### Step 2: Verify evaluations exist

Run the verification script to check that all runs have been evaluated:

```bash
node scripts/verify-batch-evals.js <batch-dir>
```

This reports how many runs have `eval-result.json` and lists any that are missing. If runs are missing evaluations, suggest running `eval-run` first before summarizing. The script exits with code 1 if any evals are missing.

### Step 3: Run summarize-batch script

```bash
node scripts/summarize-batch.js <batch-dir>
```

This produces:

- `batch-summary.json` — structured summary with per-group and overall stats
- `batch-summary-data.js` — viewer-ready batch summary
- `batch-focus.json` — deterministic focus list for groups and runs worth deeper review

This step is the primary summary path. No analytical subagent is required.

### Optional Step 4: Add narrative analysis

If the user explicitly wants narrative findings, you may still add them as a second pass.
This is optional and should not be the default path.

Launch an analysis subagent using the **Agent tool** that reads the batch summary and individual eval results to produce structured findings.

#### Subagent prompt structure

```
You are analyzing evaluation results for a batch of agent task runs. Your job is to
identify patterns, explain outcomes, and surface findings that the raw numbers alone
don't reveal.

## Batch summary
{batch-summary.json contents}

## Your task

1. Read the batch-summary.json to understand overall and per-group performance.

2. For groups with notable patterns (high variance, low success rates, common failures,
   unusual token usage), read the individual eval-result.json files in those groups to
   understand WHY:

   Batch dir: {batch_dir}
   Run folders follow the pattern: {batch_dir}/{task}-{agent}-{iteration}/eval-result.json

3. Analyze each group and produce per-group findings:
   - What happened? (succeeded, failed, mixed results)
   - Why? (specific evidence from eval results)
   - Consistency — was behavior stable across iterations or variable?

4. Look for cross-cutting patterns:
   - Which agents performed best/worst overall?
   - Are there efficiency differences (token usage, duration) worth noting?
   - Any systematic failures that appear across multiple groups?

5. Produce your output as a JSON object (no markdown fences, no commentary):
{
  "perGroup": {
    "task::agent": {
      "findings": "2-3 sentence analysis of this group's performance with specific evidence",
      "concerns": ["specific concern if any — e.g. high variance, systematic failure"]
    }
  },
  "crossCutting": [
    "Pattern or finding that spans multiple groups — be specific"
  ],
  "highlights": [
    "Notable positive or negative outcome worth calling attention to"
  ]
}

Rules:
- Be specific — reference actual scores, failure names, and evidence from eval results
- Don't just restate the numbers — explain what they mean
- Keep each finding concise (2-3 sentences max)
- If a group is straightforward (perfect scores, zero variance), a brief note is fine
- Focus on what's useful for understanding agent behavior, NOT on task design issues
```

#### Merging optional analysis into batch summary

After the subagent returns, write the analysis into the batch summary:

1. Parse the subagent's JSON output
2. Write it to `<batch-dir>/batch-analysis.json`
3. Re-run the data file generation to include the analysis:

```bash
node scripts/assemble-batch-summary.js <batch-dir>
```

This merges `batch-summary.json` with `batch-analysis.json` and writes an updated
`batch-summary-data.js` that includes the analysis fields for the batch viewer.

4. Clean up: `rm <batch-dir>/batch-analysis.json`

### Step 5: Present results

Show the user:
1. Overall batch stats (mean score, success rate, mean tokens, run count)
2. Per task+agent breakdown (mean ± stddev, success rate, min/max, common failures)
3. Scripted focus groups and runs worth deeper review
4. Batch viewer URL for visual inspection
5. Optional narrative findings if you ran the analysis pass

### Viewer URL

Ensure the viewer server is running (`npm run serve`), then provide the batch viewer URL:
```
http://localhost:8765/tools/batch-viewer/index.html?data=results/<timestamp>/batch-summary-data.js
```

The index page at http://localhost:8765/ lists all batches and comparisons.
