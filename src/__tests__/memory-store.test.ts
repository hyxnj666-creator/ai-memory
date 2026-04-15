import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeMemories, readAllMemories } from "../store/memory-store.js";
import type { ExtractedMemory } from "../types.js";

const TEST_DIR = join(process.cwd(), ".test-ai-memory");

const sampleMemory = (overrides?: Partial<ExtractedMemory>): ExtractedMemory => ({
  type: "decision",
  title: "Use OAuth Bridge Pattern",
  date: "2026-04-10",
  context: "Needed OAuth in WebView",
  content: "Use static HTML bridge page with postMessage",
  reasoning: "WebView can't receive redirects directly",
  alternatives: "Deep Link, Custom URL Scheme",
  impact: "login page, oauth-web",
  sourceId: "fa49d306-0000-0000-0000-000000000000",
  sourceTitle: "OAuth Integration",
  sourceType: "cursor",
  ...overrides,
});

describe("writeMemories + readAllMemories", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("writes a decision memory to the correct directory", async () => {
    const memories = [sampleMemory()];
    await writeMemories(memories, TEST_DIR);

    const result = await readAllMemories(TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("decision");
    expect(result[0].title).toBe("Use OAuth Bridge Pattern");
  });

  it("writes memories of different types to separate directories", async () => {
    const memories: ExtractedMemory[] = [
      sampleMemory({ type: "decision", title: "OAuth Bridge" }),
      sampleMemory({ type: "todo", title: "Add rate limiting", content: "Rate limit all endpoints" }),
      sampleMemory({ type: "architecture", title: "Module design", content: "Layered architecture" }),
    ];

    await writeMemories(memories, TEST_DIR);
    const result = await readAllMemories(TEST_DIR);

    expect(result).toHaveLength(3);
    const types = result.map((m) => m.type).sort();
    expect(types).toEqual(["architecture", "decision", "todo"]);
  });

  it("returns empty array when no memories exist", async () => {
    const result = await readAllMemories(TEST_DIR);
    expect(result).toHaveLength(0);
  });

  it("does not duplicate memory with same title", async () => {
    const memories = [sampleMemory()];
    await writeMemories(memories, TEST_DIR);
    await writeMemories(memories, TEST_DIR); // write again

    const result = await readAllMemories(TEST_DIR);
    expect(result).toHaveLength(1);
  });

  it("appends memory with different title to same file", async () => {
    const m1 = sampleMemory({ title: "First Decision" });
    const m2 = sampleMemory({
      title: "Second Decision",
      content: "Another approach",
    });

    await writeMemories([m1], TEST_DIR);
    await writeMemories([m2], TEST_DIR);

    const result = await readAllMemories(TEST_DIR);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("handles all memory types without error", async () => {
    const types: ExtractedMemory["type"][] = [
      "decision",
      "architecture",
      "convention",
      "todo",
      "issue",
    ];

    const memories = types.map((type, i) =>
      sampleMemory({ type, title: `Test ${i}`, content: `Content ${i}` })
    );

    await expect(writeMemories(memories, TEST_DIR)).resolves.not.toThrow();
    const result = await readAllMemories(TEST_DIR);
    expect(result).toHaveLength(5);
  });
});
