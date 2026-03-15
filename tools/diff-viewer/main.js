import { esc, getDataPath, loadData, viewerLink } from '../shared.js';

const root = document.getElementById('root');
const dataPath = getDataPath();

if (!dataPath) {
  root.innerHTML = '<p>Missing <code>?data=</code> parameter.</p>';
} else {
  try {
    await loadData(dataPath);
    render(
      typeof diffContent !== 'undefined' ? diffContent : null,
      typeof diffMeta !== 'undefined' ? diffMeta : null,
    );
  } catch (err) {
    root.innerHTML = `<p>Failed to load data from <code>${esc(dataPath)}</code>.</p>`;
  }
}

function render(diffText, meta) {
  if (!diffText) {
    root.innerHTML = '<p>No diff data.</p>';
    return;
  }

  document.title = meta?.title ? `Diff — ${meta.title}` : 'Diff';

  const files = parseDiff(diffText);
  let totalAdd = 0;
  let totalDel = 0;
  for (const f of files) {
    for (const l of f.lines) {
      if (l.type === 'add') totalAdd++;
      else if (l.type === 'del') totalDel++;
    }
  }

  let html = `<h1>${esc(meta?.title || 'Changes')}</h1>`;
  if (meta?.runFolder) html += `<div class="meta">${esc(meta.runFolder)}</div>`;

  html += '<div class="stats">';
  html += `<div class="stat"><span class="stat-val">${files.length}</span> files</div>`;
  html += `<div class="stat"><span class="stat-val stat-add">+${totalAdd}</span> additions</div>`;
  html += `<div class="stat"><span class="stat-val stat-del">-${totalDel}</span> deletions</div>`;
  html += '</div>';

  html += '<div class="links">';
  html += `<a href="${viewerLink('eval-viewer', 'eval-data.js', dataPath)}">Eval Result</a>`;
  html += `<a href="${viewerLink('conversation-viewer', 'conversation-data.js', dataPath)}">View Conversation</a>`;
  html += '</div>';

  html += '<details class="file-list" open><summary>Files changed</summary><ul>';
  for (let i = 0; i < files.length; i++) {
    html += `<li><a href="#file-${i}">${esc(files[i].name)}</a></li>`;
  }
  html += '</ul></details>';

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    html += `<div class="diff-file" id="file-${i}">`;
    html += `<div class="diff-file-header">${esc(f.name)}</div>`;
    html += '<table class="diff-table">';
    for (const l of f.lines) {
      const cls = l.type === 'add' ? 'line-add' : l.type === 'del' ? 'line-del' : l.type === 'hunk' ? 'line-hunk' : '';
      const ln = l.type === 'hunk' ? '...' : (l.lineNum || '');
      html += `<tr class="${cls}"><td class="ln">${ln}</td><td class="code">${esc(l.text)}</td></tr>`;
    }
    html += '</table></div>';
  }

  root.innerHTML = html;
}

function parseDiff(text) {
  const files = [];
  let current = null;
  let lineNum = 0;

  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git')) {
      const match = raw.match(/b\/(.+)$/);
      current = { name: match ? match[1] : raw, lines: [] };
      files.push(current);
    } else if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/);
      lineNum = m ? parseInt(m[1], 10) : 1;
      if (current) current.lines.push({ type: 'hunk', text: raw, lineNum: null });
    } else if (current) {
      if (raw.startsWith('+') && !raw.startsWith('+++')) {
        current.lines.push({ type: 'add', text: raw.slice(1), lineNum: lineNum++ });
      } else if (raw.startsWith('-') && !raw.startsWith('---')) {
        current.lines.push({ type: 'del', text: raw.slice(1), lineNum: null });
      } else if (raw.startsWith(' ')) {
        current.lines.push({ type: 'ctx', text: raw.slice(1), lineNum: lineNum++ });
      }
    }
  }
  return files;
}
