# Evaluation Improvements Plan

## Current state

### Pipeline
Full evaluation pipeline implemented:
1. `run-tasks` — execute tasks, write results + `batch.json`
2. `eval-run` skill — evaluate individual runs (deterministic checks + LLM judgment)
3. `summarize-batch` — aggregate stats per task+agent across all runs in a batch
4. `compare-batches` — compare two batch summaries, identify improvements/regressions

### Skills
- `eval-run` — evaluate completed runs (deterministic checks + LLM judgment)
- `summarize-batch` — batch-level aggregate stats with analytical subagent
- `compare-batches` — A/B batch comparison with subagent analysis
- `task-creator` — create and improve evaluation tasks

### Scripts
- `scripts/run-tasks.js` — task execution, writes `batch.json` with batch metadata (including `timedOutRuns`)
- `scripts/summarize-batch.js` — reads eval results, computes group + batch stats, writes `batch-summary.json`
- `scripts/compare-batches.js` — compares two batch summaries, writes `compare-data.js`
- `scripts/verify-batch-evals.js` — checks that all runs in a batch have been evaluated
- `scripts/assemble-eval.js` — merges check + judgment results into `eval-result.json`
- `scripts/assemble-batch-summary.js` — merges batch stats with analysis into viewer data
- `scripts/reconstruct-workspace.js` — reconstructs agent workspace for evaluation
- `scripts/parse-agent-log.js` — parses agent conversation logs

### Agent handlers
All three handlers (`scripts/handlers/claude.js`, `cursor.js`, `codex.js`) share process lifecycle utilities from `scripts/handlers/shared.js`:
- Idle timeout (configurable via `AGENT_IDLE_TIMEOUT_MS`, default 2 min)
- AbortSignal support (total timeout from `run-tasks.js`)
- Orphan process cleanup via `lsof`
- Output saved regardless of exit code (partial results preserved on failure)
- Activity parsing: Claude/Cursor use `parseStreamActivity` (stream-json format), Codex uses `parseCodexActivity` (item.started/item.completed format)

### Viewer tools
- `tools/eval-viewer/` — single-run eval results
- `tools/batch-viewer/` — batch summary with per-group stats
- `tools/comparison-viewer/` — A/B comparison (aggregate mode)
- `tools/conversation-viewer/` — parsed agent conversation
- `tools/diff-viewer/` — interactive diff view

## Next steps

### 1. Run and evaluate
- Re-run tasks with updated augmentations
- Evaluate all runs using eval-run skill
- Summarize each batch, compare batches to determine if augmentations help

### 2. Cross-Agent Compatibility

Remaining gaps between claude and cursor/codex handlers:

- ~~**agent configuration** — claude has system prompt append (`config/claude-system-prompt-append.txt`) and settings isolation (`--setting-sources project`); it also doesn't require yolo mode but instead has finely tuned permissions so agents can complete tasks. cursor/codex have no equivalent configuration mechanism yet~~ ✓ done — cursor gets `.cursor/cli.json` + `.cursor/rules/system-prompt.md`, codex gets `.codex/config.toml`; cursor uses `--trust` instead of `--force`, codex uses `--sandbox workspace-write -a never` instead of `--dangerously-bypass-approvals-and-sandbox`

### 3. Future work
- **Per-dimension stats** — aggregate and compare by criteria section (C1-C6)

