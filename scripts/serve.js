import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/**
 * Scan the results directory for batches and comparisons with viewer data files.
 */
export async function scanResults(resultsDir) {
  const batches = [];
  const comparisons = [];

  // Scan top-level batch directories
  let entries = [];
  try {
    entries = await fs.readdir(resultsDir, { withFileTypes: true });
  } catch { /* no results dir */ }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'comparisons') continue;

    const dataFile = path.join(resultsDir, entry.name, 'batch-summary-data.js');
    try {
      await fs.access(dataFile);
    } catch { continue; }

    const batch = { timestamp: entry.name, dataPath: dataFile };

    // Read metadata if available
    try {
      const summaryPath = path.join(resultsDir, entry.name, 'batch-summary.json');
      const summary = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
      batch.augmentation = summary.batch?.augmentationSetName || null;
      batch.tasks = summary.batch?.taskNames || [];
      batch.stats = {
        meanScorePct: summary.batchStats?.meanScorePct,
        successRate: summary.batchStats?.successRate,
        totalRuns: summary.batchStats?.totalRuns,
      };
    } catch { /* no metadata */ }

    batches.push(batch);
  }

  // Scan comparisons directory
  const comparisonsDir = path.join(resultsDir, 'comparisons');
  let compEntries = [];
  try {
    compEntries = await fs.readdir(comparisonsDir, { withFileTypes: true });
  } catch { /* no comparisons dir */ }

  for (const entry of compEntries) {
    if (!entry.isDirectory()) continue;

    const dataFile = path.join(comparisonsDir, entry.name, 'compare-data.js');
    try {
      await fs.access(dataFile);
    } catch { continue; }

    const comp = { timestamp: entry.name, dataPath: dataFile };

    // Read metadata if available
    try {
      const jsonPath = path.join(comparisonsDir, entry.name, 'comparison.json');
      const data = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
      comp.baseline = data.baselineBatch?.timestamp || null;
      comp.candidate = data.candidateBatch?.timestamp || null;
      comp.recommendation = data.analysis?.recommendation || null;
      comp.confidence = data.analysis?.confidence || null;
    } catch { /* no metadata */ }

    comparisons.push(comp);
  }

  // Sort newest first
  batches.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  comparisons.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return { batches, comparisons };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtPct(v) {
  return v == null ? 'n/a' : (v * 100).toFixed(1) + '%';
}

function renderIndex(results) {
  const { batches, comparisons } = results;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skills Evals — Results</title>
<link rel="stylesheet" href="/tools/shared.css">
<style>
  .card-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .card {
    display: block; padding: 0.875rem 1.25rem; background: var(--card);
    border: 1px solid var(--border); border-radius: 8px;
    text-decoration: none; color: var(--fg); transition: border-color 0.15s;
  }
  .card:hover { border-color: var(--blue); }
  .card-title { font-weight: 600; font-size: 0.95rem; }
  .card-meta { font-size: 0.8125rem; color: var(--muted); margin-top: 0.25rem; }
  .rec { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 9999px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
  .rec-yes { background: var(--green-bg); color: var(--green); }
  .rec-no { background: var(--red-bg); color: var(--red); }
  .rec-inconclusive { background: var(--amber-bg); color: var(--amber); }
  .empty { color: var(--muted); font-size: 0.875rem; }
</style>
</head>
<body>
<h1>Skills Evals — Results</h1>
<div class="meta">Viewer index for evaluation batches and comparisons</div>`;

  // Comparisons
  html += `<h2>Comparisons</h2>`;
  if (comparisons.length === 0) {
    html += `<p class="empty">No comparisons found.</p>`;
  } else {
    html += `<div class="card-list">`;
    for (const c of comparisons) {
      const relPath = path.relative(ROOT, c.dataPath);
      const href = `/tools/comparison-viewer/index.html?data=${esc(relPath)}`;
      const meta = [];
      if (c.baseline && c.candidate) meta.push(`${c.baseline} → ${c.candidate}`);
      let recBadge = '';
      if (c.recommendation) {
        const cls = c.recommendation === 'yes' ? 'rec-yes' : c.recommendation === 'no' ? 'rec-no' : 'rec-inconclusive';
        recBadge = ` <span class="rec ${cls}">${esc(c.recommendation)}${c.confidence ? ` (${esc(c.confidence)})` : ''}</span>`;
      }
      html += `<a class="card" href="${href}">
        <div class="card-title">${esc(c.timestamp)}${recBadge}</div>
        ${meta.length ? `<div class="card-meta">${esc(meta.join(' · '))}</div>` : ''}
      </a>`;
    }
    html += `</div>`;
  }

  // Batches
  html += `<h2>Batches</h2>`;
  if (batches.length === 0) {
    html += `<p class="empty">No batches found.</p>`;
  } else {
    html += `<div class="card-list">`;
    for (const b of batches) {
      const relPath = path.relative(ROOT, b.dataPath);
      const href = `/tools/batch-viewer/index.html?data=${esc(relPath)}`;
      const meta = [];
      if (b.stats?.totalRuns) meta.push(`${b.stats.totalRuns} runs`);
      if (b.stats?.meanScorePct != null) meta.push(`Score: ${fmtPct(b.stats.meanScorePct)}`);
      if (b.stats?.successRate != null) meta.push(`Success: ${fmtPct(b.stats.successRate)}`);
      if (b.augmentation) meta.push(`Aug: ${b.augmentation}`);
      if (b.tasks?.length) meta.push(b.tasks.join(', '));
      html += `<a class="card" href="${href}">
        <div class="card-title">${esc(b.timestamp)}</div>
        ${meta.length ? `<div class="card-meta">${esc(meta.join(' · '))}</div>` : ''}
      </a>`;
    }
    html += `</div>`;
  }

  html += `</body></html>`;
  return html;
}

async function serveFile(res, filePath) {
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // Index page
  if (pathname === '/') {
    const resultsDir = path.join(ROOT, 'results');
    const results = await scanResults(resultsDir);
    const html = renderIndex(results);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Static files — resolve against project root, prevent directory traversal
  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  await serveFile(res, filePath);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.argv[2] || '8765', 10);
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Serving at http://localhost:${port}`);
  });
}
