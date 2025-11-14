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
mkdir -p tests/unit/{skill-name}/{test-name}

# Integration test example
mkdir -p tests/integration/{workflow-name}
```

Note: No need for `initial-state/` or `baseline/` directories - we use git branches instead.

### Step 2: Create test.yaml

See `tests/TEST_SCHEMA.md` for the complete schema reference.

#### Required Decisions

1. **What skills are you testing?**
   - List them in `skills: []`
   - Should exist in `.claude/skills/`

2. **What's the task?**
   - Write like a realistic human would - clear but not overly detailed
   - "Create a quote block with optional attribution"
   - NOT: "Create a quote block that displays a blockquote with optional attribution, using the following exact content model structure with these specific fields..."

3. **What branch should it start from?**
   - Specify in `initial_state: branch-name`
   - Omit to use `main` branch
   - Create test branches with minimal setup needed

4. **What MUST pass?** (Deterministic checks - required)
   - Which files must exist?
   - Should linting pass?
   - What patterns are forbidden?
   - Which workflow steps are required?
   - Any custom scripts to run?

5. **What's nice to have?** (Optional deterministic checks)
   - README files?
   - Accessibility patterns?
   - Performance checks?
   - Best practices that aren't hard requirements?

6. **What should be evaluated for quality?** (Flexible criteria)
   - Code quality?
   - Process adherence?
   - Completeness?
   - Autonomy?
   - Set priority for each: high, medium, or low

### Step 3: Set Up Initial State Branch (Optional)

If your test needs a specific starting point:

```bash
# Create a branch with the initial state
git checkout -b test/my-test-setup main

# Add only what's needed for the test
# Example: package.json, basic scripts, etc.

git add -A
git commit -m "test: initial state for my-test"
git push -u origin test/my-test-setup

# Return to main
git checkout main
```

Then reference it in test.yaml:
```yaml
initial_state: test/my-test-setup
```

If omitted, test starts from `main` branch.

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

## Deterministic Pass Criteria
- ✅ [Required check 1]
- ✅ [Required check 2]

## Optional Checks
- ⚠️ [Nice-to-have 1]
- ⚠️ [Nice-to-have 2]

## Flexible Quality Criteria
**High priority:**
- [High priority criterion]

**Medium priority:**
- [Medium priority criterion]

**Low priority:**
- [Low priority criterion]

## Common Failure Modes
[What typically goes wrong]
```

### Step 5: Validate Test Definition

```bash
./tools/validate-test tests/unit/my-skill/my-test
```

Validates:
- All required fields present
- Skills exist in `.claude/skills/`
- Priorities are "high", "medium", or "low"
- If `initial_state` specified, branch exists

## Test Design Best Practices

### 1. Realistic Task Descriptions

❌ **Bad - Too detailed:**
```yaml
task: |
  Create a hero block that displays a large image, headline, and CTA button.
  The block should support:
  - Hero image (required) - should be first child
  - Headline text (required) - use h1 tag
  - Subheading text (optional) - use p tag with class subheading
  - CTA button with link (required) - use proper button element

  Create the following content model:
  | Image | Heading | Subheading | Button Text | Button Link |

  Follow all AEM best practices for block development including...
  [10 more paragraphs of requirements]
```

✅ **Good - Realistic:**
```yaml
task: |
  Create a hero block with image, headline, and CTA button.
```

The agent should figure out the details using the skills - that's what we're testing!

### 2. Three-Tier Checks

**Deterministic (required)** - Must pass or test fails:
```yaml
deterministic_checks:
  lint_passes: true
  files_exist:
    - blocks/hero/hero.js
    - blocks/hero/hero.css
```

**Optional deterministic** - Checked automatically, reported as warnings:
```yaml
optional_deterministic_checks:
  files_exist:
    - blocks/hero/README.md
  required_patterns:
    - pattern: "aria-"
      in_files: ["blocks/hero/hero.js"]
      message: "Consider ARIA attributes for accessibility"
```

**Flexible** - LLM evaluates with priorities:
```yaml
flexible_criteria:
  - name: code_quality
    description: Clean, maintainable code following guidelines
    priority: high
  - name: has_comments
    description: Code includes helpful comments
    priority: low
```

### 3. Specific Flexible Criteria

❌ **Bad:**
```yaml
flexible_criteria:
  - name: quality
    description: Code is good quality
    priority: high
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
    priority: high
```

### 4. Appropriate Priorities

```yaml
# For a test focused on following process:
flexible_criteria:
  - name: process_adherence
    priority: high  # Most important for this test
  - name: code_quality
    priority: high
  - name: completeness
    priority: medium
  - name: autonomy
    priority: low

# For a test focused on code quality:
flexible_criteria:
  - name: code_quality
    priority: high  # Most important for this test
  - name: completeness
    priority: high
  - name: process_adherence
    priority: medium
  - name: autonomy
    priority: low
```

### 5. Minimal Initial State

❌ **Bad** - Too much unnecessary context:
```bash
# Branch has entire repo with 20+ existing blocks
```

✅ **Good** - Just what's needed:
```bash
# Branch has: package.json, basic scripts/, styles/, and linting config
# No existing blocks (test is about creating one)
```

## Common Pitfalls

### 1. Over-specifying Tasks
**Problem**: Agent doesn't need to think, just follow instructions
**Solution**: Write realistic prompts - clear goal, let agent figure out how

### 2. Over-constrained Deterministic Checks
**Problem**: Penalizing valid alternative approaches
**Solution**: Only require what's truly essential; use optional checks for nice-to-haves

### 3. Vague Flexible Criteria
**Problem**: Evaluator doesn't know what to look for
**Solution**: List specific things to check

### 4. Wrong Test Type
**Problem**: Integration test in unit/ or vice versa
**Solution**:
- Unit = focused, single skill, quick
- Integration = complete workflow, multiple skills

### 5. Heavy Initial State
**Problem**: Too much context makes test slow and brittle
**Solution**: Minimal setup - only what's necessary

## Examples

See these tests for reference:

- `tests/unit/building-blocks/create-simple-block/` - Basic unit test

## Checklist

Before considering a test complete:

- [ ] test.yaml has all required fields
- [ ] Task description is clear but realistic (like a lazy human would write)
- [ ] Deterministic checks are appropriate (hard requirements only)
- [ ] Optional checks for nice-to-haves (don't cause failure)
- [ ] Flexible criteria are specific with clear descriptions
- [ ] Priorities assigned (high/medium/low)
- [ ] Initial state branch created (if needed) with minimal setup
- [ ] Test README.md explains purpose and expectations
- [ ] Test validated: `./tools/validate-test path/to/test`

## Next Steps

After creating a test:

1. Validate it: `./tools/validate-test path/to/test`
2. Run it once manually to verify it works
3. Save results as reference for future comparisons
4. Add to test suite for regular execution
