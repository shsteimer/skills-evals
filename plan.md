# Evaluation Improvements Plan

## Completed

### Additive scoring model
- Switched from deductive (start at 10, subtract) to additive (start at 0, earn points)
- All tasks updated: critical = +2, important = +1, bonus = +indicated
- Pass threshold: 80% of possible points (excluding bonus) with no critical items unmet
- Score/maxScore are integers, displayed as `earned / max` in reports
- `deduction` field renamed to `points` in eval output

### build-block task improvements
- Added badge overlay requirement (positioned over image, authored via semantic formatting in text column)
- Tightened criteria to prevent trivial cards-block copying
- Specific artifact checks for demo content (.plain.html files)
- auto-fit/auto-fill moved from requirement to bonus
- Responsive grid remains critical

### fix-block-bug task redesign
- Replaced obvious bugs (fixed 600px width, missing swipe) with subtle CSS issues:
  - `height: 400px` on `.carousel-slide` clips long content on mobile
  - `max-width: 120px` on `.carousel-nav` too narrow for 6 dots
- Added demo page (`drafts/carousel.plain.html`) with 6 slides, one with long text
- Prompt directs agent to preview the drafts page before diagnosing
- Pre-fixed JS lint issues so they don't distract from actual bugs
- Removed swipe requirement — purely a debugging task now
- innerHTML XSS stays as hidden +2 bonus

## End-to-end workflow

```
1. npm run run-tasks --augmentations baseline.json
2. npm run run-tasks --augmentations candidate.json
3. Invoke eval skill → scores each run (subagent with workspace access)
4. Invoke compare skill → analyzes differences across runs (mechanical + judgment)
```

## Implementation order

1. **Review/improve remaining tasks** — get criteria right before building eval tooling around them (modify-block, import-page)
2. **Run tasks several times** — validate updated tasks work (augmentations apply, bugs are findable, agents don't crash). Run only, don't evaluate — saves cost since the current API evaluator is being replaced.
3. **Build the eval skill** — evaluate the runs from step 2 using subagent with workspace access
4. **Build the compare skill** — judgment-augmented comparison across run sets

## Next: Eval skill (subagent evaluator)

### Principle
The LLM evaluator should only do what requires judgment. Anything deterministic should be scripted — the skill tells the eval agent which scripts to run, and the agent incorporates those results as facts.

### Current eval pipeline (eval-tasks.js)
1. Assembles artifacts (diff, lint, logs, etc.) into a prompt
2. Sends to OpenAI API as a single LLM call
3. LLM scores everything — both mechanical checks and subjective judgment
4. Parses JSON response

### New eval pipeline
1. **Workspace reconstruction** script recreates the agent's final workspace state:
   - Clone `startFrom` repo
   - Apply augmentations
   - Apply the agent's `changes.diff`
   - Result: exact state the agent left behind, available on demand
   - Most of this code already exists in run-tasks.js (clone, augmentation handling)
2. **Eval skill** launches a Claude Code subagent in the reconstructed workspace:
   - Reads criteria and captured artifacts (lint results, agent logs, etc.)
   - Runs deterministic check scripts as directed by the skill
   - Uses tools to investigate the workspace (read files, grep, compare against originals, start dev server, run Playwright)
   - Focuses LLM judgment on subjective criteria only
   - Produces structured eval-result.json

### Why subagent > API call
- Has the full workspace — can read original files, not just a diff
- Can run scripts, start servers, use Playwright
- Can compare agent's work against original codebase
- Criteria become investigation instructions, not a scoring checklist

### Run model
- Interactive: "use eval-tasks skill to evaluate results"
- User approves tool permissions as needed
- Workspace reconstructed on demand from startFrom + augmentations + diff
- No need to keep workspaces around between task runs and evaluation

### Implementation steps
1. Extract workspace setup from run-tasks.js into a reusable function (clone + augment + apply diff)
2. Build eval skill that reconstructs workspace and launches subagent
3. Skill provides deterministic check scripts for the subagent to run
4. Criteria.txt format stays the same — interpreted by a more capable evaluator
5. Eventually retire the OpenAI API eval path

## Next: Compare skill (judgment-augmented comparison)

### Current compare pipeline (compare-runs.js)
- Purely mechanical: aggregate scores, compute deltas, success rates
- Generates HTML report with tables and per-task breakdowns
- No judgment about why one set was better

### New compare pipeline
- **Mechanical layer** stays scripted: score aggregation, deltas, success rates (compare-runs.js)
- **Judgment layer** added via skill: a subagent reads eval results from both sets and provides:
  - Which set was better overall and why
  - Per-task analysis of what changed and whether it's meaningful
  - Patterns across tasks (e.g., "candidate improved testing but regressed on code quality")
  - Recommendations for next steps

### Run model
- Interactive: "use compare skill to analyze baseline vs candidate"
- Reads eval-result.json files from both run sets
- Incorporates mechanical comparison data
- Produces an augmented comparison report

## Other tasks to review
- `modify-block` — not yet analyzed for criteria quality
- `import-page` — not yet analyzed
- `hello-world` and `skill-check` — diagnostic tasks, likely fine as-is
