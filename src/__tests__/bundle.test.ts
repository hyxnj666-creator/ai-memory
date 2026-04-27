import { describe, it, expect } from "vitest";
import {
  buildBundle,
  parseBundle,
  planImport,
  memoryToBundleEntry,
  bundleEntryToMemory,
  BundleParseError,
} from "../bundle/bundle.js";
import { BUNDLE_VERSION, type ExtractedMemory } from "../types.js";

function mem(
  overrides: Partial<ExtractedMemory> = {}
): ExtractedMemory {
  return {
    type: "decision",
    title: "Use OAuth for auth",
    date: "2026-04-01",
    context: "User choose between OAuth and JWT",
    content: "OAuth with GitHub provider because team already uses it",
    reasoning: "Lower ops burden",
    sourceId: "b5677be8-0000-1111-2222-aaaaaaaaaaaa",
    sourceTitle: "resume tool",
    sourceType: "cursor",
    author: "alice",
    status: "active",
    ...overrides,
  };
}

describe("bundle: serialize / parse", () => {
  it("round-trips a single memory", () => {
    const m = mem();
    const entry = memoryToBundleEntry(m);
    const restored = bundleEntryToMemory(entry);
    expect(restored).toMatchObject({
      type: "decision",
      title: m.title,
      content: m.content,
      sourceId: m.sourceId,
      sourceType: m.sourceType,
      author: "alice",
      status: "active",
    });
  });

  it("buildBundle populates version, count, producer", () => {
    const bundle = buildBundle([mem(), mem({ title: "Other" })], {
      exportedBy: "alice",
      scope: "sourceId=b5677be8",
    });
    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.memoryCount).toBe(2);
    expect(bundle.exportedBy).toBe("alice");
    expect(bundle.scope).toBe("sourceId=b5677be8");
    expect(bundle.producer).toMatch(/^ai-memory-cli@/);
    expect(new Date(bundle.exportedAt).toISOString()).toBe(bundle.exportedAt);
  });

  it("parseBundle accepts a valid bundle", () => {
    const bundle = buildBundle([mem()]);
    const json = JSON.stringify(bundle);
    const parsed = parseBundle(json);
    expect(parsed.memories).toHaveLength(1);
    expect(parsed.memories[0].title).toBe(bundle.memories[0].title);
  });

  it("parseBundle rejects wrong version", () => {
    const bundle = buildBundle([mem()]);
    const mutated = { ...bundle, version: 999 };
    expect(() => parseBundle(JSON.stringify(mutated))).toThrow(BundleParseError);
    expect(() => parseBundle(JSON.stringify(mutated))).toThrow(/Unsupported bundle version/);
  });

  it("parseBundle rejects missing memories", () => {
    expect(() => parseBundle(JSON.stringify({ version: BUNDLE_VERSION }))).toThrow(/memories/);
  });

  it("parseBundle rejects malformed JSON", () => {
    expect(() => parseBundle("{not json")).toThrow(/Invalid JSON/);
  });

  it("parseBundle rejects invalid type", () => {
    const bundle = {
      version: BUNDLE_VERSION,
      memories: [{ ...memoryToBundleEntry(mem()), type: "bogus" }],
    };
    expect(() => parseBundle(JSON.stringify(bundle))).toThrow(/type must be one of/);
  });

  it("parseBundle rejects invalid date", () => {
    const bundle = {
      version: BUNDLE_VERSION,
      memories: [{ ...memoryToBundleEntry(mem()), date: "April 1" }],
    };
    expect(() => parseBundle(JSON.stringify(bundle))).toThrow(/YYYY-MM-DD/);
  });

  it("parseBundle rejects invalid sourceType", () => {
    const bundle = {
      version: BUNDLE_VERSION,
      memories: [{ ...memoryToBundleEntry(mem()), sourceType: "vim" }],
    };
    expect(() => parseBundle(JSON.stringify(bundle))).toThrow(/sourceType must be one of/);
  });

  // v2.5-06 audit pass — Finding A regression. The whitelist that decides
  // which `sourceType` strings are accepted on import must be widened in
  // the same wave that ships a new source adapter; otherwise users with
  // memories extracted from the new source can't move the bundle to
  // another machine without an explanatory error. This test pins each
  // production source type so any future addition (a 6th source) that
  // forgets to update VALID_SOURCE_TYPES fails this check loudly rather
  // than silently breaking import.
  it("parseBundle accepts every production sourceType (covers all 5 sources)", () => {
    const allTypes = [
      "cursor",
      "claude-code",
      "windsurf",
      "copilot",
      "codex",
    ] as const;
    for (const t of allTypes) {
      const bundle = {
        version: BUNDLE_VERSION,
        memories: [{ ...memoryToBundleEntry(mem()), sourceType: t }],
      };
      const parsed = parseBundle(JSON.stringify(bundle));
      expect(parsed.memories[0].sourceType).toBe(t);
    }
  });

  it("parseBundle rejects empty title", () => {
    const bundle = {
      version: BUNDLE_VERSION,
      memories: [{ ...memoryToBundleEntry(mem()), title: "" }],
    };
    expect(() => parseBundle(JSON.stringify(bundle))).toThrow(/title/);
  });

  it("parseBundle tolerates extra unknown top-level fields", () => {
    const bundle = {
      version: BUNDLE_VERSION,
      memories: [memoryToBundleEntry(mem())],
      futureField: "ignored",
    };
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed.memories).toHaveLength(1);
  });
});

