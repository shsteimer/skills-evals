#!/usr/bin/env node
/**
 * Assemble the compare-batches subagent prompt from template + comparison data.
 *
 * Usage: node scripts/assemble-compare-prompt.js <comparison-dir>
 *
 * Reads:
 *   - .claude/skills/compare-batches/resources/compare-prompt.template.md
 *   - comparison.json from the comparison directory
 *   - augmentation files referenced by both batches
 *
 * Prints the assembled prompt to stdout.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

/**
 * Diff augmentation configurations between baseline and candidate batches.
 *
 * Compares at two levels:
 * 1. Augmentation files — which .json files were added/removed
 * 2. Augmentation targets — which workspace targets changed source across files
 *
 * @param {object} baselineBatch - batch metadata from baseline (has args.augmentationsFiles, augmentationSetName)
 * @param {object} candidateBatch - batch metadata from candidate
 * @param {object} augFiles - map of file path -> parsed JSON content (pre-loaded for testability)
 * @returns {object} structured diff
 */
export function diffAugmentations(baselineBatch, candidateBatch, augFiles) {
  const baselineFiles = baselineBatch.args?.augmentationsFiles || [];
  const candidateFiles = candidateBatch.args?.augmentationsFiles || [];

  const baselineSet = new Set(baselineFiles);
  const candidateSet = new Set(candidateFiles);

  const setNameChanged = baselineBatch.augmentationSetName !== candidateBatch.augmentationSetName;

  const filesAdded = [];
  const filesRemoved = [];
  const filesUnchanged = [];
  const unreadable = [];

  // Track which files couldn't be read
  for (const f of [...baselineFiles, ...candidateFiles]) {
    if (!augFiles[f] && !unreadable.includes(f)) {
      unreadable.push(f);
    }
  }

  // File-level diff: added/removed augmentation files
  for (const f of candidateFiles) {
    if (!baselineSet.has(f) && augFiles[f]) {
      filesAdded.push({ path: f, content: augFiles[f] });
    }
  }
  for (const f of baselineFiles) {
    if (!candidateSet.has(f) && augFiles[f]) {
      filesRemoved.push({ path: f, content: augFiles[f] });
    }
  }

  // Files present in both — mark as unchanged at the file level
  for (const f of baselineFiles) {
    if (candidateSet.has(f)) {
      filesUnchanged.push({ path: f, content: augFiles[f] });
    }
  }

  // Target-level diff: compare all augmentation entries by target path
  const baselineTargets = collectTargets(baselineFiles, augFiles);
  const candidateTargets = collectTargets(candidateFiles, augFiles);

  const allTargets = new Set([...baselineTargets.keys(), ...candidateTargets.keys()]);
  const filesChanged = [];
  const targetsAdded = [];
  const targetsRemoved = [];

  for (const target of allTargets) {
    const bEntry = baselineTargets.get(target);
    const cEntry = candidateTargets.get(target);

    if (bEntry && cEntry) {
      if (bEntry.source !== cEntry.source) {
        filesChanged.push({
          target,
          baselineSource: bEntry.source,
          candidateSource: cEntry.source,
        });
      }
    } else if (cEntry && !bEntry) {
      targetsAdded.push({ target, source: cEntry.source });
    } else if (bEntry && !cEntry) {
      targetsRemoved.push({ target, source: bEntry.source });
    }
  }

  return {
    setNameChanged,
    baselineSetName: baselineBatch.augmentationSetName,
    candidateSetName: candidateBatch.augmentationSetName,
    filesAdded,
    filesRemoved,
    filesUnchanged,
    filesChanged,
    targetsAdded,
    targetsRemoved,
    unreadable,
  };
}

/**
 * Collect all augmentation target -> {source, file} mappings from a set of augmentation files.
 */
function collectTargets(filePaths, augFiles) {
  const targets = new Map();
  for (const filePath of filePaths) {
    const content = augFiles[filePath];
    if (!content?.augmentations) continue;
    for (const aug of content.augmentations) {
      targets.set(aug.target, { source: aug.source, file: filePath });
    }
  }
  return targets;
}

/**
 * Format augmentation diff as a human-readable string for the subagent prompt.
 */
