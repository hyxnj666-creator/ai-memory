import { describe, it, expect } from "vitest";
import {
  scoreFixture,
  aggregateByType,
  buildScorecard,
  renderScorecard,
} from "../scorer.js";
import type { Fixture } from "../types.js";
import type { ExtractedMemory } from "../../../src/types.js";

// ---------- Helpers ----------

function fix(
  id: string,
  expected: Fixture["expected"],
  description = id
): Fixture {
  return {
    id,
    description,
    conversation: { title: id, turns: [] },
    expected,
  };
}

function mem(
  type: ExtractedMemory["type"],
  title: string,
  content = "",
  extra: Partial<ExtractedMemory> = {}
): ExtractedMemory {
  return {
    type,
    title,
    date: "2026-04-25",
    context: "",
    content,
    sourceId: "abc",
    sourceTitle: "test",
    sourceType: "cursor",
    ...extra,
  };
}

// ---------- scoreFixture ----------

describe("scoreFixture", () => {
  it("perfect match: one expected, one extracted, all keywords present", () => {
    const f = fix("cceb-001", [
      { id: "e1", type: "decision", must_contain: ["OAuth", "PKCE"] },
    ]);
    const extracted = [mem("decision", "Use OAuth 2.0 PKCE for SPA")];
    const r = scoreFixture(f, extracted);
    expect(r.score.tp).toBe(1);
    expect(r.score.fp).toBe(0);
    expect(r.score.fn).toBe(0);
    expect(r.score.f1).toBe(1);
    expect(r.score.perfect).toBe(true);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].outcome).toBe("tp");
  });

  it("FN: expected memory has no candidate of correct type", () => {
    const f = fix("cceb-002", [
      { id: "e1", type: "decision", must_contain: ["OAuth"] },
    ]);
    const extracted = [mem("convention", "Use OAuth elsewhere")];
    const r = scoreFixture(f, extracted);
    expect(r.score.tp).toBe(0);
    expect(r.score.fn).toBe(1);
    expect(r.score.fp).toBe(1);
    expect(r.matches.find((m) => m.outcome === "fn")?.miss_reason).toMatch(
      /no extracted memory of type "decision"/
    );
  });

  it("FN: same type but missing keywords; miss reason cites closest match", () => {
    const f = fix("cceb-003", [
      { id: "e1", type: "decision", must_contain: ["OAuth", "PKCE"] },
    ]);
    const extracted = [mem("decision", "Use OAuth implicit flow")];
    const r = scoreFixture(f, extracted);
    expect(r.score.fn).toBe(1);
    expect(r.score.fp).toBe(1);
    expect(r.matches.find((m) => m.outcome === "fn")?.miss_reason).toMatch(
      /matched 1\/2/
    );
  });

  it("FP: extra extracted memory beyond expected", () => {
    const f = fix("cceb-004", [
      { id: "e1", type: "decision", must_contain: ["OAuth"] },
    ]);
    const extracted = [
      mem("decision", "Use OAuth 2.0"),
      mem("convention", "Use 2-space indent"),
    ];
    const r = scoreFixture(f, extracted);
    expect(r.score.tp).toBe(1);
    expect(r.score.fp).toBe(1);
    expect(r.score.fn).toBe(0);
    expect(r.score.perfect).toBe(false);
  });

  it("must_not_contain disqualifies a candidate", () => {
    const f = fix("cceb-005", [
      {
        id: "e1",
        type: "decision",
        must_contain: ["OAuth"],
        must_not_contain: ["implicit"],
      },
    ]);
    const extracted = [mem("decision", "Use OAuth implicit flow for SPA")];
    const r = scoreFixture(f, extracted);
    // The single candidate is disqualified → FN + FP for the same memory.
    expect(r.score.tp).toBe(0);
    expect(r.score.fn).toBe(1);
    expect(r.score.fp).toBe(1);
  });

  it("greedy claim: each extracted can be matched at most once", () => {
    const f = fix("cceb-006", [
      { id: "e1", type: "decision", must_contain: ["OAuth"] },
      { id: "e2", type: "decision", must_contain: ["OAuth"] },
    ]);
    const extracted = [mem("decision", "Use OAuth 2.0 PKCE for SPA")];
    const r = scoreFixture(f, extracted);
    expect(r.score.tp).toBe(1);
    expect(r.score.fn).toBe(1);
    expect(r.score.fp).toBe(0);
  });

  it("noise fixture: zero expected + zero extracted = perfect (f1=1)", () => {
    const f = fix("cceb-noise-1", []);
    const r = scoreFixture(f, []);
    expect(r.score.tp).toBe(0);
    expect(r.score.fp).toBe(0);
    expect(r.score.fn).toBe(0);
    expect(r.score.f1).toBe(1);
    expect(r.score.perfect).toBe(true);
  });

  it("noise fixture: zero expected + extracted memories = all FP, f1=0", () => {
    const f = fix("cceb-noise-2", []);
    const extracted = [mem("decision", "Hallucinated decision")];
    const r = scoreFixture(f, extracted);
    expect(r.score.fp).toBe(1);
    expect(r.score.f1).toBe(0);
    expect(r.score.perfect).toBe(false);
  });

  it("error path: returns zeroed score and preserves error string", () => {
    const f = fix("cceb-err", [
      { id: "e1", type: "decision", must_contain: ["OAuth"] },
    ]);
    const r = scoreFixture(f, [], { error: "LLM rate-limited" });
    expect(r.score.error).toBe("LLM rate-limited");
    expect(r.score.tp).toBe(0);
    expect(r.score.fp).toBe(0);
    expect(r.score.fn).toBe(0);
    expect(r.matches).toEqual([]);
  });

  it("matching is case-insensitive", () => {
    const f = fix("cceb-case", [
      { id: "e1", type: "decision", must_contain: ["oauth"] },
    ]);
    const extracted = [mem("decision", "Adopt OAuth Now")];
    const r = scoreFixture(f, extracted);
    expect(r.score.tp).toBe(1);
  });

  it("haystack includes content + reasoning + alternatives, not just title", () => {
    const f = fix("cceb-hay", [
      { id: "e1", type: "decision", must_contain: ["audit-trail"] },
    ]);
    const extracted = [
      mem("decision", "Use append-only logs", "We will use Kafka", {
        reasoning: "Easier to build an audit-trail downstream",
      }),
    ];
    const r = scoreFixture(f, extracted);
    expect(r.score.tp).toBe(1);
  });
});