describe("bundle: planImport", () => {
  it("marks all bundle memories as new when local is empty", () => {
    const bundle = buildBundle([mem({ title: "A" }), mem({ title: "B" })]);
    const plan = planImport(bundle, []);
    expect(plan.toWrite).toHaveLength(2);
    expect(plan.duplicates).toHaveLength(0);
  });

  it("detects duplicates by (author, type, date, title)", () => {
    const existing = [mem({ title: "A" })];
    const bundle = buildBundle([mem({ title: "A" }), mem({ title: "B" })]);
    const plan = planImport(bundle, existing);
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.toWrite[0].title).toBe("B");
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0].title).toBe("A");
  });

  it("different authors on same title => not a duplicate", () => {
    const existing = [mem({ title: "A", author: "bob" })];
    const bundle = buildBundle([mem({ title: "A", author: "alice" })]);
    const plan = planImport(bundle, existing);
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(0);
  });

  it("different dates on same title => not a duplicate", () => {
    const existing = [mem({ title: "A", date: "2026-03-01" })];
    const bundle = buildBundle([mem({ title: "A", date: "2026-04-01" })]);
    const plan = planImport(bundle, existing);
    expect(plan.toWrite).toHaveLength(1);
  });

  it("title comparison is case-insensitive", () => {
    const existing = [mem({ title: "Use OAuth" })];
    const bundle = buildBundle([mem({ title: "use oauth" })]);
    const plan = planImport(bundle, existing);
    expect(plan.duplicates).toHaveLength(1);
  });

  it("authorOverride reassigns author on imported entries before dedup", () => {
    // Local memory owned by "alice"; bundle has same memory owned by "bob".
    // With authorOverride=alice, the imported memory becomes alice's => duplicate.
    const existing = [mem({ title: "A", author: "alice" })];
    const bundle = buildBundle([mem({ title: "A", author: "bob" })]);
    const plan = planImport(bundle, existing, "alice");
    expect(plan.duplicates).toHaveLength(1);
  });
});

describe("bundle: full round-trip through JSON", () => {
  it("preserves all fields including optional ones", () => {
    const original = mem({
      impact: "All new services use OAuth",
      alternatives: "JWT rejected due to key rotation cost",
      status: "resolved",
    });
    const bundle = buildBundle([original]);
    const reparsed = parseBundle(JSON.stringify(bundle));
    const restored = bundleEntryToMemory(reparsed.memories[0]);
    expect(restored.impact).toBe(original.impact);
    expect(restored.alternatives).toBe(original.alternatives);
    expect(restored.status).toBe("resolved");
    expect(restored.reasoning).toBe(original.reasoning);
  });

  it("active status survives when undefined in source", () => {
    const m = mem();
    delete m.status;
    const bundle = buildBundle([m]);
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed.memories[0].status).toBe("active");
  });
});
