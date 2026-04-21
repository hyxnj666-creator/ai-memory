import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readAllMemories } from "../store/memory-store.js";
import { buildDirectContext, type MemoryForContext } from "../extractor/prompts.js";
import { loadConfig } from "../config.js";

function toContextMemory(m: { type: string; title: string; date: string; content: string; context?: string; reasoning?: string; alternatives?: string; impact?: string; sourceTitle?: string }): MemoryForContext {
  return {
    type: m.type,
    title: m.title,
    date: m.date,
    content: m.content,
    context: m.context,
    reasoning: m.reasoning,
    alternatives: m.alternatives,
    impact: m.impact,
    sourceTitle: m.sourceTitle,
  };
}

export function registerResources(server: McpServer, debug: boolean): void {
  server.resource(
    "project-context",
    "memory://project-context",
    {
      description: "Project knowledge base — decisions, conventions, architecture notes, TODOs, and issues extracted from AI conversation history. Updated automatically as new memories are extracted.",
      mimeType: "text/markdown",
    },
    async () => {
      try {
        const config = await loadConfig();
        const outputDir = config.output.dir;
        const language = config.output.language;

        let memories = await readAllMemories(outputDir);
        memories = memories.filter((m) => m.status !== "resolved");

        if (memories.length === 0) {
          return {
            contents: [{
              uri: "memory://project-context",
              mimeType: "text/markdown",
              text: "No project memories extracted yet. Run `npx ai-memory-cli extract` to get started.",
            }],
          };
        }

        const contextText = buildDirectContext(
          memories.map(toContextMemory),
          language
        );

        if (debug) {
          process.stderr.write(`[ai-memory-mcp] project-context: ${memories.length} memories, ${contextText.length} chars\n`);
        }

        return {
          contents: [{
            uri: "memory://project-context",
            mimeType: "text/markdown",
            text: contextText,
          }],
        };
      } catch (err) {
        return {
          contents: [{
            uri: "memory://project-context",
            mimeType: "text/plain",
            text: `Failed to load project context: ${err}`,
          }],
        };
      }
    }
  );
}
