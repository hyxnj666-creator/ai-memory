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
const VALID_TYPES = new Set<string>(["decision", "architecture", "convention", "todo", "issue"]);

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

const TITLE_NOISE_RE = /^(使用|采用|选择|引入|改为|切换到|use|adopt|switch to|choose)\s+/i;

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(TITLE_NOISE_RE, "")
    .replace(/[^\w\u4e00-\u9fff]/g, "")
    .trim();
}

function contentFingerprint(content: string): string {
  return content.slice(0, 120).toLowerCase().replace(/\s+/g, " ").trim();
}

const MIN_CONTENT_LENGTH = 30;

function stripPunctuation(s: string): string {
  return s.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, "");
}

function titleContentSimilarity(title: string, content: string): number {
  const t = stripPunctuation(title);
  const c = stripPunctuation(content);
  if (!t || !c) return 0;
  if (c.includes(t) && t.length / c.length > 0.7) return 1;
  if (t === c) return 1;
  // Check if content is just a slightly expanded version of title
  const shorter = t.length < c.length ? t : c;
  const longer = t.length < c.length ? c : t;
  if (longer.includes(shorter) && shorter.length / longer.length > 0.8) return 0.9;
  return 0;
}

export interface QualityStats {
  total: number;
  kept: number;
  filteredShort: number;
  filteredDuplicate: number;
}

function qualityFilter(memories: ExtractedMemory[]): { memories: ExtractedMemory[]; stats: QualityStats } {
  const stats: QualityStats = { total: memories.length, kept: 0, filteredShort: 0, filteredDuplicate: 0 };

  const filtered = memories.filter((m) => {
    if (m.content.length < MIN_CONTENT_LENGTH) {
      stats.filteredShort++;
      return false;
    }
    if (titleContentSimilarity(m.title, m.content) > 0.8) {
      stats.filteredDuplicate++;
      return false;
    }
    return true;
  });

  stats.kept = filtered.length;
  return { memories: filtered, stats };
}

function deduplicateMemories(memories: ExtractedMemory[]): ExtractedMemory[] {
  const seenTitles = new Set<string>();
  const seenContent = new Set<string>();

  return memories.filter((m) => {
    const titleKey = normalizeTitle(m.title);
    if (seenTitles.has(titleKey)) return false;

    const contentKey = contentFingerprint(m.content);
    if (contentKey.length > 20 && seenContent.has(contentKey)) return false;

    seenTitles.add(titleKey);
    if (contentKey.length > 20) seenContent.add(contentKey);
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
      .filter((item: Record<string, unknown>) => {
        if (!item.type || !item.title || !item.content) return false;
        if (!VALID_TYPES.has(String(item.type))) {
          process.stderr.write(`[warn] LLM returned unknown memory type "${item.type}" — skipped.\n`);
          return false;
        }
        return true;
      })
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

export interface ExtractionResult {
  memories: ExtractedMemory[];
  qualityStats: QualityStats;
}

export async function extractMemories(
  conversation: Conversation,
  opts: CliOptions,
  fromTurn = 0,
  modelOverride?: string
): Promise<ExtractionResult> {
  const config = resolveAiConfig(modelOverride);
  if (!config) {
    throw new Error("No AI API key found. Set AI_REVIEW_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.");
  }
  const verbose = opts.verbose ?? false;

  const text = conversationToText(conversation, fromTurn);
  if (!text.trim()) return { memories: [], qualityStats: { total: 0, kept: 0, filteredShort: 0, filteredDuplicate: 0 } };

  const actualDate = new Date(conversation.meta.modifiedAt)
    .toISOString()
    .slice(0, 10);
  const chunks = splitIntoChunks(text);

  let raw: ExtractedMemory[];

  if (chunks.length === 1) {
    const prompt = buildExtractionPrompt(chunks[0], opts.types, actualDate);
    const result = await callLLM(prompt, config, verbose);
    raw = parseExtractionResult(result, conversation);
  } else {
    const total = chunks.length;
    let done = 0;
    process.stdout.write(`(${total} chunks) `);

    const results = await Promise.all(
      chunks.map(async (chunk, i) => {
        const chunkLabel = ` [part ${i + 1}/${total}]`;
        const prompt = buildExtractionPrompt(chunk + chunkLabel, opts.types, actualDate);
        const result = await callLLM(prompt, config, verbose);
        done++;
        if (total > 5 && done % 5 === 0) {
          process.stdout.write(`${Math.round(done / total * 100)}% `);
        }
        return parseExtractionResult(result, conversation);
      })
    );

    raw = deduplicateMemories(results.flat());
  }

  const { memories, stats } = qualityFilter(raw);
  const dropped = stats.filteredShort + stats.filteredDuplicate;
  if (dropped > 0 && verbose) {
    process.stderr.write(`[quality] ${dropped} low-quality filtered (${stats.filteredShort} too short, ${stats.filteredDuplicate} title≈content)\n`);
  }

  return { memories, qualityStats: stats };
}
