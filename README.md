# Skills Evals

Framework for running and evaluating coding agent performance on development tasks.

## Overview

This framework allows you to:
- Define development tasks with specific criteria
- Run coding agents against those tasks
- Evaluate agent performance based on defined criteria

## Structure

- `tasks/` - Task definitions with prompts and evaluation criteria
- `scripts/` - Execution and evaluation scripts
- `results/` - Evaluation results (generated locally)

## Usage

```bash
# Run tasks
npm run run-tasks

# Evaluate task results
npm run eval-tasks
```

## Configuration

Environment variables can be configured via `.env`:
- `WORKSPACE_DIR` - Task workspace directory (defaults to system temp)

