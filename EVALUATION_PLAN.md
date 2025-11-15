# Agent Skills Evaluation Framework

## Implementation Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Foundation** | ✅ Complete | Task structure, schema, documentation |
| **Phase 2: Task Runner** | ✅ Complete | Agent execution working for all 3 agents |
| **Phase 3: Evaluator** | ✅ Complete | Full evaluation with static + dynamic (LLM) |
| **Phase 4: Write Tasks** | 📋 Next Up | Create real tasks, validate framework |
| **Phase 5: TBD** | 🤷 Future | Decide based on Phase 4 learnings |

---

## Current Status

**Phase 1: Foundation - ✅ COMPLETE**

We have established the evaluation framework foundation with a simplified, empirical approach.

**Phase 2: Task Runner - ✅ COMPLETE**

All infrastructure complete. Agent execution working for Claude Code, Cursor CLI, and Windsurf CLI.

**Phase 3: Evaluator - ✅ COMPLETE**

Full evaluation framework working end-to-end with both static and dynamic (LLM) evaluation!

**What's Done:**
- ✅ Phase 1 & 2: Complete
- ✅ `./tools/evaluate` script with full CLI interface
- ✅ Task definition loading
- ✅ File existence/non-existence checks (via git diff parsing)
- ✅ Forbidden/required pattern checks (regex in git diff)
- ✅ Linting checks (run in task-runner, results saved)
- ✅ Custom script execution for specialized validation
- ✅ PR quality checks (using gh CLI)
- ✅ **Dynamic LLM evaluation** (invokes agent for quality assessment)
- ✅ Multi-agent evaluation (evaluates all agents in one run)
- ✅ Comprehensive reports (JSON + Markdown with all criteria)
- ✅ Exit codes (0 for pass, 1 for fail)

**What's Next:**

**Phase 4:** Write real tests, validate framework end-to-end
**Phase 5:** TBD based on learnings

**Quick Start to Resume:**
1. Run full framework: `./tools/run_tasks --task <name> && ./tools/evaluate <output-dir>`
2. Write real tests for actual skills (Phase 4)
3. Validate framework catches regressions and improvements

---

## Goal

Create a framework to evaluate the impact of changes to agent skills and context files (like CLAUDE.md, AGENTS.md) on agent performance.

**Primary Metrics:**
- Quality of output (final code quality)
- Amount of human input needed (agent autonomy)

**Evaluation Approach:**
- Automated evaluation by an agent
- Present findings for manual review/verification

**Scope:**
- Test skills in isolation (unit tests)
- Test full workflows (integration tests)

**Scale:**
- As many tests as necessary, as few as possible

## Three-Tier Evaluation Strategy

### Static Evaluation Criteria (Must Pass)
These must be correct every time - failure = task fails:
- ✅ Linting passes (yes/no)
- ✅ Required files exist (yes/no)
- ✅ Code runs without errors (yes/no)
- ✅ Specific anti-patterns absent (yes/no)
- ✅ Required workflow steps completed (yes/no)
- ✅ Custom scripts pass (bash/node scripts for specialized checks)

**Scoring:** Static criteria failures = hard failures (task fails)

### Optional Static Evaluation Criteria (Nice to Have)
Automatically verified but don't cause task failure:
- ⚠️ Optional files (README, docs, etc.)
- ⚠️ Best practice patterns
- ⚠️ Performance checks
- ⚠️ Additional quality checks

**Scoring:** Reported as warnings/suggestions, no impact on pass/fail

### Dynamic Evaluation Criteria (Can Vary)
These are evaluated for quality by an LLM using dynamic evaluation:
- ~ Exact code implementation
- ~ Order of tool usage
- ~ Specific variable names
- ~ PR description wording
- ~ Alternative valid approaches

**Output:** Qualitative findings organized by priority (high/medium/low):
- What went well (strengths)
- What didn't go well (issues)
- Observations and notes
- Human evaluates if this is better/worse than previous runs

## Task Artifacts Captured

For each task run, capture:
1. **Final code** - all files created/modified
2. **PR body** - what the agent would write for a pull request
3. **Tool usage** - what tools used, when, with what parameters
4. **Conversation transcript** - agent reasoning and decisions
5. **Steps skipped** - which workflow steps skipped and why
6. **Metrics** - token usage, time, human interventions needed

## Task Structure

```
tasks/
├── unit/                           # Individual skill evaluation tasks
│   ├── building-blocks/
│   │   ├── create-simple-block/
│   │   │   ├── task.yaml          # Task definition
│   │   │   └── README.md          # Task documentation
│   │   └── modify-existing-block/
│   ├── content-modeling/
│   └── testing-blocks/
└── integration/                    # Full workflow evaluation tasks
    ├── new-feature-end-to-end/
    │   ├── task.yaml
    │   └── README.md
    └── fix-bug-workflow/
```

