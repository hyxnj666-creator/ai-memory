/**
 * Flat-file vector store for memory embeddings.
 * Stored as `.ai-memory/.embeddings.json` (gitignored, local-only).
 * Zero external dependencies — just JSON + cosine similarity.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { ExtractedMemory } from "../types.js";

// --- Types ---

export interface VectorEntry {
  id: string;
  vector: number[];
  title: string;
  type: string;
  date: string;
  author?: string;
}

export interface VectorStore {
  model: string;
  dimension: number;
  entries: Record<string, VectorEntry>;
}

// --- Memory ID ---

export function memoryId(m: { type: string; title: string; date: string }): string {
  const raw = `${m.type}:${m.title}:${m.date}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

// --- Text to embed ---

export function memoryToEmbedText(m: ExtractedMemory): string {
  const parts = [`[${m.type}] ${m.title}`, m.content];
  if (m.context) parts.push(m.context);
  if (m.reasoning) parts.push(m.reasoning);
  if (m.impact) parts.push(m.impact);
  return parts.join("\n").slice(0, 8000); // keep within typical token limits
}

// --- Store I/O ---

function storePath(outputDir: string): string {
  return join(outputDir, ".embeddings.json");
}

export async function loadVectorStore(outputDir: string): Promise<VectorStore> {
  try {
    const raw = await readFile(storePath(outputDir), "utf-8");
    return JSON.parse(raw) as VectorStore;
  } catch {
    return { model: "", dimension: 0, entries: {} };
  }
}

export async function saveVectorStore(outputDir: string, store: VectorStore): Promise<void> {
  const path = storePath(outputDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store), "utf-8");
}

// --- Cosine similarity ---

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// --- Search ---

export interface SemanticResult {
  entry: VectorEntry;
  similarity: number;
}

export function searchByVector(
  store: VectorStore,
  queryVector: number[],
  limit: number
): SemanticResult[] {
  const results: SemanticResult[] = [];

  for (const entry of Object.values(store.entries)) {
    const sim = cosineSimilarity(queryVector, entry.vector);
    results.push({ entry, similarity: sim });
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// --- Index management ---

/**
 * Find memories that need embedding (new or model changed).
 */
export function findUnindexed(
  store: VectorStore,
  memories: ExtractedMemory[],
  model: string
): ExtractedMemory[] {
  if (store.model && store.model !== model) {
    // Model changed — re-index everything
    return memories;
  }
  return memories.filter((m) => !store.entries[memoryId(m)]);
}

/**
 * Remove entries from the store that no longer have corresponding memories.
 */
export function pruneStale(
  store: VectorStore,
  memories: ExtractedMemory[]
): number {
  const activeIds = new Set(memories.map(memoryId));
  let pruned = 0;
  for (const id of Object.keys(store.entries)) {
    if (!activeIds.has(id)) {
      delete store.entries[id];
      pruned++;
    }
  }
  return pruned;
}
