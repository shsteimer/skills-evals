---
name: eval-run
description: >
  Evaluate completed agent task runs by reconstructing workspaces and running a thorough
  evaluation combining deterministic checks with LLM judgment. Use this skill whenever the
  user wants to evaluate task results, re-evaluate runs, assess agent performance on completed
  tasks, or score results. Triggers on phrases like "evaluate the runs", "score these results",
  "how did the agent do", "eval the latest", "re-evaluate", or referencing result paths.
  Do NOT trigger for running tasks (use run-tasks) or comparing batches (use compare-batches).
---

# Eval Run

Evaluate completed agent task runs. Reconstructs the agent's workspace from captured artifacts, runs deterministic checks, then uses LLM judgment only for subjective criteria.

## Pipeline overview

1. **Identify target runs** from user input
2. **Reconstruct workspace** from result artifacts
3. **Run deterministic checks** (global + task-specific)
4. **Launch evaluator subagent** for judgment-based criteria
5. **Assemble results** into eval-result.json
6. **Clean up** temp workspace

---

## Step 1: Identify target runs

Parse what the user wants evaluated:
- A specific run: `results/20260308-135305/build-block-claude-1`
- All runs in a timestamp: `results/20260308-135305`
- A task name: "evaluate all build-block runs"
- Most recent: "evaluate the latest runs"

For each target, verify the result folder contains at minimum: `task.json`, `criteria.txt`, `changes.diff`.

Also read `run-metrics.json` if it exists — check the `timedOut` field. If true, the agent ran out of time and the work is partial. Pass this information to the evaluator subagent in Step 4.

To find results programmatically, scan `results/` for timestamp directories, then scan those for task folders containing `task.json`.

## Step 2: Reconstruct workspace

For each run, reconstruct the agent's workspace using the project script:

```bash
node scripts/reconstruct-workspace.js <result-folder-path>
```

This script:
1. Reads `task.json` from the result folder to get `startFrom` and `augmentations`
2. Clones the `startFrom` repo to a temp directory
3. Applies augmentations (same logic as run-tasks.js)
4. Commits as "Workspace setup"
5. Applies `changes.diff` from the result folder via `git apply`
6. Runs `npm ci` if package.json exists
7. Prints the workspace path to stdout

Capture the workspace path from stdout for subsequent steps.

**Important:** Clean up the workspace directory after evaluation is complete. The script creates workspaces under the system temp directory.

## Step 3: Run deterministic checks

Deterministic checks verify things that don't require LLM judgment — binary facts a script can answer.

Read `check-results.json` from the result folder. This file is produced during the task run by executing `tasks/{task-name}/checks.js` against the agent's workspace. It includes all deterministic checks for the task, including lint.

Each entry has:
- `name` — short identifier for the check
- `description` — what it verifies
- `passed` — boolean result
- `evidence` — what was found (or not found)

```json
[
  {
    "name": "block-files-exist",
    "description": "Block folder with .js and .css files exists",
    "passed": true,
    "evidence": "Found blocks/product-cards/product-cards.js and product-cards.css"
  }
]
```

If `check-results.json` doesn't exist, the task had no checks script — the subagent handles everything.

**Re-running checks:** If checks.js was updated after the run, you can re-run it against the reconstructed workspace:
```bash
node tasks/{task-name}/checks.js <workspace-path>
```

### Resolving check-linked criteria

Criteria in criteria.txt can reference checks by name using `[check: name]` syntax:

```
<critical>
- Block created in `blocks/{block-name}/` with matching .js and .css files [check: block-files-exist]
- Agent tested the block in a browser (not just code review)
</critical>
```

After collecting all check results (global + task-specific), resolve check-linked criteria:

1. Parse criteria.txt — find all entries with `[check: name]`
2. Look up the check name in the results
3. If found: the criterion is **resolved** — `met` = check's `passed`, `notes` = check's `evidence`
4. If not found (check name missing from results): treat as **unresolved** — the subagent must judge it

Build two lists:
- **Resolved criteria** — settled by checks, with scores already computed
- **Unresolved criteria** — need subagent judgment

Preserve the `section` from criteria.txt (the `## Section Name` heading each criterion falls under) on all criteria — both resolved and unresolved. The HTML report groups criteria by section.

All checks use the same format. A criterion can reference any check by name, e.g. `[check: lint-passes]`.

## Step 4: Subjective evaluation via subagent

Launch an evaluator subagent using the **Agent tool** to assess unresolved criteria. The subagent runs in the same environment and has access to all tools (file reading, bash, grep, Playwright CLI).

### Building the subagent prompt

Generate the prompt deterministically using the assembly script:

```bash
node scripts/assemble-eval-prompt.js <result-folder> <workspace-path> <port>
```

