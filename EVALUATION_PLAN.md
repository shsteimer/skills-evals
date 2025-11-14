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

### Canonical Checks (Deterministic - Must Pass)
These must be correct every time:
- ✅ Linting passes (yes/no)
- ✅ Required files exist (yes/no)
- ✅ Code runs without errors (yes/no)
- ✅ Specific anti-patterns absent (yes/no)
- ✅ Required workflow steps completed (yes/no)

**Scoring:** Canonical failures = hard failures (test fails)

### Flexible Criteria (Can Vary)
These are evaluated for quality but can vary across runs:
- ~ Exact code implementation
- ~ Order of tool usage
- ~ Specific variable names
- ~ PR description wording
- ~ Alternative valid approaches

**Scoring:** Scored on quality, averaged across multiple runs

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
│   │   │   ├── initial-state/     # Starting files (if any)
│   │   │   └── baseline/          # Baseline results (generated)
│   │   └── modify-existing-block/
│   ├── content-modeling/
│   └── testing-blocks/
└── integration/                    # Full workflow tests
    ├── new-feature-end-to-end/
    │   ├── test.yaml
    │   ├── initial-state/
    │   └── baseline/
    └── fix-bug-workflow/
```

## Test Definition Schema (test.yaml)

```yaml
name: "Create hero block from scratch"
description: "Tests if agent can create a new block following all guidelines"
type: unit  # or integration
skills: ["content-driven-development", "building-blocks"]

task: |
  Create a hero block that displays a large image, headline, and CTA button.
  The content should support optional subheading and background image.
  Follow all AEM best practices.

initial_state: ./initial-state/  # Path to starting files (optional)

canonical_checks:
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
    weight: 30
  - name: process_adherence
    description: Followed skill workflow correctly
    weight: 25
  - name: completeness
    description: Implementation is complete and handles edge cases
    weight: 25
  - name: autonomy
    description: Minimal human intervention needed
    weight: 20

runs: 5  # Number of times to run this test
regression_threshold: 10  # Alert if score drops >10 points from baseline
```

## Evaluation Output Schema

```json
{
  "test_name": "create-hero-block",
  "timestamp": "2025-01-14T10:00:00Z",
  "skills_version": "abc123",  // git commit hash
  "runs": 5,

  "canonical_results": {
    "passed": 5,
    "failed": 0,
    "failures": []
  },

  "flexible_scores": {
    "runs": [85, 88, 83, 87, 85],
    "mean": 85.6,
    "std_dev": 1.9,
    "min": 83,
    "max": 88,

    "breakdown": {
      "code_quality": {"mean": 87, "std_dev": 2.1},
      "process_adherence": {"mean": 82, "std_dev": 3.2},
      "completeness": {"mean": 88, "std_dev": 1.5},
      "autonomy": {"mean": 95, "std_dev": 0}
    }
  },

  "failure_modes": {
    "forgot_to_lint": 0,
    "wrong_file_structure": 1,
    "missed_test_content": 0
  },

  "comparison_to_baseline": {
    "baseline_mean": 83.2,
    "delta": +2.4,
    "significance": "improvement",
    "confidence": "medium"
  },

  "findings": {
    "strengths": [
      "Consistently followed mobile-first approach",
      "Created test content before writing code (content-driven)"
    ],
    "issues": [
      "In 1/5 runs, created files in wrong directory structure",
      "PR descriptions varied in quality"
    ],
    "recommendations": [
      "Clarify file structure requirements in building-blocks skill"
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
