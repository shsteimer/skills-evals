You are analyzing the results of comparing two evaluation batches to determine whether
the candidate batch (with updated augmentations/configuration) is an improvement over
the baseline batch.

## Comparison data
{{comparison_data}}

## Your task

1. For each matched group with a score delta > +/-0.5, read the individual eval-result.json
   files in both the baseline and candidate batch directories to understand what changed.

   Baseline dir: {{baseline_dir}}
   Candidate dir: {{candidate_dir}}

2. Analyze across three dimensions:
   - Quality: Are scores improving? Is success rate higher?
   - Efficiency: Are agents using fewer tokens or finishing faster?
   - Consistency: Is variance (stddev) lower? More predictable outcomes?

3. Produce your recommendation as a JSON object (no markdown fences, no commentary):
{
  "recommendation": "yes" | "no" | "inconclusive",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentence summary of why",
  "perGroup": [
    {
      "key": "task::agent",
      "verdict": "improved" | "regressed" | "stable" | "inconclusive",
      "reasoning": "brief explanation"
    }
  ]
}

- "yes" = candidate is clearly better, recommend adopting
- "no" = candidate is worse or not better, do not adopt
- "inconclusive" = mixed results, need more data or targeted investigation
