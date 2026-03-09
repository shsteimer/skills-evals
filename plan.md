# Evaluation Improvements Plan

## Current state

### Eval skill (`.claude/skills/eval/SKILL.md`)
Pipeline: identify runs → reconstruct workspace → read check-results.json → resolve `[check: name]` criteria → launch subagent for judgment → assemble eval-result.json → clean up.

Subagent starts AEM dev server (`npx -y @adobe/aem-cli up --no-open --port {port} --html-folder drafts`), uses Playwright MCP for screenshots at desktop + mobile viewports. Only screenshots pages the agent created — doesn't fabricate test content. Parses agent conversation log to find pages the agent tested.

Key files:
- `.claude/skills/eval/SKILL.md` — skill definition
- `scripts/reconstruct-workspace.js` — workspace reconstruction (exported function + CLI)
- `scripts/utils/task-checks.js` — runs `tasks/{task-name}/checks.js` if it exists
- `scripts/utils/check-helpers.js` — shared async check utilities (file ops, lint, module introspection)
- `scripts/assemble-eval.js` — merges check + judgment results, computes scores, writes output files
- `scripts/parse-agent-log.js` — parses output.jsonl into structured summary
- `scripts/report/eval-template.html` — single-run HTML viewer (3-column insights, section-grouped criteria, screenshot thumbnails with lightbox)

### Deterministic checks
- `checks.js` per task runs during task execution via `captureResults()`, writes `check-results.json`
- Lint runs inside checks.js (removed separate lint capture from captureResults, dropped lint-results.json)
- Only truly reliable checks: filesystem existence, module introspection via dynamic import, lint
- `criteria.txt` references checks via `[check: name]` syntax
- Shared helpers in `scripts/utils/check-helpers.js`

Current checks per task:
- **build-block**: `block-files-exist`, `exports-decorate` (dynamic import — note: fails on browser code due to `window is not defined`), `lint-passes`
- **fix-block-bug**: `carousel-files-exist`, `lint-passes`
- **modify-block**: `lint-passes`

### Eval test results
Tested against `results/20260308-135902/build-block-claude-1`. Score: 23/32 (FAIL). Pipeline worked end-to-end. The subagent created test content when none existed (now fixed in skill — it should skip visual verification instead).

### Existing runs
Two result sets in `results/` (from 2026-03-08), 15 runs each across build-block, fix-block-bug, modify-block. These predate `check-results.json` — eval skill re-runs checks against reconstructed workspace when the file is missing.

## Next steps

### Eval supporting tooling
- **Conversation viewer** — standalone HTML that renders `output.jsonl` as a readable conversation. Link from eval-result.html. Could use `scripts/parse-agent-log.js` for parsing.
- **Diff viewer** — standalone interactive HTML view of `changes.diff`. Link from eval-result.html.
- **Move static viewers** from `scripts/report/` to a `tools/` directory — eval template, conversation viewer, diff viewer. Update references in eval skill and assemble-eval.js.

### Compare skill
- **Eval skill** produces per-run data (`eval-result.json`)
- **Compare skill** consumes eval results for cross-run analysis

Two comparison modes:
1. **Within a run set** (same timestamp, same task, multiple iterations) — consistency analysis, variance indicators, task reliability
2. **Across run sets** (different timestamps or augmentations) — per-task deltas, overall trends, cross-task patterns, recommendations

Implementation: mechanical layer (score aggregation, deltas — existing `compare-runs.js` as starting point) + judgment layer via subagent for qualitative analysis. HTML viewer for comparison results.

### Run and evaluate
- **Re-run tasks** with default 2-min idle timeout and system prompt amendment
- Investigate fix-block-bug failures (0/10 in validation runs — playwright not found, CDN 404s)
- **Evaluate runs** using eval skill, then **compare** to determine if augmentations help
- **Retire eval-tasks.js** and OpenAI API eval path once eval skill is proven
