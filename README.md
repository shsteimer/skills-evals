# Skills Evals

Framework for running and evaluating coding agent performance on development tasks.

## Overview

This framework allows you to:
- Define development tasks with specific criteria
- Run coding agents against those tasks in isolated workspaces
- Evaluate agent performance based on defined criteria

## Structure

- `tasks/` - Task definitions with prompts and evaluation criteria
- `scripts/` - Execution and evaluation scripts
- `results/` - Evaluation results (generated at `results/{timestamp}/{task-agent}/`)
- `augmentations/` - Optional global augmentation files

## Quick Start

```bash
# Install dependencies
npm install

# Run all tasks with default agents (claude, cursor, codex)
npm run run-tasks

# Run specific task
npm run run-tasks -- --task build-block

# Run with custom agents
npm run run-tasks -- --agents claude,cursor

# Run with augmentations
npm run run-tasks -- --augmentations ./augmentations/agents-md-only.json

# Show help
npm run run-tasks -- --help
```

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
- Context documents (README, AGENTS.md, etc.)
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
  "mode": "merge"  // or "replace"
}
```

- `merge` (default): Add/overwrite files, keep existing
- `replace`: Delete target first, then copy

## Results

Results are stored at `results/{timestamp}/{task-agent}/`:
- `task.json` - Complete task configuration including augmentations
- `prompt.txt` - The prompt given to the agent
- `criteria.txt` - Evaluation criteria

The workspace for each run is at: `{workspace-root}/{timestamp}/{task-agent}/`

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test find-tasks.test.js
```

