# Creating Tasks - Best Practices Guide

This guide explains how to create effective evaluation tasks for the Agent Skills Evaluation Framework.

## Task Organization

### Unit Tasks
- **Location**: `tasks/unit/{skill-name}/{task-name}/`
- **Purpose**: Evaluate individual skills or focused capabilities
- **Scope**: Single skill or small set of related skills
- **Duration**: Should complete in < 5 minutes
- **Example**: "Find security documentation", "Create a simple block"

### Integration Tasks
- **Location**: `tasks/integration/{workflow-name}/`
- **Purpose**: Evaluate complete workflows involving multiple skills
- **Scope**: Full development workflows (design → implement → test)
- **Duration**: May take 10-15 minutes
- **Example**: "Build new feature end-to-end", "Fix bug workflow"

## Recommended Workflow: Build Tasks Empirically

**The best way to write tasks is empirically** - create a minimal task, run it multiple times, observe what happens, then write criteria based on real behavior.

### Why This Approach Works

1. **Avoid over-specifying** - Only check what actually matters
2. **Catch real issues** - Find problems you wouldn't predict
3. **Proper categorization** - Clear which things are hard failures vs. nice-to-haves
4. **Data-driven priorities** - Set priorities based on actual impact
5. **Realistic expectations** - Understand what agents can/can't do consistently

## Step-by-Step Task Creation

### Step 1: Choose Task Location

```bash
# Unit task
mkdir -p tasks/unit/{skill-name}/{task-name}

# Integration task
mkdir -p tasks/integration/{workflow-name}
```

### Step 2: Create Minimal task.yaml

Start with just the essentials - you'll add criteria after running it.

```yaml
name: "Your task name"
description: "Brief description of what this evaluates"
skills:
  - skill-name
tags:
  - relevant-tag

task: |
  Your realistic task prompt here
```

See `tasks/TASK_SCHEMA.md` for complete schema reference.

### Step 3: Set Up Initial State (Optional)

If starting from `main` isn't appropriate, create a branch with minimal setup:

```bash
git checkout -b task/my-task-setup main

# Add only what's needed (e.g., package.json, basic config)
git add package.json scripts/ styles/
git commit -m "test: initial state for my-task"
git push -u origin task/my-task-setup
git checkout main
```

Reference in task.yaml:

```yaml
initial_state: task/my-task-setup
```

### Step 4: Run Task Multiple Times (5+)

**This is the key step!** Run your minimal task multiple times and observe what happens.

```bash
# Run with specific task
./tools/run-tasks.js --task tasks/unit/my-skill/my-task --agents claude-code

# Results saved to evaluations/{timestamp}/
```

**Document everything:**
- What files were created?
- Did linting pass?
- Were there errors?
- Did it follow the expected workflow?
- What varied across runs?
- What was consistently good/bad?

**Create observation notes:**

```markdown
# Task Run Observations

## Run 1
- Created blocks/quote/quote.js ✅
- Used `var` instead of `const` ❌
- Skipped linting ❌

## Run 2
- Created same files ✅
- Used `const` properly ✅
- Ran linting ✅
- Created unnecessary test file ⚠️

## Patterns Identified
### Hard failures (static criteria):
- Sometimes uses `var` instead of `const/let`
- Sometimes skips linting

### Quality issues (dynamic criteria):
- CSS scoping varies
- Code structure varies
```

### Step 5: Write Criteria Based on Observations

Use your real-world data to inform the criteria:

**Static criteria** - Must pass or task fails:

```yaml
static_criteria:
  lint_passes: true  # Failed in run 3
  files_exist:
    - blocks/quote/quote.js
    - blocks/quote/quote.css
  forbidden_patterns:
    - pattern: "var "
      in_files: ["**/*.js"]
      message: "Should use const/let instead of var"
```

**Optional static criteria** - Nice to have, warnings only:

```yaml
optional_static_criteria:
  files_not_exist:
    - blocks/quote/quote.test.js  # Sometimes created, not needed
```

**Dynamic criteria** - Quality that varies:

```yaml
dynamic_criteria:
  - description: Evaluate code quality - proper patterns and maintainability
    details:
      - CSS selectors properly scoped (saw issues in run 4)
      - Clean code structure (varied across runs)
    priority: high

  - description: Assess process adherence - followed workflows correctly
    details:
      - Announced skill usage (inconsistent in early runs)
      - Followed content-driven development
    priority: high
```

### Step 6: Evaluate Results

Run evaluation on your test results:

```bash
# Evaluate specific agent's results
./tools/evaluate.js evaluations/{timestamp}/{task-name}/{agent}

# Evaluate entire task (all agents)
./tools/evaluate.js evaluations/{timestamp}/{task-name}

# Evaluate entire run (all tasks and agents)
./tools/evaluate.js evaluations/{timestamp}

# Options:
#   --eval-agent claude-code    (default)
#   --skip-dynamic              (skip LLM evaluation, generate prompt only)
#   --clean                     (cleanup artifacts only)
```

This runs:
1. Static checks (deterministic, must pass)
2. Optional checks (deterministic, warnings only)
3. PR quality checks (if PR was opened)
4. Dynamic evaluation (LLM-based quality assessment)

### Step 7: Iterate

Based on evaluation results:
1. Refine criteria
2. Add missing checks
3. Remove overly strict requirements
4. Adjust priorities

Run the task again and re-evaluate until criteria accurately capture quality.

