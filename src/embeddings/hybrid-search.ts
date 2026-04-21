/**
 * Hybrid search: combines semantic similarity, keyword matching,
 * and time decay into a single ranked result set.
 *
 * Weights: semantic 0.55, keyword 0.30, recency 0.15
 */

import type { ExtractedMemory } from "../types.js";
import type { VectorStore } from "./vector-store.js";
import { memoryId, searchByVector } from "./vector-store.js";
import { embedText, type EmbeddingConfig } from "./embed.js";

// --- Weights ---

const W_SEMANTIC = 0.55;
const W_KEYWORD = 0.30;
const W_RECENCY = 0.15;

// --- Keyword scoring (reused from existing search logic) ---

function keywordScore(m: ExtractedMemory, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  let score = 0;
  const titleLow = m.title.toLowerCase();
  const contentLow = m.content.toLowerCase();
  const contextLow = (m.context || "").toLowerCase();
  for (const kw of keywords) {
    if (titleLow.includes(kw)) score += 10;
    if (contentLow.includes(kw)) score += 5;
    if (contextLow.includes(kw)) score += 2;
    if (m.type.includes(kw)) score += 3;
    if (m.reasoning?.toLowerCase().includes(kw)) score += 1;
    if (m.impact?.toLowerCase().includes(kw)) score += 1;
  }
  return score;
}

// --- Recency scoring ---

function recencyScore(dateStr: string): number {
  if (!dateStr) return 0;
  const daysAgo = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo < 0) return 1;
  // Half-life of 90 days — recent memories score higher
  return Math.exp(-daysAgo / 90);
}

// --- Normalize to 0-1 ---

function normalize(values: number[]): number[] {
  const max = Math.max(...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => v / max);
}

// --- Hybrid search ---

export interface HybridResult {
  memory: ExtractedMemory;
  score: number;
  semanticScore: number;
  keywordScore: number;
  recencyScore: number;
}

export interface HybridSearchOptions {
  limit?: number;
  type?: string;
  author?: string;
  includeResolved?: boolean;
}

/**
 * Perform hybrid search combining semantic, keyword, and recency signals.
 * Falls back to keyword-only if embeddings are unavailable.
 */
export async function hybridSearch(
  query: string,
  memories: ExtractedMemory[],
  store: VectorStore,
  embeddingConfig: EmbeddingConfig | null,
  opts: HybridSearchOptions = {}
): Promise<HybridResult[]> {
  const limit = opts.limit ?? 10;

  // Filter memories
  let filtered = [...memories];
  if (!opts.includeResolved) {
    filtered = filtered.filter((m) => m.status !== "resolved");
  }
  if (opts.type) {
    const types = new Set(opts.type.split(",").map((t) => t.trim()));
    filtered = filtered.filter((m) => types.has(m.type));
  }
  if (opts.author) {
    filtered = filtered.filter((m) => m.author === opts.author);
  }

  if (filtered.length === 0) return [];

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

  // Keyword scores
  const kwScores = filtered.map((m) => keywordScore(m, keywords));
  const kwNorm = normalize(kwScores);

  // Recency scores
  const recScores = filtered.map((m) => recencyScore(m.date));

  // Semantic scores
  let semNorm: number[];
  if (embeddingConfig && Object.keys(store.entries).length > 0) {
    try {
      const queryVec = await embedText(query, embeddingConfig);
      const semResults = searchByVector(store, queryVec, filtered.length);
      const semMap = new Map(semResults.map((r) => [r.entry.id, r.similarity]));

      const rawSem = filtered.map((m) => semMap.get(memoryId(m)) ?? 0);
      semNorm = normalize(rawSem);
    } catch {
      // Embedding failed — fall back to keyword only
      semNorm = filtered.map(() => 0);
    }
  } else {
    semNorm = filtered.map(() => 0);
  }

  // Determine effective weights
  const hasSemantic = semNorm.some((s) => s > 0);
  const wSem = hasSemantic ? W_SEMANTIC : 0;
  const wKw = hasSemantic ? W_KEYWORD : 0.85;
  const wRec = hasSemantic ? W_RECENCY : 0.15;

  // Combine scores
  const results: HybridResult[] = filtered.map((m, i) => ({
    memory: m,
    score: wSem * semNorm[i] + wKw * kwNorm[i] + wRec * recScores[i],
    semanticScore: semNorm[i],
    keywordScore: kwNorm[i],
    recencyScore: recScores[i],
  }));

  return results
    .filter((r) => r.keywordScore > 0 || r.semanticScore > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Keyword-only fallback (for use when embeddings are not configured).
 */
export function keywordOnlySearch(
  query: string,
  memories: ExtractedMemory[],
  opts: HybridSearchOptions = {}
): HybridResult[] {
  const limit = opts.limit ?? 10;
  let filtered = [...memories];
  if (!opts.includeResolved) {
    filtered = filtered.filter((m) => m.status !== "resolved");
  }
  if (opts.type) {
    const types = new Set(opts.type.split(",").map((t) => t.trim()));
    filtered = filtered.filter((m) => types.has(m.type));
  }
  if (opts.author) {
    filtered = filtered.filter((m) => m.author === opts.author);
  }

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const kwScores = filtered.map((m) => keywordScore(m, keywords));
  const kwNorm = normalize(kwScores);
  const recScores = filtered.map((m) => recencyScore(m.date));

  return filtered
    .map((m, i) => ({
      memory: m,
      score: 0.85 * kwNorm[i] + 0.15 * recScores[i],
      semanticScore: 0,
      keywordScore: kwNorm[i],
      recencyScore: recScores[i],
    }))
    .filter((r) => r.keywordScore > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
