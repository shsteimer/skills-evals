---
name: task-creator
description: >
  Create new evaluation tasks and improve existing ones. Handles the full task lifecycle:
  scaffolding task definitions, creating augmentation files, analyzing eval results to find
  task problems, and refining prompts, criteria, and augmentations. Use this skill whenever
  the user wants to create a new eval task, improve any part of an existing task, review or
  analyze eval results, update the evaluation dimensions, or add new dimensions.
  Do NOT trigger for running tasks (run-tasks) or comparing batches (compare-batches).
---

# Task Creator

You help create new evaluation tasks and improve existing ones. Tasks live in `tasks/{task-name}/` and consist of three required files plus optional augmentations. Your job is to get these files right — clear prompts that test what matters, criteria that discriminate between good and bad agent work, and augmentations that set up the right conditions.

## Task anatomy

Every task has:

```
tasks/{task-name}/
├── task.json        # metadata: name, description, tags, startFrom, augmentations
├── prompt.txt       # the prompt given to the agent under test
├── criteria.txt     # evaluation criteria with scoring rubric
├── (checks.js)      # optional deterministic checks run against the workspace after the agent finishes
└── (augmentations)  # optional files copied into the workspace before the agent runs
```

**task.json** — identifies the task and configures its workspace:
```json
{
  "name": "task-name",
  "description": "Brief description of what the task tests",
  "tags": ["tag1", "tag2"],
  "startFrom": "https://github.com/org/repo",
  "augmentations": ["augmentations/some-file.js"]
}
```

- `startFrom` is the git repo cloned as the agent's workspace
- `tags` categorize the task (e.g., "cdd", "blocks", "debugging")
- `augmentations` is an optional array of file paths (relative to the project root) that get copied into the workspace. Use these for things like buggy code the agent needs to fix, source files to import, etc.

**prompt.txt** — what the agent sees. Write it the way a real user would describe the task. Don't reference skills, AGENTS.md, or internal framework details — the prompt should be natural.

**criteria.txt** — how the evaluator scores the result. Uses this structure:

```markdown
# Success Criteria

<scoring_rubric>
Start with 0 points.
<critical> items: +2 points each when met.
<important> items: +1 point each when met.
<bonus> items: Add points as indicated.
Pass threshold: 80% of possible points (excluding bonus) with no critical items unmet.
</scoring_rubric>

## Section Name

<critical>
- Criterion that earns 2 points when met
- Criterion resolved by a deterministic check [check: check-name]
</critical>

<important>
- Criterion that earns 1 point when met
</important>

<bonus>
- (+1) Criterion for exceptional work
</bonus>
```

Criteria can reference deterministic checks by name using `[check: name]` at the end of the line. When a criterion has a check reference, the evaluator resolves it directly from the check result (pass/fail) instead of using LLM judgment. The check name must match a `name` field in the output of the task's `checks.js` script. Use this for criteria that are objectively verifiable — file existence, code pattern presence, CSS properties. Leave criteria without check references for the LLM evaluator to judge.

**checks.js** (optional) — deterministic checks run against the agent's workspace after the task completes. The script receives the workspace path as its first argument and prints a JSON array to stdout:

```javascript
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const workspacePath = process.argv[2];
const results = [];

// Example: check that block files exist
const blockDirs = fs.readdirSync(path.join(workspacePath, 'blocks'));
const hasBlock = blockDirs.some(d => {
  const dir = path.join(workspacePath, 'blocks', d);
  return fs.existsSync(path.join(dir, `${d}.js`)) && fs.existsSync(path.join(dir, `${d}.css`));
});
results.push({
  name: 'block-files-exist',
  description: 'Block folder with matching .js and .css files',
  passed: hasBlock,
  evidence: hasBlock ? `Found block in blocks/${blockDirs[0]}/` : 'No matching block folder found'
});

console.log(JSON.stringify(results));
```

Each result has: `name` (identifier), `description` (what it checks), `passed` (boolean), `evidence` (what was found). These are captured as `check-results.json` in the result folder and fed to the evaluator as supplementary evidence.

