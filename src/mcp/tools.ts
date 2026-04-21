import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExtractedMemory, MemoryType } from "../types.js";
import { readAllMemories, writeMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { resolveAuthor } from "../utils/author.js";
import { hybridSearch } from "../embeddings/hybrid-search.js";
import { loadVectorStore } from "../embeddings/vector-store.js";
import { resolveEmbeddingConfig } from "../embeddings/embed.js";
import { indexSingleMemory } from "../embeddings/indexer.js";

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

        // Auto-index embedding (best-effort, don't fail if API unavailable)
        const embedded = await indexSingleMemory(memory, config.output.dir);
        if (debug) {
          process.stderr.write(`[ai-memory-mcp] Remembered: ${type} — ${title}${embedded ? " (embedded)" : ""}\n`);
        }

        return {
          content: [{ type: "text" as const, text: `Stored ${type}: "${title}" by ${author} (${date})${embedded ? " [indexed]" : ""}` }],
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
    "Retrieve project memories relevant to a topic using semantic + keyword hybrid search. Works with natural language queries — doesn't require exact keyword matches.",
    {
      query: z.string().describe("What to search for (natural language topic or keywords)"),
      type: z.enum(["decision", "architecture", "convention", "todo", "issue"]).optional()
        .describe("Filter by memory type"),
      limit: z.number().min(1).max(50).default(10).describe("Max results to return"),
    },
    async ({ query, type, limit }) => {
      try {
        const config = await loadConfig();
        const outputDir = config.output.dir;
        const memories = await readAllMemories(outputDir);
        const store = await loadVectorStore(outputDir);
        const embConfig = resolveEmbeddingConfig();

        const results = await hybridSearch(query, memories, store, embConfig, {
          limit,
          type: type || undefined,
        });

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No memories found matching "${query}".` }],
          };
        }

        const text = results.map((r) => memoryToText(r.memory)).join("\n\n---\n\n");

        if (debug) {
          const semHit = results.filter((r) => r.semanticScore > 0).length;
          process.stderr.write(`[ai-memory-mcp] Recall "${query}" → ${results.length} results (${semHit} semantic)\n`);
        }

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
    "Search through all extracted project memories using hybrid semantic + keyword search. Supports type filtering, author filtering, and including resolved memories.",
    {
      query: z.string().describe("Search query (natural language or keywords)"),
      type: z.string().optional().describe("Comma-separated types: decision,architecture,convention,todo,issue"),
      author: z.string().optional().describe("Filter by author name"),
      includeResolved: z.boolean().default(false).describe("Include resolved/completed memories"),
      limit: z.number().min(1).max(100).default(20).describe("Max results"),
    },
    async ({ query, type, author, includeResolved, limit }) => {
      try {
        const config = await loadConfig();
        const memories = await readAllMemories(config.output.dir, author || undefined);
        const store = await loadVectorStore(config.output.dir);
        const embConfig = resolveEmbeddingConfig();

        const scored = await hybridSearch(query, memories, store, embConfig, {
          limit,
          type: type || undefined,
          author: author || undefined,
          includeResolved,
        });

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
