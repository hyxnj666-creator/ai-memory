import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "../config.js";
import { readAllMemories } from "../store/memory-store.js";
import type { ExtractedMemory, MemoryType } from "../types.js";
import { getDashboardHtml } from "./html.js";
import { c, printError } from "../output/terminal.js";
import {
  isVagueContent,
  specificityScore,
  shingles,
  jaccardSimilarity,
  containmentSimilarity,
} from "../extractor/ai-extractor.js";

interface StatsResponse {
  total: number;
  active: number;
  resolved: number;
  byType: Record<string, number>;
  byAuthor: Record<string, number>;
  byMonth: Array<{ month: string; count: number }>;
  recent: ExtractedMemory[];
}

interface GraphNode {
  id: string;
  title: string;
  type: MemoryType;
  author?: string;
  date: string;
  status: string;
  group: number;
}

interface GraphLink {
  source: string;
  target: string;
  reason: string;
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function html(res: ServerResponse, content: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(content);
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
}

function memoryId(m: ExtractedMemory): string {
  return `${m.type}:${m.date}:${m.title}`.replace(/[^a-zA-Z0-9:\u4e00-\u9fff-]/g, "_").slice(0, 120);
}

const TYPE_GROUP: Record<string, number> = {
  decision: 0,
  architecture: 1,
  convention: 2,
  todo: 3,
  issue: 4,
};

let htmlCache: string | null = null;
const CACHE_TTL_MS = 5_000;
let memoryCache: { data: ExtractedMemory[]; ts: number } | null = null;

async function loadMemories(): Promise<ExtractedMemory[]> {
  if (memoryCache && Date.now() - memoryCache.ts < CACHE_TTL_MS) {
    return memoryCache.data;
  }
  const config = await loadConfig();
  const data = await readAllMemories(config.output.dir);
  memoryCache = { data, ts: Date.now() };
  return data;
}

function filterMemories(
  memories: ExtractedMemory[],
  query: URLSearchParams
): ExtractedMemory[] {
  let result = memories;

  const typeFilter = query.get("type");
  if (typeFilter) {
    const types = new Set(typeFilter.split(","));
    result = result.filter((m) => types.has(m.type));
  }

  const authorFilter = query.get("author");
  if (authorFilter) {
    result = result.filter((m) => m.author === authorFilter);
  }

  const statusFilter = query.get("status");
  if (statusFilter) {
    result = result.filter((m) => (m.status ?? "active") === statusFilter);
  }

  const q = query.get("q")?.toLowerCase();
  if (q) {
    result = result.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.context?.toLowerCase().includes(q)
    );
  }

  return result;
}

function buildStats(memories: ExtractedMemory[]): StatsResponse {
  const byType: Record<string, number> = {};
  const byAuthor: Record<string, number> = {};
  const monthMap = new Map<string, number>();
  let active = 0;
  let resolved = 0;

  for (const m of memories) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    if (m.author) byAuthor[m.author] = (byAuthor[m.author] || 0) + 1;

    const month = m.date?.slice(0, 7) || "unknown";
    monthMap.set(month, (monthMap.get(month) || 0) + 1);

    if (m.status === "resolved") resolved++;
    else active++;
  }

  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const recent = [...memories]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 10);

  return { total: memories.length, active, resolved, byType, byAuthor, byMonth, recent };
}

