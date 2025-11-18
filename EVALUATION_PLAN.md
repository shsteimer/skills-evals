# Agent Skills Evaluation Framework

## Implementation Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Foundation** | ✅ Complete | Task structure, schema, documentation |
| **Phase 2: Task Runner** | ✅ Complete | Agent execution working for all 3 agents |
| **Phase 3: Evaluator** | ✅ Complete | Full evaluation with static + dynamic (LLM) |
| **Phase 3b: Fix Diff Bug** | ✅ Complete | Fix git diff capture when agent makes commits |
| **Phase 3c: Refine Evaluator** | ✅ Complete | Narrative format, template-based prompts, new criteria schema |
| **Phase 4: Write Tasks** | 📋 Next | Create real tasks, validate framework end-to-end |
| **Phase 5: TBD** | 🤷 Future | Decide based on Phase 4 learnings |

---

## Current Status

**Phase 1: Foundation - ✅ COMPLETE**

We have established the evaluation framework foundation with a simplified, empirical approach.

**Phase 2: Task Runner - ✅ COMPLETE**

All infrastructure complete. Agent execution working for Claude Code, Cursor CLI, and Windsurf CLI.

**Phase 3b: Fix Diff Bug - ✅ COMPLETE**

Git diff capture bug is fixed!

**Phase 3c: Refine Evaluator - ✅ COMPLETE**

Ran evaluations, identified issues, and made significant improvements to the evaluation system.

**What Was Done:**

1. **Evaluation Workflow** - Added flags for better control:
   - `--clean`: Cleanup only, exit
   - `--skip-dynamic`: Clean → static → prompt (skip agent invocation)
   - No flags: Clean → static → prompt → dynamic (default full evaluation)
   - Cleanup now runs by default for fresh results

2. **Narrative Evaluation Format** - Replaced rigid JSON with free-form markdown:
   - Executive Summary → Strengths → Areas for Improvement → Detailed Analysis → Conclusion
   - Gives evaluation agents creative freedom while maintaining structure
   - Responses saved as `eval-agent-response.md`
   - Fixed JSON output flags that were forcing wrong format

3. **Prompt Improvements**:
   - Extracted to `evaluation-prompt-template.txt` for easy editing
   - Changed "Test" → "Task" terminology throughout
   - Added optional `expected_outcome` field support
   - Softened "based only on" → "based largely on" for flexibility
   - Template uses placeholders: `{{TASK_INFO}}`, `{{CRITERIA}}`, `{{ARTIFACTS}}`

4. **Simplified Criteria Schema**:
   - **Removed** redundant `name` field
   - **`description`**: Main criterion (what to evaluate)
   - **`details`**: Optional array of specific points to consider
   - Much cleaner and more natural to write

5. **Documentation Updated**:
   - Updated `tasks/TASK_SCHEMA.md` with new format
   - Updated `tasks/CREATING_TASKS.md` with examples
   - Migrated both existing test tasks to new format

**Phase 4 (Next):** Write real tasks and validate framework
   - Create unit tasks for individual skills
   - Run tasks → evaluate → review results
   - Validate framework catches skill improvements/regressions
   - Document patterns and best practices

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

**Core Script:** `./tools/run-tasks.js`

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
**Status:** BUG FOUND 🐛

**Goal:** Automatically evaluate task results against criteria.

**Core Script:** `./tools/evaluate.js`

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

**Bug discovered:**
- [ ] Git diff capture in `run_tasks` is incomplete when agent makes commits
  - See Phase 3b below for details

**What it does:**

1. **Run static evaluation criteria (required)**
   - Check if required files exist (via git diff parsing)
   - Run linting if `lint_passes: true` specified
   - Check for forbidden/required patterns (regex in git diff)
   - Run custom scripts if specified
   - **Result:** PASS or FAIL (failures block test)
   - **Exit behavior:** Static failures cause non-zero exit code

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
   - **RUNS REGARDLESS OF STATIC CHECK RESULTS** (line 1261-1265 in evaluate script)
   - Accept `--eval-agent` flag (default: claude-code)
   - Can be skipped with `--skip-dynamic` for faster iteration
   - Load test criteria from task.yaml
   - Load captured artifacts (code, transcript, etc.)
   - Invoke evaluation agent with detailed prompt (see below)
   - For each criterion (organized by priority), agent identifies:
     - **Strengths:** What went well
     - **Issues:** What didn't go well
     - **Notes:** Observations and context
   - Agent provides overall notes (no numeric scores)

