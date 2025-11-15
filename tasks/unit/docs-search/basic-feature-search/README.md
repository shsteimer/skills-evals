# Docs Search - Basic Feature Lookup

## Purpose

Tests whether agents can correctly use the `docs-search` skill to find information in the aem.live documentation.

## What We're Testing

**Skill:** docs-search

**Scenario:** User asks about a fundamental AEM concept (blocks) and requests the agent search documentation.

**Success Criteria:**
1. Agent recognizes need to use docs-search skill
2. Agent invokes the skill appropriately
3. Agent finds relevant documentation
4. Agent provides accurate, helpful explanation based on docs

## Why This Test

The docs-search skill is critical for agents to:
- Find up-to-date information about AEM features
- Provide accurate answers based on official documentation
- Avoid hallucinating or providing outdated information

This task validates the basic workflow: question → skill invocation → documentation search → helpful response.

## Expected Behavior

**Good:**
- Agent explicitly mentions using docs-search
- Finds relevant docs about blocks
- Provides clear explanation with references
- Answers all three parts of the question

**Bad:**
- Answers from memory without searching docs
- Can't find relevant documentation
- Provides incorrect information
- Ignores the request to use docs-search

## Empirical Notes

(To be filled in after running test 5+ times)

### Common Patterns

- TBD

### Edge Cases

- TBD

### Criteria Refinement

- TBD
