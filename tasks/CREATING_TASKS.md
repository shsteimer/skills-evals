# Creating Tasks Guide

## Overview

This guide explains how to create new tasks for the Agent Skills Evaluation Framework.

## Task Types

### Unit Tasks
- **Location**: `tasks/unit/`
- **Purpose**: Evaluate individual skills or focused capabilities
- **Scope**: Single skill or small set of related skills
- **Duration**: Should complete in < 5 minutes
- **Example**: "Create a simple block", "Model content for a carousel"

### Integration Tasks
- **Location**: `tasks/integration/`
- **Purpose**: Evaluate complete workflows involving multiple skills
- **Scope**: Full development workflows (design → implement → test)
- **Duration**: May take 10-15 minutes
- **Example**: "Build new feature end-to-end", "Fix bug workflow"

## Recommended Workflow

**The best way to write tasks is empirically:**

1. Create initial state branch (if needed) and basic task.yaml with just the task
2. Run the test 5+ times, documenting what happens
3. Identify patterns: What fails? What varies? What's consistently good/bad?
4. Use those real observations to write your criteria

**Don't try to predict everything upfront** - let the agent show you what needs to be checked!

## Creating a New Task

### Step 1: Choose Task Location

```bash
# Unit task example
mkdir -p tasks/unit/{skill-name}/{task-name}

# Integration task example
mkdir -p tasks/integration/{workflow-name}
```

### Step 2: Create Minimal task.yaml

Start with just the essentials - you'll add criteria after running it.

**Initial task.yaml template:**
```yaml
name: "Your task name"
description: "Brief description"
type: unit  # or integration
skills:
  - skill-name
tags:  # Optional but recommended
  - relevant-tag-1
  - relevant-tag-2

task: |
  Your realistic task prompt here
```

That's it! No checks, no criteria yet. See `tasks/TASK_SCHEMA.md` for complete schema.

**About tags:**
Tags help organize and filter tasks. Common tags include:
- `blocks` - Block creation/modification tasks
- `basic` / `advanced` - Complexity level
- `workflow` - Full development workflow tasks
- `accessibility` - Accessibility-focused tasks
- `performance` - Performance-focused tasks
- `migration` - Migration-related tasks

Choose tags that make your task easy to find later!

### Step 3: Set Up Initial State Branch (Optional)

If starting from `main` isn't appropriate:

```bash
# Create a branch with minimal setup
git checkout -b task/my-task-setup main

# Add only what's needed
# Example: package.json, basic scripts, linting config

git add package.json .eslintrc.js scripts/ styles/
git commit -m "test: initial state for my-task"
git push -u origin task/my-task-setup
git checkout main
```

Reference in task.yaml:
```yaml
initial_state: task/my-task-setup
```

### Step 4: Run Task 5+ Times

**This is the key step!** Run your minimal task multiple times and observe:

```bash
# Run 1
./tools/run-tasks.js tasks/unit/my-skill/my-task > results/run-1.txt

# Run 2
./tools/run-tasks.js tasks/unit/my-skill/my-task > results/run-2.txt

# ... continue for runs 3, 4, 5+
```

**Document everything:**
- What files were created?
- Did linting pass?
- Were there errors?
- Did it follow the expected workflow?
- What varied across runs?
- What was consistently good/bad?

**Create a notes file:**
```markdown
# Task Run Observations

## Run 1
- Created blocks/quote/quote.js ✅
- Created blocks/quote/quote.css ✅
- Used `var` instead of `const` ❌
- Skipped linting step ❌
- Didn't announce skill usage ⚠️

## Run 2
- Created same files ✅
- Used `const` properly ✅
- Ran linting and passed ✅
- Announced skill usage ✅
- But created blocks/quote/quote.test.js (unnecessary) ⚠️

## Run 3
...

## Patterns Identified
### Hard failures (should be static evaluation criteria):
- Sometimes uses `var` instead of `const/let`
- Sometimes skips linting entirely

### Inconsistent but not critical (optional checks or dynamic evaluation):
- Sometimes creates test files (not needed)
- Skill announcement varies

### Quality issues (dynamic evaluation criteria):
- CSS scoping varies in quality
- Code structure varies
```

### Step 5: Write Criteria Based on Observations

Now use your real-world data to inform the test:

**Static evaluation criteria (required)** - Things that MUST be true:
```yaml
static_criteria:
  lint_passes: true  # Failed in run 3
  files_exist:
    - blocks/quote/quote.js  # Present in all runs
    - blocks/quote/quote.css  # Present in all runs
  forbidden_patterns:
    - pattern: "var "  # Saw this fail in run 1
      in_files: ["**/*.js"]
      message: "Should use const/let instead of var"
```

**Optional static evaluation criteria** - Nice to have, but seen valid exceptions:
```yaml
optional_static_criteria:
  files_not_exist:
    - blocks/quote/quote.test.js  # Sometimes created, not needed
```

**Dynamic evaluation criteria** - Quality that varies but should be evaluated:
```yaml
dynamic_criteria:
  - name: code_quality
    description: |
      - CSS selectors properly scoped (saw issues in run 4)
      - Clean code structure (varied across runs)
    priority: high

  - name: process_adherence
    description: |
      - Announces skill usage (inconsistent in early runs)
      - Follows content-driven development
    priority: high
```

