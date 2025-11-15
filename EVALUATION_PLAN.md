# Agent Skills Evaluation Framework

## Implementation Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Foundation** | ✅ Complete | Test structure, schema, documentation |
| **Phase 2: Test Runner** | ✅ Complete | Agent execution working for all 3 agents |
| **Phase 3: Evaluator** | 🚧 In Progress | Basic deterministic checks working, LLM evaluation pending |
| **Phase 4: Write Tests** | 🧪 Planned | Create real tests, validate framework |
| **Phase 5: TBD** | 🤷 Future | Decide based on Phase 4 learnings |

---

## Current Status

**Phase 1: Foundation - ✅ COMPLETE**

We have established the evaluation framework foundation with a simplified, empirical approach.

**Phase 2: Test Runner - ✅ COMPLETE**

All infrastructure complete. Agent execution working for Claude Code, Cursor CLI, and Windsurf CLI.

**Phase 3: Evaluator - 🚧 IN PROGRESS**

Basic evaluation script working with deterministic checks. Successfully tested on simple-file-creation test.

**What's Done:**
- ✅ Phase 1 & 2: Complete
- ✅ `./tools/evaluate` script with CLI interface
- ✅ Test definition loading
- ✅ File existence checks (via git diff parsing)
- ✅ File non-existence checks (via git diff parsing)
- ✅ PR quality checks (using gh CLI)
- ✅ Evaluation output generation (JSON + Markdown)
- ✅ Exit codes (0 for pass, 1 for fail)

**What's Next:**

**Phase 3 completion:**
1. Implement linting checks (run in test-runner before cleanup)
2. Implement forbidden pattern checks (grep in git diff)
3. Implement flexible LLM evaluation (invoke agent with prompt)

**Phase 4:** Write and run real tests, validate framework works
**Phase 5:** TBD based on learnings

**Quick Start to Resume:**
1. Test evaluate script: `./tools/evaluate <output-dir> --skip-non-deterministic`
2. Implement missing deterministic checks (linting, patterns)
3. Build flexible LLM evaluation feature

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

### Deterministic Checks (Must Pass)
These must be correct every time - failure = test fails:
- ✅ Linting passes (yes/no)
- ✅ Required files exist (yes/no)
- ✅ Code runs without errors (yes/no)
- ✅ Specific anti-patterns absent (yes/no)
- ✅ Required workflow steps completed (yes/no)
- ✅ Custom scripts pass (bash/node scripts for specialized checks)

**Scoring:** Deterministic failures = hard failures (test fails)

### Optional Deterministic Checks (Nice to Have)
Automatically verified but don't cause test failure:
- ⚠️ Optional files (README, docs, etc.)
- ⚠️ Best practice patterns
- ⚠️ Performance checks
- ⚠️ Additional quality checks

**Scoring:** Reported as warnings/suggestions, no impact on pass/fail

### Non-Deterministic Criteria (Can Vary)
These are evaluated for quality by an LLM evaluator:
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

## Test Artifacts Captured

For each test run, capture:
1. **Final code** - all files created/modified
2. **PR body** - what the agent would write for a pull request
3. **Tool usage** - what tools used, when, with what parameters
4. **Conversation transcript** - agent reasoning and decisions
5. **Steps skipped** - which workflow steps skipped and why
6. **Metrics** - token usage, time, human interventions needed

## Test Structure

```
tests/
├── unit/                           # Individual skill tests
│   ├── building-blocks/
│   │   ├── create-simple-block/
│   │   │   ├── test.yaml          # Test definition
│   │   │   └── README.md          # Test documentation
│   │   └── modify-existing-block/
│   ├── content-modeling/
│   └── testing-blocks/
└── integration/                    # Full workflow tests
    ├── new-feature-end-to-end/
    │   ├── test.yaml
    │   └── README.md
    └── fix-bug-workflow/
```

**Initial State:** Tests specify a git branch as their starting point. If not specified, uses `main` branch.

## Test Definition Schema (test.yaml)

```yaml
name: "Create hero block from scratch"
description: "Tests if agent can create a new block following all guidelines"
type: unit  # or integration
skills: ["content-driven-development", "building-blocks"]

task: |
  Create a hero block that displays a large image, headline, and CTA button.

initial_state: test/basic-setup  # Git branch name (optional, defaults to main)

deterministic_checks:
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

non_deterministic_criteria:
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
  "test_name": "create-hero-block",
  "timestamp": "2025-01-14T10:00:00Z",
  "agent": "claude-code",

  "deterministic_results": {
    "passed": true,
    "failures": [],
    "optional_failures": [
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

  "non_deterministic_assessment": {
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

  "artifacts_path": "./test-results/create-hero-block/2025-01-14T10:00:00Z/claude-code/"
}
```

