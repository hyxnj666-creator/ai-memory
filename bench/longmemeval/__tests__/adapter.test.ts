/**
 * Pure-function tests for the LongMemEval-50 adapter. No filesystem,
 * no LLM, no dataset — these run in milliseconds and pin the rubric
 * locked in spike doc §4.4.
 */

import { describe, it, expect } from "vitest";
import {
  haystackToConversationTurns,
  answerToKeyTokens,
  scoreEvidencePreserved,
} from "../adapter.js";
import type { ExtractedMemory } from "../../../src/types.js";

function fakeMemory(content: string): ExtractedMemory {
  return {
    type: "decision",
    title: "x",
    date: "2026-04-27",
    context: "x",
    content,
    sourceId: "x",
    sourceTitle: "x",
    sourceType: "cursor",
  };
}

describe("answerToKeyTokens", () => {
  it("lowercases, splits on whitespace, drops stop words and short tokens", () => {
    expect(answerToKeyTokens("The user lives in Toronto and prefers tea over coffee."))
      .toEqual(["user", "lives", "toronto", "prefers", "tea", "over", "coffee"]);
  });

  it("dedupes within an answer (a token only counts once toward the score)", () => {
    expect(answerToKeyTokens("Toronto Toronto and Toronto")).toEqual(["toronto"]);
  });

  it("preserves hyphenated technical tokens", () => {
    expect(answerToKeyTokens("Postgres uses tsvector-based indexing")).toEqual([
      "postgres",
      "uses",
      "tsvector-based",
      "indexing",
    ]);
  });

  it("returns empty for an all-stop-word answer", () => {
    expect(answerToKeyTokens("It is the")).toEqual([]);
  });

  it("coerces numeric answer to string (defensive — loader filters first)", () => {
    // Re-spike outcome 2026-04-27: upstream LongMemEval-S-cleaned has ~6%
    // numeric-answer samples. Loader filters them out so this code path
    // shouldn't fire in production, but we still guard against off-path
    // callers (e.g. dry-run, future fixtures, tests). A bare integer like
    // `2` becomes "2" which falls below MIN_TOKEN_LEN — empty result, no
    // crash. Pre-fix this threw `answer.toLowerCase is not a function`.
    expect(answerToKeyTokens(2 as unknown as string)).toEqual([]);
    expect(answerToKeyTokens(123 as unknown as string)).toEqual(["123"]);
  });
});

describe("scoreEvidencePreserved", () => {
  it("scores full when every key token appears as substring", () => {
    const ev = scoreEvidencePreserved(
      "The user lives in Toronto",
      // Memory must contain *exact* substrings of the key tokens — see the
      // 'no morphology' test below that documents this explicit limit.
      [fakeMemory("the user lives in toronto today")],
    );
    expect(ev.full).toBe(true);
    expect(ev.partial).toBe(false);
    expect(ev.matched.sort()).toEqual(["lives", "toronto", "user"].sort());
    expect(ev.missed).toEqual([]);
  });

  it("scores partial when at least 50% of tokens match (and not all)", () => {
    const ev = scoreEvidencePreserved(
      "The user lives in Toronto and prefers tea",
      // Memory mentions user + toronto + tea = 3/5 = 60% → partial
      [fakeMemory("user is from toronto and likes tea")],
    );
    expect(ev.full).toBe(false);
    expect(ev.partial).toBe(true);
    expect(ev.matched.length).toBeGreaterThanOrEqual(3);
  });

  it("scores zero (not partial) when fewer than 50% of tokens match", () => {
    const ev = scoreEvidencePreserved(
      "The user lives in Toronto and prefers tea over coffee",
      [fakeMemory("the user said something")],
    );
    expect(ev.full).toBe(false);
    expect(ev.partial).toBe(false);
  });

  it("matches case-insensitively", () => {
    const ev = scoreEvidencePreserved(
      "POSTGRES",
      [fakeMemory("we picked postgres")],
    );
    expect(ev.full).toBe(true);
  });

  it("substring-matches for morphological variants (intentional, see adapter doc)", () => {
    const ev = scoreEvidencePreserved(
      "rotation",
      [fakeMemory("we rotate the keys daily")],
    );
    // "rotation" is NOT a substring of "rotate the keys daily" — this test
    // documents the limit of the rubric. A stricter morphological match
    // would need stemming, which we deliberately avoid (spike §4.4: literal
    // matching keeps the rubric self-contained).
    expect(ev.full).toBe(false);
  });

  it("returns full for an empty key-token set (defensive — caller's problem)", () => {
    const ev = scoreEvidencePreserved("It is the", []);
    expect(ev.full).toBe(true);
    expect(ev.matched).toEqual([]);
  });
});

describe("haystackToConversationTurns", () => {
  it("flattens N sessions in order with date markers", () => {
    const turns = haystackToConversationTurns(
      [
        [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
        [{ role: "user", content: "follow up" }],
      ],
      ["2026-01-01", "2026-01-08"],
    );
    expect(turns.length).toBe(5); // 2 markers + 3 turns
    expect(turns[0]).toEqual({ role: "user", text: "[Session 1 — 2026-01-01]" });
    expect(turns[1]).toEqual({ role: "user", text: "hi" });
    expect(turns[2]).toEqual({ role: "assistant", text: "hello" });
    expect(turns[3]).toEqual({ role: "user", text: "[Session 2 — 2026-01-08]" });
    expect(turns[4]).toEqual({ role: "user", text: "follow up" });
  });

  it("omits date markers when sessionDates undefined", () => {
    const turns = haystackToConversationTurns([
      [{ role: "user", content: "x" }],
    ]);
    expect(turns.length).toBe(1);
    expect(turns[0].text).toBe("x");
  });
});
