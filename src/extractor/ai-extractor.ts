import type {
  Conversation,
  CliOptions,
  ExtractedMemory,
  MemoryType,
} from "../types.js";
import { buildExtractionPrompt } from "./prompts.js";
import { resolveAiConfig, callLLM } from "./llm.js";

const CHUNK_SIZE = 20_000;   // chars (~5k tokens) per LLM call
const CHUNK_OVERLAP = 2_000; // chars of context carried over between chunks

// --- Text processing ---

function conversationToText(convo: Conversation, fromTurn = 0): string {
  const lines: string[] = [];
  const turns = convo.turns.slice(fromTurn);

  for (const turn of turns) {
    const text = turn.text.trim();
    if (turn.role === "assistant" && text.length < 30) continue;
    const prefix = turn.role === "user" ? "User" : "Assistant";
    lines.push(`${prefix}: ${text}`);
  }
  return lines.join("\n\n");
}

function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const rawEnd = start + CHUNK_SIZE;
    let chunkEnd = rawEnd;

    if (rawEnd < text.length) {
      const slice = text.slice(start, rawEnd);
      const lastUser = slice.lastIndexOf("\n\nUser:");
      const lastAssistant = slice.lastIndexOf("\n\nAssistant:");
      const boundary = Math.max(lastUser, lastAssistant);
      if (boundary > CHUNK_SIZE * 0.5) {
        chunkEnd = start + boundary;
      }
    }

    const chunk = text.slice(start, chunkEnd).trim();
    if (chunk.length > 100) chunks.push(chunk);

    const step = Math.max(chunkEnd - start - CHUNK_OVERLAP, 1000);
    start += step;
  }

  return chunks;
}

function deduplicateMemories(memories: ExtractedMemory[]): ExtractedMemory[] {
  const seen = new Set<string>();
  return memories.filter((m) => {
    const key = m.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseExtractionResult(
  raw: string,
  convo: Conversation
): ExtractedMemory[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const actualDate = new Date(convo.meta.modifiedAt).toISOString().slice(0, 10);

  try {
    const items = JSON.parse(cleaned);
    if (!Array.isArray(items)) return [];

    return items
      .filter(
        (item: Record<string, unknown>) =>
          item.type && item.title && item.content
      )
      .map((item: Record<string, unknown>) => ({
        type: item.type as MemoryType,
        title: String(item.title),
        date: actualDate,
        context: String(item.context || ""),
        content: String(item.content),
        reasoning: item.reasoning ? String(item.reasoning) : undefined,
        alternatives: item.alternatives ? String(item.alternatives) : undefined,
        impact: item.impact ? String(item.impact) : undefined,
        sourceId: convo.meta.id,
        sourceTitle: convo.meta.title,
        sourceType: convo.meta.source,
      }));
  } catch {
    return [];
  }
}

// --- Public API ---

export async function extractMemories(
  conversation: Conversation,
  opts: CliOptions,
  fromTurn = 0,
  modelOverride?: string
): Promise<ExtractedMemory[]> {
  const config = resolveAiConfig(modelOverride);
  if (!config) {
    throw new Error("No AI API key found. Set AI_REVIEW_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.");
  }
  const verbose = opts.verbose ?? false;

  const text = conversationToText(conversation, fromTurn);
  if (!text.trim()) return [];

  const actualDate = new Date(conversation.meta.modifiedAt)
    .toISOString()
    .slice(0, 10);
  const chunks = splitIntoChunks(text);

  if (chunks.length === 1) {
    const prompt = buildExtractionPrompt(chunks[0], opts.types, actualDate);
    const result = await callLLM(prompt, config, verbose);
    return parseExtractionResult(result, conversation);
  }

  // Multiple chunks — process ALL in parallel
  process.stdout.write(`(${chunks.length} chunks) `);

  const results = await Promise.all(
    chunks.map(async (chunk, i) => {
      const chunkLabel = ` [part ${i + 1}/${chunks.length}]`;
      const prompt = buildExtractionPrompt(chunk + chunkLabel, opts.types, actualDate);
      const result = await callLLM(prompt, config, verbose);
      return parseExtractionResult(result, conversation);
    })
  );

  return deduplicateMemories(results.flat());
}
