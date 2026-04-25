import { describe, it, expect } from "vitest";
import { scopeBySource } from "../commands/context.js";
import type { ExtractedMemory } from "../types.js";

function mem(
  id: string,
  sourceId: string,
  sourceTitle: string,
  date = "2026-04-01",
  type: ExtractedMemory["type"] = "decision"
): ExtractedMemory {
  return {
    type,
    title: id,
    date,
    context: "",
    content: `content-${id}`,
    sourceId,
    sourceTitle,
    sourceType: "cursor",
    status: "active",
  };
}

describe("scopeBySource", () => {
  const store: ExtractedMemory[] = [
    mem("m1", "b5677be8-1111-2222-3333-aaaaaaaaaaaa", "resume tool", "2026-04-01"),
    mem("m2", "b5677be8-1111-2222-3333-aaaaaaaaaaaa", "resume tool", "2026-04-02"),
    mem("m3", "ff12abc3-9999-8888-7777-bbbbbbbbbbbb", "ai-lab", "2026-03-15"),
    mem("m4", "11aa22bb-0000-0000-0000-cccccccccccc", "ESM module system", "2026-02-10"),
    mem("m5", "cc44dd55-0000-0000-0000-dddddddddddd", "resume reviewer", "2026-04-05"),
  ];

  // --- --source-id ---

  it("filters by sourceId exact full match", () => {
    const result = scopeBySource(store, "b5677be8-1111-2222-3333-aaaaaaaaaaaa", undefined, false);
    expect(result.memories).toHaveLength(2);
    expect(result.memories.every((m) => m.sourceTitle === "resume tool")).toBe(true);
    expect(result.conversationCount).toBe(1);
    expect(result.ambiguityWarning).toBeNull();
  });

  it("filters by sourceId prefix (like git short hash)", () => {
    const result = scopeBySource(store, "ff12", undefined, false);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].sourceTitle).toBe("ai-lab");
    expect(result.ambiguityWarning).toBeNull();
  });

  it("is case-insensitive for sourceId", () => {
    const result = scopeBySource(store, "FF12ABC3", undefined, false);
    expect(result.memories).toHaveLength(1);
  });

  it("throws when sourceId prefix has no match", () => {
    expect(() => scopeBySource(store, "zzzz", undefined, false)).toThrow(/No memories found/);
  });

  // --- --convo ---

  it("filters by convo title substring", () => {
    const result = scopeBySource(store, undefined, "ai-lab", false);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].sourceTitle).toBe("ai-lab");
  });

  it("is case-insensitive for convo", () => {
    const result = scopeBySource(store, undefined, "AI-LAB", false);
    expect(result.memories).toHaveLength(1);
  });

  it("picks the most recent conversation when --convo matches multiple", () => {
    // "resume tool" has latest date 2026-04-02, "resume reviewer" has 2026-04-05
    const result = scopeBySource(store, undefined, "resume", false);
    expect(result.conversationCount).toBe(1);
    expect(result.memories[0].sourceTitle).toBe("resume reviewer");
    expect(result.ambiguityWarning).toMatch(/matched 2 conversations/);
    expect(result.ambiguityWarning).toMatch(/resume reviewer/);
  });

  it("includes all matching conversations when allMatching=true", () => {
    const result = scopeBySource(store, undefined, "resume", true);
    expect(result.memories).toHaveLength(3); // 2 from "resume tool" + 1 from "resume reviewer"
    expect(result.conversationCount).toBe(2);
    expect(result.ambiguityWarning).toBeNull();
  });

  it("throws when convo matches no conversation", () => {
    expect(() => scopeBySource(store, undefined, "nonexistent", false)).toThrow(/No conversations found/);
  });

  // --- combined ---

  it("combines sourceId + convo (intersection)", () => {
    // sourceId picks "resume tool", convo "resume" would match both — but we already narrowed
    const result = scopeBySource(
      store,
      "b5677be8",
      "resume",
      false
    );
    expect(result.memories).toHaveLength(2);
    expect(result.memories.every((m) => m.sourceTitle === "resume tool")).toBe(true);
    expect(result.conversationCount).toBe(1);
  });

  it("flags ambiguity for a short prefix hitting multiple conversations", () => {
    // Create a store where multiple sourceIds share the same first char
    const ambiguous: ExtractedMemory[] = [
      mem("a1", "aa111111-1111-1111-1111-111111111111", "conv A", "2026-04-01"),
      mem("a2", "aa222222-2222-2222-2222-222222222222", "conv B", "2026-04-02"),
    ];
    const result = scopeBySource(ambiguous, "aa", undefined, false);
    expect(result.memories).toHaveLength(2);
    expect(result.conversationCount).toBe(2);
    expect(result.ambiguityWarning).toMatch(/matches 2 conversations/);
  });

  // --- passthrough ---

  it("returns full set unchanged when neither flag given", () => {
    const result = scopeBySource(store, undefined, undefined, false);
    expect(result.memories).toEqual(store);
    expect(result.conversationCount).toBe(4);
  });
});
