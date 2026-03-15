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

  if (d.mode === 'aggregate') {
    renderAggregate(d);
  } else {
    renderLegacy(d);
  }
}

function renderAggregate(d) {
  document.title = 'Batch Comparison';

  const fmtNum = (v, digits = 1) => v == null ? 'n/a' : v.toFixed(digits);
  const fmtPct = (v) => v == null ? 'n/a' : (v * 100).toFixed(1) + '%';
  const fmtTokens = (v) => v == null ? 'n/a' : Math.round(v).toLocaleString();
  const fmtDuration = (v) => v == null ? 'n/a' : (v / 1000).toFixed(1) + 's';

  // For score/success deltas: up = good (green), down = bad (red)
  const fmtScorelikeDelta = (v, unit) => {
    if (v == null) return '<span class="delta zero">\u2014</span>';
    const abs = unit === 'pct' ? (Math.abs(v) * 100).toFixed(1) + '%' : Math.abs(v).toFixed(1);
    if (v > 0.001) return `<span class="delta pos">\u2191${abs}</span>`;
    if (v < -0.001) return `<span class="delta neg">\u2193${abs}</span>`;
    return '<span class="delta zero">0</span>';
  };

  // For token/duration deltas: up = bad (red), down = good (green)
  const fmtCostDelta = (v, unit) => {
    if (v == null) return '<span class="delta zero">\u2014</span>';
    const abs = unit === 'ms' ? (Math.abs(v) / 1000).toFixed(1) + 's' : Math.abs(v).toFixed(1);
    if (v > 0.001) return `<span class="delta neg">\u2191${abs}</span>`;
    if (v < -0.001) return `<span class="delta pos">\u2193${abs}</span>`;
    return '<span class="delta zero">0</span>';
  };

  const fmtScoreDelta = (v) => {
    if (v == null) return '<span class="delta zero">\u2014</span>';
    const abs = Math.abs(v).toFixed(1);
    if (v > 0.001) return `<span class="delta pos">+${abs}</span>`;
    if (v < -0.001) return `<span class="delta neg">${(-Math.abs(v)).toFixed(1)}</span>`;
    return '<span class="delta zero">0.0</span>';
  };

  // Build batch viewer links from timestamps
  const baselineTs = d.baselineBatch?.timestamp;
  const candidateTs = d.candidateBatch?.timestamp;
  const batchViewerBase = '/tools/batch-viewer/index.html?data=';

  const baselineLink = baselineTs
    ? `<a href="${batchViewerBase}/results/${esc(baselineTs)}/batch-summary-data.js">${esc(baselineTs)}</a>`
    : `<code>${esc(d.baselineDir)}</code>`;
  const candidateLink = candidateTs
    ? `<a href="${batchViewerBase}/results/${esc(candidateTs)}/batch-summary-data.js">${esc(candidateTs)}</a>`
    : `<code>${esc(d.candidateDir)}</code>`;

  const baselineAugName = d.baselineBatch?.augmentationSetName || 'None';
  const candidateAugName = d.candidateBatch?.augmentationSetName || 'None';

  let html = `<h1>Batch Comparison</h1>
    <div class="meta">
      Baseline: ${baselineLink} <span class="aug-label">(${esc(baselineAugName)})</span><br>
      Candidate: ${candidateLink} <span class="aug-label">(${esc(candidateAugName)})</span>
    </div>`;

  // Recommendation — up front
  const analysis = d.analysis;
  if (analysis) {
    const recClass = analysis.recommendation === 'yes' ? 'recommend-yes'
      : analysis.recommendation === 'no' ? 'recommend-no'
      : 'recommend-inconclusive';

    const recLabel = analysis.recommendation === 'yes' ? 'Adopt candidate'
      : analysis.recommendation === 'no' ? 'Keep baseline'
      : 'Inconclusive';

    html += `
      <div class="recommendation ${recClass}">
        <div class="recommendation-header">
          <span class="recommendation-verdict">${esc(recLabel)}</span>
          ${analysis.confidence ? `<span class="recommendation-confidence">${esc(analysis.confidence)} confidence</span>` : ''}
        </div>
        ${analysis.comparisonSummary ? `<p class="recommendation-summary">${esc(analysis.comparisonSummary)}</p>` : ''}
      </div>`;
  }

  // Stats grid — key deltas at a glance
  const bs = d.baselineStats;
  const cs = d.candidateStats;

  const improved = (d.matched || []).filter(m => m.scoreDelta > 0.5).length;
  const regressed = (d.matched || []).filter(m => m.scoreDelta < -0.5).length;
  const stable = (d.matched || []).length - improved - regressed;

  html += `
    <div class="stats-grid">
      <div class="stat"><div class="stat-val">${d.matched?.length || 0}</div><div class="stat-label">Groups Compared</div></div>
      <div class="stat"><div class="stat-val green">${improved}</div><div class="stat-label">Improved</div></div>
      <div class="stat"><div class="stat-val red">${regressed}</div><div class="stat-label">Regressed</div></div>
      <div class="stat"><div class="stat-val">${stable}</div><div class="stat-label">Stable</div></div>
    </div>`;

  // Overall comparison table
  html += `
    <h2>Overall</h2>
    <table class="agg-table">
      <thead><tr><th>Variant</th><th class="num">Runs</th><th class="num">Score %</th><th class="num">Success Rate</th><th class="num">Mean Tokens</th><th class="num">Mean Duration</th></tr></thead>
      <tbody>
        <tr><td>Baseline</td><td class="num">${bs.totalRuns}</td><td class="num">${fmtPct(bs.meanScorePct)}</td><td class="num">${fmtPct(bs.successRate)}</td><td class="num">${fmtTokens(bs.meanTokens)}</td><td class="num">${fmtDuration(bs.meanDurationMs)}</td></tr>
        <tr><td>Candidate</td><td class="num">${cs.totalRuns}</td><td class="num">${fmtPct(cs.meanScorePct)}</td><td class="num">${fmtPct(cs.successRate)}</td><td class="num">${fmtTokens(cs.meanTokens)}</td><td class="num">${fmtDuration(cs.meanDurationMs)}</td></tr>
        <tr class="delta-row"><td>Delta</td><td class="num">\u2014</td><td class="num">${fmtScorelikeDelta(d.overallScorePctDelta, 'pct')}</td><td class="num">${fmtScorelikeDelta(d.overallSuccessRateDelta, 'pct')}</td><td class="num">${fmtCostDelta(d.overallTokensDelta)}</td><td class="num">${fmtCostDelta(d.overallDurationDelta, 'ms')}</td></tr>
      </tbody>
    </table>`;

  // Per-task breakdown with agent cards
  if (d.matched && d.matched.length > 0) {
    // Group by task
    const byTask = new Map();
    for (const m of d.matched) {
      if (!byTask.has(m.task)) byTask.set(m.task, []);
      byTask.get(m.task).push(m);
    }

    html += `<h2>Per Task</h2>`;

    for (const [task, agents] of byTask) {
      // Task-level aggregate: average the deltas across agents for this task
      const taskImproved = agents.filter(m => m.scoreDelta > 0.5).length;
      const taskRegressed = agents.filter(m => m.scoreDelta < -0.5).length;
      const avgScoreDelta = agents.reduce((s, m) => s + (m.scoreDelta || 0), 0) / agents.length;

      const taskVerdict = taskRegressed > 0 && taskImproved === 0 ? 'regressed'
        : taskImproved > 0 && taskRegressed === 0 ? 'improved'
        : taskImproved > 0 && taskRegressed > 0 ? 'mixed'
        : 'stable';

      const taskBadgeClass = taskVerdict === 'regressed' ? 'regressed'
        : taskVerdict === 'improved' ? 'improved'
        : taskVerdict === 'mixed' ? 'mixed'
        : 'stable';

      html += `<div class="task-section">`;
      html += `<div class="task-header">`;
      html += `<span class="task-name">${esc(task)}</span>`;
      html += `<span class="task-summary">`;
      html += `${agents.length} agent${agents.length !== 1 ? 's' : ''} `;
      html += `<span class="badge ${taskBadgeClass}">${esc(taskVerdict)}</span> `;
      html += `avg score delta: ${fmtScoreDelta(avgScoreDelta)}`;
      html += `</span>`;
      html += `</div>`;

      for (const m of agents) {
        html += renderGroupCard(m, { fmtPct, fmtNum, fmtTokens, fmtDuration, fmtScoreDelta });
      }

      html += `</div>`;
    }
  }

  // Unmatched groups
  if (d.baselineOnly && d.baselineOnly.length > 0) {
    html += `<h3>Baseline Only</h3><p class="unmatched">${d.baselineOnly.map(k => `<code>${esc(k)}</code>`).join(', ')}</p>`;
  }
  if (d.candidateOnly && d.candidateOnly.length > 0) {
    html += `<h3>Candidate Only</h3><p class="unmatched">${d.candidateOnly.map(k => `<code>${esc(k)}</code>`).join(', ')}</p>`;
  }

  root.innerHTML = html;
}

