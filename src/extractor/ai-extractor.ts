import type {
  Conversation,
  CliOptions,
  ExtractedMemory,
  MemoryType,
  RedactConfig,
} from "../types.js";
import { buildExtractionPrompt } from "./prompts.js";
import { resolveAiConfig, callLLM } from "./llm.js";
import { readAllMemories } from "../store/memory-store.js";
import {
  buildRules,
  formatAuditTrail,
  redact,
  shouldRedact,
  type RedactionHit,
} from "./redact.js";

const CHUNK_SIZE = 20_000;   // chars (~5k tokens) per LLM call
const CHUNK_OVERLAP = 2_000; // chars of context carried over between chunks
const VALID_TYPES = new Set<string>(["decision", "architecture", "convention", "todo", "issue"]);

// --- Text processing ---

/**
 * Strip noise patterns from conversation text that add no extractable knowledge
 * but consume LLM context window and degrade extraction quality.
 */
export function stripConversationNoise(text: string): string {
  let cleaned = text;

  // Tool call XML blocks (Cursor/Claude): <tool_call>...</tool_call>, <invoke>...</invoke>
  cleaned = cleaned.replace(/<(?:tool_call|antml:invoke|function_call)[^>]*>[\s\S]*?<\/(?:tool_call|antml:invoke|function_call)>/g, "[tool call]");

  // Tool result blocks
  cleaned = cleaned.replace(/<(?:tool_result|function_result)[^>]*>[\s\S]*?<\/(?:tool_result|function_result)>/g, "[tool output]");

  // Long hex/base64 hashes (>= 32 chars of hex or base64-like patterns)
  cleaned = cleaned.replace(/\b[0-9a-f]{32,}\b/gi, "[hash]");
  cleaned = cleaned.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, "[base64]");

  // Data URIs
  cleaned = cleaned.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[data-uri]");

  // Very long single-line outputs (> 500 chars without newline) — likely logs/dumps
  cleaned = cleaned.replace(/^.{500,}$/gm, (line) => {
    return line.slice(0, 120) + "... [truncated " + line.length + " chars]";
  });

  // Collapse consecutive blank lines
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n");

  return cleaned;
}

function conversationToText(convo: Conversation, fromTurn = 0): string {
  const lines: string[] = [];
  const turns = convo.turns.slice(fromTurn);

  for (const turn of turns) {
    const text = turn.text.trim();
    if (turn.role === "assistant" && text.length < 30) continue;
    const prefix = turn.role === "user" ? "User" : "Assistant";
    lines.push(`${prefix}: ${text}`);
  }
  return stripConversationNoise(lines.join("\n\n"));
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

/**
 * Extract character 3-gram shingles from text.
 * Works for both CJK and Latin text since it operates at character level.
 */
export function shingles(text: string, n = 3): Set<string> {
  const clean = text.toLowerCase().replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  for (let i = 0; i <= clean.length - n; i++) {
    result.add(clean.slice(i, i + n));
  }
  return result;
}

/**
 * Jaccard similarity between two shingle sets: |A ∩ B| / |A ∪ B|.
 * Returns 0-1 where 1 means identical content.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const s of a) {
    if (b.has(s)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

/**
 * Containment similarity: |A ∩ B| / |A|.
 * Measures what fraction of A appears in B — asymmetric.
 * Useful for subsumption: if containment(small, large) > 0.8,
 * the smaller memory is mostly captured by the larger one.
 */
export function containmentSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 1;
  let intersection = 0;
  for (const s of a) {
    if (b.has(s)) intersection++;
  }
  return intersection / a.size;
}

const MIN_CONTENT_LENGTH = 30;

// Phrases that indicate content is too abstract to be useful
const VAGUE_PHRASES_ZH = [
  "影响到整个项目", "优化了用户体验", "提高了效率", "改善了性能",
  "影响到整个", "确保系统稳定", "提高代码质量", "优化了整体",
  "影响到项目的", "符合最佳实践", "遵循最佳实践", "影响较大",
  "提升了开发效率", "保证了代码质量", "确保了系统", "增强了功能",
  "方便了开发", "简化了流程", "实现了功能", "满足了需求",
  "对项目有重要意义", "是一个好的选择",
];
const VAGUE_PHRASES_EN = [
  "affects the entire project", "improves user experience", "improves efficiency",
  "improves performance", "ensures system stability", "improves code quality",
  "follows best practices", "affects the whole", "is a good choice",
  "enhances the functionality", "simplifies the process", "meets the requirements",
  "is important for the project", "makes development easier",
  "ensures code quality", "improves the overall",
];