export function formatAugmentationDiff(diff) {
  if (!diff) return 'No augmentation data available.';

  const lines = [];

  if (diff.setNameChanged) {
    lines.push(`Augmentation set name changed: "${diff.baselineSetName}" → "${diff.candidateSetName}"`);
  } else {
    lines.push(`Augmentation set: "${diff.baselineSetName}" (unchanged)`);
  }

  const hasChanges = diff.filesAdded.length > 0
    || diff.filesRemoved.length > 0
    || diff.filesChanged.length > 0
    || diff.targetsAdded.length > 0
    || diff.targetsRemoved.length > 0;

  if (!hasChanges) {
    lines.push('\nNo augmentation changes between baseline and candidate.');
    return lines.join('\n');
  }

  if (diff.filesAdded.length > 0) {
    lines.push('\n### Augmentation files added in candidate');
    for (const f of diff.filesAdded) {
      lines.push(`- **${f.content.name}** (${f.path})`);
      for (const aug of f.content.augmentations || []) {
        lines.push(`  - ${aug.target} ← ${aug.source}`);
      }
    }
  }

  if (diff.filesRemoved.length > 0) {
    lines.push('\n### Augmentation files removed in candidate');
    for (const f of diff.filesRemoved) {
      lines.push(`- **${f.content.name}** (${f.path})`);
      for (const aug of f.content.augmentations || []) {
        lines.push(`  - ${aug.target} ← ${aug.source}`);
      }
    }
  }

  if (diff.filesChanged.length > 0) {
    lines.push('\n### Workspace targets with changed sources');
    for (const c of diff.filesChanged) {
      lines.push(`- **${c.target}**`);
      lines.push(`  - Baseline: ${c.baselineSource}`);
      lines.push(`  - Candidate: ${c.candidateSource}`);
    }
  }

  if (diff.targetsAdded.length > 0) {
    lines.push('\n### New workspace targets in candidate');
    for (const t of diff.targetsAdded) {
      lines.push(`- ${t.target} ← ${t.source}`);
    }
  }

  if (diff.targetsRemoved.length > 0) {
    lines.push('\n### Workspace targets removed in candidate');
    for (const t of diff.targetsRemoved) {
      lines.push(`- ${t.target} ← ${t.source}`);
    }
  }

  if (diff.unreadable.length > 0) {
    lines.push('\n### Unreadable augmentation files');
    for (const f of diff.unreadable) {
      lines.push(`- ${f}`);
    }
  }

  return lines.join('\n');
}

/**
 * Load augmentation file contents for all paths referenced by both batches.
 */
async function loadAugmentationFiles(baselineBatch, candidateBatch) {
  const allPaths = new Set([
    ...(baselineBatch.args?.augmentationsFiles || []),
    ...(candidateBatch.args?.augmentationsFiles || []),
  ]);

  const augFiles = {};
  for (const filePath of allPaths) {
    try {
      const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      augFiles[filePath] = content;
    } catch {
      // File may have been moved/deleted since the batch ran — skip
    }
  }
  return augFiles;
}

async function assembleComparePrompt(comparisonDir) {
  const template = await fs.readFile(
    path.join(projectRoot, '.claude/skills/compare-batches/resources/compare-prompt.template.md'),
    'utf-8',
  );

  const comparison = JSON.parse(
    await fs.readFile(path.join(comparisonDir, 'comparison.json'), 'utf-8'),
  );

  const comparisonData = await fs.readFile(path.join(comparisonDir, 'comparison.json'), 'utf-8');

  // Build augmentation diff
  const augFiles = await loadAugmentationFiles(
    comparison.baselineBatch || {},
    comparison.candidateBatch || {},
  );
  const augDiff = diffAugmentations(
    comparison.baselineBatch || {},
    comparison.candidateBatch || {},
    augFiles,
  );
  const augDiffText = formatAugmentationDiff(augDiff);

  const prompt = template
    .replaceAll('{{comparison_data}}', comparisonData.trim())
    .replaceAll('{{baseline_dir}}', comparison.baselineDir || '')
    .replaceAll('{{candidate_dir}}', comparison.candidateDir || '')
    .replaceAll('{{augmentation_diff}}', augDiffText);

  return prompt;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const comparisonDir = process.argv[2];

  if (!comparisonDir) {
    console.error('Usage: node scripts/assemble-compare-prompt.js <comparison-dir>');
    process.exit(1);
  }

  const prompt = await assembleComparePrompt(path.resolve(comparisonDir));
  console.log(prompt);
}
