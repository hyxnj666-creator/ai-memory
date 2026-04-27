export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ai-memory Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#111827', light: '#1f2937' },
      }
    }
  }
}
</script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  body { font-family: 'Inter', system-ui, sans-serif; }
  .nav-link { transition: all 0.15s; }
  .nav-link.active { color: #818cf8; border-bottom: 2px solid #818cf8; }
  .card-hover { transition: all 0.2s; }
  .card-hover:hover { transform: translateY(-1px); box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
  .fade-in { animation: fadeIn 0.3s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .type-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 9999px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .graph-tooltip { position: absolute; background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 8px 12px; font-size: 13px; pointer-events: none; z-index: 50; max-width: 300px; }
  #graph-container svg { width: 100%; height: 100%; }
  .memory-detail-overlay { backdrop-filter: blur(4px); }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
</style>
</head>
<body class="dark bg-gray-950 text-gray-100 min-h-screen">

<!-- Nav -->
<nav class="sticky top-0 z-40 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
  <div class="max-w-7xl mx-auto px-6 flex items-center h-14">
    <div class="flex items-center gap-2 mr-8">
      <span class="text-lg">🧠</span>
      <span class="font-bold text-white">ai-memory</span>
      <span class="text-xs text-gray-500 ml-1">dashboard</span>
    </div>
    <div class="flex gap-1">
      <button onclick="navigate('overview')" data-nav="overview" class="nav-link px-3 py-3.5 text-sm text-gray-400 hover:text-white">Overview</button>
      <button onclick="navigate('memories')" data-nav="memories" class="nav-link px-3 py-3.5 text-sm text-gray-400 hover:text-white">Memories</button>
      <button onclick="navigate('conversations')" data-nav="conversations" class="nav-link px-3 py-3.5 text-sm text-gray-400 hover:text-white">Conversations</button>
      <button onclick="navigate('graph')" data-nav="graph" class="nav-link px-3 py-3.5 text-sm text-gray-400 hover:text-white">Graph</button>
      <button onclick="navigate('quality')" data-nav="quality" class="nav-link px-3 py-3.5 text-sm text-gray-400 hover:text-white">Quality</button>
      <button onclick="navigate('export')" data-nav="export" class="nav-link px-3 py-3.5 text-sm text-gray-400 hover:text-white">Export</button>
    </div>
  </div>
</nav>

<!-- Main -->
<main id="app" class="max-w-7xl mx-auto px-6 py-8"></main>

<!-- Memory detail modal -->
<div id="detail-overlay" class="memory-detail-overlay fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4" onclick="if(event.target===this)closeDetail()">
  <div id="detail-content" class="bg-gray-900 rounded-xl border border-gray-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 fade-in"></div>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
// === Config ===
const TYPE_COLORS = {
  decision: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', hex: '#3b82f6', dot: 'bg-blue-500' },
  architecture: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#a855f7', dot: 'bg-purple-500' },
  convention: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', hex: '#10b981', dot: 'bg-emerald-500' },
  todo: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', hex: '#f59e0b', dot: 'bg-amber-500' },
  issue: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', hex: '#f43f5e', dot: 'bg-rose-500' },
};
const TYPE_ICONS = { decision: '⚖️', architecture: '🏗️', convention: '📏', todo: '✅', issue: '🐛' };

// === State ===
let currentView = 'overview';
let memories = [];
let stats = null;
let graphData = null;
let qualityData = null;
let conversationsData = null;
let selectedConvoId = null;
// Pagination state. Page size is shared across Memories tab and Conversations
// memory list — both routinely cross 100+ items at v2.4 scale (one CCEB
// fixture conversation alone yielded 268 memories in real-world testing).
const PAGE_SIZE = 50;
let memListPage = 1;
let memListFiltered = [];   // cached filter result, so the pager can re-slice without re-running the full query
let convoMemPage = 1;

// === API ===
async function api(path) {
  const res = await fetch('/api/' + path);
  return res.json();
}

// === Router ===
function navigate(view) {
  currentView = view;
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === view);
  });
  render();
}

// === Render ===
async function render() {
  const app = document.getElementById('app');
  switch (currentView) {
    case 'overview': await renderOverview(app); break;
    case 'memories': await renderMemories(app); break;
    case 'conversations': await renderConversations(app); break;
    case 'graph': await renderGraph(app); break;
    case 'quality': await renderQuality(app); break;
    case 'export': await renderExport(app); break;
  }
}

