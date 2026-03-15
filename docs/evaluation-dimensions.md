# Evaluation Dimensions

This document defines the evaluation dimensions used to assess coding agent performance on EDS tasks. Each dimension is a high-level competency area (C1-C6) that tasks map to. Per-task scoring criteria live in each task's `criteria.txt`.

## Dimension Definitions

### C1: Code Quality

Measures adherence to web development best practices within the EDS context.

- Semantic HTML structure
- Scoped CSS (no style leakage)
- Vanilla JS (no unnecessary libraries)
- Responsive design (desktop, tablet, mobile)
- Clean, maintainable code

### C2: EDS Architecture Understanding

Measures understanding of the EDS decorated DOM pipeline and block conventions.

- Decorated DOM vs raw DOM awareness
- Block structure (`blocks/{name}/{name}.js` + `{name}.css`)
- `decorate()` function export pattern
- Sections, blocks, and default content distinctions
- 3-phase loading model (eager/lazy/delayed)

### C3: Process Adherence

Measures whether the agent follows proper development workflow.

- PR with preview link
- Browser testing with screenshots
- Lint checks run and passing
- PSI check or GitHub PR checks pass

### C4: Skill Discovery & Triggering

Measures whether the agent finds and triggers the right workflow without being explicitly told.

- Follows CDD workflow (analyze, content model, build, test, review)
- Uses page-import workflow when applicable
- Leverages block-collection patterns
- Discovers and applies relevant skills autonomously

### C5: Content Modeling & Authoring

Measures the quality of content modeling decisions from an author's perspective.

- Author-friendly table design
- Canonical model selection
- Variants over config cells
- Thinking like a content creator, not just a developer

### C6: Debugging & Problem-Solving

Measures ability to diagnose issues and apply targeted fixes.

- Root cause diagnosis
- Understanding of the DOM pipeline during debugging
- Minimal, targeted fixes (not rewrites)
- Verifying the fix works
- Security awareness (e.g., XSS, innerHTML risks)

## Task-Dimension Matrix

| Task | C1 | C2 | C3 | C4 | C5 | C6 |
|------|----|----|----|----|----|----|
| build-block | Primary | Primary | Primary | Primary | Primary | |
| fix-block-bug | | Primary | Primary | | | Primary |
| modify-block | Primary | Primary | Primary | | Primary | |

## Scoring Approach

All tasks use an additive scoring system:

- **Critical** items: +2 points each when met
- **Important** items: +1 point each when met
- **Bonus** items: Add points as indicated for exceptional performance
- Score is earned points out of total possible (excluding bonus)
- **Pass threshold**: 80% of possible points (excluding bonus) with no critical items unmet

Each task's `criteria.txt` contains the specific rubric with critical, important, and bonus items mapped to the relevant dimensions above.

## Adding New Dimensions

When adding a new dimension:

1. Define it in this document with a clear description and measurable indicators
2. Assign it a code (C7, C8, etc.)
3. Update the task-dimension matrix
4. Update relevant `criteria.txt` files to include rubric items for the new criterion

## Adding New Tasks

When adding a new task:

1. Create `tasks/{task-name}/` with `task.json`, `prompt.txt`, `criteria.txt`
2. Map the task to criteria in the matrix above
3. Write `criteria.txt` using the scoring rubric format with `<critical>`, `<important>`, and optional `<bonus>` tags
4. Add any required augmentation files (buggy code, source files, etc.)
5. Use natural prompts that don't reference skills or AGENTS.md explicitly