function renderGroupCard(m, fmt) {
  const { fmtPct, fmtNum, fmtTokens, fmtDuration, fmtScoreDelta } = fmt;
  const ga = m.analysis;

  const verdict = ga?.verdict || (m.scoreDelta > 0.5 ? 'improved' : m.scoreDelta < -0.5 ? 'regressed' : 'stable');
  const cardClass = verdict === 'regressed' ? 'group-card regressed'
    : verdict === 'improved' ? 'group-card improved'
    : 'group-card stable';

  let statusBadge;
  if (verdict === 'improved') statusBadge = '<span class="badge improved">Improved</span>';
  else if (verdict === 'regressed') statusBadge = '<span class="badge regressed">Regressed</span>';
  else statusBadge = '<span class="badge stable">Stable</span>';

  let html = `<div class="${cardClass}">`;
  html += `<div class="group-header">`;
  html += `<div class="group-title"><span class="agent-name">${esc(m.agent)}</span></div>`;
  html += `<div class="group-status">${statusBadge}</div>`;
  html += `</div>`;

  const bScore = m.baseline.meanScorePct != null ? fmtPct(m.baseline.meanScorePct) : fmtNum(m.baseline.meanScore);
  const cScore = m.candidate.meanScorePct != null ? fmtPct(m.candidate.meanScorePct) : fmtNum(m.candidate.meanScore);

  html += `<div class="group-stats">`;
  html += `<div class="group-stat"><span class="group-stat-val">${bScore} \u2192 ${cScore}</span><span class="group-stat-label">Score</span></div>`;
  html += `<div class="group-stat"><span class="group-stat-val">${fmtScoreDelta(m.scoreDelta)}</span><span class="group-stat-label">Score Delta</span></div>`;
  html += `<div class="group-stat"><span class="group-stat-val">${fmtPct(m.baseline.successRate)} \u2192 ${fmtPct(m.candidate.successRate)}</span><span class="group-stat-label">Success Rate</span></div>`;
  html += `<div class="group-stat"><span class="group-stat-val">${fmtTokens(m.baseline.meanTokens)} \u2192 ${fmtTokens(m.candidate.meanTokens)}</span><span class="group-stat-label">Tokens</span></div>`;
  html += `<div class="group-stat"><span class="group-stat-val">${fmtDuration(m.baseline.meanDurationMs)} \u2192 ${fmtDuration(m.candidate.meanDurationMs)}</span><span class="group-stat-label">Duration</span></div>`;
  html += `</div>`;

  const bFailures = new Set(m.baseline.commonFailures || []);
  const cFailures = new Set(m.candidate.commonFailures || []);
  const newFailures = [...cFailures].filter(f => !bFailures.has(f));
  const fixedFailures = [...bFailures].filter(f => !cFailures.has(f));

  if (newFailures.length > 0) {
    html += `<div class="group-failures">New failures: ${newFailures.map(f => `<span class="failure-tag">${esc(f)}</span>`).join('')}</div>`;
  }
  if (fixedFailures.length > 0) {
    html += `<div class="group-fixed">Fixed: ${fixedFailures.map(f => `<span class="fixed-tag">${esc(f)}</span>`).join('')}</div>`;
  }

  if (ga?.reasoning) {
    html += `<div class="group-findings">${esc(ga.reasoning)}</div>`;
  }

  html += `</div>`;
  return html;
}

function renderLegacy(d) {
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
