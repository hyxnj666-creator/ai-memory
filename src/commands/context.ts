import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { CliOptions, ExtractedMemory } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import {
  buildContextPrompt,
  buildDirectContext,
  buildCondensedIndex,
  type MemoryForContext,
} from "../extractor/prompts.js";
import { resolveAiConfig, callLLM } from "../extractor/llm.js";
import { loadConfig } from "../config.js";
import { printBanner, printError, printWarning } from "../output/terminal.js";
import { resolveAuthor } from "../utils/author.js";

const MAX_LLM_CHARS = 60_000;
const MAX_CONTEXT_CHARS = 32_000; // ~8,000 tokens — safe for most models

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    if (process.platform === "win32") {
      // `clip` reads stdin as the system ANSI code page (GBK on Chinese Windows)
      // which garbles UTF-8 content. Instead, write to a temp UTF-8 file and
      // use PowerShell's Set-Clipboard which handles Unicode natively.
      const tmp = join(tmpdir(), `ai-memory-clip-${Date.now()}.txt`);
      await writeFile(tmp, text, "utf-8");
      try {
        execSync(
          `powershell -noprofile -command "Get-Content -Encoding UTF8 -Raw '${tmp}' | Set-Clipboard"`
        );
      } finally {
        await unlink(tmp).catch(() => {});
      }
    } else if (process.platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else {
      execSync("xclip -selection clipboard", { input: text });
    }
    return true;
  } catch {
    return false;
  }
}

function filterByRecent(memories: ExtractedMemory[], days: number): ExtractedMemory[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return memories.filter((m) => m.date >= cutoffStr);
}

function countTokensApprox(text: string): number {
  return Math.ceil(text.length / 4);
}

// --- Conversation scoping (exported for tests) ---

export interface ScopeResult {
  memories: ExtractedMemory[];
  /** Null when no ambiguity, otherwise human-readable description for warning */
  ambiguityWarning: string | null;
  /** How many distinct conversations remain after scoping */
  conversationCount: number;
}

/**
 * Apply --source-id and --convo filters to a memory list.
 * Returns the narrowed set plus metadata for the caller to report.
 * Throws an Error (with message meant for the user) when no match is found.
 */
export function scopeBySource(
  memories: ExtractedMemory[],
  sourceId: string | undefined,
  convo: string | undefined,
  allMatching: boolean
): ScopeResult {
  let result = memories;
  let warning: string | null = null;

  if (sourceId) {
    const prefix = sourceId.toLowerCase();
    result = result.filter((m) => m.sourceId.toLowerCase().startsWith(prefix));
    if (result.length === 0) {
      throw new Error(`No memories found for conversation ID starting with "${sourceId}".`);
    }
    const unique = new Set(result.map((m) => m.sourceId));
    if (unique.size > 1) {
      warning = `Prefix "${sourceId}" matches ${unique.size} conversations. Use a longer prefix to disambiguate.`;
    }
  }

  if (convo) {
    const needle = convo.toLowerCase();
    const matching = result.filter((m) =>
      (m.sourceTitle ?? "").toLowerCase().includes(needle)
    );
    const bySource = new Map<string, ExtractedMemory[]>();
    for (const m of matching) {
      if (!bySource.has(m.sourceId)) bySource.set(m.sourceId, []);
      bySource.get(m.sourceId)!.push(m);
    }

    if (bySource.size === 0) {
      throw new Error(`No conversations found matching "${convo}".`);
    }

    if (bySource.size > 1 && !allMatching) {
      const sorted = [...bySource.entries()].sort(([, a], [, b]) => {
        const maxA = a.reduce((mx, m) => (m.date > mx ? m.date : mx), "");
        const maxB = b.reduce((mx, m) => (m.date > mx ? m.date : mx), "");
        return maxB.localeCompare(maxA);
      });
      const [chosenId, chosenMems] = sorted[0];
      warning = `"${convo}" matched ${bySource.size} conversations. Using most recent: "${chosenMems[0].sourceTitle}" (${chosenId.slice(0, 8)}, ${chosenMems.length} memories).`;
      result = chosenMems;
    } else {
      result = matching;
    }
  }

  const conversationCount = new Set(result.map((m) => m.sourceId)).size;
  return { memories: result, ambiguityWarning: warning, conversationCount };
}