Write checks for criteria that are objectively verifiable — file existence, code pattern presence, CSS property checks, HTML structure. Leave subjective criteria (code quality, appropriate naming, whether the approach "goes beyond copying") to the LLM evaluator.

## Criteria dimensions

The project maintains a set of evaluation dimensions in `docs/evaluation-dimensions.md`. These are high-level competency areas (C1: Code Quality, C2: EDS Architecture Understanding, etc.) that tasks map to. When creating or improving tasks:

- Read `docs/evaluation-dimensions.md` to understand the existing dimensions
- Map new tasks to relevant dimensions in the task-dimension matrix
- If a task needs a dimension that doesn't exist, propose adding it (new code, description, measurable indicators)
- Keep criteria.txt items grounded in these dimensions where applicable, but task-specific scoring criteria that don't map to a dimension are fine too

## Determining the mode

Figure out what the user needs:

- **Create mode** — they want a new task. Phrases like "create a task for X", "I need a task that tests Y", "add a new eval task"
- **Improve mode** — they want to refine an existing task. This covers the entire task, not just criteria — the prompt, augmentations, task config, and criteria are all fair game. Phrases like "review evals for X", "improve the build-block task", "why are scores all over the place for X", "the prompt for X is too prescriptive", "the augmentation code doesn't set up the right bug"

Sometimes the boundary is fuzzy. If the user says "I want a task like build-block but for Y", that's create mode informed by an existing task. If they say "build-block needs work", that's improve mode.

---

## Create mode

### Step 1: Interview

Understand what the task should test. Ask about:

1. **What's the task?** What should the agent build, fix, or do?
2. **What repo/starting point?** What `startFrom` repo should be used?
3. **What makes a good result?** What are the critical success criteria vs. nice-to-haves?
4. **What dimensions does this test?** Which evaluation dimensions from `docs/evaluation-dimensions.md` apply? Are any missing?
5. **Does the workspace need setup?** Are augmentations needed (buggy code, source files, config)?
6. **Tags?** What categories does this task fall into?

Don't ask all of these as a checklist — have a conversation. Some answers will be obvious from context. Fill in gaps from existing tasks if the new task is similar.

### Step 2: Research

Before writing, look at what exists:

- Read existing tasks with similar tags or goals to understand patterns and avoid duplication
- Check `docs/evaluation-dimensions.md` for the dimension matrix — where does this task fit?
- If the task is similar to an existing one, read that task's criteria.txt to understand the level of specificity expected

A caution: use existing tasks for structural patterns (file format, rubric style, priority balance), not as templates to copy from. Every task tests something different, so criteria sections like "Testing" or "Process" should be written fresh based on what actually matters for this task — not pasted from a similar task where they may not apply or may need different priority levels.

### Step 3: Scaffold

Write the three required files:

**prompt.txt** — Write it as a natural user request. Keep it focused on what the agent should accomplish, not how. Don't mention evaluation criteria, scoring, or the framework. A real user wouldn't say "make sure to run lint" — they'd just describe what they want built.

**criteria.txt** — Write criteria that are:
- **Observable** — the evaluator can verify them from the artifacts (changes.diff, lint-results.json, output.jsonl, commits.json, test-results.json)
- **Discriminating** — good agent work passes, bad work fails. Avoid criteria that every agent will trivially meet or that no agent can possibly meet.
- **Specific** — "uses semantic HTML" is vague; "uses `<ul>/<li>` for list content rather than nested `<div>` elements" is specific and verifiable.
- **Prioritized** — critical items are dealbreakers, important items matter but aren't fatal, bonus items reward going above and beyond.

The evaluator sees: the task prompt, the criteria, the git diff, lint results, test results, commit history, and the agent's conversation log. Write criteria that can be evaluated from these artifacts.

**task.json** — Fill in metadata. Set `startFrom` to the appropriate repo.

**Augmentations** — If the task needs workspace setup (buggy code to fix, source files to import, etc.), create the augmentation files in `tasks/{task-name}/` or a suitable location, and reference them in task.json's `augmentations` array. Only create task-specific augmentations — global augmentations in `augmentations/` are managed separately.

