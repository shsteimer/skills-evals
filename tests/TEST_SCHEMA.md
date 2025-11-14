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
The prompt/task given to the agent. Should be clear and complete.

**Example:**
```yaml
task: |
  Create a simple text block called 'quote' that displays a blockquote with
  optional attribution. Follow all AEM best practices.
```

#### `canonical_checks` (object)
Deterministic checks that must pass every time.

**Example:**
```yaml
canonical_checks:
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
```

##### Canonical Check Types

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

#### `flexible_criteria` (array of objects)
Quality criteria that can vary across runs.

**Example:**
```yaml
flexible_criteria:
  - name: code_quality
    description: Code follows style guidelines, is maintainable and well-structured
    weight: 30
  - name: process_adherence
    description: Followed skill workflow correctly and completely
    weight: 25
  - name: completeness
    description: Implementation is complete and handles edge cases appropriately
    weight: 25
  - name: autonomy
    description: Minimal human intervention needed to complete task
    weight: 20
```

##### Flexible Criterion Properties

**`name`** (string)
- Unique identifier for this criterion
- Used in evaluation results

**`description`** (string)
- What this criterion evaluates
- Provides context to evaluation agent

**`weight`** (number)
- Relative importance (should sum to 100 across all criteria)
- Used to calculate overall score

### Optional Fields

#### `initial_state` (string)
Path to directory containing starting files for the test.

**Example:**
```yaml
initial_state: ./initial-state/
```

If not specified, test starts with empty directory (except for boilerplate files).

#### `runs` (number)
Number of times to run this test. Default: `3`

**Example:**
```yaml
runs: 5
```

#### `regression_threshold` (number)
Alert if mean score drops more than this many points from baseline. Default: `10`

**Example:**
```yaml
regression_threshold: 15
```

#### `timeout` (number)
Maximum time (in seconds) for test execution. Default: `600` (10 minutes)

**Example:**
```yaml
timeout: 1200
```

#### `expected_human_interventions` (number)
Number of times we expect the agent to ask for human input. Default: `0`

**Example:**
```yaml
expected_human_interventions: 0
```

#### `context_files` (array of strings)
Additional context files to include beyond standard CLAUDE.md/AGENTS.md

**Example:**
```yaml
context_files:
  - docs/block-examples.md
  - docs/accessibility-guidelines.md
```

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
  The block should support:
  - Main quote text
  - Optional author name
  - Optional author title/role

  Follow all AEM best practices for block development.

initial_state: ./initial-state/

canonical_checks:
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

flexible_criteria:
  - name: code_quality
    description: |
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with proper breakpoints (600px, 900px)
      - All selectors scoped to .quote
      - Semantic HTML elements used
      - Code is clean and maintainable
    weight: 30

  - name: process_adherence
    description: |
      - Followed content-driven development (content model first)
      - Used building-blocks skill guidelines
      - Created test content before implementation
      - Announced skill usage
    weight: 25

  - name: completeness
    description: |
      - Handles all required content fields
      - Handles optional fields gracefully
      - Responsive across all breakpoints
      - Accessible (proper semantic HTML, ARIA if needed)
    weight: 25

  - name: autonomy
    description: |
      - Completed without asking unnecessary questions
      - Made reasonable decisions independently
      - Only asked for clarification on truly ambiguous points
    weight: 20

runs: 5
regression_threshold: 10
timeout: 600
expected_human_interventions: 0
```

## Validation Rules

A valid test.yaml must:
1. Include all required fields
2. Have `type` be either "unit" or "integration"
3. Reference skills that exist in `.claude/skills/`
4. Have flexible criteria weights sum to 100
5. Have `runs` >= 1
6. Have `timeout` > 0
7. If `initial_state` is specified, the path must exist

## Best Practices

1. **Task clarity**: Make tasks clear and complete. Don't rely on implicit knowledge.

2. **Canonical checks**: Focus on objective, measurable criteria that catch real problems.

3. **Flexible criteria**: Keep descriptions specific so evaluation agent knows what to look for.

4. **Weights**: Weight what matters most. If code quality is paramount, give it higher weight.

5. **Runs**: Start with 3-5 runs. Increase if you see high variance.

6. **Initial state**: Keep it minimal - only include what's necessary for the test scenario.

7. **Regression threshold**: Set based on acceptable variance. 10 points is reasonable default.