5. **Generate evaluation outputs**
   - `evaluation-results.json` - Structured data with static + dynamic results
   - `evaluation-report.md` - Human-readable findings
   - Save both to task results directory

**Evaluation Prompt Structure (buildEvaluationPrompt, line 1005-1089):**
```
# Agent Skills Test Evaluation

## Test Information
- Test name, description, task prompt
- Expected skills

## Evaluation Criteria
- Grouped by priority (high/medium/low)
- Each criterion has name + description

## Artifacts to Review
- Lists all available files in output directory
- Includes: code diff, transcripts, test-info.json, etc.

## Instructions
- Focus on qualitative assessment
- Acknowledge multiple valid approaches
- Note both successes and improvements
- Be constructive and specific

## Output Format
- Organize by priority
- For each criterion: strengths/issues/notes arrays
- Plus overall_notes array
```

The agent receives this as a structured prompt and responds with JSON matching the schema.

**Flags:**
- `--eval-agent <agent>` - Agent to use for dynamic evaluation (default: claude-code)
- `--skip-dynamic` - Only run static evaluation criteria (faster, for quick validation)

**Implementation Notes:**
- Static evaluation criteria use simple scripts/regex/file operations
- PR checks use `gh` CLI to inspect PR status and content
- Dynamic evaluation needs LLM agent with specific prompts
- Keep evaluation agent prompts in separate files for easy iteration
- Script takes test output directory as input

### Phase 3b: Fix Git Diff Capture Bug 🐛
**Status:** ✅ COMPLETE

**Goal:** Fix critical bug in git diff capture that causes missed changes when agents make commits.

**Problem:**
In `./tools/run_tasks`, the code diff is captured with:
```bash
git diff --cached HEAD
```

This only shows staged changes relative to HEAD. If the agent makes commits during execution, HEAD moves forward, so the diff only shows changes after the last commit, not all changes from the initial state.

**Example scenario:**
- Initial state: `main` branch (commit A)
- Agent runs, creates commit B (adds `hero.js`)
- Agent creates commit C (adds `hero.css`)
- Agent stages more changes
- We capture: `git diff --cached HEAD` → only shows staged changes, misses B and C!
- Evaluation checks for `hero.js` and `hero.css` → incorrectly reports as missing!

**The Fix:**

1. **In `createTestBranch()` function (line ~283):**
   - Capture the initial commit SHA before creating branch
   - Return both branch name and initial SHA
   ```javascript
   const { stdout: initialSha } = await execAsync(`git rev-parse ${initialState}`);
   return { branchName, initialSha: initialSha.trim() };
   ```

2. **In diff capture code (line ~750):**
   - Change from `git diff --cached HEAD` to `git diff ${initialSha} HEAD`
   - This captures ALL changes from initial state to current HEAD (includes all commits + staged changes)
   ```javascript
   // Include all commits + staged changes
   const { stdout: diffOutput } = await execAsync(
     `git diff ${initialSha} HEAD`, 
     { cwd: worktreePath }
   );
   ```

3. **Also capture staged-only diff for reference:**
   ```javascript
   // Also save staged-only changes for debugging
   const { stdout: stagedDiff } = await execAsync(
     `git diff --cached HEAD`,
     { cwd: worktreePath }
   );
   writeFileSync(join(outputDir, 'staged-changes.patch'), stagedDiff);
   ```

**What was done:**
1. Simplified `createTestBranch()` - just creates branch, no SHA capture
2. In `runTestWithAgent()` - capture SHA AFTER `cleanupTestArtifacts()` instead of before
   - This excludes infrastructure cleanup from diffs
3. In diff capture code:
   - Stage all changes (tracked + untracked)
   - Commit staged changes to ensure they're in HEAD
   - Use `git diff ${initialSha} HEAD` to capture full history
4. Result: Diff now shows only what agent did, excludes cleanup commit

**Committed:** `802feb6` - "fix: capture git diff from correct baseline after cleanup"

### Phase 3c: Refine Evaluator 🔬
**Status:** 🔬 CURRENT

**Goal:** Run the evaluate script on real results and tune it for useful output.

**Why this phase:**
- The evaluate script is built but untested on real results
- We have existing task results in `evaluations/2025-11-16T02:25:38.205Z/`
- Need to verify prompts produce useful evaluations
- Output format may need tuning for readability

**What to do:**