## Implementation Phases

### Phase 1: Foundation ✅
**Status:** COMPLETE

Tasks:
- [x] Create test directory structure (`tests/unit/`, `tests/integration/`)
- [x] Define test.yaml schema formally (tests/TEST_SCHEMA.md)
- [x] Create first example unit test case (create-simple-block)
- [x] Document test case creation guidelines (tests/CREATING_TESTS.md)
- [x] Simplify approach (branches not directories, priorities not weights)
- [x] Add empirical test creation workflow (run first, then add criteria)

**Key Decisions Made:**
- Use git branches for initial state (defaults to `main`)
- Three-tier checks: deterministic (required), optional deterministic (warnings), flexible (LLM-evaluated)
- Priority buckets (high/medium/low) instead of weighted scoring
- Empirical approach: run test 5+ times, document patterns, then write criteria
- No "runs" parameter - tests run once, humans repeat manually if needed

### Phase 2: Test Runner ✅
**Status:** COMPLETE

**Goal:** Build tooling to execute tests and capture results.

**Core Script:** `./tools/run-test`

**Completed:**
- [x] Add tags support to test schema
- [x] Command-line argument parsing with validation
- [x] Test discovery (find all test.yaml files)
- [x] Filter tests by `--test`, `--tags`, or `--skills`
- [x] Support multiple agents via `--agents` flag
- [x] Create isolated branch for each test/agent combo
- [x] Create worktree in `.test-worktrees/` for test execution
- [x] Remove test artifacts from branch (tests/, tools/, EVALUATION_PLAN.md)
- [x] Create output directory structure in `test-results/`
- [x] Cleanup worktrees and branches after test
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
**Status:** In Progress

**Goal:** Automatically evaluate test results against criteria.

**Core Script:** `./tools/evaluate`

**Completed:**
- [x] Argument parsing (--eval-agent, --skip-non-deterministic)
- [x] Test definition loading from test.yaml
- [x] File existence checks (parse git diff)
- [x] File non-existence checks (parse git diff)
- [x] PR quality checks structure (gh CLI integration)
- [x] Output generation (JSON + Markdown)
- [x] Proper exit codes

**Still TODO:**
- [ ] Linting checks (needs to run in test-runner before cleanup)
- [ ] Forbidden pattern checks (grep through git diff)
- [ ] Required pattern checks
- [ ] Custom script execution
- [ ] Flexible LLM evaluation (invoke agent with detailed prompt)

**What it does:

1. **Run deterministic checks (required)**
   - Check if required files exist
   - Run linting (`npm run lint`)
   - Check for forbidden/required patterns
   - Run custom scripts if specified
   - **Result:** PASS or FAIL (failures block test)

