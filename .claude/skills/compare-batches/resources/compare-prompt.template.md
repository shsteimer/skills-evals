You are analyzing the results of comparing two evaluation batches to determine whether
the candidate batch (with updated augmentations/configuration) is an improvement over
the baseline batch.

## Comparison data
{{comparison_data}}

## Augmentation changes between batches
{{augmentation_diff}}

## Your task

1. Review the augmentation changes above to understand what was different about the
   candidate's workspace setup. This is the independent variable — use it to explain
   *why* agents may have behaved differently, not just *what* changed in scores.

   When source URLs changed for a target, **fetch both versions** (using `curl` via Bash)
   and diff them to understand the actual content changes. Focus on targets most likely to
   explain score deltas (e.g., AGENTS.md, CLAUDE.md, skill files). For directory-type
   sources (e.g., a skill directory), explore the repository tree or fetch key files
   within it (like SKILL.md or the main prompt file) to understand what changed.

2. For each matched group with a score delta > +/-0.5, read the individual eval-result.json
   files in both the baseline and candidate batch directories to understand what changed.

   Baseline dir: {{baseline_dir}}
   Candidate dir: {{candidate_dir}}

3. Analyze whether agents are following their instructions better or worse in the candidate.
   Look at the specific criteria that changed (met → unmet or vice versa) and ask: is there
   something in the augmentation changes that could credibly explain the behavioral shift?
   Don't just report score deltas — connect them to specific augmentation differences.

4. Produce your recommendation as a JSON object (no markdown fences, no commentary):
{
  "recommendation": "yes" | "no" | "inconclusive",
  "confidence": "high" | "medium" | "low",
  "comparisonSummary": "This is the most prominent text in the comparison viewer — it appears in a large banner at the top. Write 3-5 sentences structured as: (1) what changed in the augmentations, (2) are agents following instructions better or worse as a result — cite specific criteria shifts, (3) what in the changes could credibly explain the behavioral differences, (4) what to try next. Lead with the insight, not the numbers — the numbers are already in the table below.",
  "perGroup": [
    {
      "key": "task::agent",
      "verdict": "improved" | "regressed" | "stable" | "inconclusive",
      "reasoning": "brief explanation — attribute changes to augmentation differences when evidence supports it"
    }
  ]
}

- "yes" = candidate is clearly better, recommend adopting
- "no" = candidate is worse or not better, do not adopt
- "inconclusive" = mixed results, need more data or targeted investigation