**Initial State:** Tasks specify a git branch as their starting point. If not specified, uses `main` branch.

## Evaluations Directory Structure

```
evaluations/
└── {timestamp}/                    # Single timestamp per run_tasks execution
    ├── {task-name-1}/              # Sanitized task name
    │   ├── claude-code/            # Agent results
    │   │   ├── task-info.json
    │   │   ├── code-diff.patch
    │   │   ├── evaluation-results.json
    │   │   └── evaluation-report.md
    │   ├── cursor-cli/
    │   └── codex-cli/
    └── {task-name-2}/
        └── ...
```

**Benefits:**
- All tasks from one run grouped under single timestamp
- Easy to evaluate entire run: `./tools/evaluate evaluations/{timestamp}`
- Simple task names (not full paths) for easier navigation
- Compare results across agents for same task

## Task Definition Schema (task.yaml)

```yaml
name: "Create hero block from scratch"
description: "Tests if agent can create a new block following all guidelines"
type: unit  # or integration
skills: ["content-driven-development", "building-blocks"]

task: |
  Create a hero block that displays a large image, headline, and CTA button.

initial_state: test/basic-setup  # Git branch name (optional, defaults to main)

static_criteria:
  lint_passes: true
  files_exist:
    - blocks/hero/hero.js
    - blocks/hero/hero.css
  files_not_exist:
    - blocks/hero/hero.test.js  # unless explicitly required
  required_workflow_steps:
    - content-modeling
    - implementation
    - linting
  forbidden_patterns:
    - pattern: "var "  # Should use const/let
      in_files: ["**/*.js"]

dynamic_criteria:
  - name: code_quality
    description: Code follows style guidelines, is maintainable
    priority: high
  - name: process_adherence
    description: Followed skill workflow correctly
    priority: high
  - name: completeness
    description: Implementation is complete and handles edge cases
    priority: medium
  - name: autonomy
    description: Minimal human intervention needed
    priority: low
```

## Evaluation Output Schema

```json
{
  "task_name": "create-hero-block-task",
  "timestamp": "2025-01-14T10:00:00Z",
  "agent": "claude-code",

  "static_results": {
    "passed": true,
    "failures": [],
    "optional_warnings": [
      "blocks/quote/README.md does not exist",
      "No ARIA attributes found (consider for accessibility)"
    ],
    "pr_opened": true,
    "pr_quality": {
      "checks_pass": true,
      "has_preview_link": true,
      "preview_valid": true
    }
  },

  "dynamic_assessment": {
    "by_priority": {
      "high": {
        "code_quality": {
          "strengths": [
            "JavaScript uses proper decoration patterns",
            "CSS is mobile-first with correct breakpoints"
          ],
          "issues": [],
          "notes": ["All selectors properly scoped to .hero"]
        },
        "process_adherence": {
          "strengths": ["Followed content-driven development workflow"],
          "issues": ["Didn't explicitly announce skill usage"],
          "notes": ["Used building-blocks skill but announcement was implicit"]
        }
      },
      "medium": {
        "completeness": {
          "strengths": ["Handles all content fields", "Responsive across breakpoints"],
          "issues": [],
          "notes": []
        }
      },
      "low": {
        "autonomy": {
          "strengths": ["Completed without unnecessary questions"],
          "issues": [],
          "notes": ["Made reasonable decisions independently"]
        }
      }
    },
    "overall_notes": [
      "Strong implementation following established patterns",
      "Minor process improvement needed for skill announcements"
    ]
  },

  "artifacts_path": "./evaluations/2025-01-14T10:00:00Z/create-hero-block-from-scratch/claude-code/"
}
```

## Implementation Phases

### Phase 1: Foundation ✅
**Status:** COMPLETE

Tasks:
- [x] Create task directory structure (`tasks/unit/`, `tasks/integration/`)
- [x] Define task.yaml schema formally (tasks/TASK_SCHEMA.md)
- [x] Create first example unit task (create-simple-block)
- [x] Document task creation guidelines (tasks/CREATING_TASKS.md)
- [x] Simplify approach (branches not directories, priorities not weights)
- [x] Add empirical task creation workflow (run first, then add criteria)

**Key Decisions Made:**
- Use git branches for initial state (defaults to `main`)
- Three-tier checks: static (required), optional static (warnings), dynamic (LLM-evaluated)
- Priority buckets (high/medium/low) instead of weighted scoring
- Empirical approach: run test 5+ times, document patterns, then write criteria
- No "runs" parameter - tests run once, humans repeat manually if needed

