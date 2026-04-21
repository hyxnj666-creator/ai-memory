/**
 * Embedding indexer — generates and stores embeddings for all memories.
 * Supports incremental indexing (only new/changed) and full reindex.
 */

import type { ExtractedMemory } from "../types.js";
import { embedBatch, resolveEmbeddingConfig, type EmbeddingConfig } from "./embed.js";
import {
  loadVectorStore,
  saveVectorStore,
  findUnindexed,
  pruneStale,
  memoryId,
  memoryToEmbedText,
  type VectorStore,
} from "./vector-store.js";

const BATCH_SIZE = 20;

export interface IndexResult {
  indexed: number;
  pruned: number;
  total: number;
  skipped: number;
}

/**
 * Index all memories that don't yet have embeddings.
 * If `force` is true, re-indexes everything.
 */
export async function indexMemories(
  memories: ExtractedMemory[],
  outputDir: string,
  options: {
    force?: boolean;
    verbose?: boolean;
    embeddingModel?: string;
  } = {}
): Promise<IndexResult> {
  const config = resolveEmbeddingConfig(options.embeddingModel);
  if (!config) {
    throw new Error("No API key configured. Set AI_REVIEW_API_KEY or OPENAI_API_KEY to enable embeddings.");
  }

  const store = options.force
    ? { model: "", dimension: 0, entries: {} }
    : await loadVectorStore(outputDir);

  // Prune stale entries
  const pruned = pruneStale(store, memories);

  // Find memories needing embedding
  const unindexed = options.force ? memories : findUnindexed(store, memories, config.model);

  if (unindexed.length === 0) {
    if (pruned > 0) {
      await saveVectorStore(outputDir, store);
    }
    return {
      indexed: 0,
      pruned,
      total: Object.keys(store.entries).length,
      skipped: memories.length,
    };
  }

  if (options.verbose) {
    process.stderr.write(`[embed] Indexing ${unindexed.length} memories (batch size ${BATCH_SIZE})...\n`);
  }

  // Process in batches
  let indexed = 0;
  for (let i = 0; i < unindexed.length; i += BATCH_SIZE) {
    const batch = unindexed.slice(i, i + BATCH_SIZE);
    const texts = batch.map(memoryToEmbedText);

    const vectors = await embedBatch(texts, config);

    for (let j = 0; j < batch.length; j++) {
      const m = batch[j];
      const id = memoryId(m);
      store.entries[id] = {
        id,
        vector: vectors[j],
        title: m.title,
        type: m.type,
        date: m.date,
        author: m.author,
      };
    }

    indexed += batch.length;

    if (options.verbose && unindexed.length > BATCH_SIZE) {
      const pct = Math.round((indexed / unindexed.length) * 100);
      process.stderr.write(`[embed] ${pct}% (${indexed}/${unindexed.length})\n`);
    }
  }

  // Update model info
  store.model = config.model;
  if (Object.values(store.entries).length > 0) {
    store.dimension = Object.values(store.entries)[0].vector.length;
  }

  await saveVectorStore(outputDir, store);

  return {
    indexed,
    pruned,
    total: Object.keys(store.entries).length,
    skipped: memories.length - indexed,
  };
}

/**
 * Quick-index a single memory (used by MCP `remember` tool).
 */
export async function indexSingleMemory(
  memory: ExtractedMemory,
  outputDir: string,
  embeddingModel?: string
): Promise<boolean> {
  const config = resolveEmbeddingConfig(embeddingModel);
  if (!config) return false;

  try {
    const store = await loadVectorStore(outputDir);
    const id = memoryId(memory);

    if (store.entries[id] && store.model === config.model) {
      return true; // already indexed
    }

    const text = memoryToEmbedText(memory);
    const [vector] = await embedBatch([text], config);

    store.entries[id] = {
      id,
      vector,
      title: memory.title,
      type: memory.type,
      date: memory.date,
      author: memory.author,
    };
    store.model = config.model;
    store.dimension = vector.length;

    await saveVectorStore(outputDir, store);
    return true;
  } catch {
    return false;
  }
}
