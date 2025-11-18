# Task Definition Schema

## Overview

Each task is defined by a `task.yaml` file that specifies the task, evaluation criteria, and expected outcomes.

## Schema Definition

### Required Fields

#### `name` (string)
Short, descriptive name for the task.

**Example:**
```yaml
name: "Create hero block from scratch"
```

#### `description` (string)
Detailed description of what this task evaluates.

**Example:**
```yaml
description: "Evaluates if agent can create a new block following all AEM guidelines content-driven development, proper file structure, and code quality standards."
```

#### `type` (enum: "unit" | "integration")
- `unit`: Evaluates a single skill or focused capability
- `integration`: Evaluates a complete workflow involving multiple skills

**Example:**
```yaml
type: unit
```

#### `skills` (array of strings)
List of skills being evaluated. Should match directory names in `.claude/skills/`.

**Example:**
```yaml
skills:
  - content-driven-development
  - building-blocks
```

#### `tags` (array of strings)
Optional tags for categorizing and filtering tasks. Use tags to group tasks by functionality, complexity, or other characteristics.

**Example:**
```yaml
tags:
  - blocks
  - basic
  - css
  - accessibility
```

**Common tags:**
- `blocks` - Tasks related to block creation/modification
- `content-modeling` - Tasks focused on content structure
- `basic` - Simple, foundational tasks
- `advanced` - Complex or edge case tasks
- `workflow` - Tasks full development workflows
- `migration` - Tasks migration-related functionality
- `accessibility` - Tasks with accessibility focus
- `performance` - Tasks with performance considerations

#### `task` (string)
The prompt/task given to the agent. Should be clear and complete, but represent a realistic prompt a lazy human would write.

**Example:**
```yaml
task: |
  Create a simple text block called 'quote' that displays a blockquote with optional attribution.
```

#### `static_criteria` (object)
Static evaluation criteria that must pass every time. Failure = task fails.

**Example:**
```yaml
static_criteria:
  lint_passes: true
  files_exist:
    - blocks/quote/quote.js
    - blocks/quote/quote.css
  files_not_exist:
    - blocks/quote/quote.test.js
  required_workflow_steps:
    - content-modeling
    - implementation
    - linting
  forbidden_patterns:
    - pattern: "var "
      in_files: ["**/*.js"]
      message: "Should use const/let instead of var"
  custom_scripts:
    - path: "./tests/scripts/check-accessibility.sh"
      description: "Verify basic accessibility requirements"
```

#### `optional_static_criteria` (object)
Optional static evaluation criteria that are good to follow but don't cause task failure.
These are automatically verified and reported, but failures are informational only.

**Example:**
```yaml
optional_static_criteria:
  files_exist:
    - blocks/quote/README.md  # Nice to have, not required
  required_patterns:
    - pattern: "aria-"
      in_files: ["blocks/**/*.js"]
      message: "Consider adding ARIA attributes for accessibility"
  custom_scripts:
    - path: "./tests/scripts/check-performance.sh"
      description: "Check for potential performance issues"
```

##### Static Evaluation Criteria Types

**`lint_passes`** (boolean)
- If `true`, requires `npm run lint` to pass
- If `false`, linting is not checked

**`files_exist`** (array of strings)
- List of file paths that must exist after test completion
- Supports glob patterns: `blocks/**/*.js`

**`files_not_exist`** (array of strings)
- List of file paths that should NOT exist
- Use to ensure agent doesn't create unnecessary files

**`required_workflow_steps`** (array of strings)
- Workflow steps that must be completed
- Common steps:
  - `content-modeling` - Designed content structure
  - `implementation` - Wrote the code
  - `linting` - Ran linter
  - `testing` - Created/ran tests
  - `local-preview` - Tested in browser

**`forbidden_patterns`** (array of objects)
- Code patterns that should not appear
- Each object has:
  - `pattern` (string): Regex pattern to search for
  - `in_files` (array of strings): File globs to check
  - `message` (string): Explanation of why it's forbidden

**`required_patterns`** (array of objects)
- Code patterns that must appear
- Same structure as `forbidden_patterns`

**`custom_scripts`** (array of objects)
- Custom bash or node scripts for specialized checks
- Each object has:
  - `path` (string): Path to script (relative to repo root)
  - `description` (string): What the script checks
- Script should exit 0 for pass, non-zero for fail
- Script receives test directory as first argument


##### Optional Static Evaluation Criteria Types

Same types as static evaluation criteria (lint_passes, files_exist, files_not_exist, required_workflow_steps, forbidden_patterns, required_patterns, custom_scripts), but failures are reported without failing the task.

**Pull Request Checks** (special handling):

PR-related checks are always optional (nice to have), but if a PR is opened, all PR checks must pass or it counts as a failure.

**`pr_quality`** (object)
- Evaluates PR quality if agent opened one
- If no PR opened: optional criteria is skipped (no penalty)
- If PR opened: all sub-checks must pass or test fails
- Properties:
  - `checks_pass` (boolean): Requires all PR checks (CI/CD) to pass
  - `has_preview_link` (boolean): Requires preview link in PR description
  - `preview_no_404` (boolean): Preview link must not return 404
  - `preview_correct_branch` (boolean): Preview link must be for the working branch