// ---------- aggregateByType ----------

describe("aggregateByType", () => {
  it("sums TP/FP/FN across fixtures and computes per-type P/R/F1 + overall", () => {
    const f1 = fix("a", [
      { id: "e1", type: "decision", must_contain: ["x"] },
      { id: "e2", type: "decision", must_contain: ["y"] },
    ]);
    const f2 = fix("b", [{ id: "e1", type: "convention", must_contain: ["z"] }]);

    const r1 = scoreFixture(f1, [
      mem("decision", "x is good"),
      mem("decision", "z is bad"), // FP for decision (no expected has only "z")
    ]);
    const r2 = scoreFixture(f2, [
      mem("convention", "z rules"),
    ]);

    const allMatches = [...r1.matches, ...r2.matches];
    const rows = aggregateByType([f1, f2], allMatches);

    const dec = rows.find((r) => r.type === "decision")!;
    expect(dec.tp).toBe(1); // matched "x"
    expect(dec.fn).toBe(1); // missed "y"
    expect(dec.fp).toBe(1); // "z is bad" extra

    const conv = rows.find((r) => r.type === "convention")!;
    expect(conv.tp).toBe(1);
    expect(conv.fp).toBe(0);
    expect(conv.fn).toBe(0);
    expect(conv.f1).toBe(1);

    const overall = rows.find((r) => r.type === "overall")!;
    expect(overall.tp).toBe(2);
    expect(overall.fp).toBe(1);
    expect(overall.fn).toBe(1);
  });

  it("FP without matching expected_type charges to extracted_type", () => {
    const f = fix("noise", []);
    const r = scoreFixture(f, [mem("issue", "fake issue")]);
    const rows = aggregateByType([f], r.matches);
    const issue = rows.find((row) => row.type === "issue")!;
    expect(issue.fp).toBe(1);
  });

  it("returns five type rows + overall, in stable order", () => {
    const f = fix("empty", []);
    const rows = aggregateByType([f], []);
    expect(rows.map((r) => r.type)).toEqual([
      "decision",
      "architecture",
      "convention",
      "todo",
      "issue",
      "overall",
    ]);
  });
});

// ---------- buildScorecard / renderScorecard ----------

describe("buildScorecard / renderScorecard", () => {
  it("composes a Scorecard from per-fixture results and renders Markdown", () => {
    const f = fix(
      "cceb-001",
      [{ id: "e1", type: "decision", must_contain: ["OAuth"] }],
      "OAuth decision case"
    );
    const r = scoreFixture(f, [mem("decision", "Use OAuth 2.0")], {
      latencyMs: 1234,
    });
    const card = buildScorecard([f], [r], {
      ranAt: "2026-04-25T13:30:00Z",
      toolVersion: "ai-memory-cli@2.3.0",
      model: "test-model",
      totalSeconds: 1.2,
      dryRun: false,
    });
    expect(card.fixture_count).toBe(1);
    expect(card.error_count).toBe(0);
    expect(card.by_fixture).toHaveLength(1);
    expect(card.by_fixture[0].perfect).toBe(true);
    expect(card.matches).toHaveLength(1);
    expect(card.by_type.find((t) => t.type === "overall")?.f1).toBe(1);

    const md = renderScorecard(card);
    expect(md).toContain("# CCEB Scorecard");
    expect(md).toContain("test-model");
    expect(md).toContain("OAuth decision case");
    // perfect fixture renders with check mark
    expect(md).toMatch(/cceb-001 ✓/);
  });

  it("renders error fixtures with a warning marker", () => {
    const f = fix("cceb-err", [
      { id: "e1", type: "decision", must_contain: ["x"] },
    ]);
    const r = scoreFixture(f, [], { error: "Network timeout" });
    const card = buildScorecard([f], [r], {
      ranAt: "now",
      toolVersion: "v",
      model: "m",
      totalSeconds: 0,
      dryRun: false,
    });
    expect(card.error_count).toBe(1);
    const md = renderScorecard(card);
    expect(md).toMatch(/cceb-err ⚠️/);
  });
});
