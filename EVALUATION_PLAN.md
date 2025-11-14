# Agent Skills Evaluation Framework

## Current Status

**Phase 1: Foundation - ✅ COMPLETE**

We have established the evaluation framework foundation with a simplified, empirical approach.

**What's Done:**
- ✅ Test structure defined (unit/ and integration/)
- ✅ Test schema created (test.yaml with three-tier evaluation)
- ✅ Example test created (create-simple-block)
- ✅ Comprehensive documentation (TEST_SCHEMA.md, CREATING_TESTS.md)
- ✅ Empirical test creation workflow documented

**What's Next: Phase 2 - Test Runner**

Build the tooling to actually run tests and capture results. See "Implementation Phases" below for details.

**Quick Start to Resume:**
1. Review Phase 2 tasks below
2. Start with building `./tools/run-test` script
3. Focus on: checkout branch → run agent → capture artifacts

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

### Flexible Criteria (Can Vary)
These are evaluated for quality by an LLM evaluator:
- ~ Exact code implementation
- ~ Order of tool usage
- ~ Specific variable names
- ~ PR description wording
- ~ Alternative valid approaches

**Scoring:** Each criterion has a priority (high/medium/low) that guides overall assessment

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

flexible_criteria:
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
  "skills_version": "abc123",  // git commit hash

  "deterministic_results": {
    "passed": true,
    "failures": [],
    "optional_failures": [
      "blocks/quote/README.md does not exist",
      "No ARIA attributes found (consider for accessibility)"
    ]
  },

  "flexible_assessment": {
    "overall": "pass",
    "score": 85,

    "by_priority": {
      "high": {
        "code_quality": {"score": 87, "issues": []},
        "process_adherence": {"score": 82, "issues": ["Didn't announce skill usage"]}
      },
      "medium": {
        "completeness": {"score": 88, "issues": []}
      },
      "low": {
        "autonomy": {"score": 95, "issues": []}
      }
    }
  },

  "findings": {
    "strengths": [
      "Followed mobile-first approach",
      "Created test content before writing code (content-driven)"
    ],
    "issues": [
      "Didn't announce skill usage explicitly",
      "Could improve PR description clarity"
    ],
    "recommendations": [
      "Emphasize skill announcement requirement in AGENTS.md"
    ]
  },

  "artifacts_path": "./test-results/create-hero-block/2025-01-14T10:00:00Z/"
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

### Phase 2: Test Runner 📋
**Status:** Not Started - NEXT UP

**Goal:** Build tooling to execute tests and capture results.

**Core Script:** `./tools/run-test`

**What it needs to do:**
1. **Setup test environment**
   - Read test.yaml
   - Checkout `initial_state` branch (or `main` if not specified)
   - Create temporary working directory for the test run

2. **Execute agent**
   - Run agent with the task from test.yaml
   - Capture conversation transcript
   - Track tool usage (what tools, when, with what params)
   - Note workflow steps completed/skipped
   - Record any human interventions

3. **Capture artifacts**
   - Final code state (all files created/modified)
   - Conversation transcript with reasoning
   - Tool usage log
   - What the agent would put in a PR description
   - Metrics (tokens used, time elapsed)

4. **Store results**
   - Save to `test-results/{test-name}/{timestamp}/`
   - Structure: code/, transcript.txt, tool-usage.json, metrics.json

**Implementation Notes:**
- Start simple - manual agent invocation is fine initially
- Can automate more later (Phase 5)
- Focus on capturing good data for evaluation

### Phase 3: Evaluator 🤖
**Status:** Not Started

**Goal:** Automatically evaluate test results against criteria.

**Core Script:** `./tools/evaluate-test`

**What it needs to do:**
1. **Run deterministic checks (required)**
   - Check if required files exist
   - Run linting (`npm run lint`)
   - Check for forbidden/required patterns
   - Run custom scripts if specified
   - **Result:** PASS or FAIL (failures block test)

2. **Run optional deterministic checks**
   - Same types as required checks
   - **Result:** List of warnings (don't block test)

3. **Run flexible criteria evaluation (LLM)**
   - Invoke evaluation agent with:
     - Test criteria (from test.yaml)
     - Captured artifacts (code, transcript, etc.)
   - Agent scores each criterion
   - Agent identifies strengths/issues
   - **Result:** Assessment with score and findings

4. **Generate reports**
   - JSON output (structured data)
   - Markdown report (human-readable)
   - Save to test results directory

**Implementation Notes:**
- Deterministic checks can use simple scripts/regex
- Flexible evaluation needs separate LLM agent with specific prompts
- Keep evaluation agent prompts in separate files for easy iteration

### Phase 4: Comparison & Baselines 📊
**Status:** Not Started

**Goal:** Compare test results across skill versions to detect regressions/improvements.

**What it needs to do:**
1. **Store baselines**
   - Save evaluation results as named baselines
   - Associate with git commit hash of skills

2. **Compare results**
   - Compare current run to baseline
   - Identify score changes
   - Flag new failures or fixed issues
   - Highlight changes in patterns

3. **Generate comparison reports**
   - Show what improved/regressed
   - Explain why (based on findings)
   - Recommend actions

**Implementation Notes:**
- Since tests run once (not multiple times), comparison is straightforward
- Focus on clear diff of evaluation results
- Can expand later if needed

### Phase 5: Tooling & Automation 🛠️
**Status:** Not Started (Optional - Add as Needed)

**Goal:** Make the framework easier to use at scale.

**Potential additions:**
- Run all tests in a suite
- CI/CD integration (auto-run on skill changes)
- Dashboard/visualization for results over time
- Test validation tool (`./tools/validate-test`)
- Helper scripts for common tasks

**Implementation Notes:**
- Build these as pain points emerge
- Don't over-engineer upfront
- Keep scripts simple and composable

## Usage Examples

### Running a Single Test
```bash
./tools/run-test tests/unit/building-blocks/create-simple-block
```

### Running All Tests
```bash
./tools/run-all-tests
```

### Comparing Skill Versions
```bash
# Run tests with current skills
./tools/run-all-tests --save-baseline current

# Make changes to skills
vim .claude/skills/building-blocks/SKILL.md

# Run tests and compare
./tools/run-all-tests --compare-to current
```

### Viewing Results
```bash
./tools/show-results tests/unit/building-blocks/create-simple-block
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
