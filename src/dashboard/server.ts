import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "../config.js";
import { readAllMemories } from "../store/memory-store.js";
import type { ExtractedMemory, MemoryType } from "../types.js";
import { getDashboardHtml } from "./html.js";
import { c, printError } from "../output/terminal.js";

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

  return { nodes, links };
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