function toContextMemory(m: ExtractedMemory): MemoryForContext {
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

export async function runContext(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const language = config.output.language;

  const author = opts.allAuthors ? undefined : await resolveAuthor(config, opts.author);
  let memories = await readAllMemories(outputDir, author);

  if (memories.length === 0) {
    printError('No memories found. Run "ai-memory extract" first.');
    return 1;
  }

  if (!opts.includeResolved) {
    memories = memories.filter((m) => m.status !== "resolved");
  }

  // --list-sources: list all conversations with memory counts, then exit
  if (opts.listSources) {
    return printConversationList(memories, opts);
  }

  if (!opts.json && !opts.allAuthors) {
    console.log(`Context for: ${author} (use --all-authors to include team)\n`);
  }

  // --source-id / --convo: filter to one or more conversations
  if (opts.sourceId || opts.convo) {
    try {
      const scope = scopeBySource(memories, opts.sourceId, opts.convo, !!opts.allMatching);
      memories = scope.memories;
      if (!opts.json) {
        if (scope.ambiguityWarning) {
          printWarning(scope.ambiguityWarning);
          console.log(`   Use --all-matching to include all, or --source-id <id> for a specific one.\n`);
        } else if (scope.conversationCount >= 1) {
          const head = memories[0];
          const suffix = scope.conversationCount > 1
            ? ` (+ ${scope.conversationCount - 1} more)`
            : "";
          console.log(`Conversation: "${head.sourceTitle || "(untitled)"}" (${head.sourceId.slice(0, 8)})${suffix}\n`);
        }
      }
    } catch (err) {
      printError(`${(err as Error).message} Run "ai-memory context --list-sources" to see available conversations.`);
      return 1;
    }
  }

  if (opts.recent) {
    memories = filterByRecent(memories, opts.recent);
    if (memories.length === 0) {
      printError(`No memories found from the last ${opts.recent} days.`);
      return 1;
    }
  }

  if (opts.topic) {
    const topic = opts.topic.toLowerCase();
    const topicFiltered = memories.filter(
      (m) =>
        m.title.toLowerCase().includes(topic) ||
        m.content.toLowerCase().includes(topic) ||
        (m.context?.toLowerCase().includes(topic) ?? false) ||
        (m.impact?.toLowerCase().includes(topic) ?? false)
    );
    if (topicFiltered.length > 0) memories = topicFiltered;
    // Keep all if no matches — better than empty context
  }

  let contextText: string;

  if (opts.summarize) {
    // LLM-summarized path: prose-style, condensed
    const aiConfig = resolveAiConfig(config.model || undefined);
    if (!aiConfig) {
      printError("No AI API key found. Set AI_REVIEW_API_KEY or OPENAI_API_KEY.");
      return 1;
    }

    let llmMemories = memories;
    const serialized = JSON.stringify(memories.map(toContextMemory), null, 2);
    if (serialized.length > MAX_LLM_CHARS) {
      const sorted = [...memories].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const kept: ExtractedMemory[] = [];
      let chars = 0;
      for (const m of sorted) {
        const size = JSON.stringify(toContextMemory(m)).length;
        if (chars + size > MAX_LLM_CHARS && kept.length > 0) break;
        kept.push(m);
        chars += size;
      }
      const truncated = memories.length - kept.length;
      if (truncated > 0 && !opts.json) {
        printWarning(`${truncated} older memories truncated to fit context window (kept ${kept.length} most recent).`);
      }
      llmMemories = kept;
    }

    const prompt = buildContextPrompt(
      JSON.stringify(llmMemories.map(toContextMemory), null, 2),
      language,
      opts.topic
    );

    if (!opts.json) {
      console.log(`\nGenerating context summary from ${llmMemories.length} memories...`);
    }

    try {
      contextText = await callLLM(prompt, aiConfig, opts.verbose);
    } catch (err) {
      printError(`Failed to generate context: ${err}`);
      return 1;
    }
  } else {
    // Direct template path: instant, free, lossless — recommended default
    // If too large, use tiered compression: recent memories get full detail,
    // older ones are condensed to a one-line index (no information lost).
    const fullText = buildDirectContext(memories.map(toContextMemory), language, opts.topic);
    if (fullText.length > MAX_CONTEXT_CHARS && memories.length > 1) {
      const sorted = [...memories].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const detailed: ExtractedMemory[] = [];
      const condensedBudget = 2_000; // reserve ~500 tokens for the condensed index
      const detailBudget = MAX_CONTEXT_CHARS - condensedBudget;

      for (const m of sorted) {
        detailed.push(m);
        const trial = buildDirectContext(detailed.map(toContextMemory), language, opts.topic);
        if (trial.length > detailBudget && detailed.length > 1) {
          detailed.pop();
          break;
        }
      }

      const detailedIds = new Set(detailed.map((m) => m.title + m.date));
      const condensed = sorted.filter((m) => !detailedIds.has(m.title + m.date));

      if (condensed.length > 0) {
        const detailBlock = buildDirectContext(detailed.map(toContextMemory), language, opts.topic);
        const indexBlock = buildCondensedIndex(condensed.map(toContextMemory), language);
        contextText = detailBlock + "\n\n" + indexBlock;
        if (!opts.json) {
          printWarning(`${detailed.length} recent memories in full detail, ${condensed.length} older ones as index.`);
          console.log(`   Use --recent or --topic to narrow scope, or --summarize for LLM compression.\n`);
        }
      } else {
        contextText = fullText;
      }
    } else {
      contextText = fullText;
    }
  }

  const tokenCount = countTokensApprox(contextText);

  if (opts.json) {
    console.log(JSON.stringify({ context: contextText, memoriesCount: memories.length, tokensApprox: tokenCount }));
    return 0;
  }

  // Write to file if --output is specified
  if (opts.output) {
    await mkdir(dirname(opts.output), { recursive: true });
    await writeFile(opts.output, contextText, "utf-8");
    console.log(`\nContext written -> ${opts.output}`);
  } else {
    console.log(`\nContext prompt (~${tokenCount} tokens):\n`);
    console.log("=".repeat(60));
    console.log(contextText);
    console.log("=".repeat(60));
  }

  if (opts.copy) {
    const ok = await copyToClipboard(contextText);
    console.log(ok ? "\nCopied to clipboard." : "\nCopy failed — paste manually.");
  }

  return 0;
}

// --- Conversation list view ---

interface ConversationSummary {
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  count: number;
  types: Record<string, number>;
  firstDate: string;
  lastDate: string;
}

function summarizeConversations(memories: ExtractedMemory[]): ConversationSummary[] {
  const bySource = new Map<string, ConversationSummary>();

  for (const m of memories) {
    if (!m.sourceId) continue;
    let entry = bySource.get(m.sourceId);
    if (!entry) {
      entry = {
        sourceId: m.sourceId,
        sourceTitle: m.sourceTitle || "(untitled)",
        sourceType: m.sourceType,
        count: 0,
        types: {},
        firstDate: m.date,
        lastDate: m.date,
      };
      bySource.set(m.sourceId, entry);
    }
    entry.count++;
    entry.types[m.type] = (entry.types[m.type] || 0) + 1;
    if (m.date && (!entry.firstDate || m.date < entry.firstDate)) entry.firstDate = m.date;
    if (m.date && m.date > entry.lastDate) entry.lastDate = m.date;
  }

  return [...bySource.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

function printConversationList(memories: ExtractedMemory[], opts: CliOptions): number {
  const summaries = summarizeConversations(memories);

  if (opts.json) {
    console.log(JSON.stringify(summaries));
    return 0;
  }

  if (summaries.length === 0) {
    printError('No conversations with memories yet. Run "ai-memory extract" first.');
    return 1;
  }

  console.log(`Conversations with extracted memories: ${summaries.length}\n`);
  console.log(
    ` #  Date        Source        ID        Count  Types                Title`
  );
  console.log("-".repeat(110));

  const typeShort: Record<string, string> = {
    decision: "D",
    architecture: "A",
    convention: "C",
    todo: "T",
    issue: "I",
  };

  summaries.forEach((s, i) => {
    const num = String(i + 1).padStart(2);
    const date = (s.lastDate || "").padEnd(10);
    const src = s.sourceType.padEnd(12);
    const idShort = s.sourceId.slice(0, 8);
    const count = String(s.count).padStart(4);
    const types = Object.entries(s.types)
      .map(([t, c]) => `${typeShort[t] ?? t[0]}:${c}`)
      .join(" ")
      .padEnd(18);
    const title = s.sourceTitle.length > 40 ? s.sourceTitle.slice(0, 39) + "…" : s.sourceTitle;
    console.log(` ${num}  ${date}  ${src}  ${idShort}  ${count}  ${types}  ${title}`);
  });

  console.log(
    '\nUse: ai-memory context --source-id <id> --copy  (to use ONE conversation as context)'
  );
  console.log(
    '     ai-memory context --convo "<keyword>" --copy  (match by title substring)'
  );
  return 0;
}
