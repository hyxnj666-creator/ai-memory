import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeConversationMemories, hasMemoryFile, readAllMemories } from "../store/memory-store.js";
import type { ExtractedMemory, ConversationMeta } from "../types.js";

function makeMeta(id: string): ConversationMeta {
  return { id, source: "cursor", filePath: "", title: "test", modifiedAt: Date.now(), turnCount: 10 };
}

function makeMemory(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
  return {
    type: "decision",
    title: "Use ESM",
    date: "2026-04-15",
    context: "Need modern JS",
    content: "Adopted ESM over CJS",
    reasoning: "Better tree-shaking",
    alternatives: "CJS, require()",
    impact: "All imports use import",
    sourceId: "test-source-id",
    sourceTitle: "my conversation",
    sourceType: "cursor",
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "ai-memory-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("writeConversationMemories + hasMemoryFile", () => {
  it("returns false before writing", async () => {
    const meta = makeMeta("abc-123");
    expect(await hasMemoryFile(meta, tmpDir)).toBe(false);
  });

  it("returns true after writing", async () => {
    const memories = [makeMemory({ sourceId: "abc-123" })];
    await writeConversationMemories(memories, tmpDir);
    const meta = makeMeta("abc-123");
    expect(await hasMemoryFile(meta, tmpDir)).toBe(true);
  });

  it("returns false after files are deleted (not just index)", async () => {
    const memories = [makeMemory({ sourceId: "del-test" })];
    await writeConversationMemories(memories, tmpDir);
    // Delete all .md files
    const { readdir, rm: rmFile } = await import("node:fs/promises");
    const decisionsDir = join(tmpDir, "decisions");
    const files = await readdir(decisionsDir);
    for (const f of files) await rmFile(join(decisionsDir, f));
    const meta = makeMeta("del-test");
    expect(await hasMemoryFile(meta, tmpDir)).toBe(false);
  });

  it("is idempotent — does not duplicate on second write", async () => {
    const memories = [makeMemory({ sourceId: "idem-test" })];
    await writeConversationMemories(memories, tmpDir);
    await writeConversationMemories(memories, tmpDir);
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(join(tmpDir, "decisions"));
    expect(files.length).toBe(1);
  });
});

describe("readAllMemories", () => {
  it("reads back all fields including reasoning/alternatives/impact", async () => {
    const m = makeMemory({ sourceId: "read-test", reasoning: "r1", alternatives: "alt1", impact: "imp1" });
    await writeConversationMemories([m], tmpDir);
    const result = await readAllMemories(tmpDir);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Use ESM");
    expect(result[0].content).toContain("Adopted ESM over CJS");
    expect(result[0].reasoning).toContain("r1");
    expect(result[0].alternatives).toContain("alt1");
    expect(result[0].impact).toContain("imp1");
  });

  it("reads english-labelled files", async () => {
    const m = makeMemory({ sourceId: "en-test" });
    await writeConversationMemories([m], tmpDir, "en");
    const result = await readAllMemories(tmpDir);
    expect(result.length).toBe(1);
    expect(result[0].content).toContain("Adopted ESM over CJS");
  });

  it("returns empty array when dir does not exist", async () => {
    const result = await readAllMemories("/nonexistent/path");
    expect(result).toEqual([]);
  });
});