// === Overview ===
async function renderOverview(app) {
  if (!stats) stats = await api('stats');
  const s = stats;

  const typeCards = Object.entries(s.byType).map(([type, count]) => {
    const c = TYPE_COLORS[type] || TYPE_COLORS.decision;
    const icon = TYPE_ICONS[type] || '📝';
    return \`<div class="rounded-xl border \${c.border} \${c.bg} p-4 card-hover">
      <div class="flex items-center justify-between mb-2">
        <span class="text-2xl">\${icon}</span>
        <span class="\${c.text} text-2xl font-bold">\${count}</span>
      </div>
      <div class="text-sm text-gray-400 capitalize">\${type}s</div>
    </div>\`;
  }).join('');

  const authorCards = Object.entries(s.byAuthor).map(([author, count]) =>
    \`<div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-800/50">
      <span class="text-sm text-gray-300">\${author}</span>
      <span class="text-sm font-medium text-gray-400">\${count}</span>
    </div>\`
  ).join('');

  const recentList = s.recent.map(m => {
    const c = TYPE_COLORS[m.type] || TYPE_COLORS.decision;
    const icon = TYPE_ICONS[m.type] || '📝';
    const detailArg = attrJson(m);
    const sidArg = m.sourceId ? attrJson(m.sourceId) : null;
    const sourceChip = m.sourceTitle && sidArg
      ? \`<button onclick="event.stopPropagation(); jumpToConversation(\${sidArg})"
           class="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 hover:underline truncate max-w-[280px]"
           title="Open this conversation in the Conversations tab">
           💬 \${esc(m.sourceTitle)}
         </button>\`
      : '';
    return \`<div class="flex items-start gap-3 py-3 px-3 rounded-lg hover:bg-gray-800/50 cursor-pointer" onclick='showDetail(\${detailArg})'>
      <span class="text-base mt-0.5">\${icon}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-gray-200 truncate">\${esc(m.title)}</div>
        <div class="flex items-center gap-2 text-xs text-gray-500 mt-0.5 min-w-0">
          <span class="shrink-0">\${m.date}\${m.author ? ' · ' + esc(m.author) : ''}</span>
          \${sourceChip ? '<span class="text-gray-700 shrink-0">·</span>' + sourceChip : ''}
        </div>
      </div>
      <span class="type-badge \${c.bg} \${c.text} \${c.border} border shrink-0">\${m.type}</span>
    </div>\`;
  }).join('');

  // Timeline chart
  const maxCount = Math.max(...s.byMonth.map(m => m.count), 1);
  const timelineBars = s.byMonth.slice(-12).map(m => {
    const h = Math.max(4, (m.count / maxCount) * 120);
    return \`<div class="flex flex-col items-center gap-1 flex-1">
      <span class="text-xs text-gray-500">\${m.count}</span>
      <div class="w-full bg-indigo-500/60 rounded-t" style="height:\${h}px"></div>
      <span class="text-xs text-gray-600 -rotate-45 origin-top-left whitespace-nowrap">\${m.month.slice(5)}</span>
    </div>\`;
  }).join('');

  app.innerHTML = \`<div class="fade-in">
    <!-- Hero stats -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      <div class="col-span-1 rounded-xl border border-gray-700 bg-gray-900 p-4 card-hover">
        <div class="text-3xl font-bold text-white">\${s.total}</div>
        <div class="text-sm text-gray-400 mt-1">Total Memories</div>
      </div>
      \${typeCards}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Timeline -->
      <div class="lg:col-span-2 rounded-xl border border-gray-700 bg-gray-900 p-6">
        <h3 class="text-sm font-semibold text-gray-300 mb-4">Timeline (Monthly)</h3>
        <div class="flex items-end gap-1 h-40">\${timelineBars || '<span class="text-gray-600 text-sm">No data</span>'}</div>
      </div>

      <!-- Authors -->
      <div class="rounded-xl border border-gray-700 bg-gray-900 p-6">
        <h3 class="text-sm font-semibold text-gray-300 mb-4">Authors</h3>
        <div class="space-y-1">\${authorCards || '<span class="text-gray-600 text-sm">No authors</span>'}</div>
        <div class="mt-4 pt-4 border-t border-gray-800 flex justify-between text-sm">
          <span class="text-emerald-400">\${s.active} active</span>
          <span class="text-gray-500">\${s.resolved} resolved</span>
        </div>
      </div>
    </div>

    <!-- Recent -->
    <div class="mt-6 rounded-xl border border-gray-700 bg-gray-900 p-6">
      <h3 class="text-sm font-semibold text-gray-300 mb-4">Recent Memories</h3>
      <div class="space-y-1">\${recentList || '<span class="text-gray-600 text-sm">No memories yet</span>'}</div>
    </div>
  </div>\`;
}

// === Memories ===
async function renderMemories(app) {
  if (!memories.length) memories = await api('memories');

  const types = [...new Set(memories.map(m => m.type))].sort();
  const authors = [...new Set(memories.filter(m => m.author).map(m => m.author))].sort();

  app.innerHTML = \`<div class="fade-in">
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <div class="relative flex-1 min-w-[200px]">
        <input id="mem-search" type="text" placeholder="Search memories..."
          class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
          oninput="filterMemoriesUI()" />
      </div>
      <select id="mem-type" class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500/50" onchange="filterMemoriesUI()">
        <option value="">All types</option>
        \${types.map(t => '<option value="'+t+'">'+TYPE_ICONS[t]+' '+t+'</option>').join('')}
      </select>
      <select id="mem-author" class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500/50" onchange="filterMemoriesUI()">
        <option value="">All authors</option>
        \${authors.map(a => '<option value="'+a+'">'+a+'</option>').join('')}
      </select>
      <select id="mem-status" class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:border-indigo-500/50" onchange="filterMemoriesUI()">
        <option value="">All status</option>
        <option value="active">Active</option>
        <option value="resolved">Resolved</option>
      </select>
      <span id="mem-count" class="text-sm text-gray-500"></span>
    </div>

    <!-- List -->
    <div id="mem-list" class="space-y-2"></div>
  </div>\`;

  filterMemoriesUI();
}

function filterMemoriesUI() {
  const q = document.getElementById('mem-search')?.value?.toLowerCase() || '';
  const type = document.getElementById('mem-type')?.value || '';
  const author = document.getElementById('mem-author')?.value || '';
  const status = document.getElementById('mem-status')?.value || '';

  let filtered = memories;
  if (q) filtered = filtered.filter(m =>
    m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || (m.context||'').toLowerCase().includes(q)
  );
  if (type) filtered = filtered.filter(m => m.type === type);
  if (author) filtered = filtered.filter(m => m.author === author);
  if (status) filtered = filtered.filter(m => (m.status||'active') === status);

  filtered.sort((a, b) => (b.date||'').localeCompare(a.date||''));

  memListFiltered = filtered;
  memListPage = 1;
  document.getElementById('mem-count').textContent = filtered.length + ' of ' + memories.length;
  renderMemListPage();
}

function renderMemListPage() {
  const list = document.getElementById('mem-list');
  if (!list) return;
  const filtered = memListFiltered;
  if (!filtered.length) {
    list.innerHTML = '<div class="text-center text-gray-500 py-12">No memories match your filters.</div>';
    return;
  }
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (memListPage > pages) memListPage = pages;
  const start = (memListPage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);

  const cards = slice.map(m => {
    const c = TYPE_COLORS[m.type] || TYPE_COLORS.decision;
    const icon = TYPE_ICONS[m.type] || '📝';
    const isResolved = m.status === 'resolved';
    return \`<div class="rounded-xl border border-gray-800 bg-gray-900 p-4 card-hover cursor-pointer \${isResolved ? 'opacity-60' : ''}" onclick='showDetail(\${attrJson(m)})'>
      <div class="flex items-start gap-3">
        <span class="text-xl mt-0.5">\${icon}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium text-gray-100">\${esc(m.title)}</span>
            <span class="type-badge \${c.bg} \${c.text} \${c.border} border">\${m.type}</span>
            \${isResolved ? '<span class="type-badge bg-gray-700/50 text-gray-400 border border-gray-600">resolved</span>' : ''}
          </div>
          <div class="text-sm text-gray-500 mt-1 line-clamp-2">\${esc(m.content.slice(0, 200))}</div>
          <div class="flex items-center gap-3 mt-2 text-xs text-gray-600">
            <span>\${m.date}</span>
            \${m.author ? '<span>· ' + esc(m.author) + '</span>' : ''}
            \${m.sourceTitle && m.sourceId
              ? '<button onclick="event.stopPropagation(); jumpToConversation(' + attrJson(m.sourceId) + ')" class="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 hover:underline truncate max-w-[280px]" title="Open this conversation">· 💬 ' + esc(m.sourceTitle) + '</button>'
              : (m.sourceTitle ? '<span class="truncate max-w-[200px]">· ' + esc(m.sourceTitle) + '</span>' : '')
            }
          </div>
        </div>
      </div>
    </div>\`;
  }).join('');

  list.innerHTML = cards + renderPager('memList', total, memListPage, pages, start);
}

// === Detail Modal ===
function showDetail(m) {
  const c = TYPE_COLORS[m.type] || TYPE_COLORS.decision;
  const icon = TYPE_ICONS[m.type] || '📝';
  const sections = [];

  if (m.context) sections.push(\`<div><h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Context</h4><p class="text-sm text-gray-300 leading-relaxed">\${esc(m.context)}</p></div>\`);
  sections.push(\`<div><h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Content</h4><p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">\${esc(m.content)}</p></div>\`);
  if (m.reasoning) sections.push(\`<div><h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reasoning</h4><p class="text-sm text-gray-300 leading-relaxed">\${esc(m.reasoning)}</p></div>\`);
  if (m.alternatives) sections.push(\`<div><h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Alternatives</h4><p class="text-sm text-gray-300 leading-relaxed">\${esc(m.alternatives)}</p></div>\`);
  if (m.impact) sections.push(\`<div><h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Impact</h4><p class="text-sm text-gray-300 leading-relaxed">\${esc(m.impact)}</p></div>\`);

  document.getElementById('detail-content').innerHTML = \`
    <div class="flex items-start justify-between mb-6">
      <div class="flex items-start gap-3">
        <span class="text-2xl">\${icon}</span>
        <div>
          <h2 class="text-lg font-bold text-white">\${esc(m.title)}</h2>
          <div class="flex items-center gap-2 mt-1">
            <span class="type-badge \${c.bg} \${c.text} \${c.border} border">\${m.type}</span>
            <span class="text-xs text-gray-500">\${m.date}</span>
            \${m.author ? '<span class="text-xs text-gray-500">· '+esc(m.author)+'</span>' : ''}
            <span class="text-xs \${m.status==='resolved'?'text-gray-500':'text-emerald-500'}">\${m.status||'active'}</span>
          </div>
        </div>
      </div>
      <button onclick="closeDetail()" class="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
    </div>
    <div class="space-y-5">\${sections.join('')}</div>
    \${m.sourceTitle ? '<div class="mt-6 pt-4 border-t border-gray-800 text-xs text-gray-600">Source: ' + esc(m.sourceType) + ' — ' + esc(m.sourceTitle) + '</div>' : ''}
  \`;

  const overlay = document.getElementById('detail-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
}

function closeDetail() {
  const overlay = document.getElementById('detail-overlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

// === Graph ===
let graphActiveTypes = null; // null = all visible

async function renderGraph(app) {
  if (!graphData) graphData = await api('graph');
  if (!graphActiveTypes) graphActiveTypes = new Set(Object.keys(TYPE_COLORS));

  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.links.length;
  const sameConvEdges = graphData.links.filter(l => l.reason === 'same conversation').length;
  const keywordEdges = graphData.links.filter(l => l.reason === 'shared keyword').length;

  app.innerHTML = \`<div class="fade-in">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold text-gray-300">Knowledge Graph</h2>
      <span class="text-xs text-gray-500">\${nodeCount} nodes · \${edgeCount} edges (\${sameConvEdges} conversation, \${keywordEdges} keyword)</span>
    </div>
    <div class="flex flex-wrap gap-2 mb-3" id="graph-type-filters">
      \${Object.entries(TYPE_COLORS).map(([t,c]) =>
        '<button data-type="'+t+'" onclick="graphToggleType(\''+t+'\')" class="graph-type-btn flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all '+c.border+' '+c.bg+' '+c.text+'" data-active="true"><div class="w-2 h-2 rounded-full '+c.dot+'"></div>'+t+'</button>'
      ).join('')}
      <span class="text-xs text-gray-600 self-center ml-2 border-l border-gray-700 pl-2">
        <span class="inline-block w-4 border-t border-indigo-500 mr-1 align-middle"></span>conversation
        <span class="inline-block w-4 border-t border-dashed border-gray-500 mr-1 ml-2 align-middle"></span>keyword
      </span>
    </div>
    <div id="graph-container" class="rounded-xl border border-gray-700 bg-gray-900 relative" style="height:580px"></div>
    <div id="graph-tooltip" class="graph-tooltip hidden"></div>
  </div>\`;

  renderForceGraph(graphData);
}

function graphToggleType(type) {
  if (graphActiveTypes.has(type)) {
    if (graphActiveTypes.size > 1) graphActiveTypes.delete(type);
  } else {
    graphActiveTypes.add(type);
  }
  // Update button appearance
  document.querySelectorAll('.graph-type-btn').forEach(btn => {
    const t = btn.getAttribute('data-type');
    const active = graphActiveTypes.has(t);
    btn.setAttribute('data-active', active ? 'true' : 'false');
    btn.style.opacity = active ? '1' : '0.35';
  });
  // Re-render with filter
  const container = document.getElementById('graph-container');
  if (container) { container.innerHTML = ''; renderForceGraph(graphData); }
}

function renderForceGraph(data) {
  const container = document.getElementById('graph-container');
  if (!container || !data.nodes.length) {
    if (container) container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">No memories to visualize.</div>';
    return;
  }

  // Apply type filter
  const visibleNodes = data.nodes.filter(n => !graphActiveTypes || graphActiveTypes.has(n.type));
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleLinks = data.links.filter(l => {
    const src = l.source.id ?? l.source;
    const tgt = l.target.id ?? l.target;
    return visibleIds.has(src) && visibleIds.has(tgt);
  });

  const filtered = { nodes: visibleNodes, links: visibleLinks };

  const width = container.clientWidth;
  const height = container.clientHeight;
  const tooltip = document.getElementById('graph-tooltip');

  const svg = d3.select(container).append('svg')
    .attr('viewBox', [0, 0, width, height]);

  // Arrow markers for implementation links (future use)
  svg.append('defs').append('marker')
    .attr('id', 'arrow').attr('viewBox', '0 -4 8 8').attr('refX', 14).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#6366f1').attr('opacity', 0.6);

  const g = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', (e) => {
    g.attr('transform', e.transform);
  }));

  const simulation = d3.forceSimulation(filtered.nodes)
    .force('link', d3.forceLink(filtered.links).id(d => d.id).distance(90))
    .force('charge', d3.forceManyBody().strength(-220))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(28));

  // Draw edges — different style by reason
  const link = g.append('g').selectAll('line')
    .data(filtered.links).join('line')
    .attr('stroke', l => l.reason === 'same conversation' ? '#6366f1' : l.reason === 'implementation' ? '#10b981' : '#374151')
    .attr('stroke-width', l => l.reason === 'same conversation' ? 1.5 : 1)
    .attr('stroke-opacity', l => l.reason === 'same conversation' ? 0.6 : 0.35)
    .attr('stroke-dasharray', l => l.reason === 'shared keyword' ? '4 3' : null)
    .attr('marker-end', l => l.reason === 'implementation' ? 'url(#arrow)' : null);

  const node = g.append('g').selectAll('circle')
    .data(filtered.nodes).join('circle')
    .attr('r', d => {
      const lc = filtered.links.filter(l => {
        const s = l.source.id ?? l.source; const t = l.target.id ?? l.target;
        return s === d.id || t === d.id;
      }).length;
      return Math.min(6 + lc * 2, 18);
    })
    .attr('fill', d => (TYPE_COLORS[d.type] || TYPE_COLORS.decision).hex)
    .attr('stroke', '#111827').attr('stroke-width', 1.5)
    .attr('cursor', 'pointer')
    .attr('opacity', d => d.status === 'resolved' ? 0.35 : 0.9)
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  const labels = g.append('g').selectAll('text')
    .data(filtered.nodes).join('text')
    .text(d => d.title.length > 22 ? d.title.slice(0, 20) + '…' : d.title)
    .attr('font-size', 9).attr('fill', '#9ca3af')
    .attr('text-anchor', 'middle').attr('dy', -14)
    .attr('pointer-events', 'none');

  node.on('mouseover', (e, d) => {
    // Highlight connected edges
    link.attr('stroke-opacity', l => {
      const s = l.source.id ?? l.source; const t = l.target.id ?? l.target;
      return (s === d.id || t === d.id) ? 1 : 0.1;
    });
    node.attr('opacity', n => {
      if (n.id === d.id) return 1;
      const connected = filtered.links.some(l => {
        const s = l.source.id ?? l.source; const t = l.target.id ?? l.target;
        return (s === d.id && t === n.id) || (t === d.id && s === n.id);
      });
      return connected ? 0.9 : 0.2;
    });
    tooltip.classList.remove('hidden');
    const lc = filtered.links.filter(l => { const s = l.source.id ?? l.source; const t = l.target.id ?? l.target; return s === d.id || t === d.id; }).length;
    tooltip.innerHTML = '<div class="font-medium text-white">' + esc(d.title) + '</div><div class="text-gray-400 text-xs mt-1">' + d.type + ' · ' + d.date + (d.author ? ' · ' + esc(d.author) : '') + ' · ' + lc + ' connection' + (lc !== 1 ? 's' : '') + '</div>';
  }).on('mousemove', (e) => {
    tooltip.style.left = (e.pageX + 12) + 'px';
    tooltip.style.top = (e.pageY - 10) + 'px';
  }).on('mouseout', () => {
    link.attr('stroke-opacity', l => l.reason === 'same conversation' ? 0.6 : 0.35);
    node.attr('opacity', d => d.status === 'resolved' ? 0.35 : 0.9);
    tooltip.classList.add('hidden');
  }).on('click', (e, d) => {
    const m = memories.find(mem => mem.title === d.title && mem.type === d.type && mem.date === d.date);
    if (m) showDetail(m);
  });

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('cx', d => d.x).attr('cy', d => d.y);
    labels.attr('x', d => d.x).attr('y', d => d.y);
  });
}

// === Quality ===
async function renderQuality(app) {
  if (!qualityData) qualityData = await api('quality');
  const q = qualityData;

  const healthPct = q.total > 0 ? Math.round((q.healthy / q.total) * 100) : 100;
  const healthColor = healthPct >= 90 ? 'emerald' : healthPct >= 75 ? 'amber' : 'rose';

  // Specificity histogram
  const maxSpec = Math.max(...q.specHistogram.map(h => h.count), 1);
  const specBars = q.specHistogram.map(h => {
    const w = Math.max(2, (h.count / maxSpec) * 100);
    const isLow = h.score === 0;
    return \`<div class="flex items-center gap-3 py-1">
      <span class="text-xs text-gray-500 w-12 text-right tabular-nums">score \${h.score}</span>
      <div class="flex-1 bg-gray-800 rounded-sm h-5 relative overflow-hidden">
        <div class="\${isLow ? 'bg-rose-500/60' : 'bg-indigo-500/60'} h-full rounded-sm" style="width:\${w}%"></div>
      </div>
      <span class="text-xs text-gray-400 w-12 tabular-nums">\${h.count}</span>
    </div>\`;
  }).join('');

  const vagueRows = q.vagueSamples.map(s => {
    const c = TYPE_COLORS[s.type] || TYPE_COLORS.decision;
    return \`<div class="py-2 px-3 rounded-lg hover:bg-gray-800/50 border-b border-gray-800/50 last:border-0">
      <div class="flex items-start gap-2">
        <span class="type-badge \${c.bg} \${c.text} \${c.border} border shrink-0 mt-0.5">\${s.type}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-gray-200 truncate">\${esc(s.title)}</div>
          <div class="text-xs text-gray-500 mt-0.5 line-clamp-2">\${esc(s.content)}</div>
        </div>
      </div>
    </div>\`;
  }).join('');

  const dupRows = q.duplicatePairs.map(p => {
    const c = TYPE_COLORS[p.type] || TYPE_COLORS.decision;
    const metric = p.reason === 'duplicate'
      ? \`jaccard <span class="text-amber-400 font-mono">\${p.jaccard}</span>\`
      : \`containment <span class="text-rose-400 font-mono">\${p.containment}</span>\`;
    return \`<div class="py-3 px-3 rounded-lg hover:bg-gray-800/50 border-b border-gray-800/50 last:border-0">
      <div class="flex items-center justify-between mb-1">
        <span class="type-badge \${c.bg} \${c.text} \${c.border} border">\${p.type}</span>
        <span class="text-xs text-gray-500">\${p.reason} · \${metric}</span>
      </div>
      <div class="text-sm text-gray-200 truncate">• \${esc(p.titleA)}</div>
      <div class="text-sm text-gray-400 truncate">• \${esc(p.titleB)}</div>
    </div>\`;
  }).join('');

  app.innerHTML = \`<div class="fade-in">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-sm font-semibold text-gray-300">Knowledge Quality</h2>
        <p class="text-xs text-gray-500 mt-0.5">Detect vague / duplicate / subsumed memories using v2.2 algorithms</p>
      </div>
      <button onclick="qualityData=null;render()" class="text-xs text-gray-500 hover:text-gray-300">↻ refresh</button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="rounded-xl border border-gray-700 bg-gray-900 p-4">
        <div class="text-3xl font-bold text-white">\${q.total}</div>
        <div class="text-sm text-gray-400 mt-1">Total memories</div>
      </div>
      <div class="rounded-xl border border-\${healthColor}-500/30 bg-\${healthColor}-500/10 p-4">
        <div class="text-3xl font-bold text-\${healthColor}-400">\${healthPct}%</div>
        <div class="text-sm text-gray-400 mt-1">Healthy (\${q.healthy})</div>
      </div>
      <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div class="text-3xl font-bold text-amber-400">\${q.vague}</div>
        <div class="text-sm text-gray-400 mt-1">Vague content</div>
      </div>
      <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
        <div class="text-3xl font-bold text-rose-400">\${q.duplicates + q.subsumed}</div>
        <div class="text-sm text-gray-400 mt-1">Duplicate pairs</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="rounded-xl border border-gray-700 bg-gray-900 p-6">
        <h3 class="text-sm font-semibold text-gray-300 mb-1">Specificity distribution</h3>
        <p class="text-xs text-gray-500 mb-4">Higher score = more technical / actionable detail</p>
        <div class="max-h-[380px] overflow-y-auto pr-2">\${specBars || '<span class="text-gray-600 text-sm">No data</span>'}</div>
      </div>

      <div class="rounded-xl border border-gray-700 bg-gray-900 p-6">
        <h3 class="text-sm font-semibold text-gray-300 mb-1">Flagged vague memories</h3>
        <p class="text-xs text-gray-500 mb-4">Low specificity + generic phrasing. Top 20 shown.</p>
        <div class="max-h-[380px] overflow-y-auto pr-2">\${vagueRows || '<span class="text-emerald-500 text-sm">✓ No vague memories detected</span>'}</div>
      </div>
    </div>

    <div class="mt-6 rounded-xl border border-gray-700 bg-gray-900 p-6">
      <h3 class="text-sm font-semibold text-gray-300 mb-1">Duplicate &amp; subsumed pairs</h3>
      <p class="text-xs text-gray-500 mb-4">Memories with shingle similarity &gt; 0.55 (duplicate) or containment &gt; 0.75 (subsumed). Top 30 shown.</p>
      <div class="max-h-[480px] overflow-y-auto pr-2">\${dupRows || '<span class="text-emerald-500 text-sm">✓ No redundancy detected</span>'}</div>
    </div>

    <div class="mt-6 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 text-xs text-gray-400">
      <strong class="text-indigo-400">Tip:</strong> Run <code class="bg-gray-800 px-1.5 py-0.5 rounded text-indigo-300">ai-memory reindex --dedup --dry-run</code> in your terminal to preview removals, then without <code class="bg-gray-800 px-1.5 py-0.5 rounded">--dry-run</code> to clean up.
    </div>
  </div>\`;
}

// === Conversations ===
async function renderConversations(app) {
  if (!conversationsData) conversationsData = await api('conversations');
  const convos = conversationsData;

  if (!convos.length) {
    app.innerHTML = \`<div class="fade-in text-center py-24 text-gray-500">
      <div class="text-4xl mb-3">💬</div>
      <div class="text-sm">No conversations yet. Run <code class="text-indigo-400">ai-memory extract</code> first.</div>
    </div>\`;
    return;
  }

  // Pick default selection: most recent
  if (!selectedConvoId || !convos.find(c => c.sourceId === selectedConvoId)) {
    selectedConvoId = convos[0].sourceId;
  }

  const sourceBadge = (src) => {
    const colors = { cursor: 'bg-sky-500/10 text-sky-400', 'claude-code': 'bg-orange-500/10 text-orange-400', windsurf: 'bg-cyan-500/10 text-cyan-400', copilot: 'bg-blue-500/10 text-blue-400' };
    const cls = colors[src] || 'bg-gray-500/10 text-gray-400';
    return \`<span class="\${cls} text-xs px-1.5 py-0.5 rounded font-medium">\${src}</span>\`;
  };

  // Build a Map for O(1) memory detail lookup instead of scanning + regex on every click
  const selected = convos.find(c => c.sourceId === selectedConvoId) || convos[0];

  const convoList = convos.map(c => {
    const selected = c.sourceId === selectedConvoId;
    const typesBadges = Object.entries(c.types).map(([t, n]) => {
      const col = TYPE_COLORS[t] || TYPE_COLORS.decision;
      return \`<span class="\${col.bg} \${col.text} text-[10px] px-1.5 rounded">\${t[0].toUpperCase()}:\${n}</span>\`;
    }).join(' ');
    const sidArg = attrJson(c.sourceId);
    return \`<div data-convo-card="\${esc(c.sourceId)}" onclick="selectConvo(\${sidArg})"
      class="cursor-pointer p-3 rounded-lg border \${selected ? 'bg-indigo-500/10 border-indigo-500/40' : 'border-transparent hover:bg-gray-800/50 hover:border-gray-700'}">
      <div class="flex items-center gap-2 mb-1">
        \${sourceBadge(c.sourceType)}
        <span class="text-[11px] text-gray-500 font-mono">\${esc(c.sourceId.slice(0, 8))}</span>
      </div>
      <div class="text-sm font-medium text-gray-200 line-clamp-2 mb-2">\${esc(c.sourceTitle)}</div>
      <div class="flex items-center justify-between text-xs text-gray-500">
        <span>\${c.count} memories</span>
        <span>\${esc(c.lastDate)}</span>
      </div>
      <div class="flex gap-1 mt-1.5 flex-wrap">\${typesBadges}</div>
    </div>\`;
  }).join('');

  const convoMemTotal = selected.memories.length;
  const convoMemPages = Math.max(1, Math.ceil(convoMemTotal / PAGE_SIZE));
  if (convoMemPage > convoMemPages) convoMemPage = convoMemPages;
  const convoMemStart = (convoMemPage - 1) * PAGE_SIZE;
  const convoMemSlice = selected.memories.slice(convoMemStart, convoMemStart + PAGE_SIZE);

  const memList = convoMemSlice.map(m => {
    const col = TYPE_COLORS[m.type] || TYPE_COLORS.decision;
    const icon = TYPE_ICONS[m.type] || '📝';
    const resolved = m.status === 'resolved';
    const idArg = attrJson(m.id);
    return \`<div onclick="loadMemoryDetail(\${idArg})" class="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-800/50 cursor-pointer \${resolved ? 'opacity-60' : ''}">
      <span class="text-base mt-0.5">\${icon}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-gray-200 truncate \${resolved ? 'line-through' : ''}">\${esc(m.title)}</div>
        <div class="text-xs text-gray-500 mt-0.5">\${esc(m.date)}</div>
      </div>
      <span class="type-badge \${col.bg} \${col.text} \${col.border} border shrink-0">\${m.type}</span>
    </div>\`;
  }).join('');
  const convoMemPager = renderPager('convoMem', convoMemTotal, convoMemPage, convoMemPages, convoMemStart);

  const prefix = selected.sourceId.slice(0, 8);
  const cliHint = 'ai-memory context --source-id ' + prefix + ' --copy';

  app.innerHTML = \`<div class="fade-in">
    <div class="flex items-baseline justify-between mb-6">
      <h2 class="text-sm font-semibold text-gray-300">Conversations (\${convos.length})</h2>
      <p class="text-xs text-gray-500">Each conversation is one chat window that produced memories. Pick one to see its scope.</p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <aside class="lg:col-span-4 rounded-xl border border-gray-700 bg-gray-900 p-3 max-h-[70vh] overflow-y-auto space-y-1">
        \${convoList}
      </aside>
      <section class="lg:col-span-8 rounded-xl border border-gray-700 bg-gray-900 p-6">
        <div class="flex items-start justify-between mb-4 gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              \${sourceBadge(selected.sourceType)}
              <span class="text-xs text-gray-500 font-mono">\${esc(selected.sourceId)}</span>
            </div>
            <h3 class="text-base font-semibold text-gray-100 break-words">\${esc(selected.sourceTitle)}</h3>
            <div class="text-xs text-gray-500 mt-1">
              \${selected.count} memories · \${esc(selected.firstDate)} → \${esc(selected.lastDate)}\${selected.author ? ' · ' + esc(selected.author) : ''}
            </div>
          </div>
          <button onclick="copyConvoCommand(\${attrJson(prefix)})" id="convo-copy-btn"
            class="shrink-0 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-mono text-indigo-300 transition-colors">
            Copy CLI
          </button>
        </div>
        <div class="mb-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
          <div class="text-xs text-gray-500 mb-1">To load only this conversation into a new AI session:</div>
          <code class="text-xs text-indigo-300 font-mono break-all">\${esc(cliHint)}</code>
        </div>
        <div class="space-y-1 max-h-[55vh] overflow-y-auto">\${memList}</div>
        \${convoMemPager}
      </section>
    </div>
  </div>\`;
}

function selectConvo(id) {
  selectedConvoId = id;
  convoMemPage = 1;
  renderConversations(document.getElementById('app')).then(() => {
    // Keep the selected card visible when picking one far from the top
    const card = document.querySelector('[data-convo-card="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
  });
}

// Jump to Conversations tab and preselect the given sourceId (used from Overview / Memories)
function jumpToConversation(sourceId) {
  selectedConvoId = sourceId;
  convoMemPage = 1;
  navigate('conversations');
}

async function copyConvoCommand(prefix) {
  const cmd = 'ai-memory context --source-id ' + prefix + ' --copy';
  try { await navigator.clipboard.writeText(cmd); } catch {}
  const btn = document.getElementById('convo-copy-btn');
  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy CLI'; }, 1500); }
}

// Cached O(1) lookup: memoryId -> full memory object
let memoryByIdMap = null;
function computeMemoryId(m) {
  return (m.type + ':' + m.date + ':' + m.title).replace(/[^a-zA-Z0-9:\\u4e00-\\u9fff-]/g, '_').slice(0, 120);
}
function buildMemoryIdMap() {
  memoryByIdMap = new Map();
  for (const m of memories) memoryByIdMap.set(computeMemoryId(m), m);
}
async function loadMemoryDetail(id) {
  if (!memories.length) { memories = await api('memories'); memoryByIdMap = null; }
  if (!memoryByIdMap) buildMemoryIdMap();
  const m = memoryByIdMap.get(id);
  if (m) showDetail(m);
}

// === Export ===
async function renderExport(app) {
  app.innerHTML = \`<div class="fade-in">
    <h2 class="text-sm font-semibold text-gray-300 mb-6">Export Memories</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

      <div class="rounded-xl border border-gray-700 bg-gray-900 p-6 card-hover">
        <div class="text-2xl mb-3">📦</div>
        <h3 class="font-semibold text-white mb-1">JSON Export</h3>
        <p class="text-sm text-gray-400 mb-4">Full data dump of all memories as a JSON file. Useful for backups or custom integrations.</p>
        <button onclick="exportJson()" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors">Download JSON</button>
      </div>

      <div class="rounded-xl border border-gray-700 bg-gray-900 p-6 card-hover">
        <div class="text-2xl mb-3">💎</div>
        <h3 class="font-semibold text-white mb-1">Obsidian Vault</h3>
        <p class="text-sm text-gray-400 mb-4">Export as Obsidian-compatible markdown with YAML frontmatter, tags, and folder structure.</p>
        <button onclick="exportObsidian()" class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors">Download Obsidian</button>
      </div>

      <div class="rounded-xl border border-gray-700 bg-gray-900 p-6 card-hover">
        <div class="text-2xl mb-3">📋</div>
        <h3 class="font-semibold text-white mb-1">Copy All</h3>
        <p class="text-sm text-gray-400 mb-4">Copy all memories as structured markdown to clipboard. Paste into Notion, Google Docs, etc.</p>
        <button onclick="copyAll()" id="copy-btn" class="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">Copy to Clipboard</button>
      </div>

    </div>
  </div>\`;
}

async function exportJson() {
  const data = await api('export/json');
  downloadFile('ai-memories.json', JSON.stringify(data, null, 2), 'application/json');
}

async function exportObsidian() {
  const files = await api('export/obsidian');
  // Create a simple JSON manifest (user extracts manually)
  const manifest = { vault: 'ai-memory', files };
  downloadFile('ai-memory-obsidian.json', JSON.stringify(manifest, null, 2), 'application/json');
}

async function copyAll() {
  if (!memories.length) memories = await api('memories');
  const lines = memories.map(m => {
    return '## [' + m.type.toUpperCase() + '] ' + m.title + '\\n' +
      (m.context ? '**Context**: ' + m.context + '\\n' : '') +
      '**Content**: ' + m.content +
      (m.reasoning ? '\\n**Reasoning**: ' + m.reasoning : '') + '\\n';
  });
  await navigator.clipboard.writeText(lines.join('\\n---\\n\\n'));
  const btn = document.getElementById('copy-btn');
  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000); }
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// === Utils ===
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
// JSON-encode a value and HTML-entity-encode every char that could collide
// with an HTML attribute delimiter, so the result is safe to splice into
// onclick="..." (or onclick='...') without breaking the parser. Without the
// &quot; escape, JSON.stringify("foo") = "\"foo\"" terminates a double-quoted
// attribute and silently disables the click handler.
function attrJson(v) { return JSON.stringify(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Pager renderer shared by Memories tab and Conversations memory list.
// Returns '' when total fits in a single page so the UI stays clean for small
// stores; otherwise emits Prev / Page N of M / Next plus a count summary.
function renderPager(scope, total, page, pages, start) {
  if (total <= PAGE_SIZE) return '';
  const end = Math.min(start + PAGE_SIZE, total);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= pages;
  const btn = (label, target, disabled) =>
    '<button onclick="setPage(' + attrJson(scope) + ',' + target + ')" '
    + (disabled ? 'disabled ' : '')
    + 'class="px-2.5 py-1 rounded border border-gray-700 ' + (disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-800 hover:border-gray-600 text-gray-300') + '">' + label + '</button>';
  return '<div class="flex items-center justify-between gap-3 pt-3 mt-3 border-t border-gray-800 text-xs text-gray-500">'
    + '<div>Showing ' + (start + 1) + '–' + end + ' of ' + total + ' · Page ' + page + ' of ' + pages + '</div>'
    + '<div class="flex gap-1">' + btn('‹ Prev', page - 1, prevDisabled) + btn('Next ›', page + 1, nextDisabled) + '</div>'
    + '</div>';
}

function setPage(scope, p) {
  if (scope === 'memList') {
    memListPage = p;
    renderMemListPage();
    document.getElementById('mem-list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else if (scope === 'convoMem') {
    convoMemPage = p;
    renderConversations(document.getElementById('app'));
  }
}

// === Init ===
async function init() {
  memories = await api('memories');
  stats = await api('stats');
  navigate('overview');
}

init();
</script>
</body>
</html>`;
}