## Task Design Best Practices

### 1. Realistic Task Prompts

❌ **Bad - Too detailed:**

```yaml
task: |
  Create a hero block that displays a large image, headline, and CTA button.
  The block should support:
  - Hero image (required) - should be first child
  - Headline text (required) - use h1 tag
  - Subheading text (optional) - use p tag
  [10 more paragraphs of requirements...]
```

✅ **Good - Realistic:**

```yaml
task: |
  Create a hero block with image, headline, and CTA button.
```

The agent should figure out details using skills - that's what we're testing!

### 2. Three-Tier Checks

**Static** (required) - Must pass or task fails:

```yaml
static_criteria:
  lint_passes: true
  files_exist:
    - blocks/hero/hero.js
    - blocks/hero/hero.css
```

**Optional static** (checked, warnings only):

```yaml
optional_static_criteria:
  files_exist:
    - blocks/hero/README.md
```

**Dynamic** (LLM evaluates with priorities):

```yaml
dynamic_criteria:
  - description: Evaluate code quality
    priority: high
  - description: Check documentation clarity
    priority: low
```

### 3. Specific Dynamic Criteria

❌ **Bad:**

```yaml
dynamic_criteria:
  - description: Code is good quality
    priority: high
```

✅ **Good:**

```yaml
dynamic_criteria:
  - description: Evaluate code quality - proper patterns and maintainability
    details:
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with breakpoints (600px, 900px)
      - Selectors properly scoped
      - Semantic HTML elements used
    priority: high
```

### 4. Expected Outcomes

For research/documentation tasks, provide an expected outcome:

```yaml
expected_outcome: |
  Agent invokes the docs-search skill, finds relevant documentation pages,
  fetches full content, and synthesizes information from multiple sources
  with specific, actionable recommendations.
```

This helps the evaluator assess quality against a reference standard.

### 5. Agent-Agnostic Language

Avoid tool-specific names since different agents may use different tools:

❌ **Bad:**
- "Agent used WebFetch to read docs"
- "Agent invoked WebSearch instead of docs-search"

✅ **Good:**
- "Agent fetched and read full documentation pages"
- "Agent used docs-search skill (not general web search)"

### 6. Minimal Initial State

❌ **Bad** - Too much context:
```bash
# Branch has entire repo with 20+ existing blocks
```

✅ **Good** - Just what's needed:
```bash
# Branch has: package.json, basic scripts/, styles/, linting config
# No existing blocks (test is about creating one)
```

## Common Pitfalls

### 1. Over-specifying Tasks
**Problem**: Agent doesn't need to think, just follows instructions
**Solution**: Write realistic prompts - clear goal, let agent figure out how

### 2. Over-constrained Static Checks
**Problem**: Penalizing valid alternative approaches
**Solution**: Only require what's essential; use optional checks for nice-to-haves

### 3. Vague Dynamic Criteria
**Problem**: Evaluator doesn't know what to look for
**Solution**: List specific things to check using `details` array

### 4. Wrong Task Location
**Problem**: Task in wrong directory structure
**Solution**:
- Unit tasks → `tasks/unit/{skill-name}/` - focused, single skill, quick
- Integration tasks → `tasks/integration/{workflow-name}/` - complete workflow, multiple skills

### 5. Testing Non-Existent Features
**Problem**: Criteria reference scripts or checks that don't exist
**Solution**: Verify commands work before adding to criteria

## Available Tools

### Running Tasks

```bash
# Run by task name
./tools/run-tasks.js --task tasks/unit/docs-search/best-practices

# Run by tags
./tools/run-tasks.js --tags documentation,research

# Run by skills
./tools/run-tasks.js --skills docs-search

# Specify agents
./tools/run-tasks.js --task my-task --agents claude-code,cursor-cli

# Setup only (don't run, just prepare environment)
./tools/run-tasks.js --task my-task --setup-only
```

### Evaluating Results

```bash
# Evaluate specific agent
./tools/evaluate.js evaluations/{timestamp}/{task}/{agent}

# Evaluate all agents for a task
./tools/evaluate.js evaluations/{timestamp}/{task}

# Evaluate entire test run
./tools/evaluate.js evaluations/{timestamp}

# Options
./tools/evaluate.js <path> --eval-agent claude-code
./tools/evaluate.js <path> --skip-dynamic  # Generate prompt only
./tools/evaluate.js <path> --clean         # Cleanup artifacts only
```

## Quick Start Example

```bash
# 1. Create task directory
mkdir -p tasks/unit/building-blocks/quote-block

# 2. Create minimal task.yaml
cat > tasks/unit/building-blocks/quote-block/task.yaml <<EOF
name: "Create quote block"
description: "Evaluate basic block creation"
skills:
  - building-blocks
tags:
  - blocks
  - basic

task: |
  Create a quote block with optional attribution.
EOF

# 3. Run it multiple times
./tools/run-tasks.js --task tasks/unit/building-blocks/quote-block --agents claude-code

# 4. Evaluate results
./tools/evaluate.js evaluations/{timestamp}/quote-block/claude-code

# 5. Review output, add criteria based on observations
# 6. Run again and iterate
```

## Next Steps

After creating a task:

1. Run it 5+ times with different agents
2. Document patterns and failure modes
3. Add criteria that catch real issues
4. Avoid over-specifying based on assumptions
5. Iterate based on evaluation feedback
6. Share learnings with other task creators