### Phase 2: Task Runner ✅
**Status:** COMPLETE

**Goal:** Build tooling to execute tasks and capture results.

**Core Script:** `./tools/run_tasks`

**Completed:**
- [x] Add tags support to task schema
- [x] Command-line argument parsing with validation
- [x] Task discovery (find all task.yaml files)
- [x] Filter tasks by `--task`, `--tags`, or `--skills`
- [x] Support multiple agents via `--agents` flag
- [x] Create isolated branch for each task/agent combo
- [x] Create worktree for task execution
- [x] Install npm dependencies in worktree
- [x] Remove task artifacts from branch (tasks/, tools/, EVALUATION_PLAN.md)
- [x] Create output directory structure in `evaluations/`
- [x] Cleanup worktrees and branches after task
- [x] Implement actual agent CLI execution
  - [x] Claude Code with `claude` command
  - [x] Cursor CLI with `cursor-cli` command
  - [x] Windsurf CLI with `windsurf-cli` command
- [x] Capture artifacts:
  - [x] Final code state (diff from initial state)
  - [x] Basic agent info (command, exit code, timestamps)

**Future artifact improvements (Phase 5?):**
- Conversation transcript (agent-specific log parsing)
- Tool usage log (agent-specific format)
- Skills that were actually used during execution
- PR link (if agent opened one)
- Metrics (tokens, time, interventions)

**Implementation Notes:**
- All three agents execute successfully in isolated worktrees
- Basic artifact capture in place (code diff, agent-info.json)
- Advanced artifacts (transcripts, tool logs) deferred - need agent-specific parsers
- Ready for evaluation script development (Phase 3)

### Phase 3: Evaluator 🤖
**Status:** COMPLETE ✅

**Goal:** Automatically evaluate task results against criteria.

**Core Script:** `./tools/evaluate`

**Completed:**
- [x] Argument parsing (--eval-agent, --skip-dynamic)
- [x] Task definition loading from task.yaml
- [x] File existence checks (parse git diff)
- [x] File non-existence checks (parse git diff)
- [x] Forbidden pattern checks (regex search in git diff with glob filtering)
- [x] Required pattern checks (regex search in git diff with glob filtering)
- [x] Linting checks (run in task-runner before cleanup, results saved)
- [x] Custom script execution (arbitrary bash scripts with timeout)
- [x] PR quality checks (gh CLI integration)
- [x] Dynamic LLM evaluation (invoke agent with detailed prompt)
- [x] Multi-agent evaluation (evaluate all agents in one run)
- [x] Output generation (JSON + Markdown with full assessment)
- [x] Proper exit codes
- [x] Agent response parsing (handles claude-code, cursor-cli, codex-cli formats)

**What it does:

1. **Run static evaluation criteria (required)**
   - Check if required files exist
   - Run linting (`npm run lint`)
   - Check for forbidden/required patterns
   - Run custom scripts if specified
   - **Result:** PASS or FAIL (failures block test)

