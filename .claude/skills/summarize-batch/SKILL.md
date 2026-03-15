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

Summarize evaluation results for all runs in a batch directory. Produces aggregate statistics per task+agent group and overall batch metrics, then analyzes the results to surface patterns and findings.

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

This produces `batch-summary.json` — structured summary with per-group and overall stats.
The viewer data file (`batch-summary-data.js`) is produced later by the assembly step after
analysis is merged in.

### Step 4: Analyze results with subagent

This step is **required** — it produces the analytical findings that appear in the batch viewer.

Launch an analysis subagent using the **Agent tool**. Generate the prompt deterministically:

```bash
node scripts/assemble-summarize-prompt.js <batch-dir>
```

This reads the template from `.claude/skills/summarize-batch/resources/summarize-prompt.template.md`, fills in the batch summary data, and outputs the complete prompt to stdout. Pass the output directly as the subagent prompt.

The template is in `resources/summarize-prompt.template.md` — edit that file to change the subagent's instructions.

#### Merging analysis into batch summary

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
3. Key findings from the analysis (highlights and cross-cutting patterns)
4. Batch viewer URL for visual inspection

### Viewer URL

Ensure the viewer server is running (`npm run serve`), then provide the batch viewer URL:
```
http://localhost:8765/tools/batch-viewer/index.html?data=results/<timestamp>/batch-summary-data.js
```

The index page at http://localhost:8765/ lists all batches and comparisons.
