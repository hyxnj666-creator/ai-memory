import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAuthor } from "../utils/author.js";
import { writeConversationMemories, readAllMemories } from "../store/memory-store.js";
import { parseArgs } from "../cli.js";
import type { AiMemoryConfig, ExtractedMemory } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

// --- resolveAuthor ---

describe("resolveAuthor", () => {
  it("prefers CLI override over everything", async () => {
    const config = { ...DEFAULT_CONFIG, author: "config-user" };
    const result = await resolveAuthor(config, "cli-user");
    expect(result).toBe("cli-user");
  });

  it("uses config.author when no CLI override", async () => {
    const config = { ...DEFAULT_CONFIG, author: "Config User" };
    const result = await resolveAuthor(config);
    expect(result).toBe("config-user");
  });

  it("slugifies author names", async () => {
    const config = { ...DEFAULT_CONFIG, author: "Conor Liu" };
    const result = await resolveAuthor(config);
    expect(result).toBe("conor-liu");
  });

  it("falls back to git or OS when no config", async () => {
    const config = { ...DEFAULT_CONFIG };
    const result = await resolveAuthor(config);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// --- CLI --author / --all-authors ---

describe("parseArgs --author / --all-authors", () => {
  it("parses --author flag", () => {
    const opts = parseArgs(["extract", "--author", "alice"]);
    expect(opts.author).toBe("alice");
  });

  it("parses --all-authors flag", () => {
    const opts = parseArgs(["summary", "--all-authors"]);
    expect(opts.allAuthors).toBe(true);
  });

  it("parses both together", () => {
    const opts = parseArgs(["context", "--author", "bob", "--all-authors"]);
    expect(opts.author).toBe("bob");
    expect(opts.allAuthors).toBe(true);
  });
});

// --- Memory store with author ---

function makeMemory(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
  return {
    type: "decision",
    title: "Test Decision",
    date: "2026-04-20",
    context: "test context",
    content: "test content",
    sourceId: "src-id-001",
    sourceTitle: "test convo",
    sourceType: "cursor",
    author: "conor",
    ...overrides,
  };
}

describe("writeConversationMemories with author", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ai-memory-author-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes to author subdirectory", async () => {
    const m = makeMemory({ author: "alice" });
    await writeConversationMemories([m], tmpDir, "zh", { author: "alice" });

    const dirs = await readdir(join(tmpDir, "alice"));
    expect(dirs).toContain("decisions");

    const files = await readdir(join(tmpDir, "alice", "decisions"));
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.md$/);
  });

  it("writes to flat structure when no author", async () => {
    const m = makeMemory({ author: undefined });
    await writeConversationMemories([m], tmpDir);

    const dirs = await readdir(tmpDir);
    expect(dirs).toContain("decisions");
  });

  it("writes index under .index/{author}/", async () => {
    const m = makeMemory({ author: "bob", sourceId: "idx-test" });
    await writeConversationMemories([m], tmpDir, "zh", { author: "bob" });

    const indexFiles = await readdir(join(tmpDir, ".index", "bob"));
    expect(indexFiles).toContain("idx-test.json");
  });
});

describe("readAllMemories with author", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ai-memory-read-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads only specified author's memories", async () => {
    const m1 = makeMemory({ title: "Alice Decision", author: "alice", sourceId: "a1" });
    const m2 = makeMemory({ title: "Bob Decision", author: "bob", sourceId: "b1" });
    await writeConversationMemories([m1], tmpDir, "zh", { author: "alice" });
    await writeConversationMemories([m2], tmpDir, "zh", { author: "bob" });

    const aliceMemories = await readAllMemories(tmpDir, "alice");
    expect(aliceMemories.length).toBe(1);
    expect(aliceMemories[0].title).toBe("Alice Decision");

    const bobMemories = await readAllMemories(tmpDir, "bob");
    expect(bobMemories.length).toBe(1);
    expect(bobMemories[0].title).toBe("Bob Decision");
  });

  it("reads all authors when no author specified", async () => {
    const m1 = makeMemory({ title: "Alice Decision", author: "alice", sourceId: "a2" });
    const m2 = makeMemory({ title: "Bob Decision", author: "bob", sourceId: "b2" });
    await writeConversationMemories([m1], tmpDir, "zh", { author: "alice" });
    await writeConversationMemories([m2], tmpDir, "zh", { author: "bob" });

    const all = await readAllMemories(tmpDir);
    expect(all.length).toBe(2);
    const titles = all.map((m) => m.title).sort();
    expect(titles).toEqual(["Alice Decision", "Bob Decision"]);
  });

  it("reads legacy flat structure (backwards compat)", async () => {
    // Write without author (legacy flat structure)
    const m = makeMemory({ title: "Legacy Decision", author: undefined, sourceId: "legacy" });
    await writeConversationMemories([m], tmpDir);

    const all = await readAllMemories(tmpDir);
    expect(all.length).toBe(1);
    expect(all[0].title).toBe("Legacy Decision");
  });

  it("reads both legacy and author-namespaced memories", async () => {
    // Legacy flat
    const m1 = makeMemory({ title: "Old Decision", author: undefined, sourceId: "old" });
    await writeConversationMemories([m1], tmpDir);

    // New author-namespaced
    const m2 = makeMemory({ title: "New Decision", author: "conor", sourceId: "new" });
    await writeConversationMemories([m2], tmpDir, "zh", { author: "conor" });

    const all = await readAllMemories(tmpDir);
    expect(all.length).toBe(2);
  });

  it("parses author field from file content", async () => {
    const m = makeMemory({ title: "Authored Memory", author: "conor" });
    await writeConversationMemories([m], tmpDir, "zh", { author: "conor" });

    const memories = await readAllMemories(tmpDir, "conor");
    expect(memories[0].author).toBe("conor");
  });
});
