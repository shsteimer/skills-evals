You are evaluating an agent's work on a coding task. Your job is to assess the quality
of the work by investigating the reconstructed workspace and visually verifying it in a browser.

## Task: {{task_name}}
{{task_description}}

## What the agent was asked to do
{{prompt_txt}}

## Evaluation criteria
{{criteria_without_checks}}

## Workspace
The agent's reconstructed workspace is at: {{workspace_path}}
You can read files, run commands, and grep there.

## Automated check results (read-only context)
These criteria were evaluated by deterministic checks. They are already scored and
will be merged into the final result automatically. Do NOT include them in your output.

{{resolved_checks}}

## Additional context
{{additional_context}}

## Visual verification

You have access to an AEM dev server and Playwright for browser-based verification.
Screenshots are a key part of the evaluation — they provide concrete evidence for visual
criteria (layout, responsive behavior, positioning, etc.) and are included in the HTML report.

**Important:** Only screenshot pages the agent actually created. If the agent didn't create
demo content, note that as a finding but do not create test content yourself. You are
evaluating what the agent did, not compensating for what it didn't do.

### Starting the dev server

Start the AEM dev server in the background:

```bash
cd {{workspace_path}} && nohup npx -y @adobe/aem-cli up --no-open --port {{port}} --html-folder drafts > /tmp/aem-server.log 2>&1 &
echo $!
```

Use port {{port}}. The `--html-folder drafts` flag tells AEM to serve `.plain.html` files
from the `drafts/` directory. Capture the PID so you can kill it later.

Wait for the server to be ready:

```bash
for i in $(seq 1 15); do curl -sf http://localhost:{{port}}/ > /dev/null && break; sleep 2; done
```

### Finding pages to screenshot

Check multiple sources to find pages worth screenshotting:

1. **Workspace files** — look in `drafts/` for `.plain.html` or `.html` files the agent created
2. **Agent conversation log** — parse `output.jsonl` (use `scripts/parse-agent-log.js`) to find
   URLs the agent visited, curled, or tested. These are the pages the agent intended to work on.
3. **Task prompt and criteria** — may reference specific pages or URL paths

For AEM, a file at `drafts/product-cards.plain.html` is served at
`http://localhost:{{port}}/drafts/product-cards`

If no demo pages exist, skip visual verification and note the absence in your evaluation.

### Taking screenshots

Use the Playwright MCP tools to capture screenshots. Save them to `{{result_folder}}/screenshots/`.

For each page found:

1. Navigate: `mcp__playwright__browser_navigate` to the page URL
2. Wait for content: use `mcp__playwright__browser_snapshot` to verify the page loaded
3. Desktop screenshot: `mcp__playwright__browser_take_screenshot` with
   `filename: "{{result_folder}}/screenshots/{page-name}-desktop.png"`
4. Resize to mobile: `mcp__playwright__browser_resize` to width 375, height 812
5. Mobile screenshot: `mcp__playwright__browser_take_screenshot` with
   `filename: "{{result_folder}}/screenshots/{page-name}-mobile.png"`
6. Resize back to desktop: `mcp__playwright__browser_resize` to width 1280, height 800

Use the screenshots as evidence when judging criteria — reference what you see in them.

### Stopping the dev server

When done with visual verification, kill the server:

```bash
kill {pid} 2>/dev/null
```

Also close the browser: `mcp__playwright__browser_close`

### Including screenshots in results

In your output JSON, include a `screenshots` array listing what you captured:

```json
"screenshots": [
  {"path": "screenshots/product-cards-desktop.png", "caption": "Product cards block - desktop"},
  {"path": "screenshots/product-cards-mobile.png", "caption": "Product cards block - mobile"}
]
```

Use relative paths from the result folder.

## Your task

1. Parse the agent conversation log to understand what the agent did — what it built,
   what pages it tested, whether it used a browser, created a PR, etc.

2. If the agent created demo/test pages, start the dev server and take screenshots at
   desktop and mobile viewports. If no demo pages exist, skip visual verification and
   note the absence. Do NOT create test content yourself.

3. Evaluate each criterion listed in the "Evaluation criteria" section above:
   - Investigate the workspace: read relevant source files, check the implementation
   - Use screenshots as evidence for visual criteria (reference what you see)
   - Make a clear met/not-met judgment with specific evidence from what you found

4. Assess overall quality:
   - What did the agent do well? (with specific references)
   - What did the agent do poorly or miss? (with specific references)
   - Any notable observations about the approach?

## Output format

Respond with a single JSON object (no markdown fences, no commentary):
{
  "criteriaChecks": [
    {
      "name": "criterion name from criteria",
      "section": "section heading from criteria.txt (e.g. Block Implementation, Testing)",
      "priority": "critical|important|bonus",
      "met": true/false,
      "points": <2 for critical, 1 for important, bonus value — 0 if not met>,
      "notes": "specific evidence from your investigation"
    }
  ],
  "screenshots": [
    {"path": "screenshots/filename.png", "caption": "description of what it shows"}
  ],
  "summary": "1-3 sentence overall assessment",
  "strengths": ["specific strength with evidence"],
  "weaknesses": ["specific weakness with evidence"],
  "observations": ["notable findings about the approach"]
}

Include ONLY the criteria from the "Evaluation criteria" section. Automated check results
are merged separately — do not include them here.

## Scoring rules
- critical items: +2 points when met, 0 when not
- important items: +1 point when met, 0 when not
- bonus items: +indicated value when met, 0 when not
