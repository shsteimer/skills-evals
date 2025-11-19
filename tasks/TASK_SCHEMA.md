# Task Definition Schema

Each task is defined by a `task.yaml` file that specifies the evaluation criteria and expected outcomes.

## Required Fields

### `name` (string)
Short, descriptive name for the task.

```yaml
name: "Find security best practices documentation"
```

### `description` (string)
Detailed description of what this task evaluates.

```yaml
description: "Evaluates if agent can effectively use docs-search skill to find and synthesize security best practices from AEM documentation."
```

### `type` (enum)
Type of task being evaluated.

**Values:**
- `unit` - Evaluates a single skill or focused capability
- `integration` - Evaluates a complete workflow involving multiple skills

```yaml
type: unit
```

### `skills` (array of strings)
List of skills being evaluated. Should match directory names in `.claude/skills/`.

```yaml
skills:
  - docs-search
  - building-blocks
```

### `task` (string)
The prompt/task given to the agent. Should be clear and realistic - representing how a real user might phrase the request.

```yaml
task: |
  Create a hero block with image, headline, and CTA button.
```

### `static_criteria` (object)
Deterministic evaluation criteria that must pass. Failure causes task failure.

**Available checks:**

#### `lint_passes` (boolean)
If true, requires `npm run lint` to pass.

```yaml
static_criteria:
  lint_passes: true
```

#### `files_exist` (array of strings)
File paths that must exist after task completion. Supports glob patterns.

```yaml
static_criteria:
  files_exist:
    - blocks/quote/quote.js
    - blocks/quote/quote.css
```

#### `files_not_exist` (array of strings)
File paths that must NOT exist. Used to prevent unnecessary file creation.

```yaml
static_criteria:
  files_not_exist:
    - blocks/quote/quote.test.js
```

#### `forbidden_patterns` (array of objects)
Code patterns that should not appear in the diff.

Each pattern has:
- `pattern` (string) - Regex pattern to search for
- `in_files` (array of strings) - File globs to check
- `message` (string) - Explanation of why it's forbidden

```yaml
static_criteria:
  forbidden_patterns:
    - pattern: "var "
      in_files: ["**/*.js"]
      message: "Should use const/let instead of var"
```

#### `required_patterns` (array of objects)
Code patterns that must appear in the diff. Same structure as `forbidden_patterns`.

```yaml
static_criteria:
  required_patterns:
    - pattern: "export default"
      in_files: ["blocks/**/*.js"]
      message: "Blocks should export default function"
```

#### `custom_scripts` (array of objects)
Custom bash scripts for specialized checks.

Each script has:
- `name` (string) - Script identifier
- `script` (string) - Bash command to execute
- `cwd` (string, optional) - Working directory (defaults to output dir)
- `timeout` (number, optional) - Timeout in milliseconds (default: 30000)

Script should exit 0 for pass, non-zero for fail.

```yaml
static_criteria:
  custom_scripts:
    - name: "check-accessibility"
      script: "./scripts/check-aria.sh"
      timeout: 10000
```

### `dynamic_criteria` (array of objects)
Quality criteria evaluated by LLM. Can vary across runs.

Each criterion has:
- `description` (string, required) - What aspect to evaluate
- `details` (array of strings, optional) - Specific points to consider
- `priority` (enum, required) - Importance: `high`, `medium`, or `low`

```yaml
dynamic_criteria:
  - description: Evaluate code quality - proper patterns and maintainability
    details:
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with breakpoints
      - Code is clean and maintainable
    priority: high

  - description: Check completeness - handles all requirements
    priority: medium
```

## Optional Fields

### `tags` (array of strings)
Tags for categorizing and filtering tasks.

**Common tags:**
- `blocks` - Block creation/modification
- `basic` / `advanced` - Complexity level
- `workflow` - Full development workflow
- `accessibility` - Accessibility focus
- `performance` - Performance focus
- `documentation` - Documentation research
- `research` - Research/discovery tasks

```yaml
tags:
  - blocks
  - basic
  - css
```

### `initial_state` (string)
Git branch name to use as starting point. If not specified, uses `main`.

```yaml
initial_state: task/hero-block-base
```

### `expected_outcome` (string)
Description of the ideal response or outcome. Included in dynamic evaluation prompt to provide evaluator with quality reference.

```yaml
expected_outcome: |
  Agent invokes the docs-search skill, finds relevant documentation,
  fetches full page content, and synthesizes information from multiple
  authoritative sources with specific, actionable recommendations.
```

### `optional_static_criteria` (object)
Deterministic checks that are verified but don't cause task failure. Same check types as `static_criteria`.

Failures are reported as warnings only.

```yaml
optional_static_criteria:
  files_exist:
    - blocks/quote/README.md
  required_patterns:
    - pattern: "aria-"
      in_files: ["blocks/**/*.js"]
      message: "Consider ARIA attributes for accessibility"
```

**Special case - PR Quality:**

PR-related checks in `optional_static_criteria` have special handling:
- If no PR opened: checks are skipped (no penalty)
- If PR opened: all enabled checks must pass or task fails

```yaml
optional_static_criteria:
  pr_quality:
    checks_pass: true              # Requires all PR checks (CI/CD) to pass
    has_preview_link: true          # Requires preview link in PR description
    preview_no_404: true            # Preview link must not return 404
    preview_correct_branch: true    # Preview link must be for working branch
```

This ensures opening a broken PR is worse than not opening one at all.

## Complete Example

```yaml
name: "Create simple quote block"
description: "Evaluates basic block creation following content-driven development and building-blocks skills."
type: unit
skills:
  - content-driven-development
  - building-blocks
tags:
  - blocks
  - basic

task: |
  Create a quote block that displays a blockquote with optional attribution.

expected_outcome: |
  Agent follows content-driven development, creates proper file structure,
  implements mobile-first CSS, and uses semantic HTML decoration.

initial_state: task/basic-setup

static_criteria:
  lint_passes: true
  files_exist:
    - blocks/quote/quote.js
    - blocks/quote/quote.css
  forbidden_patterns:
    - pattern: "var "
      in_files: ["**/*.js"]
      message: "Should use const/let instead of var"

optional_static_criteria:
  files_exist:
    - blocks/quote/README.md
  pr_quality:
    checks_pass: true
    has_preview_link: true

dynamic_criteria:
  - description: Evaluate code quality - proper patterns and maintainability
    details:
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with breakpoints (600px, 900px)
      - Selectors properly scoped to .quote
      - Semantic HTML elements used
    priority: high

  - description: Assess process adherence - followed skill workflows
    details:
      - Used content-driven development approach
      - Created test content before implementation
      - Followed building-blocks skill guidelines
    priority: high

  - description: Check completeness - handles requirements and edge cases
    priority: medium

  - description: Evaluate autonomy - minimal human intervention needed
    priority: low
```
