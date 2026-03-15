# Skills Evals

Framework for measuring how well coding agents follow project instructions. The primary use case is A/B testing changes to `AGENTS.md` and other workspace augmentations — run the same tasks with a baseline and candidate configuration, then compare scores to see if agents follow instructions better or worse.

## Why

When you change an `AGENTS.md` or add a skill file, you want to know if agents actually behave differently. Eyeballing a few runs doesn't scale and is subject to confirmation bias. This framework gives you a structured way to measure the impact: define tasks with scoring criteria, run agents in isolated workspaces, evaluate the output, and compare batches side-by-side.

## What it does

- Runs coding agents (Claude, Cursor, Codex) against defined tasks in isolated workspaces
- Evaluates each run against task-specific criteria (deterministic checks + LLM judgment)
- Aggregates results per task+agent with statistical summaries
- Compares two batches to determine if augmentation changes improved agent behavior

## Terminology

- **batch** — timestamp directory (`results/20260308-135305/`) containing all tasks × agents × iterations from one `run-tasks` invocation
- **run** — individual task execution folder (`results/.../build-block-claude-1/`)
- **iteration** — repeat number (1-5) within a batch for same task+agent
- **augmentation** — files injected into the workspace before a run (AGENTS.md, skills, config)

## Structure

- `tasks/` - Task definitions with prompts and evaluation criteria
- `scripts/` - Execution, evaluation, summarization, comparison, and assembly scripts
- `scripts/handlers/` - Agent-specific CLI handlers (claude, cursor, codex)
- `scripts/utils/` - Shared utilities for git, GitHub, npm, process, and environment config
- `.claude/skills/` - Claude Code skills for evaluation workflow
- `tools/` - Standalone HTML viewer tools
- `results/` - Evaluation results
  - `results/{timestamp}/` - Batch directories (runs + batch summary)
  - `results/comparisons/{baseline}_vs_{candidate}/` - Comparison directories
- `augmentations/` - Optional global augmentation files
- `config/` - Agent config files and [safehouse sandbox config](config/safehouse/README.md)
- `docs/` - Additional documentation
  - [Agent Settings & Configuration](docs/agent-settings.md) — env vars, CLI flags, sandboxing, bot auth
  - [Evaluation Dimensions](docs/evaluation-dimensions.md) — scoring rubric, dimension definitions, task matrix

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

# Run with augmentations (A/B testing an AGENTS.md change)
npm run run-tasks -- --augmentations ./augmentations/aem-boilerplate-pr594-baseline.json

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

Use with `--augmentations` flag (can be specified multiple times):
```bash
npm run run-tasks -- --augmentations ./my-augmentations.json
npm run run-tasks -- --augmentations ./base.json --augmentations ./extras.json
```

In interactive mode, augmentation files are multi-select.

### Augmentation Properties

Each augmentation entry supports:

| Property | Required | Description |
|----------|----------|-------------|
| `source` | yes | File/folder path or URL |
| `target` | yes | Destination path in workspace |
| `mode`   | no  | `"merge"` (default) or `"replace"` for folders |
| `agents` | no  | Array of agent names (e.g. `["claude"]`). When set, the augmentation is only applied for those agents. Omit to apply for all agents. |

### Scripted Augmentations

For complex setup that can't be expressed as simple file copies (e.g. modifying existing config files, agent-specific logic), use a JS augmentation file. Export a default object with a `name` and an `augment` function:

```js
// augmentations/my-setup.js
import fs from 'fs/promises';
import path from 'path';

export default {
  name: 'My Setup',
  async augment({ workspaceDir, agent, taskName }) {
    // Full access to the workspace — read, write, modify files
    if (agent === 'codex') {
      const configPath = path.join(workspaceDir, '.codex', 'config.toml');
      const existing = await fs.readFile(configPath, 'utf-8');
      await fs.writeFile(configPath, existing + '\n[extra]\nkey = "value"\n');
    }
  },
};
```

Scripted augmentations run after agent config and file-copy augmentations, so they can read and modify any files already in the workspace. They're discovered alongside JSON files in `augmentations/` and appear in the interactive multi-select.

### Augmentation Modes

For folders, control merge behavior with `mode`:
- `merge` (default): Add/overwrite files, keep existing
- `replace`: Delete target first, then copy

## Results

Results are stored at `results/{timestamp}/`:

### Batch-level artifacts (`results/{timestamp}/`)
- `batch.json` — batch metadata (timestamp, args, augmentations, agents, run counts)
- `batch-summary.json` — aggregate stats per task+agent (after `summarize-batch`)
- `batch-summary-data.js` — data file for batch viewer
- `batch.log` — execution log

### Comparison artifacts (`results/comparisons/{baseline}_vs_{candidate}/`)
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
http://localhost:8765/tools/comparison-viewer/index.html?data=results/comparisons/20260308-135305_vs_20260309-115836/compare-data.js
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
