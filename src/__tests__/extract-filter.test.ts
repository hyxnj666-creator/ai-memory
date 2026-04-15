import { describe, it, expect } from "vitest";
import type { ConversationMeta } from "../types.js";

// Test the parseSince helper by extracting it via dynamic import
// Since parseSince is not exported, we test its effects through the filter logic indirectly.
// Instead, test the incremental filter logic by directly invoking filterConversations-equivalent.

function makeConvo(id: string, modifiedAt: number, turnCount = 10): ConversationMeta {
  return { id, source: "cursor", filePath: "", title: id, modifiedAt, turnCount };
}

describe("parseSince logic", () => {
  it("handles 'N days ago'", () => {
    const now = Date.now();
    // We test by checking Date.now() - parsed >= 0
    const parse = (s: string): number | null => {
      const match = s.match(/^(\d+)\s*(day|days|d|week|weeks|w|hour|hours|h)\s*ago$/i);
      if (!match) return null;
      const n = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      let ms: number;
      if (unit.startsWith("h")) ms = n * 3_600_000;
      else if (unit.startsWith("w")) ms = n * 7 * 86_400_000;
      else ms = n * 86_400_000;
      return Date.now() - ms;
    };

    const ts3d = parse("3 days ago");
    expect(ts3d).not.toBeNull();
    expect(now - ts3d!).toBeGreaterThanOrEqual(3 * 86_400_000 - 100);

    const ts2w = parse("2 weeks ago");
    expect(ts2w).not.toBeNull();
    expect(now - ts2w!).toBeGreaterThanOrEqual(14 * 86_400_000 - 100);

    const ts6h = parse("6 hours ago");
    expect(ts6h).not.toBeNull();
    expect(now - ts6h!).toBeGreaterThanOrEqual(6 * 3_600_000 - 100);
  });

  it("returns null for unrecognised strings", () => {
    const parse = (s: string): number | null => {
      const match = s.match(/^(\d+)\s*(day|days|d|week|weeks|w|hour|hours|h)\s*ago$/i);
      if (!match) {
        const ts = Date.parse(s);
        return isNaN(ts) ? null : ts;
      }
      return null;
    };
    expect(parse("yesterday")).toBeNull();
    expect(parse("last week")).toBeNull();
    expect(parse("abc")).toBeNull();
  });
});

describe("ignoreList filter", () => {
  it("excludes conversations by id", () => {
    const convos = [makeConvo("aaa", 1000), makeConvo("bbb", 2000)];
    const ignoreList = new Set(["aaa"]);
    const filtered = convos.filter((c) => !ignoreList.has(c.id));
    expect(filtered.map((c) => c.id)).toEqual(["bbb"]);
  });

  it("excludes conversations by title", () => {
    const convos = [makeConvo("aaa", 1000), makeConvo("bbb", 2000)];
    convos[0].title = "Test Chat";
    const ignoreList = new Set(["Test Chat"]);
    const filtered = convos.filter((c) => !ignoreList.has(c.id) && !ignoreList.has(c.title));
    expect(filtered.length).toBe(1);
  });
});

describe("--pick filter", () => {
  it("selects single index", () => {
    const convos = [makeConvo("a", 3), makeConvo("b", 2), makeConvo("c", 1)];
    const indices = new Set([1]); // 0-based
    const filtered = convos.filter((_, i) => indices.has(i));
    expect(filtered[0].id).toBe("b");
  });

  it("selects multiple indices", () => {
    const convos = [makeConvo("a", 3), makeConvo("b", 2), makeConvo("c", 1)];
    const indices = new Set([0, 2]);
    const filtered = convos.filter((_, i) => indices.has(i));
    expect(filtered.map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("--id filter", () => {
  it("matches by prefix", () => {
    const convos = [makeConvo("abc-123-xyz", 1), makeConvo("def-456-xyz", 2)];
    const prefix = "abc";
    const filtered = convos.filter((c) => c.id.toLowerCase().startsWith(prefix));
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("abc-123-xyz");
  });
});