This reads the template from `.claude/skills/eval-run/resources/eval-prompt.template.md`, fills in task data, strips check-resolved criteria from the evaluation criteria section, and outputs the complete prompt to stdout. Pass the output directly as the subagent prompt.

The template is in `resources/eval-prompt.template.md` — edit that file to change the subagent's instructions.

### Port assignment

When running the assembly script, assign a unique port to avoid collisions if running
multiple evaluations. Use `3001 + index` (e.g. first eval gets 3001, second gets 3002).

### Parsing subagent output

The subagent returns text. Extract the JSON from its response — it may include commentary before/after. Strip markdown fences if present, then parse.

## Step 5: Assemble and write results

Merge resolved criteria (from checks) and unresolved criteria (from subagent) into the final `eval-result.json`. Add a `source` field to each criteriaCheck: `"check"` for resolved, `"judgment"` for subagent-evaluated.

### Computing scores

From the criteriaChecks array:
- `score` = sum of all `points` values
- `maxScore` = sum of possible points from critical (2 each) and important (1 each) items only
- `overallSuccess` = true when score >= 0.8 * maxScore AND no critical criterion has `met: false`

### Final schema

```json
{
  "score": 8,
  "maxScore": 11,
  "overallSuccess": true,
  "summary": "from subagent",
  "strengths": ["from subagent"],
  "weaknesses": ["from subagent"],
  "observations": ["from subagent"],
  "criteriaChecks": [
    {
      "name": "criterion name",
      "section": "section heading from criteria.txt",
      "priority": "critical",
      "met": true,
      "points": 2,
      "notes": "evidence",
      "source": "check or judgment"
    }
  ]
}
```

### Writing output files

Write to the result folder:
1. `eval-result.json` — the structured evaluation
2. `eval-data.js` — JavaScript constants for the eval viewer
3. `conversation-data.js` — parsed agent conversation (if `output.jsonl` exists)
4. `diff-data.js` — diff content (if `changes.diff` exists)

Use `scripts/assemble-eval.js` to handle all of the above:
```bash
node scripts/assemble-eval.js <result-folder> <result-folder>/subagent-output.json
```
It reads `check-resolved-criteria.json` from the result folder if present, merges with the subagent output, computes scores, and writes all data files.

**Important:** Write the intermediate subagent output JSON to the run's result folder (e.g. `results/<timestamp>/<run>/subagent-output.json`), not /tmp/. After `assemble-eval.js` completes, delete the intermediate file:
```bash
rm <result-folder>/subagent-output.json
```

### Viewing results

The viewer tools require the viewer server (`npm run serve`). After evaluation completes, provide direct URLs for each result folder evaluated:
   - `http://localhost:8765/tools/eval-viewer/index.html?data=results/<run-set>/<run>/eval-data.js`
   - `http://localhost:8765/tools/conversation-viewer/index.html?data=results/<run-set>/<run>/conversation-data.js`
   - `http://localhost:8765/tools/diff-viewer/index.html?data=results/<run-set>/<run>/diff-data.js`

Always provide the eval viewer URL at minimum. Include conversation and diff viewer URLs if those data files were generated. The index page at http://localhost:8765/ lists all batches and comparisons.

### Pre-built tooling

The following scripts are available — use them instead of writing ad-hoc scripts:

- `scripts/reconstruct-workspace.js <result-folder>` — reconstructs workspace, prints path to stdout
- `scripts/assemble-eval.js <result-folder> <subagent-output.json>` — assembles final eval from check + judgment results
- `scripts/parse-agent-log.js <output.jsonl> [output.txt]` — parses agent conversation log into readable summary
- `tasks/{task-name}/checks.js <workspace-path>` — runs deterministic checks, prints JSON to stdout

## Step 6: Clean up

Remove the reconstructed workspace temp directory:
```bash
rm -rf <workspace-path>
```

## Parallel evaluation

When evaluating multiple runs, you can process them in parallel:
- Reconstruct workspaces concurrently (each gets its own temp dir)
- Run deterministic checks concurrently
- Launch subagent evaluations concurrently

Use the Agent tool to spawn parallel evaluator subagents when processing multiple runs. Each subagent handles one run independently.

## Tips

- **Dev server ports**: Each subagent gets a unique port (3001 + index). If a port is in use, increment until one is free.
- **Large diffs**: Some runs have large changes.diff files. The reconstruct script handles this, but `git apply` may fail if the diff is malformed. Check the script's exit code and report failures.
- **Missing artifacts**: Some runs may lack certain artifacts (e.g., no commits.json if the agent didn't commit). Handle gracefully — evaluate what's available.
- **Timeout runs**: Runs where `run-metrics.json` shows `timedOut: true` may have incomplete work. Still evaluate what's there — partial credit is valid.