1. **Run evaluator on existing results**
   ```bash
   # After fixing diff bug, run evaluate on existing docs-search task
   ./tools/evaluate.js evaluations/2025-11-16T02:25:38.205Z/docs-search-basic-feature-lookup
   ```

2. **Review outputs**
   - Check `evaluation-results.json` structure
   - Read `evaluation-report.md` for clarity
   - Review evaluation prompt sent to LLM
   - Check if dynamic criteria findings are useful

3. **Tune evaluation prompt (if needed)**
   - Update `buildEvaluationPrompt()` in `./tools/evaluate`
   - Adjust instructions for clearer guidance
   - Test with different eval agents
   - Ensure JSON response parsing works reliably

4. **Refine output format (if needed)**
   - Update `generateMarkdownReport()` for better readability
   - Add summary tables or key metrics at top
   - Make it easy to compare across agents
   - Consider diff-friendly formats for tracking over time

5. **Test with multiple agents**
   - Run evaluation with different `--eval-agent` options
   - Compare evaluation perspectives
   - Ensure all agent response formats parse correctly

**Success criteria:**
- Can run evaluate on all agents without errors
- Evaluation reports are readable and useful
- Dynamic findings provide actionable insights
- Easy to spot what went well vs. what needs work

**Iteration approach:**
- Run → Review → Adjust → Repeat
- Don't try to perfect it, just make it useful
- Keep it simple and focused

### Phase 4: Write Tasks 📝
**Status:** 📋 NEXT - After evaluator is proven to work

**Goal:** Create unit tasks to test individual skills and validate the full framework.

**Why wait until now:**
- ✅ Git diff bug must be fixed (Phase 3b) - DONE
- 🔬 Evaluator must produce useful output (Phase 3c) - IN PROGRESS
- Otherwise we're writing tasks against a broken system

**Approach:**
- Focus on unit tasks first (test one skill at a time)
- Use empirical approach: run 5+ times, document patterns, then add criteria
- Start simple, iterate based on learnings
- See "Planned Unit Tasks" section below for initial list

**What to do:**

1. **Create initial unit tasks** (see list below)
   - Pick real scenarios from actual skill usage
   - Cover key skills individually
   - Start with simple tasks to validate framework

2. **Run full evaluation loop for each task**
   ```bash
   # Full workflow
   ./tools/run-tasks.js --task <task-name> --agents claude-code,cursor-cli
   ./tools/evaluate.js evaluations/{timestamp}/{task-name}
   
   # Review results
   cat evaluations/{timestamp}/{task-name}/*/evaluation-report.md
   ```

3. **Use empirical approach to add criteria**
   - Run task 5+ times with different agents
   - Document what ALWAYS should be true (static criteria)
   - Document what VARIES but matters (dynamic criteria)
   - Add criteria to task.yaml based on patterns observed

4. **Iterate on framework as needed**
   - Fix bugs discovered during real usage
   - Improve task schema if patterns emerge
   - Refine evaluation criteria based on what's useful vs. noise
   - Update documentation with lessons learned

5. **Document learnings**
   - What task patterns work well?
   - What criteria catch real issues?
   - How to write better tasks for different skill types?
   - What makes evaluation results actionable?

**Success criteria:**
- Can run any task end-to-end without manual intervention
- Evaluation results are useful and actionable
- Framework helps identify skill improvements/regressions
- Have enough tasks to validate framework thoroughly

### Phase 5: TBD 🤷
**Status:** Not Started

**Goal:** Decide next steps based on Phase 4 learnings.

**Implementation approach:**
- See where we are after Phase 4
- Build what we actually need, not what we think we might need
- Keep it simple and focused

**Potential directions to consider:**

#### Performance Improvements
- **Parallel execution**: Run multiple agents in parallel during both test execution and evaluation
  - Currently: Sequential execution (one agent at a time)
  - Potential: Significant time savings when testing with multiple agents
  - Implementation: Would need to handle concurrent worktrees and output directories

#### Evaluation Enhancements
- **Random evaluator selection**: Option to use a random/different agent for each evaluation
  - `--eval-agent random` - Randomly selects evaluator for each agent being tested
  - `--eval-agent round-robin` - Cycles through available evaluators
  - Benefits: Diverse evaluation perspectives, reduces bias from single evaluator
  - Use case: Get multiple viewpoints on agent performance

#### Analysis & Optimization
- A/B testing between skill versions
- Automatic skill optimization suggestions
- Integration with human feedback loop
- Test case generation from real usage patterns
- Performance benchmarking (speed, cost)

