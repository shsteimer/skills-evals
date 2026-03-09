import { esc, getDataPath, loadData, dataDir } from '../shared.js';

const root = document.getElementById('root');
const dataPath = getDataPath();

if (!dataPath) {
  root.innerHTML = '<p>Missing <code>?data=</code> parameter.</p>';
} else {
  try {
    await loadData(dataPath);
    render(typeof batchSummaryData !== 'undefined' ? batchSummaryData : null);
  } catch (err) {
    root.innerHTML = `<p>Failed to load data from <code>${esc(dataPath)}</code>.</p>`;
  }
}

function render(d) {
  if (!d) { root.innerHTML = '<p>No batch summary data.</p>'; return; }

  const batch = d.batch;
  const stats = d.batchStats;
  // dataPath is like "results/20260309/batch-summary-data.js" — strip filename to get batch dir
  const batchDataDir = dataDir(dataPath);

  document.title = `Batch Summary — ${batch?.timestamp || 'unknown'}`;

  const fmtNum = (v, digits = 1) => v == null ? 'n/a' : v.toFixed(digits);
  const fmtPct = (v) => v == null ? 'n/a' : (v * 100).toFixed(1) + '%';
  const fmtTokens = (v) => v == null ? 'n/a' : Math.round(v).toLocaleString();
  const fmtDuration = (v) => v == null ? 'n/a' : (v / 1000).toFixed(1) + 's';

  const evalLink = (folderName) =>
    `/tools/eval-viewer/index.html?data=${batchDataDir}${folderName}/eval-data.js`;

  let html = `<h1>Batch Summary</h1>`;

  // Metadata
  html += `<div class="meta">`;
  if (batch) {
    html += `Timestamp: <code>${esc(batch.timestamp)}</code>`;
    if (batch.augmentationSetName) html += ` · Augmentation: <code>${esc(batch.augmentationSetName)}</code>`;
    if (batch.agentModels) {
      const models = Object.entries(batch.agentModels).map(([a, m]) => `${a}: ${m || 'default'}`).join(', ');
      html += ` · Models: ${esc(models)}`;
    }
    if (batch.durationMs) html += ` · Duration: ${fmtDuration(batch.durationMs)}`;
  } else {
    html += `Batch: <code>${esc(d.batchDir)}</code> (no batch.json — older batch)`;
  }
  html += `</div>`;

  // Overall stats
  html += `
    <div class="stats-grid">
      <div class="stat"><div class="stat-val">${d.evaluatedCount}</div><div class="stat-label">Runs Evaluated</div></div>
      <div class="stat"><div class="stat-val">${fmtPct(stats.meanScorePct)}</div><div class="stat-label">Mean Score</div></div>
      <div class="stat"><div class="stat-val">${fmtPct(stats.successRate)}</div><div class="stat-label">Success Rate</div></div>
      <div class="stat"><div class="stat-val">${fmtTokens(stats.meanTokens)}</div><div class="stat-label">Mean Tokens</div></div>
    </div>`;

  // Per task+agent table
  const groups = Object.entries(d.groups);
  if (groups.length > 0) {
    html += `
      <h2>Per Task + Agent</h2>
      <table class="group-table">
        <thead><tr>
          <th>Task</th><th>Agent</th>
          <th class="num">Score %</th><th class="num">Min</th><th class="num">Max</th>
          <th class="num">Success</th><th class="num">Tokens</th><th class="num">Duration</th>
          <th>Runs</th>
        </tr></thead>
        <tbody>`;

    for (const [, g] of groups) {
      const s = g.stats;
      const scoreStr = s.meanScorePct != null ? fmtPct(s.meanScorePct) : 'n/a';

      let statusBadge;
      if (s.successRate === 1) statusBadge = '<span class="badge pass">All pass</span>';
      else if (s.successRate === 0) statusBadge = '<span class="badge fail">All fail</span>';
      else statusBadge = `<span class="badge mixed">${fmtPct(s.successRate)}</span>`;

      // Build run links
      const runLinks = (g.runs || []).map(r => {
        const label = g.stats.runCount > 1 ? `#${r.iteration}` : 'eval';
        const passClass = r.overallSuccess ? 'pass' : 'fail';
        const score = r.score != null ? ` (${r.score}/${r.maxScore})` : '';
        return `<a class="drill ${passClass}" href="${evalLink(r.folderName)}">${label}${score}</a>`;
      }).join(' ');

      html += `<tr>
        <td>${esc(g.task)}</td>
        <td>${esc(g.agent)}</td>
        <td class="num">${scoreStr}</td>
        <td class="num">${fmtNum(s.minScore)}</td>
        <td class="num">${fmtNum(s.maxScore)}</td>
        <td class="num">${statusBadge}</td>
        <td class="num">${fmtTokens(s.meanTokens)}</td>
        <td class="num">${fmtDuration(s.meanDurationMs)}</td>
        <td>${runLinks}</td>
      </tr>`;

      if (s.commonFailures && s.commonFailures.length > 0) {
        html += `<tr><td colspan="9"><div class="failures">Common failures: ${s.commonFailures.map(f => `<span>${esc(f)}</span>`).join('')}</div></td></tr>`;
      }
    }

    html += `</tbody></table>`;
  }

  root.innerHTML = html;
}
