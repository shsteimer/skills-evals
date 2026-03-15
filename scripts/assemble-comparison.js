import fs from 'fs/promises';
import path from 'path';

/**
 * Merge comparison analysis into comparison data for the comparison viewer.
 *
 * Reads comparison.json and comparison-analysis.json from the comparison directory,
 * merges the analysis fields into the comparison, and writes updated
 * comparison.json and compare-data.js.
 */
export async function assembleComparison(comparisonDir) {
  const targetDir = path.resolve(comparisonDir);

  const comparisonPath = path.join(targetDir, 'comparison.json');
  const comparison = JSON.parse(await fs.readFile(comparisonPath, 'utf-8'));

  const analysisPath = path.join(targetDir, 'comparison-analysis.json');
  const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf-8'));

  // Merge per-group verdicts into matched groups
  if (analysis.perGroup) {
    const verdictsByKey = new Map(analysis.perGroup.map(g => [g.key, g]));
    for (const group of comparison.matched) {
      const verdict = verdictsByKey.get(group.key);
      if (verdict) {
        group.analysis = {
          verdict: verdict.verdict,
          reasoning: verdict.reasoning
        };
      }
    }
  }

  // Add top-level analysis
  comparison.analysis = {
    recommendation: analysis.recommendation,
    confidence: analysis.confidence,
    comparisonSummary: analysis.comparisonSummary
  };

  // Write updated comparison.json
  await fs.writeFile(comparisonPath, JSON.stringify(comparison, null, 2), 'utf-8');

  // Write updated compare-data.js
  const dataJsPath = path.join(targetDir, 'compare-data.js');
  await fs.writeFile(
    dataJsPath,
    `const compareData = ${JSON.stringify(comparison, null, 2)};\n`,
    'utf-8'
  );

  return comparison;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const comparisonDir = process.argv[2];

  if (!comparisonDir) {
    console.error('Usage: node scripts/assemble-comparison.js <comparison-dir>');
    process.exit(1);
  }

  const result = await assembleComparison(comparisonDir);
  const rec = result.analysis?.recommendation || 'none';
  const confidence = result.analysis?.confidence || 'unknown';
  console.log(`Merged analysis into comparison (recommendation: ${rec}, confidence: ${confidence})`);
}