### Step 6: Write Task README

Create `README.md` explaining the test:

```markdown
# [Task Name]

## Purpose
[What does this task evaluate?]

## What It Tests
### Skills Under Evaluation
- skill-name - [what aspect]

### Key Behaviors
1. [Behavior 1]
2. [Behavior 2]

## Expected Outcome
[What should happen when test passes?]

## Static Evaluation Pass Criteria
- ✅ [Required check 1]
- ✅ [Required check 2]

## Optional Checks
- ⚠️ [Nice-to-have 1]
- ⚠️ [Nice-to-have 2]

## Dynamic Evaluation Criteria
**High priority:**
- [High priority criterion]

**Medium priority:**
- [Medium priority criterion]

**Low priority:**
- [Low priority criterion]

## Common Failure Modes
[What typically goes wrong]
```

### Step 7: Validate Task Definition

```bash
./tools/validate-task tasks/unit/my-skill/my-task
```

Validates:
- All required fields present
- Skills exist in `.claude/skills/`
- Priorities are "high", "medium", or "low"
- If `initial_state` specified, branch exists

## Why This Workflow Works

### Benefits of Empirical Task Creation

1. **Avoid over-specifying** - Only check what actually matters
2. **Catch real issues** - Find problems you wouldn't predict
3. **Proper categorization** - Clear which things are hard failures vs. nice-to-haves
4. **Data-driven priorities** - Set priorities based on actual impact
5. **Realistic expectations** - Understand what the agent can/can't do consistently

### Example: Learning From Runs

**Before running (guessing):**
```yaml
static_criteria:
  files_exist:
    - blocks/quote/quote.js
    - blocks/quote/quote.css
    - blocks/quote/README.md  # Assumed this was needed
  required_workflow_steps:
    - content-modeling
    - implementation
    - testing  # Assumed testing was required
```

**After 5 runs (reality):**
```yaml
static_criteria:
  files_exist:
    - blocks/quote/quote.js
    - blocks/quote/quote.css
    # Removed README - not critical
  required_workflow_steps:
    - content-modeling
    - implementation
    # Removed testing - not always applicable for simple blocks

optional_static_criteria:
  files_exist:
    - blocks/quote/README.md  # Nice to have, moved here
```

## Task Design Best Practices

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

**Static evaluation (required)** - Must pass or task fails:
```yaml
static_criteria:
  lint_passes: true
  files_exist:
    - blocks/hero/hero.js
    - blocks/hero/hero.css
```

**Optional static evaluation** - Checked automatically, reported as warnings:
```yaml
optional_static_criteria:
  files_exist:
    - blocks/hero/README.md
  required_patterns:
    - pattern: "aria-"
      in_files: ["blocks/hero/hero.js"]
      message: "Consider ARIA attributes for accessibility"
```

**Flexible** - LLM evaluates with priorities:
```yaml
dynamic_criteria:
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
dynamic_criteria:
  - name: quality
    description: Code is good quality
    priority: high
```

✅ **Good:**
```yaml
dynamic_criteria:
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
dynamic_criteria:
  - name: process_adherence
    priority: high  # Most important for this test
  - name: code_quality
    priority: high
  - name: completeness
    priority: medium
  - name: autonomy
    priority: low

# For a test focused on code quality:
dynamic_criteria:
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
**Problem**: Integration task in unit/ or vice versa
**Solution**:
- Unit = focused, single skill, quick
- Integration = complete workflow, multiple skills

### 5. Heavy Initial State
**Problem**: Too much context makes test slow and brittle
**Solution**: Minimal setup - only what's necessary

## Examples

See these tasks for reference:

- `tasks/unit/building-blocks/create-simple-block/` - Basic unit task

## Checklist

Before considering a task complete:

- [ ] Created minimal task.yaml (name, description, type, skills, task)
- [ ] Created initial state branch if needed (minimal setup only)
- [ ] **Ran task at least 5 times**
- [ ] **Documented observations from all runs**
- [ ] **Identified patterns in failures/successes**
- [ ] Added static_criteria based on hard failures
- [ ] Added optional_static_criteria for nice-to-haves
- [ ] Added dynamic_criteria for quality variations
- [ ] Set priorities based on impact observed in runs
- [ ] Task README.md explains purpose and expectations
- [ ] Task validated: `./tools/validate-task path/to/task`

## Quick Start Example

```bash
# 1. Create task directory
mkdir -p tasks/unit/building-blocks/simple-task

# 2. Create minimal task.yaml
cat > tests/unit/building-blocks/simple-test/task.yaml <<EOF
name: "Create quote block"
description: "Evaluate basic block creation"
type: unit
skills:
  - building-blocks
tags:
  - blocks
  - basic

task: |
  Create a quote block with optional attribution.
EOF

# 3. Run it 5+ times, document everything
for i in {1..5}; do
  ./tools/run-tasks.js tasks/unit/building-blocks/simple-task > results/run-$i.txt
done

# 4. Review results, identify patterns
# 5. Add criteria based on what you observed
# 6. Document in README.md
# 7. Validate
./tools/validate-task tasks/unit/building-blocks/simple-task
```

## Next Steps

After creating a task:

1. Commit the task (even if criteria aren't perfect yet)
2. Run tasks periodically as skills evolve
3. Refine criteria based on ongoing observations
4. Share patterns with other task creators