When designing augmentations, think about the difficulty curve. For bug-fix tasks: the bug should be realistic (something a real developer might introduce), discoverable with the right debugging approach, but not so obvious that a grep for "TODO" or "FIXME" finds it immediately. For import/migration tasks: the source material should have enough complexity to test the agent's judgment, not just mechanical transformation. The augmentation sets the stage for the task — if it's too easy or too hard, the criteria won't discriminate.

### Step 4: Map to evaluation dimensions

Before presenting to the user, read `docs/evaluation-dimensions.md` and explicitly map the new task to dimensions:
- Which existing dimensions (C1-C6+) does this task test?
- Add a row for the new task in the task-dimension matrix
- If the task needs a dimension that doesn't exist, draft it (code, description, measurable indicators)

This step is easy to skip but matters — it keeps the evaluation framework coherent across tasks.

### Step 5: Review together

Present the draft to the user. Walk through:
- The prompt — does it read naturally? Does it capture the intent?
- The criteria — are critical/important/bonus priorities right? Any missing criteria? Any that seem too easy or impossible?
- The evaluation dimensions — does the mapping to `docs/evaluation-dimensions.md` make sense?
- Augmentations — are they correct and complete?

Iterate until the user is satisfied. Then apply the `docs/evaluation-dimensions.md` updates.

---

## Improve mode

### Step 1: Gather data

1. Read the task definition from `tasks/{task-name}/`:
   - `task.json`, `prompt.txt`, `criteria.txt`

2. Read `docs/evaluation-dimensions.md` for context on evaluation dimensions

3. Scan `results/*/` for all result directories matching the task. Result directories follow the pattern `results/{timestamp}/{task-name}-{agent}-{iteration}/`. Each may contain:
   - `eval-result.json` — structured eval output (score, overallSuccess, summary, strengths, weaknesses, observations, criteriaChecks)
   - `eval-prompt.txt` — the assembled prompt sent to the evaluator LLM
   - `output.jsonl` — raw agent conversation log (JSON lines)
   - `changes.diff` — git diff of agent's changes
   - `lint-results.json` — linting output
   - `test-results.json` — test runner output
   - `commits.json` — git commits made
   - `run-metrics.json` — timing and token usage
   - `task.json` — run-level metadata (includes `taskHash` for versioning)

Use Glob to find matching directories, then read all available files across all runs. Read every `eval-result.json` and `changes.diff` at minimum. For claims analysis, also read `output.jsonl` files — focus on assistant messages and tool calls, skip raw tool results.

#### Task versioning

Each result's `task.json` may contain a `taskHash` — a content hash of the source prompt.txt, criteria.txt, and task.json at the time the run was created. Group runs by task version. When comparing runs across versions, note that score differences may reflect criteria changes rather than agent performance.

### Step 2: Analyze

Analyze the full task — not just criteria. The prompt, augmentations, and criteria all interact, and problems in one often manifest as symptoms in another.

#### Prompt analysis

Look at how agents interpreted the prompt across runs:
- **Too vague** — agents diverge wildly in what they build, suggesting the prompt doesn't communicate intent clearly
- **Too prescriptive** — agents all follow the same rigid path, preventing the criteria from distinguishing creative/skilled approaches from rote execution
- **Leaking implementation hints** — prompt tells agents what to do rather than what to achieve (e.g., "use createOptimizedPicture()" belongs in criteria, not the prompt)
- **Unnatural language** — prompt doesn't read like something a real user would say

#### Augmentation analysis

If the task has augmentations, check whether they're doing their job:
- **Wrong setup** — augmentation code doesn't create the right conditions (e.g., a "fix the bug" task where the buggy code is broken in a way that's too obvious or too obscure)
- **Missing context** — agents struggle because workspace is missing files they'd need in a real scenario
- **Stale augmentations** — augmentations reference patterns or APIs that have changed in the startFrom repo

#### Claims verification

