/**
 * Pure-function tests for the deterministic-by-id selection rule from
 * spike doc §4.2. Uses small synthetic samples so we don't need the
 * 200 MB upstream dataset on disk.
 */

import { describe, it, expect } from "vitest";
import { groupAndSortByType, selectQuestions } from "../loader.js";
import type { LongMemEvalSample, LongMemEvalType } from "../types.js";
import expectedDist from "../expected-distribution.json" with { type: "json" };

function fakeSample(
  question_id: string,
  question_type: string,
): LongMemEvalSample {
  return {
    question_id,
    question_type,
    question: "?",
    // Default answer kept above MIN_TOKEN_LEN=3 so the
    // hasZeroKeyTokens filter (added 2026-04-27) doesn't drop
    // every sample that doesn't override `answer` explicitly.
    answer: "the user lives in toronto",
    question_date: "2026-01-01",
    haystack_session_ids: [],
    haystack_dates: [],
    haystack_sessions: [],
    answer_session_ids: [],
  };
}

describe("groupAndSortByType", () => {
  it("drops abstention samples (id ends with _abs)", () => {
    const samples = [
      fakeSample("q-001", "single-session-user"),
      fakeSample("q-002_abs", "single-session-user"),
      fakeSample("q-003", "single-session-user"),
    ];
    const grouped = groupAndSortByType(samples);
    expect(grouped.get("single-session-user")?.length).toBe(2);
    expect(
      grouped.get("single-session-user")?.map((s) => s.question_id),
    ).toEqual(["q-001", "q-003"]);
  });

  it("sorts each group ascending by question_id (deterministic)", () => {
    const samples = [
      fakeSample("zebra", "multi-session"),
      fakeSample("alpha", "multi-session"),
      fakeSample("middle", "multi-session"),
    ];
    const grouped = groupAndSortByType(samples);
    expect(
      grouped.get("multi-session")?.map((s) => s.question_id),
    ).toEqual(["alpha", "middle", "zebra"]);
  });

  it("ignores unknown question types rather than guessing", () => {
    const samples = [
      fakeSample("q-001", "weird-new-type"),
      fakeSample("q-002", "single-session-user"),
    ];
    const grouped = groupAndSortByType(samples);
    expect([...grouped.keys()]).toEqual(["single-session-user"]);
  });

  it("drops samples whose answer is not a string (counting questions)", () => {
    // Re-spike outcome 2026-04-27: upstream LongMemEval-S-cleaned has
    // ~6% of samples whose `answer` is a raw integer count. The
    // evidence-preservation rubric is undefined for them — see
    // loader.ts:isNonStringAnswer. Pin the filter so a future refactor
    // can't quietly let them back in.
    const samples: LongMemEvalSample[] = [
      fakeSample("q-string", "multi-session"),
      { ...fakeSample("q-numeric", "multi-session"), answer: 2 as unknown as string },
      { ...fakeSample("q-zero", "multi-session"), answer: 0 as unknown as string },
      fakeSample("q-other-string", "multi-session"),
    ];
    const grouped = groupAndSortByType(samples);
    expect(
      grouped.get("multi-session")?.map((s) => s.question_id),
    ).toEqual(["q-other-string", "q-string"]);
  });

  it("drops samples whose answer cleans down to zero key tokens", () => {
    // Second re-spike outcome 2026-04-27: short numeric string answers
    // like "$12" / "20%" / "2" / "43" all clean down to a 1-2-char
    // numeric token that falls below MIN_TOKEN_LEN, leaving zero key
    // tokens. The empty-token branch in scoreEvidencePreserved returns
    // full=true defensively, which silently inflated 9/50 measurements
    // in the first live run. Loader-side filter prevents recurrence.
    const samples: LongMemEvalSample[] = [
      fakeSample("q-real-answer", "knowledge-update"),
      { ...fakeSample("q-currency-12", "knowledge-update"), answer: "$12" },
      { ...fakeSample("q-percent-20", "knowledge-update"), answer: "20%" },
      { ...fakeSample("q-bare-2", "knowledge-update"), answer: "2" },
      { ...fakeSample("q-bare-43", "knowledge-update"), answer: "43" },
      fakeSample("q-other-real-answer", "knowledge-update"),
    ];
    const grouped = groupAndSortByType(samples);
    expect(
      grouped.get("knowledge-update")?.map((s) => s.question_id),
    ).toEqual(["q-other-real-answer", "q-real-answer"]);
  });
});

