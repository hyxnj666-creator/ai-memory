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
      <button onclick="navigate('graph')" data-nav="graph" class="nav-link px-3 py-3.5 text-sm text-gray-400 hover:text-white">Graph</button>
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
    case 'graph': await renderGraph(app); break;
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
    return \`<div class="flex items-start gap-3 py-3 px-3 rounded-lg hover:bg-gray-800/50 cursor-pointer" onclick='showDetail(\${JSON.stringify(m).replace(/'/g, "&#39;")})'>
      <span class="text-base mt-0.5">\${icon}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-gray-200 truncate">\${esc(m.title)}</div>
        <div class="text-xs text-gray-500 mt-0.5">\${m.date}\${m.author ? ' · ' + esc(m.author) : ''}</div>
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

  document.getElementById('mem-count').textContent = filtered.length + ' of ' + memories.length;

  const list = document.getElementById('mem-list');
  if (!filtered.length) {
    list.innerHTML = '<div class="text-center text-gray-500 py-12">No memories match your filters.</div>';
    return;
  }

  list.innerHTML = filtered.map(m => {
    const c = TYPE_COLORS[m.type] || TYPE_COLORS.decision;
    const icon = TYPE_ICONS[m.type] || '📝';
    const isResolved = m.status === 'resolved';
    return \`<div class="rounded-xl border border-gray-800 bg-gray-900 p-4 card-hover cursor-pointer \${isResolved ? 'opacity-60' : ''}" onclick='showDetail(\${JSON.stringify(m).replace(/'/g, "&#39;")})'>
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
            \${m.sourceTitle ? '<span class="truncate max-w-[200px]">· ' + esc(m.sourceTitle) + '</span>' : ''}
          </div>
        </div>
      </div>
    </div>\`;
  }).join('');
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
async function renderGraph(app) {
  if (!graphData) graphData = await api('graph');

  app.innerHTML = \`<div class="fade-in">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-semibold text-gray-300">Knowledge Graph</h2>
      <div class="flex gap-3">
        \${Object.entries(TYPE_COLORS).map(([t,c]) =>
          '<div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded-full '+c.dot+'"></div><span class="text-xs text-gray-400">'+t+'</span></div>'
        ).join('')}
      </div>
    </div>
    <div id="graph-container" class="rounded-xl border border-gray-700 bg-gray-900 relative" style="height:600px"></div>
    <div id="graph-tooltip" class="graph-tooltip hidden"></div>
  </div>\`;

  renderForceGraph(graphData);
}

function renderForceGraph(data) {
  const container = document.getElementById('graph-container');
  if (!container || !data.nodes.length) {
    if (container) container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">No memories to visualize.</div>';
    return;
  }

  const width = container.clientWidth;
  const height = container.clientHeight;
  const tooltip = document.getElementById('graph-tooltip');

  const svg = d3.select(container).append('svg')
    .attr('viewBox', [0, 0, width, height]);

  const g = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.2, 5]).on('zoom', (e) => {
    g.attr('transform', e.transform);
  }));

  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(25));

  const link = g.append('g').selectAll('line')
    .data(data.links).join('line')
    .attr('stroke', '#374151').attr('stroke-width', 1).attr('stroke-opacity', 0.5);

  const node = g.append('g').selectAll('circle')
    .data(data.nodes).join('circle')
    .attr('r', d => {
      const linkCount = data.links.filter(l => l.source.id === d.id || l.target.id === d.id || l.source === d.id || l.target === d.id).length;
      return Math.min(6 + linkCount * 2, 18);
    })
    .attr('fill', d => (TYPE_COLORS[d.type] || TYPE_COLORS.decision).hex)
    .attr('stroke', '#111827').attr('stroke-width', 1.5)
    .attr('cursor', 'pointer')
    .attr('opacity', d => d.status === 'resolved' ? 0.4 : 0.9)
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  const labels = g.append('g').selectAll('text')
    .data(data.nodes).join('text')
    .text(d => d.title.length > 20 ? d.title.slice(0, 18) + '…' : d.title)
    .attr('font-size', 9).attr('fill', '#9ca3af')
    .attr('text-anchor', 'middle').attr('dy', -14)
    .attr('pointer-events', 'none');

  node.on('mouseover', (e, d) => {
    tooltip.classList.remove('hidden');
    tooltip.innerHTML = '<div class="font-medium text-white">' + esc(d.title) + '</div><div class="text-gray-400 text-xs mt-1">' + d.type + ' · ' + d.date + (d.author ? ' · ' + d.author : '') + '</div>';
  }).on('mousemove', (e) => {
    tooltip.style.left = (e.pageX + 12) + 'px';
    tooltip.style.top = (e.pageY - 10) + 'px';
  }).on('mouseout', () => {
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
