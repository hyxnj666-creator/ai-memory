import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { CliOptions, ExtractedMemory } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { buildSummaryPrompt } from "../extractor/prompts.js";
import { resolveAiConfig, callLLM } from "../extractor/llm.js";
import {
  buildRules,
  formatAuditTrail,
  redact,
  shouldRedact,
} from "../extractor/redact.js";
import { loadConfig } from "../config.js";
import { printBanner, printError, printWarning } from "../output/terminal.js";
import { resolveAuthor } from "../utils/author.js";
import { scopeBySource } from "./context.js";

const MAX_LLM_CHARS = 60_000; // ~15k tokens — safe for most models

function memoriesToJson(memories: ExtractedMemory[]): string {
  return JSON.stringify(
    memories.map((m) => ({
      type: m.type,
      title: m.title,
      date: m.date,
      content: m.content,
      reasoning: m.reasoning,
      alternatives: m.alternatives,
      impact: m.impact,
    })),
    null,
    2
  );
}

function truncateForLLM(memories: ExtractedMemory[], json: boolean): { memories: ExtractedMemory[]; truncated: number } {
  const sorted = [...memories].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const kept: ExtractedMemory[] = [];
  let chars = 0;
  for (const m of sorted) {
    const size = JSON.stringify(m).length;
    if (chars + size > MAX_LLM_CHARS && kept.length > 0) break;
    kept.push(m);
    chars += size;
  }
  return { memories: kept, truncated: memories.length - kept.length };
}

export async function runSummary(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const language = config.output.language;

  const author = opts.allAuthors ? undefined : await resolveAuthor(config, opts.author);
  const memories = await readAllMemories(outputDir, author);

  if (memories.length === 0) {
    printError('No memories found. Run "ai-memory extract" first.');
    return 1;
  }

  let filtered = opts.includeResolved
    ? memories
    : memories.filter((m) => m.status !== "resolved");

  // --list-sources: print conversations and exit (no LLM call)
  if (opts.listSources) {
    return printSummarySources(filtered, opts);
  }

  if (!opts.json && !opts.allAuthors) {
    console.log(`Summarizing for: ${author} (use --all-authors to include team)\n`);
  }

  // --source-id / --convo: scope summary to specific conversation(s)
  if (opts.sourceId || opts.convo) {
    try {
      const scope = scopeBySource(filtered, opts.sourceId, opts.convo, !!opts.allMatching);
      filtered = scope.memories;
      if (!opts.json && scope.ambiguityWarning) {
        printWarning(scope.ambiguityWarning);
      }
    } catch (err) {
      printError(`${(err as Error).message} Run "ai-memory summary --list-sources" to see available conversations.`);
      return 1;
    }
  }

  if (opts.focus) {
    const focus = opts.focus.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.title.toLowerCase().includes(focus) ||
        m.content.toLowerCase().includes(focus) ||
        (m.impact?.toLowerCase().includes(focus) ?? false)
    );
    if (filtered.length === 0) {
      printError(`No memories found matching "${opts.focus}".`);
      return 1;
    }
  }

  const aiConfig = resolveAiConfig(config.model || undefined);
  if (!aiConfig) {
    printError("No AI API key found. Set AI_REVIEW_API_KEY or OPENAI_API_KEY.");
    return 1;
  }

  const { memories: llmMemories, truncated } = truncateForLLM(filtered, false);
  if (truncated > 0 && !opts.json) {
    printWarning(`${truncated} older memories truncated to fit context window (kept ${llmMemories.length} most recent).`);
  }

  // v2.5-05: redact secrets / PII from the memory payload before
  // sending to the LLM. Memories on disk may have been extracted
  // before --redact existed; the spike doc notes this case explicitly.
  // v2.5-05 audit-fix: track whether redaction RAN (separate from
  // whether it produced hits), so --json can emit a stable schema in
  // both the "ran with hits" and "ran with no hits" cases.
  let memoryPayload = memoriesToJson(llmMemories);
  let redactionHits: { rule: string; count: number }[] = [];
  let redactionTotalChars = 0;
  let redactionApplied = false;
  if (shouldRedact(opts.redact, opts.noRedact, config.redact)) {
    redactionApplied = true;
    const result = redact(memoryPayload, buildRules(config.redact));
    memoryPayload = result.redacted;
    redactionHits = result.hits;
    redactionTotalChars = result.totalChars;
    if (opts.verbose && result.hits.length > 0) {
      process.stderr.write(
        `[redact] ${formatAuditTrail(result.hits)} (${result.totalChars} chars)\n`
      );
    }
  }

  const prompt = buildSummaryPrompt(memoryPayload, language, opts.focus);

  if (!opts.json) {
    console.log(`\nGenerating summary from ${llmMemories.length} memories...`);
  }

  let summary: string;
  try {
    summary = await callLLM(prompt, aiConfig, opts.verbose);
  } catch (err) {
    printError(`Failed to generate summary: ${err}`);
    return 1;
  }

  if (opts.json) {
    console.log(
      JSON.stringify({
        summary,
        memoriesCount: filtered.length,
        // Always emit `redactions` + `redactedChars` when redaction RAN,
        // even if zero hits — this lets CI consumers tell "redacted,
        // found nothing" apart from "redaction not enabled". (v2.5-05
        // audit-fix)
        ...(redactionApplied
          ? {
              redactionApplied: true,
              redactions: redactionHits,
              redactedChars: redactionTotalChars,
            }
          : {}),
      })
    );
    return 0;
  }
  if (redactionApplied) {
    if (redactionHits.length > 0) {
      const total = redactionHits.reduce((acc, h) => acc + h.count, 0);
      const breakdown = redactionHits.map((h) => `${h.count} ${h.rule}`).join(", ");
      console.log(
        `   Redaction: ${total} item${total === 1 ? "" : "s"} scrubbed before LLM (${redactionTotalChars} chars) — ${breakdown}`
      );
    } else {
      console.log(`   Redaction: enabled, no matches found.`);
    }
  }

  const outputFile = opts.output ?? join(outputDir, config.output.summaryFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, summary, "utf-8");

  console.log(`\nSummary written -> ${outputFile}`);
  console.log(`   ${filtered.length} memories summarized`);

  return 0;
}

