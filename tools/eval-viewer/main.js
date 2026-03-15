import { esc, getDataPath, loadData, viewerLink, dataDir } from '../shared.js';

const root = document.getElementById('root');
const dataPath = getDataPath();

if (!dataPath) {
  root.innerHTML = '<p>Missing <code>?data=</code> parameter.</p>';
} else {
  try {
    await loadData(dataPath);
    render(
      typeof evalData !== 'undefined' ? evalData : null,
      typeof runMetrics !== 'undefined' ? runMetrics : null,
    );
  } catch (err) {
    root.innerHTML = `<p>Failed to load data from <code>${esc(dataPath)}</code>.</p>`;
  }
}

// Expose for lightbox onclick
window.showLightbox = function (src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('active');
};

function render(d, m) {
  if (!d) { root.innerHTML = '<p>No evaluation data.</p>'; return; }

  const pass = d.overallSuccess;
  const scoreFmt = typeof d.score === 'number' ? String(d.score) : 'N/A';
  const maxScore = typeof d.maxScore === 'number' ? d.maxScore : null;
  const maxFmt = maxScore !== null ? String(maxScore) : '?';
  const pct = (typeof d.score === 'number' && maxScore) ? (d.score / maxScore * 100) : 0;

  document.title = `${d.task} \u2014 ${d.agent} \u2014 ${scoreFmt}`;

  const metaParts = [d.agent];
  if (d.model) metaParts.push(d.model);
  if (d.augmentationSetName) metaParts.push(d.augmentationSetName);
  if (d.iteration) metaParts.push(`Iteration ${d.iteration}`);

  let html = `
    <h1>${esc(d.task)}</h1>
    <div class="meta">${esc(metaParts.join(' · '))}</div>
    <div class="score-banner ${pass ? 'pass' : 'fail'}">
      <div>
        <div class="score-num">${scoreFmt}</div>
        <div class="score-label">/ ${maxFmt}</div>
      </div>
      <div class="score-bar-track"><div class="score-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
      <div class="badge ${pass ? 'met' : 'not-met'}">${pass ? 'PASS' : 'FAIL'}</div>
    </div>`;

  if (m) {
    const dur = typeof m.durationMs === 'number' ? (m.durationMs / 1000).toFixed(1) + 's' : null;
    const tok = m.tokenUsage;
    html += '<div class="metrics">';
    if (dur) html += `<div class="metric"><div class="metric-val">${dur}</div><div class="metric-label">Duration</div></div>`;
    if (tok?.totalTokens) html += `<div class="metric"><div class="metric-val">${tok.totalTokens.toLocaleString()}</div><div class="metric-label">Total Tokens</div></div>`;
    if (tok?.inputTokens) html += `<div class="metric"><div class="metric-val">${tok.inputTokens.toLocaleString()}</div><div class="metric-label">Input Tokens</div></div>`;
    if (tok?.outputTokens) html += `<div class="metric"><div class="metric-val">${tok.outputTokens.toLocaleString()}</div><div class="metric-label">Output Tokens</div></div>`;
    if (tok?.costUsd) html += `<div class="metric"><div class="metric-val">$${tok.costUsd.toFixed(4)}</div><div class="metric-label">Est. Cost</div></div>`;
    html += '</div>';
  }

  if (d.summary) {
    html += `<div class="summary">${esc(d.summary)}</div>`;
  }

  const hasInsights = d.strengths?.length || d.weaknesses?.length || d.observations?.length;
  if (hasInsights) {
    html += '<div class="insights">';
    for (const [key, label] of [['strengths', 'STRENGTHS'], ['weaknesses', 'WEAKNESSES'], ['observations', 'OBSERVATIONS']]) {
      html += `<div class="insight-col ${key}"><h3>${label}</h3>`;
      html += d[key]?.length
        ? `<ul class="list ${key}">${d[key].map(s => `<li>${esc(s)}</li>`).join('')}</ul>`
        : '<p style="color:var(--muted);font-size:0.875rem">None noted</p>';
      html += '</div>';
    }
    html += '</div>';
  }

  if (d.screenshots?.length) {
    const assetBase = '/' + dataDir(dataPath);
    html += '<h2>Screenshots</h2><div class="screenshots">';
    for (const s of d.screenshots) {
      let rawSrc = s.path || s.url || '';
      if (!rawSrc && s.filename) rawSrc = 'screenshots/' + s.filename;
      const src = rawSrc.startsWith('/') || rawSrc.startsWith('http') ? rawSrc : assetBase + rawSrc;
      const cap = s.caption || s.label || s.description || '';
      html += `<div class="screenshot"><img src="${esc(src)}" alt="${esc(cap)}" onclick="showLightbox(this.src)"><div class="caption">${esc(cap)}</div></div>`;
    }
    html += '</div>';
  }

  html += '<div class="links">';
  if (d.runSetId) {
    const batchDir = dataDir(dataPath).replace(/[^/]+\/[^/]*$/, '');
    html += `<a href="/tools/batch-viewer/index.html?data=${batchDir}batch-summary-data.js">Batch Summary</a>`;
  }
  html += `<a href="${viewerLink('diff-viewer', 'diff-data.js', dataPath)}">View Diff</a>`;
  html += `<a href="${viewerLink('conversation-viewer', 'conversation-data.js', dataPath)}">View Conversation</a>`;
  html += '</div>';

  if (d.criteriaChecks?.length) {
    html += '<h2>Criteria</h2>';
    const sections = groupBySection(d.criteriaChecks);
    for (const [sectionName, checks] of sections) {
      if (sections.length > 1 && sectionName) {
        html += `<div class="criteria-section"><div class="criteria-section-title">${esc(sectionName)}</div>`;
      }
      html += '<table class="criteria-table"><thead><tr><th>Criterion</th><th>Priority</th><th>Source</th><th>Status</th><th>Points</th></tr></thead><tbody>';
      for (const c of checks) {
        const cls = c.met ? 'met' : 'not-met';
        const prCls = c.priority || 'important';
        const pts = c.points || 0;
        const ptsCls = pts > 0 ? 'earned' : c.met ? 'zero' : 'not-earned';
        const ptsFmt = pts > 0 ? `+${pts}` : '0';
        const src = c.source || 'judgment';
        html += `<tr>
          <td>${esc(c.name)}${c.notes ? `<div class="notes">${esc(c.notes)}</div>` : ''}</td>
          <td><span class="badge ${prCls}">${prCls}</span></td>
          <td><span class="badge ${src}">${src}</span></td>
          <td><span class="badge ${cls}">${c.met ? 'Met' : 'Not Met'}</span></td>
          <td class="points ${ptsCls}">${ptsFmt}</td>
        </tr>`;
      }
      html += '</tbody></table>';
      if (sections.length > 1 && sectionName) html += '</div>';
    }
  }

  root.innerHTML = html;
}

function groupBySection(checks) {
  const ordered = new Map();
  for (const c of checks) {
    const section = c.section || '';
    if (!ordered.has(section)) ordered.set(section, []);
    ordered.get(section).push(c);
  }
  const entries = [...ordered.entries()];
  if (entries.length === 1 && !entries[0][0]) return entries;
  return entries;
}
