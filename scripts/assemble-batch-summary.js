import fs from 'fs/promises';
import path from 'path';

/**
 * Merge batch analysis into batch-summary-data.js for the batch viewer.
 *
 * Reads batch-summary.json and batch-analysis.json from the batch directory,
 * merges the analysis fields into the summary, and writes an updated
 * batch-summary-data.js.
 */
export async function assembleBatchSummary(batchDir) {
  const targetDir = path.resolve(batchDir);

  const summaryPath = path.join(targetDir, 'batch-summary.json');
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));

  const analysisPath = path.join(targetDir, 'batch-analysis.json');
  const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf-8'));

  // Merge per-group findings into groups
  if (analysis.perGroup) {
    for (const [key, groupAnalysis] of Object.entries(analysis.perGroup)) {
      if (summary.groups[key]) {
        summary.groups[key].analysis = groupAnalysis;
      }
    }
  }

  // Add batch-level analysis
  summary.analysis = {
    crossCutting: analysis.crossCutting || [],
    highlights: analysis.highlights || []
  };

  // Write updated batch-summary.json
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  // Write updated batch-summary-data.js
  const dataJsPath = path.join(targetDir, 'batch-summary-data.js');
  await fs.writeFile(
    dataJsPath,
    `const batchSummaryData = ${JSON.stringify(summary, null, 2)};\n`,
    'utf-8'
  );

  return summary;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const batchDir = process.argv[2];

  if (!batchDir) {
    console.error('Usage: node scripts/assemble-batch-summary.js <batch-dir>');
    process.exit(1);
  }

  const summary = await assembleBatchSummary(batchDir);
  const groupCount = Object.keys(summary.analysis?.crossCutting || {}).length;
  const highlightCount = (summary.analysis?.highlights || []).length;
  console.log(`Merged analysis into batch summary (${highlightCount} highlights, ${groupCount} cross-cutting patterns)`);
}