**Example:**
```yaml
optional_static_criteria:
  pr_quality:
    checks_pass: true
    has_preview_link: true
    preview_no_404: true
    preview_correct_branch: true
```

**Logic:**
- No PR opened → no penalty, just informational
- PR opened → all enabled checks must pass or task fails
- This ensures: opening a broken PR is worse than not opening one at all

#### `dynamic_criteria` (array of objects)
Quality criteria evaluated by LLM using dynamic evaluation, can vary across runs.

**Example:**
```yaml
dynamic_criteria:
  - description: Evaluate code quality - follows style guidelines, is maintainable and well-structured
    details:
      - JavaScript uses proper patterns and modern syntax
      - CSS is well-organized with appropriate selectors
      - Code is readable and maintainable
    priority: high

  - description: Assess process adherence - agent followed skill workflows correctly
    details:
      - Used content-driven development approach
      - Followed building-blocks skill guidelines
      - Completed workflow in logical order
    priority: high

  - description: Check completeness - implementation handles requirements and edge cases
    priority: medium

  - description: Evaluate autonomy - minimal human intervention needed
    priority: low
```

##### Dynamic Evaluation Criterion Properties

**`description`** (string, required)
- Main criterion description - what aspect of the task to evaluate
- Should be clear and focused on a specific quality or aspect
- This becomes the header in the evaluation prompt

**`details`** (array of strings, optional)
- Specific points to consider when evaluating this criterion
- Provides concrete guidance to the evaluation agent
- Use when the criterion benefits from explicit sub-points
- Can be omitted for simpler criteria

**`priority`** (enum: "high" | "medium" | "low", required)
- Relative importance for evaluation
- High priority issues have more impact on overall assessment

### Optional Fields

#### `tags` (array of strings)
Tags for categorizing and filtering tasks. See the `tags` field in Required Fields section for details.

#### `initial_state` (string)
Git branch name to use as starting point for the task.

**Example:**
```yaml
initial_state: task/hero-block-base
```

If not specified, uses `main` branch as starting point.

## Complete Examples

### Example 1: Simple Block Creation Task (No PR Required)

```yaml
name: "Create simple quote block"
description: "Evaluates basic block creation following content-driven development and building-blocks skills. Should create proper file structure, mobile-first CSS, and semantic HTML decoration."
type: unit
skills:
  - content-driven-development
  - building-blocks
tags:
  - blocks
  - basic
  - css

task: |
  Create a 'quote' block that displays a blockquote with optional attribution.

initial_state: task/basic-setup

static_criteria:
  lint_passes: true
  files_exist:
    - blocks/quote/quote.js
    - blocks/quote/quote.css
  required_workflow_steps:
    - content-modeling
    - implementation
    - linting
  forbidden_patterns:
    - pattern: "var "
      in_files: ["blocks/**/*.js"]
      message: "Should use const/let instead of var"
    - pattern: "\\{blockName\\}"
      in_files: ["blocks/**/*.css"]
      message: "CSS selectors should use actual block name, not template placeholder"

optional_static_criteria:
  files_exist:
    - blocks/quote/README.md
  required_patterns:
    - pattern: "aria-"
      in_files: ["blocks/quote/quote.js"]
      message: "Consider adding ARIA attributes for better accessibility"

dynamic_criteria:
  - description: Evaluate code quality - proper patterns, maintainability, and structure
    details:
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with proper breakpoints (600px, 900px)
      - All selectors scoped to .quote
      - Semantic HTML elements used
      - Code is clean and maintainable
    priority: high

  - description: Assess process adherence - followed skill workflows correctly
    details:
      - Followed content-driven development (content model first)
      - Used building-blocks skill guidelines
      - Created test content before implementation
      - Announced skill usage
    priority: high

  - description: Check completeness - handles all requirements and edge cases
    details:
      - Handles all required content fields
      - Handles optional fields gracefully
      - Responsive across all breakpoints
      - Accessible (proper semantic HTML, ARIA if needed)
    priority: medium

  - description: Evaluate autonomy - minimal human intervention needed
    details:
      - Completed without asking unnecessary questions
      - Made reasonable decisions independently
      - Only asked for clarification on truly ambiguous points
    priority: low
```

## Validation Rules

A valid task.yaml must:
1. Include all required fields (name, description, type, skills, task, deterministic_checks, non_deterministic_criteria)
2. Have `type` be either "unit" or "integration"
3. Reference skills that exist in `.claude/skills/`
4. Have flexible criteria priorities be "high", "medium", or "low"
5. If `initial_state` is specified, the branch must exist
6. If `tags` is specified, it must be an array of strings

## Best Practices

1. **Task clarity**: Write tasks like a realistic human would - clear but not overly detailed.

2. **Deterministic checks**: Focus on objective, measurable criteria that catch real problems.

3. **Non-deterministic criteria**: Keep descriptions specific so evaluation agent knows what to look for.

4. **Priorities**: Use "high" for must-haves, "medium" for important, "low" for nice-to-haves.

5. **Initial state**: Create branches with minimal setup needed for the test scenario.

6. **Custom scripts**: Use for specialized checks that can't be expressed with built-in check types.
