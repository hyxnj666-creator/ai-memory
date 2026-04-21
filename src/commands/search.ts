import type { CliOptions, ExtractedMemory, MemoryType } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { resolveAuthor } from "../utils/author.js";
import { printBanner, printError, ANSI as COL } from "../output/terminal.js";

const TYPE_ICON: Record<string, string> = {
  decision: "D",
  architecture: "A",
  convention: "C",
  todo: "T",
  issue: "I",
};

function highlight(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  return text.replace(re, `${COL.yellow}${COL.bold}$1${COL.reset}`);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function matchScore(m: ExtractedMemory, keywords: string[]): number {
  let score = 0;
  const titleLower = m.title.toLowerCase();
  const contentLower = m.content.toLowerCase();
  const contextLower = (m.context || "").toLowerCase();

  for (const kw of keywords) {
    if (titleLower.includes(kw)) score += 10;
    if (contentLower.includes(kw)) score += 5;
    if (contextLower.includes(kw)) score += 2;
    if (m.reasoning?.toLowerCase().includes(kw)) score += 1;
    if (m.impact?.toLowerCase().includes(kw)) score += 1;
  }
  return score;
}

export async function runSearch(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const query = opts.query?.trim();
  if (!query) {
    printError('Usage: ai-memory search <query> [--type decision] [--author name]');
    return 1;
  }

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const author = opts.allAuthors ? undefined : await resolveAuthor(config, opts.author);

  let memories = await readAllMemories(outputDir, author);

  if (opts.types?.length) {
    const typeSet = new Set<string>(opts.types);
    memories = memories.filter((m) => typeSet.has(m.type));
  }

  if (!opts.includeResolved) {
    memories = memories.filter((m) => m.status !== "resolved");
  }

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = memories
    .map((m) => ({ memory: m, score: matchScore(m, keywords) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ query, results: [] }));
    } else {
      console.log(`\nNo memories matching "${query}".`);
    }
    return 0;
  }

  if (opts.json) {
    console.log(JSON.stringify({
      query,
      results: scored.map((s) => ({
        type: s.memory.type,
        title: s.memory.title,
        date: s.memory.date,
        content: s.memory.content,
        author: s.memory.author,
        score: s.score,
      })),
    }));
    return 0;
  }

  console.log(`\n${COL.bold}${scored.length} result${scored.length === 1 ? "" : "s"} for "${query}"${COL.reset}\n`);

  for (const { memory: m, score } of scored.slice(0, 20)) {
    const icon = TYPE_ICON[m.type] || "?";
    const statusTag = m.status === "resolved" ? `${COL.dim}[resolved]${COL.reset} ` : "";
    const authorTag = m.author ? `${COL.dim}@${m.author}${COL.reset} ` : "";
    console.log(
      `  ${COL.cyan}[${icon}]${COL.reset} ${statusTag}${highlight(m.title, query)} ${COL.dim}(${m.date})${COL.reset} ${authorTag}`
    );
    const snippet = truncate(m.content, 120);
    console.log(`      ${COL.dim}${highlight(snippet, query)}${COL.reset}`);
    console.log();
  }

  if (scored.length > 20) {
    console.log(`${COL.dim}  ... and ${scored.length - 20} more results${COL.reset}\n`);
  }

  return 0;
}