function buildGraph(memories: ExtractedMemory[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const sourceGroups = new Map<string, string[]>();

  for (const m of memories) {
    const id = memoryId(m);
    nodes.push({
      id,
      title: m.title,
      type: m.type,
      author: m.author,
      date: m.date,
      status: m.status ?? "active",
      group: TYPE_GROUP[m.type] ?? 0,
    });

    if (m.sourceId) {
      const list = sourceGroups.get(m.sourceId) ?? [];
      list.push(id);
      sourceGroups.set(m.sourceId, list);
    }
  }

  for (const [, ids] of sourceGroups) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        links.push({ source: ids[i], target: ids[j], reason: "same conversation" });
      }
    }
  }

  // Keyword-based connections: memories sharing 2+ significant words
  const keywords = new Map<string, string[]>();
  for (const m of memories) {
    const id = memoryId(m);
    const words = m.title
      .toLowerCase()
      .split(/[\s\-_/]+/)
      .filter((w) => w.length > 3);
    for (const w of words) {
      const list = keywords.get(w) ?? [];
      list.push(id);
      keywords.set(w, list);
    }
  }

  const linkedPairs = new Set(links.map((l) => `${l.source}|${l.target}`));
  for (const [, ids] of keywords) {
    if (ids.length < 2 || ids.length > 8) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        const reverseKey = `${ids[j]}|${ids[i]}`;
        if (!linkedPairs.has(key) && !linkedPairs.has(reverseKey)) {
          links.push({ source: ids[i], target: ids[j], reason: "shared keyword" });
          linkedPairs.add(key);
        }
      }
    }
  }

  // Implementation links (v2.6+): if two memories share a common implementation
  // commit (from `ai-memory link`), draw an "implementation" edge between them.
  // We surface commit SHAs as shared-reference keys — memories that both point to
  // the same commit are co-implementing peers, which is a meaningful relationship
  // to visualise without adding artificial commit nodes to the memory graph.
  const shaToMemoryIds = new Map<string, string[]>();
  for (const m of memories) {
    if (!m.links?.implementations?.length) continue;
    const id = memoryId(m);
    for (const impl of m.links.implementations) {
      const list = shaToMemoryIds.get(impl.short) ?? [];
      list.push(id);
      shaToMemoryIds.set(impl.short, list);
    }
  }
  for (const [, ids] of shaToMemoryIds) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        const rev = `${ids[j]}|${ids[i]}`;
        if (!linkedPairs.has(key) && !linkedPairs.has(rev)) {
          links.push({ source: ids[i], target: ids[j], reason: "implementation" });
          linkedPairs.add(key);
        }
      }
    }
  }

  return { nodes, links };
}

interface QualityResponse {
  total: number;
  healthy: number;
  flagged: number;
  flaggedPct: number;
  vague: number;
  duplicates: number;
  subsumed: number;
  specHistogram: Array<{ score: number; count: number }>;
  vagueSamples: Array<{ type: string; title: string; content: string; filePath?: string }>;
  duplicatePairs: Array<{
    type: string;
    titleA: string;
    titleB: string;
    jaccard: number;
    containment: number;
    reason: "duplicate" | "subsumed";
  }>;
}

const SHINGLE_DEDUP_THRESHOLD = 0.55;
const CONTAINMENT_THRESHOLD = 0.75;

interface ConversationSummary {
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  author?: string;
  count: number;
  types: Record<string, number>;
  firstDate: string;
  lastDate: string;
  memories: Array<{
    id: string;
    type: string;
    title: string;
    date: string;
    status: string;
  }>;
}

export function buildConversations(memories: ExtractedMemory[]): ConversationSummary[] {
  const bySource = new Map<string, ConversationSummary>();

  for (const m of memories) {
    if (!m.sourceId) continue;
    let entry = bySource.get(m.sourceId);
    if (!entry) {
      entry = {
        sourceId: m.sourceId,
        sourceTitle: m.sourceTitle || "(untitled)",
        sourceType: m.sourceType,
        author: m.author,
        count: 0,
        types: {},
        firstDate: m.date || "",
        lastDate: m.date || "",
        memories: [],
      };
      bySource.set(m.sourceId, entry);
    }
    entry.count++;
    entry.types[m.type] = (entry.types[m.type] || 0) + 1;
    // Defensive: treat "" as "unknown" so the first real date always wins.
    if (m.date) {
      if (!entry.firstDate || m.date < entry.firstDate) entry.firstDate = m.date;
      if (m.date > entry.lastDate) entry.lastDate = m.date;
    }
    entry.memories.push({
      id: memoryId(m),
      type: m.type,
      title: m.title,
      date: m.date || "",
      status: m.status ?? "active",
    });
  }

  // Sort each conversation's memories by date desc, then conversations by lastDate desc
  for (const entry of bySource.values()) {
    entry.memories.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  return [...bySource.values()].sort((a, b) =>
    (b.lastDate || "").localeCompare(a.lastDate || "")
  );
}

function buildQualityReport(memories: ExtractedMemory[]): QualityResponse {
  let vague = 0;
  const vagueSamples: QualityResponse["vagueSamples"] = [];
  const specCounts = new Map<number, number>();
  const flaggedPaths = new Set<string | undefined>();

  for (const m of memories) {
    const score = specificityScore(m.content);
    specCounts.set(score, (specCounts.get(score) ?? 0) + 1);

    if (isVagueContent(m.content, m.impact)) {
      vague++;
      flaggedPaths.add(m.filePath);
      if (vagueSamples.length < 20) {
        vagueSamples.push({
          type: m.type,
          title: m.title,
          content: m.content.slice(0, 180),
          filePath: m.filePath,
        });
      }
    }
  }

  // Duplicate / subsumed pairs within each type
  const byType = new Map<string, ExtractedMemory[]>();
  for (const m of memories) {
    if (!byType.has(m.type)) byType.set(m.type, []);
    byType.get(m.type)!.push(m);
  }

  let duplicates = 0;
  let subsumed = 0;
  const duplicatePairs: QualityResponse["duplicatePairs"] = [];

  for (const [type, ms] of byType) {
    const shingleCache = ms.map((m) => shingles(m.content));
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const jac = jaccardSimilarity(shingleCache[i], shingleCache[j]);
        const [smaller, larger] = shingleCache[i].size <= shingleCache[j].size
          ? [shingleCache[i], shingleCache[j]]
          : [shingleCache[j], shingleCache[i]];
        const cont = containmentSimilarity(smaller, larger);

        let reason: "duplicate" | "subsumed" | null = null;
        if (jac > SHINGLE_DEDUP_THRESHOLD) { duplicates++; reason = "duplicate"; }
        else if (cont > CONTAINMENT_THRESHOLD) { subsumed++; reason = "subsumed"; }

        if (reason) {
          flaggedPaths.add(ms[i].filePath);
          flaggedPaths.add(ms[j].filePath);
          if (duplicatePairs.length < 30) {
            duplicatePairs.push({
              type,
              titleA: ms[i].title,
              titleB: ms[j].title,
              jaccard: Math.round(jac * 100) / 100,
              containment: Math.round(cont * 100) / 100,
              reason,
            });
          }
        }
      }
    }
  }

  const specHistogram = [...specCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([score, count]) => ({ score, count }));

  const flagged = flaggedPaths.size;
  const total = memories.length;

  return {
    total,
    healthy: total - flagged,
    flagged,
    flaggedPct: total > 0 ? Math.round((flagged / total) * 100) : 0,
    vague,
    duplicates,
    subsumed,
    specHistogram,
    vagueSamples,
    duplicatePairs,
  };
}

