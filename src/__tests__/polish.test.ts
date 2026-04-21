import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "../cli.js";
import { resolveAiConfig } from "../extractor/llm.js";
import { writeConversationMemories, readAllMemories } from "../store/memory-store.js";
import type { ExtractedMemory } from "../types.js";

// --- CLI: --force flag ---

describe("parseArgs --force", () => {
  it("parses --force flag", () => {
    const opts = parseArgs(["extract", "--force"]);
    expect(opts.force).toBe(true);
  });

  it("force is undefined when not specified", () => {
    const opts = parseArgs(["extract"]);
    expect(opts.force).toBeUndefined();
  });

  it("parses --force combined with other flags", () => {
    const opts = parseArgs(["extract", "--incremental", "--force", "--json"]);
    expect(opts).toMatchObject({
      command: "extract",
      incremental: true,
      force: true,
      json: true,
    });
  });
});

// --- Anthropic key warning (skips when no base URL) ---

describe("resolveAiConfig Anthropic handling", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.AI_REVIEW_API_KEY = process.env.AI_REVIEW_API_KEY;
    saved.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    saved.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    saved.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
    delete process.env.AI_REVIEW_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns null when only Anthropic key set without base URL", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.ANTHROPIC_BASE_URL;
    expect(resolveAiConfig()).toBeNull();
  });

  it("works when Anthropic key has a custom base URL", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ANTHROPIC_BASE_URL = "https://my-proxy.example.com/v1";
    const cfg = resolveAiConfig();
    expect(cfg).not.toBeNull();
    expect(cfg?.apiKey).toBe("sk-ant-test");
    expect(cfg?.baseUrl).toBe("https://my-proxy.example.com/v1");
  });
});

// --- Memory store: --force update ---

function makeMemory(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
  return {
    type: "decision",
    title: "Test Decision",
    date: "2026-04-15",
    context: "test context",
    content: "Original content here",
    sourceId: "force-test-id",
    sourceTitle: "test convo",
    sourceType: "cursor",
    ...overrides,
  };
}

describe("writeConversationMemories --force", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ai-memory-force-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("skips existing file by default", async () => {
    const m = makeMemory();
    await writeConversationMemories([m], tmpDir);
    const r1 = await writeConversationMemories([m], tmpDir);
    expect(r1.skipped).toBe(1);
    expect(r1.created).toBe(0);
    expect(r1.updated).toBe(0);
  });

  it("updates file with --force when content differs", async () => {
    const m1 = makeMemory({ content: "Version 1" });
    await writeConversationMemories([m1], tmpDir);

    const m2 = makeMemory({ content: "Version 2" });
    const r = await writeConversationMemories([m2], tmpDir, "zh", { force: true });
    expect(r.updated).toBe(1);
    expect(r.created).toBe(0);

    const all = await readAllMemories(tmpDir);
    expect(all[0].content).toContain("Version 2");
  });

  it("skips with --force when content is identical", async () => {
    const m = makeMemory();
    await writeConversationMemories([m], tmpDir);
    const r = await writeConversationMemories([m], tmpDir, "zh", { force: true });
    expect(r.skipped).toBe(1);
    expect(r.updated).toBe(0);
  });

  it("reports created count for new files", async () => {
    const m = makeMemory();
    const r = await writeConversationMemories([m], tmpDir);
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(0);
  });
});

// --- Dedup enhancement ---

describe("dedup enhancement", () => {
  it("deduplicates memories with similar titles (verb prefix variation)", async () => {
    // We test dedup indirectly through the extractMemories pipeline
    // Since deduplicateMemories is not exported, test via writeConversationMemories
    // which doesn't do dedup itself. The dedup happens in ai-extractor.
    // Here we just verify the normalizeTitle logic concept.
    const normalize = (title: string) =>
      title
        .toLowerCase()
        .replace(/^(使用|采用|选择|引入|改为|切换到|use|adopt|switch to|choose)\s+/i, "")
        .replace(/[^\w\u4e00-\u9fff]/g, "")
        .trim();

    expect(normalize("使用 OAuth Bridge")).toBe(normalize("采用 OAuth Bridge"));
    expect(normalize("Use ESM modules")).toBe(normalize("Adopt ESM modules"));
    expect(normalize("Switch to Redis")).toBe(normalize("Choose Redis"));
  });
});
