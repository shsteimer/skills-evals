---
name: compare-batches
description: >
  Compare two batches of evaluation results to determine if augmentation changes improved
  agent performance. Works on aggregate stats from batch summaries, not individual iterations.
  Use this skill when the user wants to compare two batches, do an A/B comparison, check
  if a candidate improved over baseline, or compare baseline vs candidate results.
  Triggers on phrases like "compare batches", "A/B comparison", "did candidate improve",
  "compare baseline vs candidate", "which batch is better".
  Do NOT trigger for running tasks (use run-tasks), evaluating runs (use eval-run),
  or summarizing a single batch (use summarize-batch).
---

# Compare Batches

Compare two batches of evaluation results to determine whether augmentation or configuration changes improved agent performance.

## Pipeline

### Step 1: Identify baseline and candidate batch directories

Parse the user's request to find both directories:
- Explicit paths: `results/20260308-135305` and `results/20260308-135902`
- By description: "compare the first and second batch", "compare baseline vs latest"

Convention: the first/older batch is the **baseline**, the second/newer is the **candidate**.

### Step 2: Verify batch summaries exist

Check that `batch-summary.json` exists in both directories. If missing, suggest running the `summarize-batch` skill first — batch summaries must include analysis to be useful for comparison.

### Step 3: Run compare-batches script

```bash
node scripts/compare-batches.js <baseline-dir> <candidate-dir> --output-dir results/comparisons/<timestamp>
```

If you don't pass `--output-dir`, the script auto-generates a timestamped directory under `results/comparisons/`.

This produces a comparison directory containing:
- `comparison.json` — machine-readable comparison data
- `compare-data.js` — JavaScript data file for the comparison viewer

Note the output directory path — you'll need it for the assembly step.

### Step 4: Analyze results with subagent

This step is **required** — it produces the recommendation and per-group analysis that appear in the comparison viewer.

Launch an analysis subagent using the **Agent tool**. Generate the prompt deterministically:

```bash
node scripts/assemble-compare-prompt.js <comparison-dir>
```

This reads the template from `.claude/skills/compare-batches/resources/compare-prompt.template.md`, fills in the comparison data and batch directory paths, and outputs the complete prompt to stdout. Pass the output directly as the subagent prompt.

The template is in `resources/compare-prompt.template.md` — edit that file to change the subagent's instructions.

#### Merging analysis into comparison data

After the subagent returns, write the analysis into the comparison data:

1. Parse the subagent's JSON output
2. Write it to `<comparison-dir>/comparison-analysis.json`
3. Run the assembly script to merge analysis into the comparison data:

```bash
node scripts/assemble-comparison.js <comparison-dir>
```

This merges `comparison.json` with `comparison-analysis.json` and writes an updated
`compare-data.js` that includes the analysis fields for the comparison viewer.

4. Clean up: `rm <comparison-dir>/comparison-analysis.json`

### Step 5: Present results

Show the user:
1. Overall comparison table (baseline vs candidate stats with deltas)
2. Per-group breakdown with score/success/token deltas
3. Subagent's recommendation with reasoning
4. Comparison viewer URL

### Viewer URL

Ensure the viewer server is running (`npm run serve`), then provide the viewer URL:
```
http://localhost:8765/tools/comparison-viewer/index.html?data=results/comparisons/<timestamp>/compare-data.js
```

The index page at http://localhost:8765/ lists all batches and comparisons.