function buildObsidianExport(memories: ExtractedMemory[]): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];

  for (const m of memories) {
    const folder = m.type;
    const slug = m.title
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80);
    const path = `${folder}/${m.date}-${slug}.md`;

    const frontmatter = [
      "---",
      `type: ${m.type}`,
      `date: ${m.date}`,
      `status: ${m.status ?? "active"}`,
      m.author ? `author: ${m.author}` : null,
      `tags: [ai-memory, ${m.type}]`,
      "---",
    ]
      .filter(Boolean)
      .join("\n");

    const body = [
      `# ${m.title}`,
      "",
      m.context ? `## Context\n${m.context}` : null,
      `## Content\n${m.content}`,
      m.reasoning ? `## Reasoning\n${m.reasoning}` : null,
      m.alternatives ? `## Alternatives\n${m.alternatives}` : null,
      m.impact ? `## Impact\n${m.impact}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    files.push({ path, content: `${frontmatter}\n\n${body}\n` });
  }

  return files;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url === "/" || url === "/index.html") {
    if (!htmlCache) htmlCache = getDashboardHtml();
    html(res, htmlCache);
    return;
  }

  if (url.startsWith("/api/")) {
    const memories = await loadMemories();
    const query = parseQuery(url);
    const path = url.split("?")[0];

    switch (path) {
      case "/api/memories":
        json(res, filterMemories(memories, query));
        return;

      case "/api/stats":
        json(res, buildStats(memories));
        return;

      case "/api/graph":
        json(res, buildGraph(memories));
        return;

      case "/api/quality":
        json(res, buildQualityReport(memories));
        return;

      case "/api/conversations":
        json(res, buildConversations(memories));
        return;

      case "/api/export/json":
        json(res, memories);
        return;

      case "/api/export/obsidian":
        json(res, buildObsidianExport(memories));
        return;

      default:
        json(res, { error: "Not found" }, 404);
        return;
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

export async function startDashboard(port: number): Promise<void> {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        printError(`Port ${port} is already in use. Try: --port ${port + 1}`);
        reject(err);
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`   ${c.cyan("→")} Dashboard running at ${c.bold(url)}`);
      console.log(`   ${c.dim("Press Ctrl+C to stop.\n")}`);

      const openCmd =
        process.platform === "win32"
          ? "start"
          : process.platform === "darwin"
            ? "open"
            : "xdg-open";
      import("node:child_process").then(({ exec }) => {
        exec(`${openCmd} ${url}`);
      }).catch(() => {});
    });

    process.on("SIGINT", () => {
      server.close();
      console.log(`\n${c.dim("Dashboard stopped.")}`);
      resolve();
    });
    process.on("SIGTERM", () => {
      server.close();
      resolve();
    });
  });
}