Scan agent logs (`output.jsonl`) and extract claims agents made, then check whether the evaluator gave credit for things that didn't actually happen. This reveals criteria that need tightening.

**Claim types:**
- **Process claims** — "I tested this in the browser", "I ran the linter", "I verified on mobile"
- **Factual claims** — "The bug was caused by X", "The API returns Y format"
- **Quality claims** — "The implementation is responsive", "Error handling covers all cases"

**Verification:** Cross-reference claims against matching tool calls in `output.jsonl`, `lint-results.json`, `test-results.json`, and `changes.diff`. Focus on patterns where the evaluator accepted unverified claims as evidence that a criterion was met.

#### Criteria quality

For each criterion, analyze how it performed across runs using `criteriaChecks` in each `eval-result.json`:

- **Non-discriminating** — always `met: true` regardless of agent quality. Too easy, too vague, or interpreted too loosely.
- **Impossible** — always `met: false`. Asks for something agents can't do in this environment, or can't be verified from available artifacts.
- **Inconsistently evaluated** — similar agent behavior scored differently across runs. Wording is ambiguous.
- **Loosely interpreted** — evaluator gives credit for partial or tangential fulfillment. Compare what the criterion says vs. what the evaluator accepted.
- **Missing criteria** — important outcomes visible in results that no criterion covers. Check `changes.diff` for patterns of good/bad work that criteria miss. Check `weaknesses` and `observations` in eval results for recurring themes.

#### Cross-run patterns

Surface patterns that aggregate scores hide:

- **Score variance** — which criteria drive wide score ranges? High variance on one criterion may mean it's flaky or poorly worded.
- **Agent behavior divergence** — where do agents approach the task fundamentally differently? Do criteria unintentionally favor one approach?
- **Common failure modes** — what do agents consistently get wrong? Could criteria catch these failures?
- **Resource-quality correlation** — do agents that spend more tokens/time produce better results? Weak correlation might mean criteria aren't capturing the work that takes effort.
- **Evaluator consistency** — how does the evaluator score identical or near-identical work across runs?
- **Version-aware comparison** — when runs span multiple task versions, analyze whether criteria changes improved discrimination.

### Step 3: Apply changes

The analysis above is an intermediate step — your real deliverable is improved task files. Use your findings to draft specific edits, present them to the user, and apply after approval. Everything is fair game:

**prompt.txt:**
- Clarify vague intent that caused agents to diverge in unproductive ways
- Remove implementation hints that belong in criteria or not at all
- Make the language more natural
- Add or remove constraints based on what the data shows

**criteria.txt:**
- Tighten criteria wording to prevent loose interpretation
- Remove or rework non-discriminating criteria
- Adjust impossible criteria (make achievable, or remove if not relevant)
- Add missing criteria identified from the analysis
- Adjust priority levels (critical/important/bonus) based on what the data shows

**task.json:**
- Update tags, description, or startFrom if needed

**Augmentations:**
- Fix augmentation files that don't set up the right conditions
- Add missing augmentations
- Update stale augmentations

**docs/evaluation-dimensions.md:**
- Update dimensions or the task-dimension matrix if needed

Present proposed changes clearly — show what's changing and why — then apply after user approval.

---

## Important notes

- When runs are few (2-3), be upfront about limited confidence. Patterns from 2 runs are hypotheses, not conclusions.
- Focus effort proportionally: critical criteria matter more than bonus criteria, actionable findings matter more than observations.
- Agents fail for many reasons — environment, augmentations, time limits, task difficulty. Don't conflate agent failure with criteria problems. A criterion agents consistently fail may be perfectly valid.
- The scoring rubric (start from 0, earn 2/critical, 1/important, add for bonus; pass at 80% with no critical unmet) is important context for score distributions.
- Read `eval-prompt.txt` when available — it shows exactly what the evaluator saw, which helps explain scoring.
- Use subagents for heavy analysis when the data is large (many runs, large output.jsonl files). Delegate specific analysis tasks (e.g., "read these 5 output.jsonl files and extract all process claims") to keep the main conversation focused.
