import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExtractedMemory, MemoryType } from "../types.js";
import { readAllMemories, writeMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { resolveAuthor } from "../utils/author.js";

const VALID_TYPES: MemoryType[] = ["decision", "architecture", "convention", "todo", "issue"];

function memoryToText(m: ExtractedMemory): string {
  const lines = [`## [${m.type}] ${m.title}`, `Date: ${m.date}`];
  if (m.author) lines.push(`Author: ${m.author}`);
  if (m.status === "resolved") lines.push(`Status: resolved`);
  lines.push("", m.content);
  if (m.context) lines.push("", `Context: ${m.context}`);
  if (m.reasoning) lines.push(`Reasoning: ${m.reasoning}`);
  if (m.alternatives) lines.push(`Alternatives rejected: ${m.alternatives}`);
  if (m.impact) lines.push(`Impact: ${m.impact}`);
  return lines.join("\n");
}

function scoreMatch(m: ExtractedMemory, keywords: string[]): number {
  let score = 0;
  const titleLow = m.title.toLowerCase();
  const contentLow = m.content.toLowerCase();
  const contextLow = (m.context || "").toLowerCase();
  for (const kw of keywords) {
    if (titleLow.includes(kw)) score += 10;
    if (contentLow.includes(kw)) score += 5;
    if (contextLow.includes(kw)) score += 2;
    if (m.reasoning?.toLowerCase().includes(kw)) score += 1;
    if (m.impact?.toLowerCase().includes(kw)) score += 1;
  }
  return score;
}

export function registerTools(server: McpServer, debug: boolean): void {
  // ── remember ──────────────────────────────────────────
  server.tool(
    "remember",
    "Store a piece of project knowledge (decision, convention, architecture note, todo, or issue) for future reference. Use this when the conversation produces a meaningful technical decision, convention, or task worth preserving.",
    {
      type: z.enum(["decision", "architecture", "convention", "todo", "issue"])
        .describe("Knowledge type"),
      title: z.string().min(5).describe("Short descriptive title"),
      content: z.string().min(30).describe("Detailed content with specific technical details"),
      context: z.string().optional().describe("What problem or goal led to this"),
      reasoning: z.string().optional().describe("Why this approach was chosen (decisions)"),
      alternatives: z.string().optional().describe("What was considered and rejected (decisions)"),
      impact: z.string().optional().describe("Affected files, modules, or APIs"),
    },
    async ({ type, title, content, context, reasoning, alternatives, impact }) => {
      try {
        const config = await loadConfig();
        const author = await resolveAuthor(config);
        const date = new Date().toISOString().slice(0, 10);

        const memory: ExtractedMemory = {
          type: type as MemoryType,
          title,
          content,
          date,
          context: context || "",
          reasoning,
          alternatives,
          impact,
          sourceId: "mcp",
          sourceTitle: "MCP remember",
          sourceType: "cursor",
          author,
        };

        await writeMemories([memory], config.output.dir, config.output.language, { author });

        if (debug) process.stderr.write(`[ai-memory-mcp] Remembered: ${type} — ${title}\n`);

        return {
          content: [{ type: "text" as const, text: `Stored ${type}: "${title}" by ${author} (${date})` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Failed to store memory: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ── recall ────────────────────────────────────────────
  server.tool(
    "recall",
    "Retrieve project memories relevant to a topic. Returns structured knowledge about decisions, conventions, architecture, todos, and issues from this project's history.",
    {
      query: z.string().describe("What to search for (keywords or topic)"),
      type: z.enum(["decision", "architecture", "convention", "todo", "issue"]).optional()
        .describe("Filter by memory type"),
      limit: z.number().min(1).max(50).default(10).describe("Max results to return"),
    },
    async ({ query, type, limit }) => {
      try {
        const config = await loadConfig();
        const outputDir = config.output.dir;
        let memories = await readAllMemories(outputDir);

        // Filter resolved by default
        memories = memories.filter((m) => m.status !== "resolved");

        if (type) {
          memories = memories.filter((m) => m.type === type);
        }

        const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
        const scored = memories
          .map((m) => ({ memory: m, score: scoreMatch(m, keywords) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        if (scored.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No memories found matching "${query}".` }],
          };
        }

        const text = scored.map((s) => memoryToText(s.memory)).join("\n\n---\n\n");

        if (debug) process.stderr.write(`[ai-memory-mcp] Recall "${query}" → ${scored.length} results\n`);

        return {
          content: [{ type: "text" as const, text: text }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Failed to recall: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // ── search_memories ───────────────────────────────────
  server.tool(
    "search_memories",
    "Search through all extracted project memories by keyword. More flexible than recall — supports type filtering, author filtering, and including resolved memories.",
    {
      query: z.string().describe("Search query"),
      type: z.string().optional().describe("Comma-separated types: decision,architecture,convention,todo,issue"),
      author: z.string().optional().describe("Filter by author name"),
      includeResolved: z.boolean().default(false).describe("Include resolved/completed memories"),
      limit: z.number().min(1).max(100).default(20).describe("Max results"),
    },
    async ({ query, type, author, includeResolved, limit }) => {
      try {
        const config = await loadConfig();
        let memories = await readAllMemories(config.output.dir, author || undefined);

        if (!includeResolved) {
          memories = memories.filter((m) => m.status !== "resolved");
        }

        if (type) {
          const typeSet = new Set(type.split(",").map((t) => t.trim()));
          memories = memories.filter((m) => typeSet.has(m.type));
        }

        const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
        const scored = memories
          .map((m) => ({ memory: m, score: scoreMatch(m, keywords) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        if (scored.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No memories matching "${query}".` }],
          };
        }

        const results = scored.map((s) => {
          const m = s.memory;
          return `[${m.type}] ${m.title} (${m.date})${m.author ? ` @${m.author}` : ""}${m.status === "resolved" ? " [resolved]" : ""}\n  ${m.content.slice(0, 200)}${m.content.length > 200 ? "..." : ""}`;
        });

        const text = `${scored.length} result${scored.length === 1 ? "" : "s"} for "${query}":\n\n${results.join("\n\n")}`;

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Search failed: ${err}` }],
          isError: true,
        };
      }
    }
  );
}
