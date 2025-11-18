# Agent Skills Evaluation Framework

## Implementation Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Foundation** | ✅ Complete | Task structure, schema, documentation |
| **Phase 2: Task Runner** | ✅ Complete | Agent execution working for all 3 agents |
| **Phase 3: Evaluator** | ✅ Complete | Full evaluation with static + dynamic (LLM) |
| **Phase 3b: Fix Diff Bug** | ✅ Complete | Fix git diff capture when agent makes commits |
| **Phase 3c: Refine Evaluator** | ✅ Complete | Narrative format, template-based prompts, new criteria schema |
| **Phase 4: Write Tasks** | 📋 Next | Create real tasks, validate framework end-to-end |
| **Phase 5: TBD** | 🤷 Future | Decide based on Phase 4 learnings |

---

## What We Built (Phases 1-3c)

**Infrastructure:**
- Task runner that executes tasks with claude-code, cursor-cli, and windsurf-cli in isolated git worktrees
- Evaluation system with static checks (linting, file existence, patterns, custom scripts)
- Dynamic LLM-based evaluation with narrative markdown format
- Template-based evaluation prompts for easy iteration
- Multi-agent evaluation and comparison

**Task System:**
- Simplified criteria schema (description + optional details)
- Support for expected outcomes
- Three-tier evaluation: static (must pass), optional static (warnings), dynamic (LLM assessed)
- Empirical task creation workflow (run first, document patterns, then add criteria)

**Key Files:**
- `tasks/TASK_SCHEMA.md` - Complete schema documentation
- `tasks/CREATING_TASKS.md` - Best practices and guidelines
- `tools/run-tasks.js` - Execute tasks with agents
- `tools/evaluate.js` - Evaluate results (static + dynamic)
- `tools/lib/eval/evaluation-prompt-template.txt` - Dynamic evaluation prompt

---

## Phase 4: Write Real Tasks (Current)

**Goal:** Create unit tasks to test individual skills and validate framework end-to-end.

**Approach:**
1. Pick a skill (docs-search, building-blocks, content-modeling, etc.)
2. Create 2-3 tasks for that skill
3. Use empirical approach: run 5+ times, document patterns, add criteria
4. Review evaluation results - are they useful and actionable?
5. Iterate on task design and evaluation criteria
6. Document learnings and patterns

**Planned Unit Tasks:**
- **docs-search**: Basic feature lookup ✅, find best practices, research complex features
- **building-blocks**: Create simple block, create complex block, modify existing block, fix styling bug
- **content-modeling**: Model simple carousel, model complex form
- **content-driven-development**: Follow CDD workflow, create with test content
- **testing-blocks**: Write unit tests, write browser tests
- **block-collection-and-party**: Find reference implementation, adapt existing pattern

**Success Criteria:**
- Can run any task end-to-end without manual intervention
- Evaluation results are useful and actionable
- Framework catches real skill improvements/regressions
- Easy to write new tasks (low overhead)

---

## Phase 5: TBD (Future)

Decide next steps based on Phase 4 learnings. Potential directions:

**Possible Enhancements:**
- Parallel execution of multiple agents
- A/B testing between skill versions
- Integration tests (multi-skill workflows)
- CI/CD integration
- Comparison and trending tools
- Additional task coverage

**Philosophy:** Build what we actually need, not what we think we might need. Keep it simple and focused.

---

## Overall Goal

Create a framework to evaluate the impact of changes to agent skills and context files on agent performance.

**Primary Metrics:**
- Quality of output (final code quality)
- Amount of human input needed (agent autonomy)

**Evaluation Approach:**
- Automated evaluation by an agent
- Present findings for manual review/verification

**Success = Framework helps us:**
1. Detect regressions when skills are changed
2. Identify improvements when skills are enhanced
3. Understand what changed and why
4. Make data-driven decisions about skill modifications
