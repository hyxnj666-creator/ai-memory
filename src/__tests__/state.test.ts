import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test state functions by pointing STATE_PATH to a temp dir.
// Since STATE_PATH is module-level const, we mock fs operations instead.

describe("markProcessed", () => {
  it("sets turnCount and processedAt", async () => {
    const { markProcessed } = await import("../store/state.js");
    const state = { lastExtraction: 0, processedConversations: {} };
    markProcessed(state, "abc-123", 42);
    const entry = state.processedConversations["abc-123"];
    expect(typeof entry).toBe("object");
    if (typeof entry === "object") {
      expect(entry.turnCount).toBe(42);
      expect(entry.processedAt).toBeGreaterThan(0);
    }
    expect(state.lastExtraction).toBeGreaterThan(0);
  });
});

describe("getConversationState backwards compat", () => {
  it("converts legacy numeric value to ConversationState", async () => {
    const { getConversationState } = await import("../types.js");
    const state = {
      lastExtraction: 0,
      processedConversations: { "old-id": 1234567890 } as Record<string, unknown>,
    };
    const cs = getConversationState(state as Parameters<typeof getConversationState>[0], "old-id");
    expect(cs).not.toBeNull();
    expect(cs!.processedAt).toBe(1234567890);
    expect(cs!.turnCount).toBe(0);
  });

  it("returns null for unknown id", async () => {
    const { getConversationState } = await import("../types.js");
    const state = { lastExtraction: 0, processedConversations: {} };
    expect(getConversationState(state, "missing")).toBeNull();
  });
});
