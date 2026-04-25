import { describe, it, expect } from "vitest";
import { getDashboardHtml } from "../dashboard/html.js";
import { buildConversations } from "../dashboard/server.js";
import type { ExtractedMemory } from "../types.js";

describe("getDashboardHtml", () => {
  it("returns valid HTML", () => {
    const html = getDashboardHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("ai-memory");
    expect(html).toContain("</html>");
  });

  it("contains all navigation tabs", () => {
    const html = getDashboardHtml();
    expect(html).toContain("Overview");
    expect(html).toContain("Memories");
    expect(html).toContain("Conversations");
    expect(html).toContain("Graph");
    expect(html).toContain("Quality");
    expect(html).toContain("Export");
  });

  it("includes D3.js for graph visualization", () => {
    const html = getDashboardHtml();
    expect(html).toContain("d3.v7.min.js");
  });

  it("includes Tailwind CSS", () => {
    const html = getDashboardHtml();
    expect(html).toContain("tailwindcss");
  });

  it("includes all memory type colors and icons", () => {
    const html = getDashboardHtml();
    expect(html).toContain("decision");
    expect(html).toContain("architecture");
    expect(html).toContain("convention");
    expect(html).toContain("todo");
    expect(html).toContain("issue");
  });

  it("includes API fetch functions", () => {
    const html = getDashboardHtml();
    expect(html).toContain("api('memories')");
    expect(html).toContain("api('stats')");
    expect(html).toContain("api('graph')");
    expect(html).toContain("api('quality')");
    expect(html).toContain("api('conversations')");
  });

  it("includes conversations panel renderer with CLI hint", () => {
    const html = getDashboardHtml();
    expect(html).toContain("renderConversations");
    expect(html).toContain("selectConvo");
    expect(html).toContain("copyConvoCommand");
    expect(html).toContain("ai-memory context --source-id");
  });

  it("shows conversation title on Overview recent memories and makes it clickable", () => {
    const html = getDashboardHtml();
    // Overview's recentList references sourceChip built from sourceTitle + sourceId
    expect(html).toContain("sourceChip");
    // Both Overview and Memories panels link to jumpToConversation for source title chips
    expect(html).toContain("jumpToConversation");
    // Event propagation is stopped so clicking the source chip doesn't trigger showDetail
    expect(html).toContain("event.stopPropagation(); jumpToConversation");
  });

  it("includes quality panel renderer", () => {
    const html = getDashboardHtml();
    expect(html).toContain("renderQuality");
    expect(html).toContain("Specificity distribution");
    expect(html).toContain("Duplicate");
  });

  it("includes export functionality", () => {
    const html = getDashboardHtml();
    expect(html).toContain("exportJson");
    expect(html).toContain("exportObsidian");
    expect(html).toContain("copyAll");
  });

  // Regression: a previous build escaped only single-quotes in JSON-stringified
  // inline-handler arguments, so onclick="selectConvo("549bedda-...")" had its
  // attribute terminated by the inner double-quote and clicking another
  // conversation card silently did nothing. The dashboard must now route every
  // onclick payload through attrJson() which entity-encodes both quote styles.
  it("uses attrJson to entity-encode inline handler arguments (no raw inner quotes)", () => {
    const html = getDashboardHtml();
    expect(html).toContain("function attrJson(v)");
    expect(html).toContain("&quot;");
    // The dashboard JS is embedded as raw source; if any onclick handler still
    // uses JSON.stringify(...).replace(/'/g, '&#39;') (the old, unsafe form)
    // we reintroduce the click-fails-on-double-quote bug.
    expect(html).not.toMatch(/JSON\.stringify\([^)]+\)\.replace\(\/'\/g/);
    expect(html).toContain("onclick=\"selectConvo(${sidArg})\"");
    expect(html).toContain("onclick=\"loadMemoryDetail(${idArg})\"");
  });

  // Pagination: at v2.4 a single conversation routinely produces 200+ memories,
  // and the Memories tab can hold thousands. Both lists must paginate so users
  // aren't forced to scroll through one giant DOM column.
  it("paginates Memories tab and Conversations memory list with shared PAGE_SIZE", () => {
    const html = getDashboardHtml();
    expect(html).toContain("const PAGE_SIZE = 50");
    expect(html).toContain("function renderPager(scope, total, page, pages, start)");
    expect(html).toContain("function setPage(scope, p)");
    // Memories tab routes through renderMemListPage so the pager can re-slice
    // the cached filtered result without re-running the search predicate.
    expect(html).toContain("function renderMemListPage()");
    expect(html).toContain("memListFiltered = filtered");
    expect(html).toContain("memListPage = 1");
    // Conversations tab resets page on convo switch / cross-tab jump so the
    // user lands on page 1 of the newly selected conversation, not page N of
    // the previous one (which may have fewer pages).
    expect(html).toContain("convoMemPage = 1");
  });
});

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

describe("buildConversations", () => {
  it("groups memories by sourceId, preserving counts and types", () => {
    const memories: ExtractedMemory[] = [
      mem({ title: "T1", date: "2026-04-01" }),
      mem({ title: "T2", date: "2026-04-03", type: "architecture" }),
      mem({ title: "T3", date: "2026-03-15", sourceId: "b2-uuid", sourceTitle: "conv B" }),
    ];
    const convos = buildConversations(memories);
    expect(convos).toHaveLength(2);
    // Sorted by lastDate desc → conv A first (lastDate 2026-04-03)
    expect(convos[0].sourceId).toBe("a1-uuid");
    expect(convos[0].count).toBe(2);
    expect(convos[0].firstDate).toBe("2026-04-01");
    expect(convos[0].lastDate).toBe("2026-04-03");
    expect(convos[0].types).toEqual({ decision: 1, architecture: 1 });
    expect(convos[0].memories).toHaveLength(2);
    expect(convos[1].sourceId).toBe("b2-uuid");
  });

  it("sorts memories within a conversation by date desc", () => {
    const memories: ExtractedMemory[] = [
      mem({ title: "old", date: "2026-01-01" }),
      mem({ title: "new", date: "2026-04-01" }),
      mem({ title: "mid", date: "2026-02-15" }),
    ];
    const [convo] = buildConversations(memories);
    expect(convo.memories.map((m) => m.title)).toEqual(["new", "mid", "old"]);
  });

  it("skips memories without sourceId", () => {
    const memories: ExtractedMemory[] = [
      mem({ sourceId: "" }),
      mem({ sourceId: "a1-uuid" }),
    ];
    const convos = buildConversations(memories);
    expect(convos).toHaveLength(1);
    expect(convos[0].count).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(buildConversations([])).toEqual([]);
  });

  it("handles memories with empty dates without locking firstDate to empty string", () => {
    const memories: ExtractedMemory[] = [
      mem({ title: "nodate", date: "" }),
      mem({ title: "real", date: "2026-04-01" }),
      mem({ title: "later", date: "2026-04-10" }),
    ];
    const [convo] = buildConversations(memories);
    expect(convo.firstDate).toBe("2026-04-01");
    expect(convo.lastDate).toBe("2026-04-10");
  });

  it("escapes source type fallback to gray badge for unknown source", () => {
    const memories: ExtractedMemory[] = [
      mem({ sourceType: "unknown" as ExtractedMemory["sourceType"] }),
    ];
    const [convo] = buildConversations(memories);
    expect(convo.sourceType).toBe("unknown");
  });
});
