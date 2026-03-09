import { esc, getDataPath, loadData, viewerLink } from '../shared.js';

const root = document.getElementById('root');
const dataPath = getDataPath();

if (!dataPath) {
  root.innerHTML = '<p>Missing <code>?data=</code> parameter.</p>';
} else {
  try {
    await loadData(dataPath);
    render(typeof compareData !== 'undefined' ? compareData : null);
  } catch (err) {
    root.innerHTML = `<p>Failed to load data from <code>${esc(dataPath)}</code>.</p>`;
  }
}

function render(d) {
  if (!d) { root.innerHTML = '<p>No comparison data.</p>'; return; }

  document.title = `Comparison \u2014 ${d.passed ? 'PASS' : 'FAIL'}`;

  const fmtNum = (v, digits = 3) => v == null ? 'n/a' : v.toFixed(digits);
  const fmtPct = (v) => v == null ? 'n/a' : (v * 100).toFixed(1) + '%';
  const fmtTokens = (v) => v == null ? 'n/a' : v.toLocaleString();

  let html = `
    <h1>A/B Comparison Report</h1>
    <div class="meta">
      Baseline: <code>${esc(d.baselineDir)}</code><br>
      Candidate: <code>${esc(d.candidateDir)}</code>
    </div>

    <div class="gate-banner ${d.passed ? 'pass' : 'fail'}">
      <span class="gate-icon">${d.passed ? '\u2705' : '\u274C'}</span>
      Gate: ${d.passed ? 'PASS' : 'FAIL'}
      ${d.softFailed ? '<span style="font-weight:400;font-size:0.875rem;margin-left:0.5rem">(soft-fail: ' + esc(d.softFailReason) + ')</span>' : ''}
    </div>

    <div class="stats-grid">
      <div class="stat"><div class="stat-val">${d.comparedCount}</div><div class="stat-label">Compared</div></div>
      <div class="stat"><div class="stat-val green">${d.measurableGains}</div><div class="stat-label">Gains</div></div>
      <div class="stat"><div class="stat-val red">${d.qualityRegressions}</div><div class="stat-label">Regressions</div></div>
      <div class="stat"><div class="stat-val amber">${d.scoringFailures}</div><div class="stat-label">Scoring Failures</div></div>
      <div class="stat"><div class="stat-val">${d.skippedNotRelevant}</div><div class="stat-label">Skipped</div></div>
    </div>`;

  const b = d.baselineTotals;
  const c = d.candidateTotals;
  html += `
    <h2>Aggregate Metrics</h2>
    <table class="agg-table">
      <thead><tr><th>Variant</th><th class="num">Runs</th><th class="num">Avg Score</th><th class="num">Success Rate</th><th class="num">Total Tokens</th></tr></thead>
      <tbody>
        <tr><td>Baseline</td><td class="num">${b.runCount}</td><td class="num">${fmtNum(b.avgScore)}</td><td class="num">${fmtPct(b.successRate)}</td><td class="num">${fmtTokens(b.totalTokens)}</td></tr>
        <tr><td>Candidate</td><td class="num">${c.runCount}</td><td class="num">${fmtNum(c.avgScore)}</td><td class="num">${fmtPct(c.successRate)}</td><td class="num">${fmtTokens(c.totalTokens)}</td></tr>
      </tbody>
    </table>`;

  html += `
    <h2>Per-Task Results</h2>
    <table class="task-table">
      <thead><tr><th>Task</th><th>Agent</th><th class="num">Baseline</th><th class="num">Candidate</th><th class="num">Score Delta</th><th class="num">Tokens</th><th class="num">Duration</th><th>Status</th><th>Details</th></tr></thead>
      <tbody>`;

  for (const comp of d.comparisons) {
    const bScore = fmtNum(comp.baseline?.score);
    const cScore = fmtNum(comp.candidate?.score);

    let statusBadge, deltaStr;
    if (!comp.relevant) {
      statusBadge = '<span class="badge skipped">Skipped</span>';
      deltaStr = '<span class="delta zero">\u2014</span>';
    } else if (comp.scoringFailure) {
      statusBadge = '<span class="badge error">Error</span>';
      deltaStr = '<span class="delta zero">\u2014</span>';
    } else if (comp.qualityImproved) {
      statusBadge = '<span class="badge improved">Improved</span>';
      deltaStr = `<span class="delta pos">+${fmtNum(comp.qualityDelta)}</span>`;
    } else if (comp.qualityRegressed) {
      statusBadge = '<span class="badge regressed">Regressed</span>';
      deltaStr = `<span class="delta neg">${fmtNum(comp.qualityDelta)}</span>`;
    } else if (comp.efficiencyGain) {
      statusBadge = '<span class="badge improved">Efficiency</span>';
      deltaStr = '<span class="delta zero">0.000</span>';
    } else {
      statusBadge = '<span class="badge stable">Stable</span>';
      deltaStr = '<span class="delta zero">0.000</span>';
    }

    const fmtDelta = (v, unit) => {
      if (v == null) return '<span class="delta zero">\u2014</span>';
      const abs = unit === 'ms' ? (Math.abs(v) / 1000).toFixed(1) + 's' : Math.abs(v).toLocaleString();
      if (v < 0) return `<span class="delta pos">\u2193${abs}</span>`;
      if (v > 0) return `<span class="delta neg">\u2191${abs}</span>`;
      return '<span class="delta zero">0</span>';
    };

    // Drill links point to eval-viewer with the run's eval-data.js
    const evalViewerBase = `../eval-viewer/index.html?data=`;
    const bLink = comp.baseline?.folderName
      ? `<a class="drill" href="${evalViewerBase}${esc(d.baselineDirName)}/${esc(comp.baseline.folderName)}/eval-data.js">baseline</a>`
      : '';
    const cLink = comp.candidate?.folderName
      ? `<a class="drill" href="${evalViewerBase}${esc(d.candidateDirName)}/${esc(comp.candidate.folderName)}/eval-data.js">candidate</a>`
      : '';

    html += '<tr>' +
      `<td>${esc(comp.task)}</td>` +
      `<td>${esc(comp.agent)}</td>` +
      `<td class="num">${bScore}</td>` +
      `<td class="num">${cScore}</td>` +
      `<td class="num">${deltaStr}</td>` +
      `<td class="num">${fmtDelta(comp.tokenDelta)}</td>` +
      `<td class="num">${fmtDelta(comp.durationDelta, 'ms')}</td>` +
      `<td>${statusBadge}</td>` +
      `<td>${[bLink, cLink].filter(Boolean).join(' \u00b7 ')}</td>` +
      '</tr>';
  }

  html += '</tbody></table>';
  root.innerHTML = html;
}
