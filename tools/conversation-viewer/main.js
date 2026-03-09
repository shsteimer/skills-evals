import { esc, getDataPath, loadData, viewerLink } from '../shared.js';

const root = document.getElementById('root');
const dataPath = getDataPath();

if (!dataPath) {
  root.innerHTML = '<p>Missing <code>?data=</code> parameter.</p>';
} else {
  try {
    await loadData(dataPath);
    render(
      typeof conversationEvents !== 'undefined' ? conversationEvents : null,
      typeof conversationMeta !== 'undefined' ? conversationMeta : null,
    );
  } catch (err) {
    root.innerHTML = `<p>Failed to load data from <code>${esc(dataPath)}</code>.</p>`;
  }
}

function render(events, meta) {
  if (!events?.length) {
    root.innerHTML = '<p>No conversation data.</p>';
    return;
  }

  document.title = meta?.title ? `Conversation — ${meta.title}` : 'Conversation';

  const resultEvent = events.find(e => e.type === 'result');
  let step = 0;

  let html = `<h1>${esc(meta?.title || 'Agent Conversation')}</h1>`;
  if (meta?.runFolder) html += `<div class="meta">${esc(meta.runFolder)}</div>`;

  if (resultEvent) {
    html += '<div class="stats">';
    if (resultEvent.cost) html += `<div class="stat"><span class="stat-val">$${resultEvent.cost.toFixed(4)}</span> cost</div>`;
    if (resultEvent.duration) html += `<div class="stat"><span class="stat-val">${(resultEvent.duration / 1000).toFixed(1)}s</span> duration</div>`;
    if (resultEvent.turns) html += `<div class="stat"><span class="stat-val">${resultEvent.turns}</span> turns</div>`;
    html += '</div>';
  }

  html += '<div class="links">';
  html += `<a href="${viewerLink('eval-viewer', 'eval-data.js', dataPath)}">Eval Result</a>`;
  html += `<a href="${viewerLink('diff-viewer', 'diff-data.js', dataPath)}">View Diff</a>`;
  html += '</div>';

  if (meta?.prompt) {
    html += `<div class="event event-prompt">
      <div class="step-num">Prompt</div>
      <div class="text-content">${esc(meta.prompt)}</div>
    </div>`;
  }

  for (const e of events) {
    if (e.type === 'assistant_text') {
      step++;
      html += `<div class="event event-assistant" id="step-${step}">
        <div class="step-num">Step ${step}</div>
        <div class="text-content">${esc(e.text)}</div>
      </div>`;
    } else if (e.type === 'tool_call') {
      html += `<div class="event event-tool">
        <span class="tool-name">${esc(e.tool)}</span>
        <div class="tool-input">${esc(e.input)}</div>
      </div>`;
    } else if (e.type === 'subagent_completed') {
      html += '<div class="event event-subagent">Subagent completed</div>';
    } else if (e.type === 'result') {
      html += `<div class="event event-result">
        <div class="step-num">Result: ${esc(e.subtype || 'done')}</div>
        <div class="text-content">${[
          e.cost ? `Cost: $${e.cost.toFixed(4)}` : null,
          e.duration ? `Duration: ${(e.duration / 1000).toFixed(1)}s` : null,
          e.turns ? `Turns: ${e.turns}` : null,
        ].filter(Boolean).join('\n')}</div>
      </div>`;
    }
  }

  root.innerHTML = html;
}
