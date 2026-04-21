import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  memoryId,
  memoryToEmbedText,
  findUnindexed,
  pruneStale,
  searchByVector,
  type VectorStore,
  type VectorEntry,
} from "../embeddings/vector-store.js";
import { keywordOnlySearch } from "../embeddings/hybrid-search.js";
import type { ExtractedMemory } from "../types.js";

function makeMemory(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
  return {
    type: "decision",
    title: "Use PostgreSQL",
    date: "2026-04-21",
    content: "We chose PostgreSQL for its JSONB and full-text search capabilities.",
    context: "Need a database for the new API",
    sourceId: "test-123",
    sourceTitle: "DB Selection Chat",
    sourceType: "cursor",
    author: "conor-liu",
    ...overrides,
  };
}

function makeVector(dim: number, seed: number): number[] {
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    vec.push(Math.sin(seed * (i + 1)));
  }
  return vec;
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched dimensions", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("handles zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe("memoryId", () => {
  it("generates consistent IDs", () => {
    const m = makeMemory();
    const id1 = memoryId(m);
    const id2 = memoryId(m);
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(16);
  });

  it("generates different IDs for different memories", () => {
    const m1 = makeMemory({ title: "Use PostgreSQL" });
    const m2 = makeMemory({ title: "Use MySQL" });
    expect(memoryId(m1)).not.toBe(memoryId(m2));
  });
});

describe("memoryToEmbedText", () => {
  it("includes type, title, content, and context", () => {
    const m = makeMemory();
    const text = memoryToEmbedText(m);
    expect(text).toContain("[decision]");
    expect(text).toContain("Use PostgreSQL");
    expect(text).toContain("PostgreSQL");
    expect(text).toContain("database");
  });

  it("includes reasoning and impact if present", () => {
    const m = makeMemory({
      reasoning: "Best fit for our use case",
      impact: "API endpoints, migration scripts",
    });
    const text = memoryToEmbedText(m);
    expect(text).toContain("Best fit");
    expect(text).toContain("migration");
  });

  it("truncates very long text", () => {
    const m = makeMemory({ content: "x".repeat(10000) });
    const text = memoryToEmbedText(m);
    expect(text.length).toBeLessThanOrEqual(8000);
  });
});

describe("findUnindexed", () => {
  it("returns all memories for empty store", () => {
    const store: VectorStore = { model: "test-model", dimension: 4, entries: {} };
    const memories = [makeMemory()];
    expect(findUnindexed(store, memories, "test-model")).toHaveLength(1);
  });

  it("skips already indexed memories", () => {
    const m = makeMemory();
    const id = memoryId(m);
    const store: VectorStore = {
      model: "test-model",
      dimension: 4,
      entries: { [id]: { id, vector: [1, 2, 3, 4], title: m.title, type: m.type, date: m.date } },
    };
    expect(findUnindexed(store, [m], "test-model")).toHaveLength(0);
  });

  it("re-indexes all when model changes", () => {
    const m = makeMemory();
    const id = memoryId(m);
    const store: VectorStore = {
      model: "old-model",
      dimension: 4,
      entries: { [id]: { id, vector: [1, 2, 3, 4], title: m.title, type: m.type, date: m.date } },
    };
    expect(findUnindexed(store, [m], "new-model")).toHaveLength(1);
  });
});

describe("pruneStale", () => {
  it("removes entries without matching memories", () => {
    const store: VectorStore = {
      model: "test",
      dimension: 4,
      entries: {
        "stale-id": { id: "stale-id", vector: [1, 2, 3, 4], title: "Old", type: "todo", date: "2025-01-01" },
      },
    };
    const pruned = pruneStale(store, []);
    expect(pruned).toBe(1);
    expect(Object.keys(store.entries)).toHaveLength(0);
  });

  it("keeps entries with matching memories", () => {
    const m = makeMemory();
    const id = memoryId(m);
    const store: VectorStore = {
      model: "test",
      dimension: 4,
      entries: { [id]: { id, vector: [1, 2, 3, 4], title: m.title, type: m.type, date: m.date } },
    };
    const pruned = pruneStale(store, [m]);
    expect(pruned).toBe(0);
    expect(Object.keys(store.entries)).toHaveLength(1);
  });
});

describe("searchByVector", () => {
  it("returns entries sorted by similarity", () => {
    const queryVec = [1, 0, 0, 0];
    const store: VectorStore = {
      model: "test",
      dimension: 4,
      entries: {
        a: { id: "a", vector: [1, 0, 0, 0], title: "Exact match", type: "decision", date: "2026-01-01" },
        b: { id: "b", vector: [0, 1, 0, 0], title: "Orthogonal", type: "todo", date: "2026-01-01" },
        c: { id: "c", vector: [0.9, 0.1, 0, 0], title: "Close match", type: "convention", date: "2026-01-01" },
      },
    };
    const results = searchByVector(store, queryVec, 3);
    expect(results[0].entry.id).toBe("a");
    expect(results[0].similarity).toBeCloseTo(1.0, 3);
    expect(results[1].entry.id).toBe("c");
  });

  it("respects limit", () => {
    const queryVec = [1, 0, 0, 0];
    const store: VectorStore = {
      model: "test",
      dimension: 4,
      entries: {
        a: { id: "a", vector: [1, 0, 0, 0], title: "A", type: "decision", date: "2026-01-01" },
        b: { id: "b", vector: [0.5, 0.5, 0, 0], title: "B", type: "decision", date: "2026-01-01" },
        c: { id: "c", vector: [0, 1, 0, 0], title: "C", type: "decision", date: "2026-01-01" },
      },
    };
    const results = searchByVector(store, queryVec, 1);
    expect(results).toHaveLength(1);
  });
});

describe("keywordOnlySearch", () => {
  const memories: ExtractedMemory[] = [
    makeMemory({ title: "Use PostgreSQL", content: "Database decision for API", date: "2026-04-20" }),
    makeMemory({ title: "REST API Design", content: "Use OpenAPI spec for documentation", type: "convention", date: "2026-04-21" }),
    makeMemory({ title: "Redis Caching", content: "Use Redis for session caching", type: "architecture", date: "2026-04-19" }),
    makeMemory({ title: "Resolved Issue", content: "Fixed database connection pooling", status: "resolved", date: "2026-04-18" }),
  ];

  it("finds memories by keyword", () => {
    const results = keywordOnlySearch("database", memories);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.title).toBe("Use PostgreSQL");
  });

  it("excludes resolved by default", () => {
    const results = keywordOnlySearch("database", memories);
    expect(results.every((r) => r.memory.status !== "resolved")).toBe(true);
  });

  it("includes resolved when asked", () => {
    const results = keywordOnlySearch("database", memories, { includeResolved: true });
    expect(results.some((r) => r.memory.title === "Resolved Issue")).toBe(true);
  });

  it("filters by type", () => {
    const results = keywordOnlySearch("use", memories, { type: "convention" });
    expect(results.every((r) => r.memory.type === "convention")).toBe(true);
  });

  it("returns empty for no matches", () => {
    const results = keywordOnlySearch("nonexistent-keyword-xyz", memories);
    expect(results).toHaveLength(0);
  });

  it("includes type name in keyword matching", () => {
    const results = keywordOnlySearch("architecture", memories);
    expect(results.some((r) => r.memory.title === "Redis Caching")).toBe(true);
  });
});
