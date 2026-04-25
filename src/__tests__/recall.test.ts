import { describe, it, expect } from "vitest";
import { filterMemoriesForRecall } from "../commands/recall.js";
import type { ExtractedMemory } from "../types.js";

function mem(overrides: Partial<ExtractedMemory>): ExtractedMemory {
  return {
    type: "decision",
    title: "Use OAuth 2.0 PKCE for SPA",
    date: "2026-04-20",
    context: "auth flow choice",
    content: "All single-page apps must use PKCE; never implicit flow.",
    sourceId: "abc123",
    sourceTitle: "auth chat",
    sourceType: "cursor",
    author: "conor",
    status: "active",
    ...overrides,
  };
}

describe("filterMemoriesForRecall", () => {
  const store: ExtractedMemory[] = [
    mem({ title: "Use OAuth 2.0 PKCE for SPA" }),
    mem({
      title: "GraphQL pagination convention",
      content: "Use cursor pagination for all paged endpoints",
      type: "convention",
    }),
    mem({
      title: "Switch from REST to GraphQL",
      reasoning: "Better caching for OAuth-protected endpoints",
      type: "architecture",
    }),
    mem({
      title: "Old OAuth implicit flow",
      status: "resolved",
    }),
  ];

  it("matches title substring case-insensitively", () => {
    const r = filterMemoriesForRecall(store, "oauth");
    // Default excludes resolved.
    expect(r.map((m) => m.title)).toEqual(
      expect.arrayContaining([
        "Use OAuth 2.0 PKCE for SPA",
        "Switch from REST to GraphQL", // matches via reasoning
      ])
    );
    expect(r.find((m) => m.status === "resolved")).toBeUndefined();
  });

  it("matches content substring", () => {
    const r = filterMemoriesForRecall(store, "cursor pagination");
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe("convention");
  });

  it("matches reasoning substring", () => {
    const r = filterMemoriesForRecall(store, "Better caching");
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe("Switch from REST to GraphQL");
  });

  it("includes resolved memories only when --include-resolved is set", () => {
    const without = filterMemoriesForRecall(store, "OAuth");
    const withRes = filterMemoriesForRecall(store, "OAuth", {
      includeResolved: true,
    });
    expect(withRes.length).toBeGreaterThan(without.length);
    expect(withRes.some((m) => m.status === "resolved")).toBe(true);
  });

  it("filters by type", () => {
    const r = filterMemoriesForRecall(store, "OAuth", {
      types: ["convention"],
    });
    // No convention memory mentions OAuth → empty.
    expect(r).toHaveLength(0);

    const r2 = filterMemoriesForRecall(store, "GraphQL", {
      types: ["convention"],
    });
    expect(r2).toHaveLength(1);
    expect(r2[0].type).toBe("convention");
  });

  it("returns [] when query matches nothing", () => {
    const r = filterMemoriesForRecall(store, "kubernetes");
    expect(r).toEqual([]);
  });

  it("treats empty/whitespace types[] as 'no type filter'", () => {
    const r = filterMemoriesForRecall(store, "OAuth", { types: [] });
    expect(r.length).toBeGreaterThan(0);
  });
});