2. **Run optional static evaluation criteria**
   - Same types as required checks
   - Special handling for PR quality (see below)
   - **Result:** List of warnings (don't block test unless PR opened)

3. **PR Quality Checks (special logic)**
   - If no PR opened: skip, no penalty
   - If PR opened: all enabled pr_quality checks must pass or test fails
   - Checks: CI/CD status, preview link presence, preview link validity
   - **Logic:** A broken PR is worse than no PR

4. **Run dynamic criteria evaluation (LLM)**
   - Accept `--eval-agent` flag (default: claude-code)
   - Load test criteria from task.yaml
   - Load captured artifacts (code, transcript, etc.)
   - Invoke evaluation agent with detailed prompt
   - For each criterion (organized by priority), agent identifies:
     - **Strengths:** What went well
     - **Issues:** What didn't go well
     - **Notes:** Observations and context
   - Agent provides overall notes (no numeric scores)

5. **Generate evaluation outputs**
   - `evaluation-results.json` - Structured data with static + dynamic results
   - `evaluation-report.md` - Human-readable findings
   - Save both to task results directory

**Flags:**
- `--eval-agent <agent>` - Agent to use for dynamic evaluation (default: claude-code)
- `--skip-dynamic` - Only run static evaluation criteria (faster, for quick validation)

**Implementation Notes:**
- Static evaluation criteria use simple scripts/regex/file operations
- PR checks use `gh` CLI to inspect PR status and content
- Dynamic evaluation needs LLM agent with specific prompts
- Keep evaluation agent prompts in separate files for easy iteration
- Script takes test output directory as input

### Phase 4: Write and Run Initial Tasks 🧪
**Status:** Not Started - NEXT AFTER PHASE 3

**Goal:** Create real tasks and validate the framework works end-to-end.

**What to do:**
1. **Create 3-5 initial tasks**
   - Pick real scenarios from actual skill usage
   - Mix of unit and integration tasks
   - Cover different skills (building-blocks, content-modeling, etc.)
   - Use empirical approach: run 5+ times, document, then add criteria

2. **Run tasks with framework**
   - Use `./tools/run_tasks` to execute
   - Use `./tools/evaluate-*` to assess
   - Identify what works, what doesn't

3. **Iterate on framework**
   - Fix bugs discovered during real usage
   - Improve test schema if needed
   - Refine evaluation criteria based on what matters

4. **Document learnings**
   - What task patterns work well?
   - What criteria are useful vs. noise?
   - How to write better tasks?

**Success criteria:**
- Can run a task end-to-end without manual intervention
- Evaluation results are useful and actionable
- Framework helps identify skill improvements/regressions

### Phase 5: TBD 🤷
**Status:** Not Started

**Goal:** Decide next steps based on Phase 4 learnings.

**Potential directions:**
- Comparison & baselines (if we need to track over time)
- More automation (run all tests, CI/CD integration)
- Better tooling (validation, dashboards, etc.)
- More tasks (expand coverage)
- Framework improvements (based on pain points)

**Implementation approach:**
- See where we are after Phase 4
- Build what we actually need, not what we think we might need
- Keep it simple and focused

## Usage Examples

### Running a Single Task
```bash
./tools/run_tasks --task create-simple-block
# or with full path
./tools/run_tasks --task tasks/unit/building-blocks/create-simple-block
```

### Running Tasks by Tags
```bash
./tools/run_tasks --tags blocks,basic
```

### Running Tasks by Skills
```bash
./tools/run_tasks --skills building-blocks
./tools/run_tasks --skills content-driven-development,building-blocks
```

### Running with Multiple Agents
```bash
./tools/run_tasks --tags blocks --agents claude-code,cursor-cli
```

### Evaluating Task Results
```bash
# After running tasks, evaluate the results
OUTPUT_DIR="evaluations/tasks/unit/building-blocks/create-simple-block/2025-01-14T10:00:00Z/claude-code"

# Run full evaluation (static + dynamic)
./tools/evaluate "$OUTPUT_DIR"

# Use specific eval agent for dynamic criteria
./tools/evaluate "$OUTPUT_DIR" --eval-agent claude-code

# Skip dynamic evaluation (faster, static only)
./tools/evaluate "$OUTPUT_DIR" --skip-dynamic
```

### Full Workflow Example
```bash
# 1. Run a task with current skills
./tools/run_tasks --task create-simple-block

# 2. Evaluate results
OUTPUT_DIR=$(ls -td evaluations/tasks/unit/building-blocks/create-simple-block/*/claude-code | head -1)
./tools/evaluate "$OUTPUT_DIR"

# 3. Review results
cat "$OUTPUT_DIR/evaluation-report.md"
cat "$OUTPUT_DIR/evaluation-results.json"

# 4. Make skill changes
vim .claude/skills/building-blocks/SKILL.md

# 5. Re-run task and compare
./tools/run_tasks --task create-simple-block
OUTPUT_DIR_NEW=$(ls -td evaluations/tasks/unit/building-blocks/create-simple-block/*/claude-code | head -1)
./tools/evaluate "$OUTPUT_DIR_NEW"

# 6. Compare results manually (or with diff tools)
diff "$OUTPUT_DIR/evaluation-results.json" "$OUTPUT_DIR_NEW/evaluation-results.json"
```

## Success Criteria

The framework is successful if:
1. ✅ Detects regressions when skills are changed
2. ✅ Identifies improvements when skills are enhanced
3. ✅ Provides actionable feedback on what changed and why
4. ✅ Handles dynamic variation gracefully
5. ✅ Minimal maintenance overhead for adding new tasks

## Future Enhancements

### Performance
- **Parallel execution**: Run multiple agents in parallel during both test execution and evaluation
  - Currently: Sequential execution (one agent at a time)
  - Potential: Significant time savings when testing with multiple agents
  - Implementation: Would need to handle concurrent worktrees and output directories

### Evaluation
- **Random evaluator selection**: Option to use a random/different agent for each evaluation
  - `--eval-agent random` - Randomly selects evaluator for each agent being tested
  - `--eval-agent round-robin` - Cycles through available evaluators
  - Benefits: Diverse evaluation perspectives, reduces bias from single evaluator
  - Use case: Get multiple viewpoints on agent performance

### Analysis & Optimization
- A/B testing between skill versions
- Automatic skill optimization suggestions
- Integration with human feedback loop
- Test case generation from real usage patterns
- Performance benchmarking (speed, cost)