/**
 * Group memories by sourceId for `summary --list-sources` output.
 * Exported for unit testing.
 */
export function groupSummaryConversations(memories: ExtractedMemory[]): Array<{
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  count: number;
  lastDate: string;
}> {
  const bySource = new Map<string, {
    sourceId: string;
    sourceTitle: string;
    sourceType: string;
    count: number;
    lastDate: string;
  }>();

  for (const m of memories) {
    if (!m.sourceId) continue;
    let entry = bySource.get(m.sourceId);
    if (!entry) {
      entry = {
        sourceId: m.sourceId,
        sourceTitle: m.sourceTitle || "(untitled)",
        sourceType: m.sourceType,
        count: 0,
        lastDate: m.date,
      };
      bySource.set(m.sourceId, entry);
    }
    entry.count++;
    if (m.date && m.date > entry.lastDate) entry.lastDate = m.date;
  }

  return [...bySource.values()].sort((a, b) =>
    b.lastDate.localeCompare(a.lastDate)
  );
}

function printSummarySources(memories: ExtractedMemory[], opts: CliOptions): number {
  const summaries = groupSummaryConversations(memories);

  if (opts.json) {
    console.log(JSON.stringify(summaries));
    return 0;
  }

  if (summaries.length === 0) {
    printError('No conversations with memories yet. Run "ai-memory extract" first.');
    return 1;
  }

  console.log(`Conversations with summarizable memories: ${summaries.length}\n`);
  summaries.forEach((s, i) => {
    const idShort = s.sourceId.slice(0, 8);
    const title = s.sourceTitle.length > 50 ? s.sourceTitle.slice(0, 49) + "…" : s.sourceTitle;
    console.log(
      ` ${String(i + 1).padStart(2)}. [${s.sourceType.padEnd(11)}] ${idShort}  ${String(s.count).padStart(4)} mem  ${s.lastDate}  ${title}`
    );
  });

  console.log(
    '\nUse: ai-memory summary --source-id <id>  OR  --convo "<title>"  to scope summary.'
  );
  return 0;
}