// Patterns that indicate concrete technical content — each match adds specificity.
// Use global flag so we can count ALL matches, not just presence.
const SPECIFICITY_PATTERNS: RegExp[] = [
  /[./\\][\w-]+\.\w{1,5}\b/g,                                              // file paths e.g. ./src/x.ts
  /(?:function|class|interface|type|const|let|var|def|fn|func|struct|enum)\s+\w+/g,  // declarations
  /\b[a-z_][\w]*\([^)]*\)/g,                                               // function calls foo()
  /\/api\/[\w/]+/g,                                                         // API routes
  /\/v\d+\//g,                                                             // versioned APIs
  /`[^`\n]{2,}`/g,                                                         // inline code refs `xxx`
  /(?:config|process\.env|import|require|from)\s*[.(]\s*['"]?\w+/g,        // config/import refs
  /\b\w+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|c|cpp|h|hpp|json|yaml|yml|toml|ini|env|md|mdx|sql|sh|bash|zsh|ps1|css|scss|sass|html|vue|svelte|astro|xml|csv|proto)\b/g,  // file extensions
  /https?:\/\/\S+/g,                                                       // URLs
  /\blocalhost:\d+/g,                                                      // local servers
  /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|JOIN|WHERE|GROUP BY|ORDER BY)\b/gi,  // SQL
  /\b(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\/[\w/-]*/g,            // HTTP + route
  /\bv?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?\b/g,                                 // version numbers v1.2.3
  /[\w-]+\/[\w-]+(?:\/[\w.-]+)+/g,                                         // module/path-like
  /\B--[a-z][\w-]*/g,                                                      // CLI flags --foo
  /\B-[a-zA-Z]\b/g,                                                        // short CLI flags -f
  /\b[a-z][\w]*(?:-[\w]+){1,}\b/gi,                                        // kebab-case tool/package names
  /\b[A-Z][A-Z0-9_]{2,}\b/g,                                               // CONSTANTS / env var names
  /\$\{?\w+\}?/g,                                                          // template vars ${x}
  /\bnpm\s+(?:install|i|run|publish|version)\b/g,                          // npm commands
  /\bgit\s+(?:add|commit|push|pull|merge|rebase|checkout|log|diff|status|tag)\b/g,  // git commands
];

/**
 * Count technical specificity indicators in text.
 * Counts ALL matches across patterns (e.g. 3 file paths + 2 functions = 5).
 * This gives more accurate density measurement than "pattern presence".
 */
export function specificityScore(text: string): number {
  let score = 0;
  for (const pattern of SPECIFICITY_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) score += matches.length;
  }
  return score;
}

/**
 * Detect vague/abstract content that lacks concrete technical specifics.
 * Uses a multi-signal approach:
 * 1. Vague phrase detection (expanded bilingual list)
 * 2. Technical specificity scoring (must have ≥ 2 concrete indicators for longer content)
 * 3. Length-based thresholds
 * Returns true if the content should be filtered out.
 */
export function isVagueContent(content: string, impact?: string): boolean {
  const contentLow = content.toLowerCase();
  const spec = specificityScore(content);

  // Vague phrases: only filter if no technical specifics compensate
  const hasVaguePhraseZH = VAGUE_PHRASES_ZH.some((p) => contentLow.includes(p));
  const hasVaguePhraseEN = VAGUE_PHRASES_EN.some((p) => contentLow.includes(p));

  if (hasVaguePhraseZH || hasVaguePhraseEN) {
    if (spec < 1) return true;
  }

  // Short content without any technical indicator
  if (content.length < 80 && spec === 0) return true;

  // Medium-length content: require at least some technical substance
  // (threshold lower than before since specificityScore now counts all matches)
  if (content.length >= 80 && content.length < 200 && spec === 0) {
    const impactSpec = impact ? specificityScore(impact) : 0;
    if (spec + impactSpec === 0) return true;
  }

  return false;
}

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
  filteredVague: number;
  filteredExistingDup: number;
  /** TODOs dropped because they are sub-steps of a same-extraction decision/architecture/convention */
  filteredSubsumed: number;
}

function qualityFilter(memories: ExtractedMemory[]): { memories: ExtractedMemory[]; stats: QualityStats } {
  const stats: QualityStats = {
    total: memories.length, kept: 0,
    filteredShort: 0, filteredDuplicate: 0, filteredVague: 0, filteredExistingDup: 0, filteredSubsumed: 0,
  };

  const filtered = memories.filter((m) => {
    if (m.content.length < MIN_CONTENT_LENGTH) {
      stats.filteredShort++;
      return false;
    }
    if (titleContentSimilarity(m.title, m.content) > 0.8) {
      stats.filteredDuplicate++;
      return false;
    }
    if (isVagueContent(m.content, m.impact)) {
      stats.filteredVague++;
      return false;
    }
    return true;
  });

  stats.kept = filtered.length;
  return { memories: filtered, stats };
}

const SHINGLE_DEDUP_THRESHOLD = 0.55;
const CONTAINMENT_THRESHOLD = 0.75;
const CROSS_TYPE_SUBSUMPTION_THRESHOLD = 0.75;

// Types that can "subsume" a TODO: if a TODO's content is mostly contained
// inside a decision/architecture/convention from the same extraction, it is a
// sub-step of that larger memory and should not be stored as a separate file.
const TODO_ANCHOR_TYPES = new Set<string>(["decision", "architecture", "convention"]);

function deduplicateMemories(memories: ExtractedMemory[]): ExtractedMemory[] {
  const seenTitles = new Set<string>();
  const kept: ExtractedMemory[] = [];
  const keptShingles: Array<{ mem: ExtractedMemory; sh: Set<string> }> = [];

  for (const m of memories) {
    const titleKey = normalizeTitle(m.title);
    if (seenTitles.has(titleKey)) continue;

    const sh = shingles(m.content);

    let isDup = false;
    for (const existing of keptShingles) {
      if (existing.mem.type !== m.type) continue;

      const jaccard = jaccardSimilarity(sh, existing.sh);
      if (jaccard > SHINGLE_DEDUP_THRESHOLD) {
        if (m.content.length > existing.mem.content.length) {
          const idx = kept.indexOf(existing.mem);
          if (idx >= 0) {
            kept[idx] = m;
            existing.mem = m;
            existing.sh = sh;
          }
        }
        isDup = true;
        break;
      }

      // Containment check: if the smaller memory is subsumed by the larger
      const [smaller, larger] = sh.size <= existing.sh.size
        ? [sh, existing.sh]
        : [existing.sh, sh];
      if (containmentSimilarity(smaller, larger) > CONTAINMENT_THRESHOLD) {
        // Keep the more complete memory
        if (m.content.length > existing.mem.content.length) {
          const idx = kept.indexOf(existing.mem);
          if (idx >= 0) {
            kept[idx] = m;
            existing.mem = m;
            existing.sh = sh;
          }
        }
        isDup = true;
        break;
      }
    }

    if (!isDup) {
      seenTitles.add(titleKey);
      kept.push(m);
      keptShingles.push({ mem: m, sh });
    }
  }

  return kept;
}

/**
 * Drop TODO memories that are sub-steps of a decision/architecture/convention
 * from the same extraction pass. A TODO is "subsumed" when its shingles are
 * contained at >= CROSS_TYPE_SUBSUMPTION_THRESHOLD inside a richer anchor
 * memory (title + content + reasoning joined). This cuts a class of FPs where
 * the LLM both extracts "use PKCE" as a decision AND "implement PKCE" as a
 * TODO from the same conversation chunk.
 */
function deduplicateSubsumedTodos(memories: ExtractedMemory[]): ExtractedMemory[] {
  const anchors = memories
    .filter((m) => TODO_ANCHOR_TYPES.has(m.type))
    .map((m) => shingles([m.title, m.content, m.reasoning ?? ""].join(" ")));

  if (anchors.length === 0) return memories;

  return memories.filter((m) => {
    if (m.type !== "todo") return true;
    const todoSh = shingles([m.title, m.content].join(" "));
    return !anchors.some((aSh) => containmentSimilarity(todoSh, aSh) > CROSS_TYPE_SUBSUMPTION_THRESHOLD);
  });
}

/**
 * Remove new memories that duplicate existing ones already on disk.
 * Uses both symmetric (Jaccard) and asymmetric (containment) comparison.
 */
function deduplicateAgainstExisting(
  newMemories: ExtractedMemory[],
  existingMemories: ExtractedMemory[]
): ExtractedMemory[] {
  if (existingMemories.length === 0) return newMemories;

  const existingByType = new Map<string, Array<Set<string>>>();
  for (const em of existingMemories) {
    const list = existingByType.get(em.type) ?? [];
    list.push(shingles(em.content));
    existingByType.set(em.type, list);
  }

  return newMemories.filter((m) => {
    const typeShingles = existingByType.get(m.type);
    if (!typeShingles) return true;

    const mSh = shingles(m.content);
    for (const eSh of typeShingles) {
      if (jaccardSimilarity(mSh, eSh) > SHINGLE_DEDUP_THRESHOLD) return false;
      // New memory subsumed by existing? Also a duplicate.
      if (containmentSimilarity(mSh, eSh) > CONTAINMENT_THRESHOLD) return false;
    }
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
  /** Per-rule redaction hit counts (v2.5-05+). Empty when redaction is off or no matches. */
  redactionHits?: RedactionHit[];
  /** Total characters redacted across all rules. 0 when redaction is off or no matches. */
  redactionTotalChars?: number;
}

export async function extractMemories(
  conversation: Conversation,
  opts: CliOptions,
  fromTurn = 0,
  modelOverride?: string,
  outputDir?: string,
  /**
   * Redaction config from `.ai-memory/.config.json` `redact` block. v2.5-05+.
   * The actual on/off decision uses `shouldRedact(opts.redact, opts.noRedact, redactConfig)`
   * — CLI flags override the config-level `enabled`.
   */
  redactConfig?: RedactConfig
): Promise<ExtractionResult> {
  const config = resolveAiConfig(modelOverride);
  if (!config) {
    throw new Error("No AI API key found. Set AI_REVIEW_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.");
  }
  const verbose = opts.verbose ?? false;
  const emptyStats: QualityStats = { total: 0, kept: 0, filteredShort: 0, filteredDuplicate: 0, filteredVague: 0, filteredExistingDup: 0, filteredSubsumed: 0 };

  let text = conversationToText(conversation, fromTurn);
  if (!text.trim()) return { memories: [], qualityStats: emptyStats };

  // v2.5-05: redact secrets / PII / internal hostnames BEFORE chunking
  // so the redaction pass runs once per conversation rather than per
  // chunk, and so each chunk fed to the LLM is already scrubbed.
  let redactionHits: RedactionHit[] | undefined;
  let redactionTotalChars: number | undefined;
  if (shouldRedact(opts.redact, opts.noRedact, redactConfig)) {
    const rules = buildRules(redactConfig);
    const result = redact(text, rules);
    text = result.redacted;
    redactionHits = result.hits;
    redactionTotalChars = result.totalChars;
    if (verbose && result.hits.length > 0) {
      process.stderr.write(
        `[redact] ${formatAuditTrail(result.hits)} (${result.totalChars} chars)\n`
      );
    }
  }

  const actualDate = new Date(conversation.meta.modifiedAt)
    .toISOString()
    .slice(0, 10);
  const chunks = splitIntoChunks(text);

  // Load existing memories for cross-extraction dedup
  let existingMemories: ExtractedMemory[] = [];
  if (outputDir) {
    try { existingMemories = await readAllMemories(outputDir); } catch { /* ignore */ }
  }

  // Build existing-memory title list for prompt context
  const existingTitles = existingMemories.length > 0
    ? existingMemories.slice(0, 50).map((m) => `[${m.type}] ${m.title}`).join("\n")
    : "";

  let raw: ExtractedMemory[];

  if (chunks.length === 1) {
    const prompt = buildExtractionPrompt(chunks[0], opts.types, actualDate, existingTitles);
    const result = await callLLM(prompt, config, verbose);
    // Single-chunk: apply same within-conversation dedup as multi-chunk
    raw = deduplicateMemories(parseExtractionResult(result, conversation));
  } else {
    const total = chunks.length;
    let done = 0;
    process.stdout.write(`(${total} chunks) `);

    const results = await Promise.all(
      chunks.map(async (chunk, i) => {
        const chunkLabel = ` [part ${i + 1}/${total}]`;
        const prompt = buildExtractionPrompt(chunk + chunkLabel, opts.types, actualDate, existingTitles);
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

  const { memories: filtered, stats } = qualityFilter(raw);

  // Cross-type subsumption: drop TODOs that are sub-steps of a same-extraction anchor
  const beforeSubsumption = filtered.length;
  const afterSubsumption = deduplicateSubsumedTodos(filtered);
  stats.filteredSubsumed = beforeSubsumption - afterSubsumption.length;

  // Cross-extraction dedup: remove new memories that already exist on disk
  const beforeCrossDedup = afterSubsumption.length;
  const memories = deduplicateAgainstExisting(afterSubsumption, existingMemories);
  stats.filteredExistingDup = beforeCrossDedup - memories.length;
  stats.kept = memories.length;

  const dropped = stats.filteredShort + stats.filteredDuplicate + stats.filteredVague + stats.filteredSubsumed + stats.filteredExistingDup;
  if (dropped > 0 && verbose) {
    process.stderr.write(
      `[quality] ${dropped} filtered (${stats.filteredShort} short, ${stats.filteredDuplicate} title≈content, ${stats.filteredVague} vague, ${stats.filteredSubsumed} subsumed-todo, ${stats.filteredExistingDup} existing dup)\n`
    );
  }

  return {
    memories,
    qualityStats: stats,
    ...(redactionHits ? { redactionHits } : {}),
    ...(redactionTotalChars !== undefined ? { redactionTotalChars } : {}),
  };
}
