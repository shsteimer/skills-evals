# Task Definition Schema

Each task is defined by a `task.yaml` file. Here's a complete example:

```yaml
# ============================================================================
# REQUIRED FIELDS
# ============================================================================

# Short, descriptive name for the task
name: "Create simple quote block"

# Detailed description of what this task evaluates
description: "Evaluates basic block creation following content-driven development and building-blocks skills."

# List of skills being evaluated (should match directory names in .claude/skills/)
skills:
  - content-driven-development
  - building-blocks

# The prompt/task given to the agent (should be clear and realistic)
task: |
  Create a quote block that displays a blockquote with optional attribution.

# Deterministic checks that MUST pass (failure = task failure)
static_criteria:
  lint_passes: true                     # Requires npm run lint to pass
  files_exist:                          # Files that must exist
    - blocks/quote/quote.js
    - blocks/quote/quote.css
  files_not_exist:                      # Files that must NOT exist
    - blocks/quote/quote.test.js
  forbidden_patterns:                   # Code patterns that should not appear
    - pattern: "var "
      in_files: ["**/*.js"]
      message: "Should use const/let instead of var"
  required_patterns:                    # Code patterns that must appear
    - pattern: "export default"
      in_files: ["blocks/**/*.js"]
      message: "Blocks should export default function"
  custom_scripts:                       # Custom bash scripts for specialized checks
    - name: "check-accessibility"
      script: "./scripts/check-aria.sh"
      timeout: 10000

# Quality criteria evaluated by LLM (can vary across runs)
dynamic_criteria:
  - description: Evaluate code quality - proper patterns and maintainability
    details:                            # Optional: specific points to consider
      - JavaScript uses proper decoration patterns
      - CSS is mobile-first with breakpoints (600px, 900px)
      - Selectors properly scoped to .quote
      - Semantic HTML elements used
    priority: high                      # high, medium, or low

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

# ============================================================================
# OPTIONAL FIELDS
# ============================================================================

# Tags for categorizing and filtering tasks
tags:
  - blocks
  - basic

# Git branch name to use as starting point (defaults to main)
initial_state: task/basic-setup

# Description of ideal response (included in dynamic evaluation prompt)
expected_outcome: |
  Agent follows content-driven development, creates proper file structure,
  implements mobile-first CSS, and uses semantic HTML decoration.

# Deterministic checks that are verified but don't cause failure
# (reported as warnings only, except for PR checks - see below)
optional_static_criteria:
  files_exist:
    - blocks/quote/README.md
  required_patterns:
    - pattern: "aria-"
      in_files: ["blocks/**/*.js"]
      message: "Consider ARIA attributes for accessibility"
  
  # PR checks have special handling:
  # - If no PR opened: checks skipped (no penalty)
  # - If PR opened: all enabled checks must pass or task fails
  pr_quality:
    checks_pass: true              # All PR checks (CI/CD) must pass
    has_preview_link: true          # Preview link required in PR description
    preview_no_404: true            # Preview link must not return 404
    preview_correct_branch: true    # Preview link must be for working branch
```

---

## Field Reference

### Required Fields

#### `name`
**Type:** String

Short, descriptive name for the task. Used in logs and reports.

#### `description`
**Type:** String

Detailed description of what this task evaluates. Helps understand the purpose and scope.

#### `skills`
**Type:** Array of strings

List of skills being evaluated. Should match directory names in `.claude/skills/`. Used to understand which skill workflows are being tested.

#### `task`
**Type:** String (multi-line)

The prompt/task given to the agent. Should be clear and realistic - representing how a real user might phrase the request. This is what the agent will receive and attempt to complete.

#### `static_criteria`
**Type:** Object

Deterministic evaluation criteria that must pass. Failure of any check causes task failure.

**Available checks:**

**`lint_passes`** (boolean)
- If true, requires `npm run lint` to pass with no errors

**`files_exist`** (array of strings)
- File paths that must exist after task completion
- Supports glob patterns (e.g., `blocks/**/*.js`)

**`files_not_exist`** (array of strings)
- File paths that must NOT exist
- Used to prevent unnecessary file creation

**`forbidden_patterns`** (array of objects)
- Code patterns that should not appear in the diff
- Each pattern has:
  - `pattern` (string) - Regex pattern to search for
  - `in_files` (array of strings) - File globs to check
  - `message` (string) - Explanation of why it's forbidden

**`required_patterns`** (array of objects)
- Code patterns that must appear in the diff
- Same structure as `forbidden_patterns`

**`custom_scripts`** (array of objects)
- Custom bash scripts for specialized checks
- Each script has:
  - `name` (string) - Script identifier
  - `script` (string) - Bash command to execute
  - `cwd` (string, optional) - Working directory (defaults to output dir)
  - `timeout` (number, optional) - Timeout in milliseconds (default: 30000)
- Script should exit 0 for pass, non-zero for fail

#### `dynamic_criteria`
**Type:** Array of objects

Quality criteria evaluated by LLM. Results can vary across runs based on subjective assessment.

Each criterion requires:
- `description` (string) - What aspect to evaluate
- `priority` (enum) - Importance level: `high`, `medium`, or `low`

Optional field:
- `details` (array of strings) - Specific points to consider during evaluation

The LLM evaluator scores each criterion and provides reasoning.

### Optional Fields

#### `tags`
**Type:** Array of strings

Tags for categorizing and filtering tasks.

Common tags:
- `blocks` - Block creation/modification
- `basic` / `advanced` - Complexity level
- `workflow` - Full development workflow
- `accessibility` - Accessibility focus
- `performance` - Performance focus
- `documentation` - Documentation research
- `research` - Research/discovery tasks

#### `initial_state`
**Type:** String

Git branch name to use as starting point. If not specified, uses `main`. Useful for tasks that require specific starting conditions or pre-existing code.

#### `expected_outcome`
**Type:** String (multi-line)

Description of the ideal response or outcome. Included in the dynamic evaluation prompt to provide the LLM evaluator with a quality reference point.

#### `optional_static_criteria`
**Type:** Object

Deterministic checks that are verified but don't cause task failure. Uses the same check types as `static_criteria`. Failures are reported as warnings only.

**Special case - PR Quality:**

PR-related checks in `optional_static_criteria` have special handling:
- If no PR opened: checks are skipped (no penalty)
- If PR opened: all enabled checks must pass or task fails

This ensures opening a broken PR is worse than not opening one at all.

Available PR checks:
- `checks_pass` - Requires all PR checks (CI/CD) to pass
- `has_preview_link` - Requires preview link in PR description
- `preview_no_404` - Preview link must not return 404
- `preview_correct_branch` - Preview link must be for working branch
