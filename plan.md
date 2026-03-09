# Evaluation Improvements Plan

## Current state

### Pipeline
Full evaluation pipeline implemented:
1. `run-tasks` — execute tasks, write results + `batch.json`
2. `eval-run` skill — evaluate individual runs (deterministic checks + LLM judgment)
3. `summarize-batch` — aggregate stats per task+agent across all runs in a batch
4. `compare-batches` — compare two batch summaries, identify improvements/regressions

### Skills
- `eval-run` — evaluate completed runs (renamed from `eval`)
- `summarize-batch` — batch-level aggregate stats
- `compare-batches` — A/B batch comparison with subagent analysis
- `task-creator` — create and improve evaluation tasks

### Scripts
- `scripts/run-tasks.js` — task execution, writes `batch.json` with batch metadata
- `scripts/summarize-batch.js` — reads eval results, computes group + batch stats, writes `batch-summary.json`
- `scripts/compare-batches.js` — compares two batch summaries, writes `compare-data.js`
- `scripts/compare-runs.js` — iteration-level comparison (legacy, still used)
- `scripts/eval-tasks.js` — legacy OpenAI API evaluation path

### Viewer tools
- `tools/eval-viewer/` — single-run eval results
- `tools/batch-viewer/` — batch summary with per-group stats
- `tools/comparison-viewer/` — A/B comparison (supports both iteration-level and aggregate mode)
- `tools/conversation-viewer/` — parsed agent conversation
- `tools/diff-viewer/` — interactive diff view

## Next steps

### 1. Run and evaluate
- Re-run tasks with updated augmentations
- Evaluate all runs using eval-run skill
- Summarize each batch, compare batches to determine if augmentations help

### 2. Retire legacy paths
- Remove `eval-tasks.js` and OpenAI API eval path once eval-run skill is proven end-to-end
- cleanup any other unused scripts

### 3. Future work
- **Per-dimension stats** — aggregate and compare by criteria section (C1-C6)
- **Run and evaluate** — combined skill that runs tasks, evaluates, summarizes, and compares in one flow
- ensure when a run times out, that is written somewhere to when the eval-run happens, it can note that and respond accordingly (may require updated to eval-run skill and run-tasks scripting)
- ensure conversation viewer handles output from codex/cursor, not just claude
- add a script to use in summarize-batch to verify all evaluations exist for a batch. this will make that process more repeatable.