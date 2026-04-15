import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { CliOptions, ExtractedMemory } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { buildSummaryPrompt } from "../extractor/prompts.js";
import { resolveAiConfig, callLLM } from "../extractor/llm.js";
import { loadConfig } from "../config.js";
import { printBanner, printError } from "../output/terminal.js";

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

export async function runSummary(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const language = config.output.language;

  const memories = await readAllMemories(outputDir);

  if (memories.length === 0) {
    printError('No memories found. Run "ai-memory extract" first.');
    return 1;
  }

  let filtered = memories;
  if (opts.focus) {
    const focus = opts.focus.toLowerCase();
    filtered = memories.filter(
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

  const prompt = buildSummaryPrompt(memoriesToJson(filtered), language, opts.focus);

  if (!opts.json) {
    console.log(`\nGenerating summary from ${filtered.length} memories...`);
  }

  let summary: string;
  try {
    summary = await callLLM(prompt, aiConfig, opts.verbose);
  } catch (err) {
    printError(`Failed to generate summary: ${err}`);
    return 1;
  }

  if (opts.json) {
    console.log(JSON.stringify({ summary, memoriesCount: filtered.length }));
    return 0;
  }

  const outputFile = opts.output ?? join(outputDir, config.output.summaryFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, summary, "utf-8");

  console.log(`\nSummary written -> ${outputFile}`);
  console.log(`   ${filtered.length} memories summarized`);

  return 0;
}
