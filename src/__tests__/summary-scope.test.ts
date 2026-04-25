import { describe, it, expect } from "vitest";
import { groupSummaryConversations } from "../commands/summary.js";
import type { ExtractedMemory } from "../types.js";

function mem(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
  return {
    type: "decision",
    title: "T",
    date: "2026-04-01",
    context: "",
    content: "c",
    sourceId: "a1-uuid",
    sourceTitle: "conv A",
    sourceType: "cursor",
    status: "active",
    ...overrides,
  };
}

describe("groupSummaryConversations", () => {
  it("groups by sourceId and counts", () => {
    const memories: ExtractedMemory[] = [
      mem({ date: "2026-04-01" }),
      mem({ date: "2026-04-03" }),
      mem({ sourceId: "b2-uuid", sourceTitle: "conv B", date: "2026-03-15" }),
    ];
    const summaries = groupSummaryConversations(memories);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].sourceId).toBe("a1-uuid");
    expect(summaries[0].count).toBe(2);
    expect(summaries[0].lastDate).toBe("2026-04-03");
  });

  it("sorts by lastDate desc", () => {
    const memories: ExtractedMemory[] = [
      mem({ sourceId: "old", sourceTitle: "old chat", date: "2026-01-01" }),
      mem({ sourceId: "new", sourceTitle: "new chat", date: "2026-04-01" }),
    ];
    const summaries = groupSummaryConversations(memories);
    expect(summaries[0].sourceId).toBe("new");
    expect(summaries[1].sourceId).toBe("old");
  });

  it("falls back to (untitled) when sourceTitle is empty", () => {
    const memories: ExtractedMemory[] = [
      mem({ sourceTitle: "" }),
    ];
    const summaries = groupSummaryConversations(memories);
    expect(summaries[0].sourceTitle).toBe("(untitled)");
  });

  it("skips memories without sourceId", () => {
    const memories: ExtractedMemory[] = [
      mem({ sourceId: "" }),
      mem({ sourceId: "real" }),
    ];
    const summaries = groupSummaryConversations(memories);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].sourceId).toBe("real");
  });

  it("handles empty input", () => {
    expect(groupSummaryConversations([])).toEqual([]);
  });
});
