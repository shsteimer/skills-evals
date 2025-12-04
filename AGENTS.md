# AI Agent Guidelines

This document provides guidance for AI coding agents working on the skills evaluation framework.

## Overview

This is a framework for evaluating coding agent performance on development tasks. It runs agents in isolated workspaces, then evaluates their output against defined criteria.

## Project Structure

- `tasks/` - Task definitions with prompts, criteria, and configuration
- `scripts/` - Task execution (`run-tasks.js`) and evaluation (`eval-tasks.js`)
- `scripts/handlers/` - Agent-specific CLI handlers (claude, cursor, codex)
- `scripts/utils/` - Shared utilities for git, GitHub, npm, process, and environment config
- `tests/` - Vitest unit tests
- `results/` - Generated evaluation results
- `augmentations/` - Optional files to add to task workspaces

## Commands

- `npm run lint:fix` - Check code with ESLint, Auto-fix linting issues
- `npm test` - Run all tests
- `npm run run-tasks` - Execute tasks with agents
- `npm run eval-tasks` - Evaluate completed tasks

## Important Reminders

- run `npm run lint` and `npm test` before committing anything. If any issues are reported, fix them
- practice TDD. write tests to document expected behavior. run them to see that they fail. implement the changes. then re-run tests to see that they pass
