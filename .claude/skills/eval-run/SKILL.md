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

Launch an evaluator subagent using the **Agent tool** to assess unresolved criteria. The subagent runs in the same environment and has access to all tools (file reading, bash, grep, Playwright MCP).

### Subagent prompt

Use this structure (adapt the specifics per run):

```
You are evaluating an agent's work on a coding task. Your job is to assess the quality
of the work by investigating the reconstructed workspace and visually verifying it in a browser.

## Task: {task_name}
{description}

## What the agent was asked to do
{prompt_txt_content}

## Evaluation criteria
{criteria_txt_content}

## Workspace
The agent's reconstructed workspace is at: {workspace_path}
You can read files, run commands, and grep there.

## Already resolved by automated checks
The following criteria have been resolved by deterministic checks. These are final —
do NOT re-evaluate them. They are included so you have full context.

{for each resolved criterion:}
- [{MET|NOT MET}] ({priority}, {points}pts) {criterion text}: {evidence}

## Additional context
{if test-results.json exists:}
- Tests: {passed|failed} — {details}

## Visual verification

You have access to an AEM dev server and Playwright for browser-based verification.
Screenshots are a key part of the evaluation — they provide concrete evidence for visual
criteria (layout, responsive behavior, positioning, etc.) and are included in the HTML report.

**Important:** Only screenshot pages the agent actually created. If the agent didn't create
demo content, note that as a finding but do not create test content yourself. You are
evaluating what the agent did, not compensating for what it didn't do.

### Starting the dev server

Start the AEM dev server in the background:

```bash
cd {workspace_path} && nohup npx -y @adobe/aem-cli up --no-open --port {port} --html-folder drafts > /tmp/aem-server.log 2>&1 &
echo $!
```

Use port {port}. The `--html-folder drafts` flag tells AEM to serve `.plain.html` files
from the `drafts/` directory. Capture the PID so you can kill it later.

Wait for the server to be ready:

```bash
for i in $(seq 1 15); do curl -sf http://localhost:{port}/ > /dev/null && break; sleep 2; done
```

### Finding pages to screenshot

Check multiple sources to find pages worth screenshotting:

1. **Workspace files** — look in `drafts/` for `.plain.html` or `.html` files the agent created
2. **Agent conversation log** — parse `output.jsonl` (use `scripts/parse-agent-log.js`) to find
   URLs the agent visited, curled, or tested. These are the pages the agent intended to work on.
3. **Task prompt and criteria** — may reference specific pages or URL paths

For AEM, a file at `drafts/product-cards.plain.html` is served at
`http://localhost:{port}/drafts/product-cards`

If no demo pages exist, skip visual verification and note the absence in your evaluation.

### Taking screenshots

Use the Playwright MCP tools to capture screenshots. Save them to `{result_folder}/screenshots/`.

For each page found:

1. Navigate: `mcp__playwright__browser_navigate` to the page URL
2. Wait for content: use `mcp__playwright__browser_snapshot` to verify the page loaded
3. Desktop screenshot: `mcp__playwright__browser_take_screenshot` with
   `filename: "{result_folder}/screenshots/{page-name}-desktop.png"`
4. Resize to mobile: `mcp__playwright__browser_resize` to width 375, height 812
5. Mobile screenshot: `mcp__playwright__browser_take_screenshot` with
   `filename: "{result_folder}/screenshots/{page-name}-mobile.png"`
6. Resize back to desktop: `mcp__playwright__browser_resize` to width 1280, height 800

Use the screenshots as evidence when judging criteria — reference what you see in them.

### Stopping the dev server

When done with visual verification, kill the server:

```bash
kill {pid} 2>/dev/null
```

Also close the browser: `mcp__playwright__browser_close`

### Including screenshots in results

In your output JSON, include a `screenshots` array listing what you captured:

```json
"screenshots": [
  {"path": "screenshots/product-cards-desktop.png", "caption": "Product cards block - desktop"},
  {"path": "screenshots/product-cards-mobile.png", "caption": "Product cards block - mobile"}
]
```

Use relative paths from the result folder.

## Your task

1. Parse the agent conversation log to understand what the agent did — what it built,
   what pages it tested, whether it used a browser, created a PR, etc.

2. If the agent created demo/test pages, start the dev server and take screenshots at
   desktop and mobile viewports. If no demo pages exist, skip visual verification and
   note the absence. Do NOT create test content yourself.

3. Evaluate each UNRESOLVED criterion (those without [check: ...] tags):
   - Investigate the workspace: read relevant source files, check the implementation
   - Use screenshots as evidence for visual criteria (reference what you see)
   - Make a clear met/not-met judgment with specific evidence from what you found

4. Assess overall quality:
   - What did the agent do well? (with specific references)
   - What did the agent do poorly or miss? (with specific references)
   - Any notable observations about the approach?

## Output format

Respond with a single JSON object (no markdown fences, no commentary):
{
  "criteriaChecks": [
    {
      "name": "criterion name from criteria",
      "section": "section heading from criteria.txt (e.g. Block Implementation, Testing)",
      "priority": "critical|important|bonus",
      "met": true/false,
      "points": <2 for critical, 1 for important, bonus value — 0 if not met>,
      "notes": "specific evidence from your investigation"
    }
  ],
  "screenshots": [
    {"path": "screenshots/filename.png", "caption": "description of what it shows"}
  ],
  "summary": "1-3 sentence overall assessment",
  "strengths": ["specific strength with evidence"],
  "weaknesses": ["specific weakness with evidence"],
  "observations": ["notable findings about the approach"]
}

Include ONLY the unresolved criteria you evaluated — not the ones already resolved by checks.

## Scoring rules
- critical items: +2 points when met, 0 when not
- important items: +1 point when met, 0 when not
- bonus items: +indicated value when met, 0 when not
```

### Port assignment

When building the subagent prompt, assign a unique port to avoid collisions if running
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

The viewer tools require a local HTTP server. After evaluation completes, tell the user how to view results:

1. Start a server from the project root (if one isn't already running):
   ```bash
   python3 -m http.server 8765
   ```

2. Provide direct URLs for each result folder evaluated, using paths relative to the project root:
   - `http://localhost:8765/tools/eval-viewer/index.html?data=results/<run-set>/<run>/eval-data.js`
   - `http://localhost:8765/tools/conversation-viewer/index.html?data=results/<run-set>/<run>/conversation-data.js`
   - `http://localhost:8765/tools/diff-viewer/index.html?data=results/<run-set>/<run>/diff-data.js`

Always provide the eval viewer URL at minimum. Include conversation and diff viewer URLs if those data files were generated.

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

