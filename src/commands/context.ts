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

  if (!opts.json && !opts.allAuthors) {
    console.log(`Context for: ${author} (use --all-authors to include team)\n`);
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
