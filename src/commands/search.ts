import type { CliOptions } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { resolveAuthor } from "../utils/author.js";
import { printBanner, printError, ANSI as COL } from "../output/terminal.js";
import { hybridSearch } from "../embeddings/hybrid-search.js";
import { loadVectorStore } from "../embeddings/vector-store.js";
import { resolveEmbeddingConfig } from "../embeddings/embed.js";

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

  const memories = await readAllMemories(outputDir, author);
  const store = await loadVectorStore(outputDir);
  const embConfig = resolveEmbeddingConfig(config.embeddingModel);

  const scored = await hybridSearch(query, memories, store, embConfig, {
    limit: 20,
    type: opts.types?.join(","),
    includeResolved: opts.includeResolved,
  });

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
        semanticScore: s.semanticScore,
        keywordScore: s.keywordScore,
      })),
    }));
    return 0;
  }

  const semCount = scored.filter((r) => r.semanticScore > 0).length;
  const modeLabel = semCount > 0 ? ` (${semCount} semantic)` : " (keyword)";
  console.log(`\n${COL.bold}${scored.length} result${scored.length === 1 ? "" : "s"} for "${query}"${COL.reset}${COL.dim}${modeLabel}${COL.reset}\n`);

  for (const { memory: m } of scored) {
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

  return 0;
}
