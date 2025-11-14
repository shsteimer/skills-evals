# Creating Tests Guide

## Overview

This guide explains how to create new test cases for the Agent Skills Evaluation Framework.

## Test Types

### Unit Tests
- **Location**: `tests/unit/`
- **Purpose**: Test individual skills or focused capabilities
- **Scope**: Single skill or small set of related skills
- **Duration**: Should complete in < 5 minutes
- **Example**: "Create a simple block", "Model content for a carousel"

### Integration Tests
- **Location**: `tests/integration/`
- **Purpose**: Test complete workflows involving multiple skills
- **Scope**: Full development workflows (design → implement → test)
- **Duration**: May take 10-15 minutes
- **Example**: "Build new feature end-to-end", "Fix bug workflow"

## Creating a New Test

### Step 1: Choose Test Location

```bash
# Unit test example
mkdir -p tests/unit/{skill-name}/{test-name}/{initial-state,baseline}

# Integration test example
mkdir -p tests/integration/{workflow-name}/{initial-state,baseline}
```

### Step 2: Create test.yaml

Copy the template and customize:

```bash
cp tests/TEST_SCHEMA.md tests/unit/my-skill/my-test/test.yaml
# Edit test.yaml with your test definition
```

#### Required Decisions

1. **What skills are you testing?**
   - List them in `skills: []`
   - Should exist in `.claude/skills/`

2. **What's the task?**
   - Write a clear, complete prompt
   - Don't assume implicit knowledge
   - Include all requirements

3. **What must pass every time?** (Canonical checks)
   - Which files must exist?
   - Should linting pass?
   - What patterns are forbidden?
   - Which workflow steps are required?

4. **What should be evaluated for quality?** (Flexible criteria)
   - Code quality?
   - Process adherence?
   - Completeness?
   - Autonomy?
   - Set weights (must sum to 100)

5. **How many runs?**
   - Start with 3-5
   - Increase if variance is high

### Step 3: Set Up Initial State

Decide what files the test should start with:

```bash
# Option A: Start from boilerplate
cp -r {package.json,.eslintrc.js,scripts/,styles/} \
  tests/unit/my-skill/my-test/initial-state/

# Option B: Start with custom files
# Manually create files needed for test scenario
```

Document the initial state in `initial-state/README.md`:

```markdown
# Initial State

## Purpose
[Why these files?]

## Contents
- package.json - [why needed]
- scripts/scripts.js - [why needed]

## What's NOT included
[Files intentionally omitted]
```

### Step 4: Write Test README

Create `README.md` explaining the test:

```markdown
# [Test Name]

## Purpose
[What does this test evaluate?]

## What It Tests
### Skills Under Test
- skill-name - [what aspect]

### Key Behaviors
1. [Behavior 1]
2. [Behavior 2]

## Expected Outcome
[What should happen when test passes?]

### Example Expected Files
[Show what good output looks like]

## Canonical Pass Criteria
- ✅ [Criterion 1]
- ✅ [Criterion 2]

## Flexible Quality Criteria
[What's evaluated for quality]

## Common Failure Modes
[What typically goes wrong]
```

### Step 5: Validate Test Definition

Check that your test.yaml is valid:

```bash
./tools/validate-test tests/unit/my-skill/my-test/test.yaml
```

Validates:
- All required fields present
- Skills exist in `.claude/skills/`
- Weights sum to 100
- File paths are valid
- Runs > 0, timeout > 0

## Test Design Best Practices

### 1. Clear Task Descriptions

❌ **Bad:**
```yaml
task: Create a hero block
```

✅ **Good:**
```yaml
task: |
  Create a hero block that displays a large image, headline, and CTA button.
  The block should support:
  - Hero image (required)
  - Headline text (required)
  - Subheading text (optional)
  - CTA button with link (required)

  Follow all AEM best practices for block development.
```

### 2. Meaningful Canonical Checks

Focus on things that indicate real problems:

✅ **Good:**
```yaml
canonical_checks:
  lint_passes: true  # Ensures code quality
  files_exist:
    - blocks/hero/hero.js
    - blocks/hero/hero.css
  forbidden_patterns:
    - pattern: "var "  # Modern JS uses const/let
      in_files: ["**/*.js"]
```

❌ **Bad:**
```yaml
canonical_checks:
  files_exist:
    - blocks/hero/hero.js
    - blocks/hero/hero.css
    - blocks/hero/hero.test.js  # Don't require if not essential
    - blocks/hero/README.md     # Don't require documentation files
```

### 3. Specific Flexible Criteria

❌ **Bad:**
```yaml
flexible_criteria:
  - name: quality
    description: Code is good quality
    weight: 50
```

✅ **Good:**
```yaml
flexible_criteria:
  - name: code_quality
    description: |
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with breakpoints (600px, 900px)
      - Selectors properly scoped
      - Semantic HTML elements used
      - Code is maintainable
    weight: 30
```

### 4. Appropriate Weights

Weight based on what matters most for this test:

```yaml
# For a test focused on following process:
flexible_criteria:
  - name: process_adherence
    weight: 40  # Most important
  - name: code_quality
    weight: 30
  - name: completeness
    weight: 20
  - name: autonomy
    weight: 10

# For a test focused on code quality:
flexible_criteria:
  - name: code_quality
    weight: 40  # Most important
  - name: completeness
    weight: 30
  - name: process_adherence
    weight: 20
  - name: autonomy
    weight: 10
```

### 5. Realistic Initial State

Include only what's necessary:

✅ **Good** - Minimal but realistic:
```
initial-state/
├── package.json
├── .eslintrc.js
├── scripts/
│   ├── aem.js
│   └── scripts.js
└── styles/
    └── styles.css
```

❌ **Bad** - Too much unnecessary context:
```
initial-state/
├── package.json
├── blocks/
│   ├── header/
│   ├── footer/
│   ├── carousel/
│   └── [20 other blocks]
└── [entire repository structure]
```

## Common Pitfalls

### 1. Vague Tasks
**Problem**: Agent doesn't know what to build
**Solution**: Provide complete requirements

### 2. Over-constrained Canonical Checks
**Problem**: Penalizing valid alternative approaches
**Solution**: Only require what's truly essential

### 3. Under-specified Flexible Criteria
**Problem**: Evaluator doesn't know what to look for
**Solution**: List specific things to check

### 4. Wrong Test Type
**Problem**: Integration test in unit/ or vice versa
**Solution**:
- Unit = focused, single skill, quick
- Integration = complete workflow, multiple skills

### 5. Missing Context
**Problem**: Test assumes files/knowledge not in initial state
**Solution**: Include all necessary context in initial-state/

## Examples

See these tests for reference:

- `tests/unit/building-blocks/create-simple-block/` - Basic unit test
- `tests/integration/new-feature-workflow/` - Full workflow test (TODO)

## Checklist

Before considering a test complete:

- [ ] test.yaml has all required fields
- [ ] Task description is clear and complete
- [ ] Canonical checks are appropriate and not over-constrained
- [ ] Flexible criteria are specific with clear descriptions
- [ ] Weights sum to 100
- [ ] initial-state/ contains all necessary files
- [ ] initial-state/README.md documents what's included and why
- [ ] Test README.md explains purpose and expectations
- [ ] Runs validated: `./tools/validate-test path/to/test`

## Next Steps

After creating a test:

1. Validate it: `./tools/validate-test path/to/test`
2. Run it once manually to check it works
3. Establish baseline: `./tools/run-test path/to/test --save-baseline`
4. Add to test suite for regular execution
