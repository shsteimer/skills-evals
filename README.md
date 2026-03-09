# Skills Evals

Framework for running and evaluating coding agent performance on development tasks.

## Overview

This framework allows you to:
- Define development tasks with specific criteria
- Run coding agents against those tasks in isolated workspaces
- Evaluate agent performance based on defined criteria
- Summarize batch results with aggregate statistics
- Compare batches to determine if changes improved performance

## Terminology

- **batch** — timestamp directory (`results/20260308-135305/`) containing all tasks × agents × iterations from one `run-tasks` invocation
- **run** — individual task execution folder (`results/.../build-block-claude-1/`)
- **iteration** — repeat number (1-5) within a batch for same task+agent

## Structure

- `tasks/` - Task definitions with prompts and evaluation criteria
- `scripts/` - Execution, evaluation, summarization, comparison, and assembly scripts
- `.claude/skills/` - Claude Code skills for evaluation workflow
- `tools/` - Standalone HTML viewer tools
- `results/` - Evaluation results
  - `results/{timestamp}/` - Batch directories (runs + batch summary)
  - `results/comparisons/{timestamp}/` - Comparison directories
- `augmentations/` - Optional global augmentation files

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
# Create a .env file based on the example in .env.example
# and add your API keys and settings

# Run all tasks with default agents (claude, cursor, codex)
npm run run-tasks

# Run specific task
npm run run-tasks -- --task build-block

# Run with custom agents
npm run run-tasks -- --agents claude,cursor

# Run with augmentations
npm run run-tasks -- --augmentations ./augmentations/agents-md-only.json

# Run multiple iterations
npm run run-tasks -- --task build-block --times 5

# Show help
npm run run-tasks -- --help

# Start viewer server (index page at http://localhost:8765)
npm run serve
```

## Pipeline

The full evaluation pipeline:

1. **Run tasks** — `npm run run-tasks` executes agents against tasks, writes results + `batch.json`
2. **Evaluate runs** — use the `eval-run` skill to evaluate individual runs
3. **Summarize batch** — use the `summarize-batch` skill (runs `scripts/summarize-batch.js` + analytical subagent)
4. **Compare batches** — use the `compare-batches` skill (runs `scripts/compare-batches.js` + analytical subagent)

## Defining Tasks

Tasks are defined in the `tasks/` directory. Each task is a folder containing:

### Required Files

**`task.json`** - Task metadata and configuration:
```json
{
  "name": "task-name",
  "description": "What the agent should accomplish",
  "tags": ["tag1", "tag2"],
  "startFrom": "https://github.com/org/repo",
  "augmentations": [
    {
      "source": "path/to/file.txt",
      "target": "INSTRUCTIONS.md"
    }
  ]
}
```

**`prompt.txt`** - Instructions given to the agent

**`criteria.txt`** - Evaluation criteria for the task

### Task Configuration

- **`startFrom`** (required): GitHub URL to clone as starting point
  - Repository: `https://github.com/org/repo`
  - Specific branch: `https://github.com/org/repo/tree/branch-name`
  - Specific commit: `https://github.com/org/repo/tree/commit-hash`

- **`augmentations`** (optional): Files to add to the workspace
  - Local paths: `"./path/to/file"` (relative or absolute)
  - GitHub files: `"https://github.com/org/repo/blob/main/file.txt"`
  - GitHub folders: `"https://github.com/org/repo/tree/main/folder"`
  - HTTP URLs: `"https://example.com/file.txt"`

- **`tags`** (optional): Tags for filtering tasks

## Augmentations

Augmentations add files to the workspace before running tasks. Use them to provide:
- Context documents (README, AGENTS.md, skills, etc.)
- Instructions or guidelines
- Utility files or helpers
- Different skill/knowledge levels for testing

### Global Augmentations

Create a JSON file with augmentations to apply to all tasks:

```json
[
  {
    "source": "https://github.com/org/repo/blob/main/AGENTS.md",
    "target": "AGENTS.md"
  },
  {
    "source": "./common/instructions.md",
    "target": ".claude/instructions.md"
  }
]
```

Use with `--augmentations` flag:
```bash
npm run run-tasks -- --augmentations ./my-augmentations.json
```

### Augmentation Modes

For folders, control merge behavior:
```json
{
  "source": "./folder",
  "target": "dest",
  "mode": "merge"
}
```

- `merge` (default): Add/overwrite files, keep existing
- `replace`: Delete target first, then copy

## Results

Results are stored at `results/{timestamp}/`:

### Batch-level artifacts (`results/{timestamp}/`)
- `batch.json` — batch metadata (timestamp, args, augmentations, agents, run counts)
- `batch-summary.json` — aggregate stats per task+agent (after `summarize-batch`)
- `batch-summary-data.js` — data file for batch viewer
- `batch.log` — execution log

### Comparison artifacts (`results/comparisons/{timestamp}/`)
- `comparison.json` — comparison data with analysis (recommendation, per-group verdicts)
- `compare-data.js` — data file for comparison viewer

### Run-level artifacts (per `{task-agent-iteration}/`)
- `task.json` - Complete task configuration including augmentations
- `prompt.txt` - The prompt given to the agent
- `criteria.txt` - Evaluation criteria
- `changes.diff` - Git diff of agent's changes
- `commits.json` - Agent's git commits
- `run-metrics.json` - Timing, token usage, timeout status
- `output.jsonl` - Raw agent output stream
- `check-results.json` - Deterministic check results
- `eval-result.json` - Evaluation results (after eval)
- `eval-data.js` - Data file for eval viewer

## Viewer Tools

Standalone HTML viewers for inspecting results:

```bash
npm run serve
```

This starts a server at http://localhost:8765 with an index page listing all batches and comparisons.

- **eval-viewer** — single-run evaluation results, criteria, screenshots
- **batch-viewer** — batch summary with per-group stats and analytical findings
- **comparison-viewer** — A/B batch comparison with recommendation and per-group verdicts
- **conversation-viewer** — parsed agent conversation log
- **diff-viewer** — interactive diff view

All viewers load data via `?data=` URL parameter:
```
http://localhost:8765/tools/eval-viewer/index.html?data=results/20260308-135305/build-block-claude-1/eval-data.js
http://localhost:8765/tools/batch-viewer/index.html?data=results/20260308-135305/batch-summary-data.js
http://localhost:8765/tools/comparison-viewer/index.html?data=results/comparisons/20260309-115836/compare-data.js
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test summarize-batch.test.js
```