describe("selectQuestions", () => {
  function makeFullSet(): LongMemEvalSample[] {
    // Build a synthetic dataset large enough to satisfy the locked
    // distribution + a few abstention samples sprinkled in.
    const out: LongMemEvalSample[] = [];
    const types: LongMemEvalType[] = [
      "single-session-user",
      "multi-session",
      "single-session-preference",
      "single-session-assistant",
      "temporal-reasoning",
      "knowledge-update",
    ];
    for (const t of types) {
      for (let i = 0; i < 20; i++) {
        out.push(fakeSample(`${t}-${String(i).padStart(3, "0")}`, t));
      }
      out.push(fakeSample(`${t}-999_abs`, t));
    }
    // Shuffle so we can verify selection is stable regardless of input order
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(((i * 9301 + 49297) % 233280) / 233280 * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  it("picks exactly 50 ids matching the locked distribution", () => {
    const all = makeFullSet();
    const { picked, ids } = selectQuestions(all, expectedDist.distribution);
    expect(picked.length).toBe(50);
    expect(ids.length).toBe(50);
    expect(new Set(ids).size).toBe(50); // no duplicates
  });

  it("respects per-type counts", () => {
    const all = makeFullSet();
    const { picked } = selectQuestions(all, expectedDist.distribution);
    const counts = new Map<string, number>();
    for (const s of picked) {
      counts.set(s.question_type, (counts.get(s.question_type) ?? 0) + 1);
    }
    expect(counts.get("single-session-user")).toBe(10);
    expect(counts.get("multi-session")).toBe(10);
    expect(counts.get("single-session-preference")).toBe(8);
    expect(counts.get("single-session-assistant")).toBe(8);
    expect(counts.get("temporal-reasoning")).toBe(7);
    expect(counts.get("knowledge-update")).toBe(7);
  });

  it("excludes abstention samples even when present in input", () => {
    const all = makeFullSet();
    const { ids } = selectQuestions(all, expectedDist.distribution);
    expect(ids.every((id) => !id.endsWith("_abs"))).toBe(true);
  });

  it("is deterministic across input orderings (idempotency under shuffle)", () => {
    const a = makeFullSet();
    const b = [...a].reverse();
    const idsA = selectQuestions(a, expectedDist.distribution).ids;
    const idsB = selectQuestions(b, expectedDist.distribution).ids;
    expect(idsA).toEqual(idsB);
  });

  it("throws clearly when a type group is short of the requested count (re-spike trigger)", () => {
    const tooSmall: LongMemEvalSample[] = [];
    for (let i = 0; i < 5; i++) {
      tooSmall.push(fakeSample(`x-${i}`, "single-session-user"));
    }
    expect(() => selectQuestions(tooSmall, expectedDist.distribution)).toThrow(
      /requested 10 samples of type "single-session-user" but only 5 available/,
    );
  });
});

describe("expected-distribution.json invariants", () => {
  it("totals exactly 50 across all types", () => {
    const sum = Object.values(expectedDist.distribution).reduce(
      (a: number, b: number) => a + b,
      0,
    );
    expect(sum).toBe(50);
    expect(sum).toBe(expectedDist.total);
  });

  it("only references known LongMemEval types", () => {
    const known = new Set([
      "single-session-user",
      "single-session-assistant",
      "single-session-preference",
      "temporal-reasoning",
      "knowledge-update",
      "multi-session",
    ]);
    for (const t of Object.keys(expectedDist.distribution)) {
      expect(known.has(t)).toBe(true);
    }
  });
});
