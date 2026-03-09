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
  const taskCount = batch?.taskNames?.length || new Set(Object.values(d.groups).map(g => g.task)).size;
  const agentCount = batch?.args?.agents?.length || new Set(Object.values(d.groups).map(g => g.agent)).size;

  html += `
    <div class="stats-grid">
      <div class="stat"><div class="stat-val">${d.evaluatedCount}</div><div class="stat-label">Runs Evaluated</div></div>
      <div class="stat"><div class="stat-val">${taskCount}</div><div class="stat-label">Tasks</div></div>
      <div class="stat"><div class="stat-val">${agentCount}</div><div class="stat-label">Agents</div></div>
      <div class="stat"><div class="stat-val">${fmtPct(stats.meanScorePct)}</div><div class="stat-label">Mean Score</div></div>
      <div class="stat"><div class="stat-val">${fmtPct(stats.successRate)}</div><div class="stat-label">Success Rate</div></div>
      <div class="stat"><div class="stat-val">${fmtTokens(stats.meanTokens)}</div><div class="stat-label">Mean Tokens</div></div>
    </div>`;

  // Analysis insights (highlights + cross-cutting) — right after stats
  const analysis = d.analysis;
  if (analysis && (analysis.highlights?.length || analysis.crossCutting?.length)) {
    html += '<div class="insights">';

    html += '<div class="insight-col highlights"><h3>Highlights</h3>';
    if (analysis.highlights?.length) {
      html += `<ul class="list highlights">${analysis.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`;
    } else {
      html += '<p class="none">None noted</p>';
    }
    html += '</div>';

    html += '<div class="insight-col patterns"><h3>Cross-Cutting Patterns</h3>';
    if (analysis.crossCutting?.length) {
      html += `<ul class="list patterns">${analysis.crossCutting.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`;
    } else {
      html += '<p class="none">None noted</p>';
    }
    html += '</div>';

    html += '</div>';
  }

  // Per task+agent cards
  const groups = Object.entries(d.groups);
  if (groups.length > 0) {
    html += `<h2>Per Task + Agent</h2>`;

    for (const [, g] of groups) {
      const s = g.stats;
      const ga = g.analysis;
      const scoreStr = s.meanScorePct != null ? fmtPct(s.meanScorePct) : 'n/a';
      const allPass = s.successRate === 1;
      const allFail = s.successRate === 0;
      const cardClass = allFail ? 'group-card fail' : allPass ? 'group-card pass' : 'group-card mixed';

      // Run links
      const runLinks = (g.runs || []).map(r => {
        const label = s.runCount > 1 ? `#${r.iteration}` : 'eval';
        const passClass = r.overallSuccess ? 'pass' : 'fail';
        const score = r.score != null ? ` (${r.score}/${r.maxScore})` : '';
        return `<a class="drill ${passClass}" href="${evalLink(r.folderName)}">${label}${score}</a>`;
      }).join(' ');

      // Status badge
      let statusBadge;
      if (allPass) statusBadge = '<span class="badge pass">All pass</span>';
      else if (allFail) statusBadge = '<span class="badge fail">All fail</span>';
      else statusBadge = `<span class="badge mixed">${fmtPct(s.successRate)}</span>`;

      html += `<div class="${cardClass}">`;
      html += `<div class="group-header">`;
      html += `<div class="group-title">${esc(g.task)} <span class="agent-name">${esc(g.agent)}</span></div>`;
      html += `<div class="group-status">${statusBadge}</div>`;
      html += `</div>`;

      html += `<div class="group-stats">`;
      html += `<div class="group-stat"><span class="group-stat-val">${scoreStr}</span><span class="group-stat-label">Score</span></div>`;
      html += `<div class="group-stat"><span class="group-stat-val">${fmtNum(s.meanScore)} ± ${fmtNum(s.stddev)}</span><span class="group-stat-label">Mean ± SD</span></div>`;
      html += `<div class="group-stat"><span class="group-stat-val">${fmtNum(s.minScore)} – ${fmtNum(s.maxScore)}</span><span class="group-stat-label">Range</span></div>`;
      html += `<div class="group-stat"><span class="group-stat-val">${fmtTokens(s.meanTokens)}</span><span class="group-stat-label">Tokens</span></div>`;
      html += `<div class="group-stat"><span class="group-stat-val">${fmtDuration(s.meanDurationMs)}</span><span class="group-stat-label">Duration</span></div>`;
      html += `</div>`;

      // Common failures
      if (s.commonFailures?.length > 0) {
        html += `<div class="group-failures">Common failures: ${s.commonFailures.map(f => `<span class="failure-tag">${esc(f)}</span>`).join('')}</div>`;
      }

      // Analysis findings
      if (ga?.findings) {
        html += `<div class="group-findings">${esc(ga.findings)}</div>`;
      }
      if (ga?.concerns?.length > 0) {
        html += `<div class="group-concerns">${ga.concerns.map(c => `<span class="concern-tag">${esc(c)}</span>`).join('')}</div>`;
      }

      // Run links
      html += `<div class="group-runs">Runs: ${runLinks}</div>`;

      html += `</div>`;
    }
  }

  root.innerHTML = html;
}
