# AI Agent Guidelines

This document provides guidance for AI coding agents working on the skills evaluation framework.

## Overview

This is a framework for evaluating coding agent performance on development tasks. It runs agents in isolated workspaces, then evaluates their output against defined criteria.

## Terminology

- **batch** — timestamp directory (`results/20260308-135305/`) containing all tasks × agents × iterations from one `run-tasks` invocation
- **run** — individual task execution folder (`results/.../build-block-claude-1/`)
- **iteration** — repeat number (1-5) within a batch for same task+agent

## Project Structure

- `tasks/` - Task definitions with prompts, criteria, and configuration
- `scripts/` - Task execution (`run-tasks.js`), summarization (`summarize-batch.js`), comparison (`compare-batches.js`), assembly (`assemble-*.js`), and viewer server (`serve.js`)
- `scripts/handlers/` - Agent-specific CLI handlers (claude, cursor, codex)
- `scripts/utils/` - Shared utilities for git, GitHub, npm, process, and environment config
- `.claude/skills/` - Claude Code skills (eval-run, summarize-batch, compare-batches, task-creator)
- `tools/` - Standalone HTML viewer tools (eval-viewer, comparison-viewer, batch-viewer, conversation-viewer, diff-viewer)
- `tests/` - Vitest unit tests
- `results/` - Generated evaluation results
  - `results/<timestamp>/` - Batch directories (runs + batch summary)
  - `results/comparisons/<timestamp>/` - Comparison directories (comparison data + analysis)
- `augmentations/` - Optional files to add to task workspaces

## Commands

- `npm run lint:fix` - Check code with ESLint, Auto-fix linting issues
- `npm test` - Run all tests
- `npm run run-tasks` - Execute tasks with agents
- `npm run serve` - Start viewer server at http://localhost:8765 (index page lists all batches and comparisons)

## Evaluation Workflow

The framework has a multi-step pipeline. Each step is a separate skill invocation — don't collapse them into a single mechanical pass.

1. **Run tasks** (`run-tasks`) — Execute agents against tasks in isolated workspaces
2. **Evaluate runs** (`eval-run`) — Score individual runs against criteria
3. **Summarize batch** (`summarize-batch`) — Aggregate stats + analytical findings per batch
4. **Compare batches** (`compare-batches`) — A/B comparison with recommendation

Steps 2-4 include an analytical subagent step that produces structured findings for the viewer tools. These are not optional — the viewers render this analysis alongside the raw numbers. Running the script alone without the analysis step produces incomplete output.

When a user asks for multiple steps at once (e.g. "evaluate, summarize, and compare"), invoke each skill fully — don't shortcut the analytical steps just because the mechanical parts are fast.

## Important Reminders

- run `npm run lint` and `npm test` before committing anything. If any issues are reported, fix them
- practice TDD. write tests to document expected behavior. run them to see that they fail. implement the changes. then re-run tests to see that they pass
