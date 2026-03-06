# AGENTS.md Eval Fixtures

This folder provides deterministic `AGENTS.md` variants for running `skills-evals` gate tasks.

## Layout

- `baseline/AGENTS.md`: Control baseline copied from `AGENTS-TEST-BASELINE.md`
- `candidates/pass-commands-first/AGENTS.md`: Expected pass candidate (clarity/ordering improvement)
- `candidates/fail-contradiction/AGENTS.md`: Expected fail candidate (contains contradictory instructions)
- `candidates/fail-missing-critical/AGENTS.md`: Expected fail candidate (removes critical security guidance)
- `manifests/*.json`: Ready-to-use `--augmentations` manifests for each scenario

## Expected Outcomes

- `baseline.json`: pass (reference run)
- `pass-commands-first.json`: pass
- `fail-contradiction.json`: fail
- `fail-missing-critical.json`: fail

## Command Nuance (What Each Command Does)

### `run-tasks` command

Example:

```bash
npm run run-tasks -- --tag gate --agents codex --augmentations ./test-fixtures/agents-md/manifests/baseline.json
```

What it does:
- Selects all tasks with tag `gate` from `tasks/*`.
- Creates isolated workspaces for each selected task.
- Clones each task's `startFrom` repository.
- Applies augmentation entries from the manifest (overwriting `AGENTS.md` and `CLAUDE.md` in the task workspace).
- Runs the configured agent (`codex`) against each task prompt.
- Captures task artifacts in `results/<timestamp>/<task-name>-<agent>-<iteration>/` including:
  - `task.json`, `prompt.txt`, `criteria.txt`
  - `changes.diff`, `commits.json`
  - `lint-results.json`, optional `test-results.json`
  - `output.jsonl` (agent output log)

Why you run it:
- To generate candidate behavior/output under a specific instruction set (`AGENTS.md` variant).

Primary success signal:
- It completes for all selected tasks and produces a new timestamped folder under `results/`.

### `eval-tasks` command

Examples:

```bash
# Evaluate most recent run folder in results/
npm run eval-tasks

# Evaluate a specific run folder
npm run eval-tasks -- results/20260225-150500
```

What it does:
- Loads one results directory (explicit path, or newest by timestamp if omitted).
- For each task folder, builds an evaluation prompt from task prompt, criteria, code diff, lint/tests, commits, and logs.
- Calls the evaluator model and writes:
  - `eval-prompt.txt` (the assembled judge prompt)
  - `final-result.md` (human-readable evaluation)
  - `eval-result.json` (structured score/success data when available)

Why you run it:
- To turn raw run artifacts into pass/fail quality judgments and comparable scores.

Important clarification:
- `eval-tasks` does **not** send context into your Codex chat session. It is a local script that reads files from `results/` and writes evaluation artifacts back to those folders.

Primary success signal:
- Each task folder gets `final-result.md` with criterion-level outcomes and overall score/success.

## E2E Scenario Commands

```bash
# Baseline
npm run run-tasks -- --tag gate --agents codex --augmentations ./test-fixtures/agents-md/manifests/baseline.json
npm run eval-tasks

# Candidate expected to pass
npm run run-tasks -- --tag gate --agents codex --augmentations ./test-fixtures/agents-md/manifests/pass-commands-first.json
npm run eval-tasks

# Candidates expected to fail
npm run run-tasks -- --tag gate --agents codex --augmentations ./test-fixtures/agents-md/manifests/fail-contradiction.json
npm run eval-tasks

npm run run-tasks -- --tag gate --agents codex --augmentations ./test-fixtures/agents-md/manifests/fail-missing-critical.json
npm run eval-tasks
```

## Comparing Results Across Scenarios

- Keep the timestamp printed by each `run-tasks` execution.
- Evaluate that specific folder with `npm run eval-tasks -- results/<timestamp>`.
- Compare `final-result.md` files across baseline/pass/fail scenarios.
- Expected pattern:
  - baseline and `pass-commands-first` should have higher scores and mostly/fully met criteria.
  - fail scenarios should show explicit criterion misses aligned to contradictions or removed critical guidance.
