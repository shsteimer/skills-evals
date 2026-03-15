You are analyzing evaluation results for a batch of agent task runs. Your job is to
identify patterns, explain outcomes, and surface findings that the raw numbers alone
don't reveal.

## Batch summary
{{batch_summary}}

## Your task

1. Read the batch-summary.json to understand overall and per-group performance.

2. For groups with notable patterns (high variance, low success rates, common failures,
   unusual token usage), read the individual eval-result.json files in those groups to
   understand WHY:

   Batch dir: {{batch_dir}}
   Run folders follow the pattern: {{batch_dir}}/{task}-{agent}-{iteration}/eval-result.json

3. Analyze each group and produce per-group findings:
   - What happened? (succeeded, failed, mixed results)
   - Why? (specific evidence from eval results)
   - Consistency — was behavior stable across iterations or variable?

4. Look for cross-cutting patterns:
   - Which agents performed best/worst overall?
   - Are there efficiency differences (token usage, duration) worth noting?
   - Any systematic failures that appear across multiple groups?

5. Produce your output as a JSON object (no markdown fences, no commentary):
{
  "perGroup": {
    "task::agent": {
      "findings": "2-3 sentence analysis of this group's performance with specific evidence",
      "concerns": ["specific concern if any — e.g. high variance, systematic failure"]
    }
  },
  "crossCutting": [
    "Pattern or finding that spans multiple groups — be specific"
  ],
  "highlights": [
    "Notable positive or negative outcome worth calling attention to"
  ]
}

Rules:
- Be specific — reference actual scores, failure names, and evidence from eval results
- Don't just restate the numbers — explain what they mean
- Keep each finding concise (2-3 sentences max)
- If a group is straightforward (perfect scores, zero variance), a brief note is fine
- Focus on what's useful for understanding agent behavior, NOT on task design issues
