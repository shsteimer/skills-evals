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

Summarize evaluation results for all runs in a batch directory. Produces aggregate statistics per task+agent group and overall batch metrics.

## Pipeline

### Step 1: Identify target batch

Parse the user's request to find the batch directory:
- A specific path: `results/20260308-135305`
- "latest" or "most recent": scan `results/` for the most recent timestamp directory

### Step 2: Verify evaluations exist

Check that `eval-result.json` exists in run subdirectories. Report:
- How many runs have eval results
- How many are missing eval results

If most runs are missing evaluations, suggest running `eval-run` first before summarizing.

### Step 3: Run summarize-batch script

```bash
node scripts/summarize-batch.js <batch-dir>
```

This produces:
- `batch-summary.json` — structured summary with per-group and overall stats
- `batch-summary-data.js` — JavaScript data file for the batch viewer

### Step 4: Present results

Show the user:
1. Overall batch stats (mean score, success rate, mean tokens, run count)
2. Per task+agent breakdown (mean ± stddev, success rate, min/max, common failures)
3. Any notable findings (high variance groups, common failure patterns)
4. Batch viewer URL for visual inspection

### Viewer URL

After summarization, provide the batch viewer URL:
```
http://localhost:8765/tools/batch-viewer/index.html?data=results/<timestamp>/batch-summary-data.js
```

Start a local HTTP server if one isn't running:
```bash
python3 -m http.server 8765
```