#### Automation & Tooling
- Run all tests in CI/CD
- Validation tools for task definitions
- Dashboards for tracking results over time
- Comparison tools (before/after, agent vs agent)
- Baseline tracking for detecting regressions

#### Expansion
- More tasks (expand coverage of skills and scenarios)
- Integration tests (full workflows combining multiple skills)
- Framework improvements based on pain points discovered in Phase 4

## Planned Unit Tasks

Focus on testing individual skills in isolation to understand their strengths and weaknesses.

### Content Modeling Skill

**Task: Model simple carousel**
- Test ability to design appropriate content structure for a carousel block with images and captions.

**Task: Model complex form**
- Test ability to design content model for a multi-step form with various field types.

### Building Blocks Skill

**Task: Create simple quote block**
- Test basic block creation with minimal requirements (blockquote with optional attribution).

**Task: Create hero block**
- Test block creation with moderate complexity (image, heading, subheading, CTA button).

**Task: Modify existing accordion block**
- Test ability to understand existing block code and add new feature (e.g., allow multiple panels open).

**Task: Fix styling bug in cards block**
- Test ability to identify and fix CSS issues in existing block.

### Content-Driven Development Skill

**Task: Create block following CDD workflow**
- Test whether agent properly follows content-driven development (content model first, then implementation).

**Task: Create block with test content**
- Test whether agent creates appropriate test content before writing code.

### Testing Blocks Skill

**Task: Write unit tests for utility function**
- Test ability to create proper unit tests for a JavaScript utility function.

**Task: Write browser tests for interactive block**
- Test ability to create Playwright/Puppeteer tests for block with user interactions.

### Block Collection and Party Skill

**Task: Find reference implementation**
- Test ability to search Block Collection/Party for similar patterns and use as reference.

**Task: Adapt existing block pattern**
- Test ability to find and adapt a pattern from Block Collection to current needs.

### Docs Search Skill

**Task: Research feature implementation**
- Test ability to search aem.live documentation to understand how to implement a specific feature.

**Task: Find best practices**
- Test ability to find relevant best practices documentation for a given scenario.

### Integration Tasks (Future)

These will test complete workflows combining multiple skills:
- **Build new feature end-to-end** - CDD → Building → Testing
- **Debug and fix production issue** - Docs Search → Analysis → Fix → Testing
- **Migrate existing component** - Reference Search → Content Modeling → Building

## Usage Examples

### Running a Single Task
```bash
./tools/run-tasks.js --task create-simple-block
# or with full path
./tools/run-tasks.js --task tasks/unit/building-blocks/create-simple-block
```

### Running Tasks by Tags
```bash
./tools/run-tasks.js --tags blocks,basic
```

### Running Tasks by Skills
```bash
./tools/run-tasks.js --skills building-blocks
./tools/run-tasks.js --skills content-driven-development,building-blocks
```

### Running with Multiple Agents
```bash
./tools/run-tasks.js --tags blocks --agents claude-code,cursor-cli
```

### Evaluating Task Results
```bash
# After running tasks, evaluate the results
OUTPUT_DIR="evaluations/tasks/unit/building-blocks/create-simple-block/2025-01-14T10:00:00Z/claude-code"

# Run full evaluation (static + dynamic)
./tools/evaluate.js "$OUTPUT_DIR"

# Use specific eval agent for dynamic criteria
./tools/evaluate.js "$OUTPUT_DIR" --eval-agent claude-code

# Skip dynamic evaluation (faster, static only)
./tools/evaluate.js "$OUTPUT_DIR" --skip-dynamic
```

### Full Workflow Example
```bash
# 1. Run a task with current skills
./tools/run-tasks.js --task create-simple-block

# 2. Evaluate results
OUTPUT_DIR=$(ls -td evaluations/tasks/unit/building-blocks/create-simple-block/*/claude-code | head -1)
./tools/evaluate.js "$OUTPUT_DIR"

# 3. Review results
cat "$OUTPUT_DIR/evaluation-report.md"
cat "$OUTPUT_DIR/evaluation-results.json"

# 4. Make skill changes
vim .claude/skills/building-blocks/SKILL.md

# 5. Re-run task and compare
./tools/run-tasks.js --task create-simple-block
OUTPUT_DIR_NEW=$(ls -td evaluations/tasks/unit/building-blocks/create-simple-block/*/claude-code | head -1)
./tools/evaluate.js "$OUTPUT_DIR_NEW"

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

