# Agent Skills Evaluation Framework

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

## Two-Tier Evaluation Strategy

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

### Phase 1: Foundation ⏳
**Status:** Not Started

Tasks:
- [ ] Create test directory structure (`tests/unit/`, `tests/integration/`)
- [ ] Define test.yaml schema formally
- [ ] Create first example unit test case
- [ ] Document test case creation guidelines

### Phase 2: Test Runner 📋
**Status:** Not Started

Tasks:
- [ ] Build test execution script
  - Set up isolated test environment
  - Run agent with task
  - Capture all artifacts (code, transcript, tool usage)
- [ ] Implement artifact storage structure
- [ ] Add support for initial-state setup
- [ ] Handle multiple test runs

### Phase 3: Evaluator 🤖
**Status:** Not Started

Tasks:
- [ ] Create evaluation agent
  - Canonical checks (automated)
  - Flexible criteria scoring (LLM-based)
  - Failure mode detection
- [ ] Generate evaluation reports (JSON)
- [ ] Create human-readable report format
- [ ] Track metrics (tokens, time, interventions)

### Phase 4: Comparison & Baselines 📊
**Status:** Not Started

Tasks:
- [ ] Baseline storage mechanism
- [ ] Comparison logic (statistical significance)
- [ ] Regression detection
- [ ] Trend tracking over time
- [ ] Generate delta reports

### Phase 5: Tooling & Automation 🛠️
**Status:** Not Started

Tasks:
- [ ] CLI tool for running tests
- [ ] CI/CD integration (run on skill changes)
- [ ] Dashboard/visualization for results
- [ ] Test suite management commands

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
