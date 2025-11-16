import { writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Generate evaluation outputs
 */
export function generateOutputs(outputDir, evaluationResults) {
  console.log('\n=== Generating Evaluation Outputs ===\n');

  const timestamp = new Date().toISOString();

  // Generate JSON output
  const jsonOutput = {
    ...evaluationResults,
    timestamp,
    version: '1.0.0',
  };

  const jsonPath = join(outputDir, 'evaluation-results.json');
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`  ✓ Saved JSON: ${jsonPath}`);

  // Generate Markdown report
  const mdContent = generateMarkdownReport(evaluationResults);
  const mdPath = join(outputDir, 'evaluation-report.md');
  writeFileSync(mdPath, mdContent);
  console.log(`  ✓ Saved report: ${mdPath}`);

  return { jsonPath, mdPath };
}

/**
 * Generate markdown report
 */
export function generateMarkdownReport(results) {
  let md = '# Evaluation Report\n\n';

  md += `**Timestamp:** ${new Date().toISOString()}\n\n`;
  md += `**Test:** ${results.task_name || 'Unknown'}\n\n`;
  md += `**Agent (tested):** ${results.agent || 'Unknown'}\n\n`;
  md += `**Evaluator:** ${results.evaluator || 'Unknown'}\n\n`;

  md += '## Deterministic Results\n\n';
  md += `**Status:** ${results.static_results?.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;

  // Show all checks that were run
  if (results.static_results?.checks) {
    md += '### Checks Run\n\n';
    const { checks } = results.static_results;
    for (const [checkName, passed] of Object.entries(checks)) {
      const icon = passed ? '✅' : '❌';
      md += `- ${icon} ${checkName}\n`;
    }
    md += '\n';
  }

  if (results.static_results?.failures?.length > 0) {
    md += '### Failures\n\n';
    for (const failure of results.static_results.failures) {
      md += `- ❌ ${failure}\n`;
    }
    md += '\n';
  }

  // Show optional checks
  if (results.optional_results?.checks && Object.keys(results.optional_results.checks).length > 0) {
    md += '### Optional Checks\n\n';
    const { checks } = results.optional_results;
    for (const [checkName, passed] of Object.entries(checks)) {
      const icon = passed ? '✅' : '⚠️';
      md += `- ${icon} ${checkName}\n`;
    }
    md += '\n';
  }

  if (results.optional_results?.warnings?.length > 0) {
    md += '### Warnings\n\n';
    for (const warning of results.optional_results.warnings) {
      md += `- ⚠️ ${warning}\n`;
    }
    md += '\n';
  }

  // Show PR results
  if (results.pr_results?.pr_opened) {
    md += '### Pull Request\n\n';
    md += `**URL:** ${results.pr_results.pr_url}\n\n`;
    if (results.pr_results.pr_quality && Object.keys(results.pr_results.pr_quality).length > 0) {
      md += '**Quality Checks:**\n\n';
      for (const [check, result] of Object.entries(results.pr_results.pr_quality)) {
        if (typeof result === 'boolean') {
          const icon = result ? '✅' : '❌';
          md += `- ${icon} ${check}\n`;
        } else if (check === 'preview_url') {
          md += `- Preview URL: ${result}\n`;
        }
      }
      md += '\n';
    }
    if (results.pr_results.failures?.length > 0) {
      md += '**PR Failures:**\n\n';
      for (const failure of results.pr_results.failures) {
        md += `- ❌ ${failure}\n`;
      }
      md += '\n';
    }
  }

  md += '## Non-Deterministic Criteria Assessment\n\n';

  if (results.dynamic_assessment && results.dynamic_assessment.by_priority) {
    const assessment = results.dynamic_assessment;

    for (const priority of ['high', 'medium', 'low']) {
      const priorityResults = assessment.by_priority[priority];
      if (priorityResults && Object.keys(priorityResults).length > 0) {
        md += `### ${priority.toUpperCase()} Priority\n\n`;

        for (const [criterionName, criterionResults] of Object.entries(priorityResults)) {
          md += `#### ${criterionName}\n\n`;

          if (criterionResults.strengths && criterionResults.strengths.length > 0) {
            md += '**Strengths:**\n\n';
            for (const s of criterionResults.strengths) {
              md += `- ✅ ${s}\n`;
            }
            md += '\n';
          }

          if (criterionResults.issues && criterionResults.issues.length > 0) {
            md += '**Issues:**\n\n';
            for (const i of criterionResults.issues) {
              md += `- ⚠️ ${i}\n`;
            }
            md += '\n';
          }

          if (criterionResults.notes && criterionResults.notes.length > 0) {
            md += '**Notes:**\n\n';
            for (const n of criterionResults.notes) {
              md += `- ${n}\n`;
            }
            md += '\n';
          }
        }
      }
    }

    if (assessment.overall_notes && assessment.overall_notes.length > 0) {
      md += '### Overall Notes\n\n';
      assessment.overall_notes.forEach((note) => { md += `- ${note}\n`; });
      md += '\n';
    }
  } else {
    md += '_(Not evaluated)_\n\n';
  }

  return md;
}