2. **Run optional deterministic checks**
   - Same types as required checks
   - Special handling for PR quality (see below)
   - **Result:** List of warnings (don't block test unless PR opened)

3. **PR Quality Checks (special logic)**
   - If no PR opened: skip, no penalty
   - If PR opened: all enabled pr_quality checks must pass or test fails
   - Checks: CI/CD status, preview link presence, preview link validity
   - **Logic:** A broken PR is worse than no PR

4. **Run flexible criteria evaluation (LLM)**
   - Accept `--eval-agent` flag (default: claude-code)
   - Load test criteria from test.yaml
   - Load captured artifacts (code, transcript, etc.)
   - Invoke evaluation agent with detailed prompt
   - For each criterion (organized by priority), agent identifies:
     - **Strengths:** What went well
     - **Issues:** What didn't go well
     - **Notes:** Observations and context
   - Agent provides overall notes (no numeric scores)

5. **Generate evaluation outputs**
   - `evaluation-results.json` - Structured data with deterministic + flexible results
   - `evaluation-report.md` - Human-readable findings
   - Save both to test results directory

**Flags:**
- `--eval-agent <agent>` - Agent to use for non-deterministic evaluation (default: claude-code)
- `--skip-non-deterministic` - Only run deterministic checks (faster, for quick validation)

**Implementation Notes:**
- Deterministic checks use simple scripts/regex/file operations
- PR checks use `gh` CLI to inspect PR status and content
- Non-deterministic evaluation needs LLM agent with specific prompts
- Keep evaluation agent prompts in separate files for easy iteration
- Script takes test output directory as input

### Phase 4: Write and Run Initial Tests 🧪
**Status:** Not Started - NEXT AFTER PHASE 3

**Goal:** Create real tests and validate the framework works end-to-end.

**What to do:**
1. **Create 3-5 initial tests**
   - Pick real scenarios from actual skill usage
   - Mix of unit and integration tests
   - Cover different skills (building-blocks, content-modeling, etc.)
   - Use empirical approach: run 5+ times, document, then add criteria

2. **Run tests with framework**
   - Use `./tools/run-test` to execute
   - Use `./tools/evaluate-*` to assess
   - Identify what works, what doesn't

3. **Iterate on framework**
   - Fix bugs discovered during real usage
   - Improve test schema if needed
   - Refine evaluation criteria based on what matters

4. **Document learnings**
   - What test patterns work well?
   - What criteria are useful vs. noise?
   - How to write better tests?

**Success criteria:**
- Can run a test end-to-end without manual intervention
- Evaluation results are useful and actionable
- Framework helps identify skill improvements/regressions

### Phase 5: TBD 🤷
**Status:** Not Started

**Goal:** Decide next steps based on Phase 4 learnings.

**Potential directions:**
- Comparison & baselines (if we need to track over time)
- More automation (run all tests, CI/CD integration)
- Better tooling (validation, dashboards, etc.)
- More tests (expand coverage)
- Framework improvements (based on pain points)

**Implementation approach:**
- See where we are after Phase 4
- Build what we actually need, not what we think we might need
- Keep it simple and focused

## Usage Examples

### Running a Single Test
```bash
./tools/run-test --test create-simple-block
# or with full path
./tools/run-test --test tests/unit/building-blocks/create-simple-block
```

### Running Tests by Tags
```bash
./tools/run-test --tags blocks,basic
```

### Running Tests by Skills
```bash
./tools/run-test --skills building-blocks
./tools/run-test --skills content-driven-development,building-blocks
```

### Running with Multiple Agents
```bash
./tools/run-test --tags blocks --agents claude-code,cursor-cli
```

### Evaluating Test Results
```bash
# After running tests, evaluate the results
OUTPUT_DIR="test-results/tests/unit/building-blocks/create-simple-block/2025-01-14T10:00:00Z/claude-code"

# Run full evaluation (deterministic + flexible)
./tools/evaluate "$OUTPUT_DIR"

# Use specific eval agent for flexible criteria
./tools/evaluate "$OUTPUT_DIR" --eval-agent claude-code

# Skip non-deterministic evaluation (faster, deterministic only)
./tools/evaluate "$OUTPUT_DIR" --skip-non-deterministic
```

### Full Workflow Example
```bash
# 1. Run a test with current skills
./tools/run-test --test create-simple-block

# 2. Evaluate results
OUTPUT_DIR=$(ls -td test-results/tests/unit/building-blocks/create-simple-block/*/claude-code | head -1)
./tools/evaluate "$OUTPUT_DIR"

# 3. Review results
cat "$OUTPUT_DIR/evaluation-report.md"
cat "$OUTPUT_DIR/evaluation-results.json"

# 4. Make skill changes
vim .claude/skills/building-blocks/SKILL.md

# 5. Re-run test and compare
./tools/run-test --test create-simple-block
OUTPUT_DIR_NEW=$(ls -td test-results/tests/unit/building-blocks/create-simple-block/*/claude-code | head -1)
./tools/evaluate "$OUTPUT_DIR_NEW"

# 6. Compare results manually (or with diff tools)
diff "$OUTPUT_DIR/evaluation-results.json" "$OUTPUT_DIR_NEW/evaluation-results.json"
```

## Success Criteria

The framework is successful if:
1. ✅ Can detect regressions when skills are changed
2. ✅ Can identify improvements when skills are enhanced
3. ✅ Provides actionable feedback on what changed and why
4. ✅ Handles non-determinism gracefully
5. ✅ Minimal maintenance overhead for adding new tests

## Future Enhancements

- A/B testing between skill versions
- Automatic skill optimization suggestions
- Integration with human feedback loop
- Test case generation from real usage patterns
- Performance benchmarking (speed, cost)
