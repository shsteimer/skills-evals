# Test Definition Schema

## Overview

Each test is defined by a `test.yaml` file that specifies the task, evaluation criteria, and expected outcomes.

## Schema Definition

### Required Fields

#### `name` (string)
Short, descriptive name for the test.

**Example:**
```yaml
name: "Create hero block from scratch"
```

#### `description` (string)
Detailed description of what this test evaluates.

**Example:**
```yaml
description: "Tests if agent can create a new block following all AEM guidelines including content-driven development, proper file structure, and code quality standards."
```

#### `type` (enum: "unit" | "integration")
- `unit`: Tests a single skill or focused capability
- `integration`: Tests a complete workflow involving multiple skills

**Example:**
```yaml
type: unit
```

#### `skills` (array of strings)
List of skills being tested. Should match directory names in `.claude/skills/`.

**Example:**
```yaml
skills:
  - content-driven-development
  - building-blocks
```

#### `task` (string)
The prompt/task given to the agent. Should be clear and complete, but represent a realistic prompt a lazy human would write.

**Example:**
```yaml
task: |
  Create a simple text block called 'quote' that displays a blockquote with optional attribution.
```

#### `deterministic_checks` (object)
Deterministic checks that must pass every time. Failure = test fails.

**Example:**
```yaml
deterministic_checks:
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

#### `optional_deterministic_checks` (object)
Optional deterministic checks that are good to follow but don't cause test failure.
These are automatically verified and reported, but failures are informational only.

**Example:**
```yaml
optional_deterministic_checks:
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

##### Deterministic Check Types

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

##### Optional Deterministic Check Types

Same types as deterministic checks (lint_passes, files_exist, files_not_exist, required_workflow_steps, forbidden_patterns, required_patterns, custom_scripts), but failures are reported without failing the test.

#### `flexible_criteria` (array of objects)
Quality criteria evaluated by LLM, can vary across runs.

**Example:**
```yaml
flexible_criteria:
  - name: code_quality
    description: Code follows style guidelines, is maintainable and well-structured
    priority: high
  - name: process_adherence
    description: Followed skill workflow correctly and completely
    priority: high
  - name: completeness
    description: Implementation is complete and handles edge cases appropriately
    priority: medium
  - name: autonomy
    description: Minimal human intervention needed to complete task
    priority: low
```

##### Flexible Criterion Properties

**`name`** (string)
- Unique identifier for this criterion
- Used in evaluation results

**`description`** (string)
- What this criterion evaluates
- Provides context to evaluation agent

**`priority`** (enum: "high" | "medium" | "low")
- Relative importance for evaluation
- High priority issues have more impact on overall assessment

### Optional Fields

#### `initial_state` (string)
Git branch name to use as starting point for the test.

**Example:**
```yaml
initial_state: test/hero-block-base
```

If not specified, uses `main` branch as starting point.

## Complete Example

```yaml
name: "Create simple quote block"
description: "Tests basic block creation following content-driven development and building-blocks skills. Should create proper file structure, mobile-first CSS, and semantic HTML decoration."
type: unit
skills:
  - content-driven-development
  - building-blocks

task: |
  Create a 'quote' block that displays a blockquote with optional attribution.

initial_state: test/basic-setup

deterministic_checks:
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

optional_deterministic_checks:
  files_exist:
    - blocks/quote/README.md
  required_patterns:
    - pattern: "aria-"
      in_files: ["blocks/quote/quote.js"]
      message: "Consider adding ARIA attributes for better accessibility"

flexible_criteria:
  - name: code_quality
    description: |
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with proper breakpoints (600px, 900px)
      - All selectors scoped to .quote
      - Semantic HTML elements used
      - Code is clean and maintainable
    priority: high

  - name: process_adherence
    description: |
      - Followed content-driven development (content model first)
      - Used building-blocks skill guidelines
      - Created test content before implementation
      - Announced skill usage
    priority: high

  - name: completeness
    description: |
      - Handles all required content fields
      - Handles optional fields gracefully
      - Responsive across all breakpoints
      - Accessible (proper semantic HTML, ARIA if needed)
    priority: medium

  - name: autonomy
    description: |
      - Completed without asking unnecessary questions
      - Made reasonable decisions independently
      - Only asked for clarification on truly ambiguous points
    priority: low
```

## Validation Rules

A valid test.yaml must:
1. Include all required fields
2. Have `type` be either "unit" or "integration"
3. Reference skills that exist in `.claude/skills/`
4. Have flexible criteria priorities be "high", "medium", or "low"
5. If `initial_state` is specified, the branch must exist

## Best Practices

1. **Task clarity**: Write tasks like a realistic human would - clear but not overly detailed.

2. **Deterministic checks**: Focus on objective, measurable criteria that catch real problems.

3. **Flexible criteria**: Keep descriptions specific so evaluation agent knows what to look for.

4. **Priorities**: Use "high" for must-haves, "medium" for important, "low" for nice-to-haves.

5. **Initial state**: Create branches with minimal setup needed for the test scenario.

6. **Custom scripts**: Use for specialized checks that can't be expressed with built-in check types.
