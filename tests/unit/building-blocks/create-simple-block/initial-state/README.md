# Initial State for Create Simple Block Test

## Purpose

This directory contains the starting project state for the test. It should include the minimal AEM boilerplate needed for block development.

## What Should Be Here

The test runner will copy these files into a fresh test environment before running the test.

### Required Files

These files must be present for a realistic AEM project context:

- `package.json` - Node.js dependencies and scripts (including lint)
- `.eslintrc.js` - ESLint configuration
- `.stylelintrc.json` - Stylelint configuration
- `scripts/aem.js` - Core AEM library (never modified)
- `scripts/scripts.js` - Main entry point for page decoration
- `scripts/delayed.js` - Delayed functionality
- `styles/styles.css` - Global styles
- `head.html` - HTML head template
- Basic project structure (blocks/, styles/, scripts/ directories)

### Context Files

These provide instructions to the agent:

- `CLAUDE.md` - Agent instructions
- `AGENTS.md` - Skills workflow
- `.claude/skills/` - All skill definitions
- `.agents/discover-skills` - Skill discovery script

### What Should NOT Be Here

- No existing blocks (the test is about creating one from scratch)
- No test content (agent should create this as part of content-driven development)
- No node_modules (will be installed if needed during test)

## Setup

To populate this directory, run:

```bash
# From repo root
./tools/setup-test-initial-state tests/unit/building-blocks/create-simple-block
```

This will copy the minimal required files from the base repository.
