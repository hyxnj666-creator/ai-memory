/**
 * CCEB — Cursor Conversation Extraction Benchmark.
 *
 * Pure types shared between the loader, runner and scorer. No imports from
 * `bench/` IO paths so this file can be safely consumed by the unit tests.
 */

import type { ConversationTurn, MemoryType } from "../../src/types.js";

// ---------- Fixture schema ----------

/**
 * A single annotated conversation. Fixtures live under `bench/cceb/fixtures/`
 * as JSON files; one fixture per file. The id is a stable identifier you can
 * cite from a results table.
 */
export interface Fixture {
  /** Stable identifier, e.g. "cceb-001-oauth-decision". */
  id: string;
  /** One-line description of what this fixture is testing. */
  description: string;
  /** Difficulty hint — informational only, not used for scoring. */
  difficulty?: "easy" | "medium" | "hard";
  /** Tags for slicing the report (e.g. "cjk", "noisy", "long"). */
  tags?: string[];
  /** Synthetic conversation that gets fed to `extractMemories`. */
  conversation: {
    title: string;
    turns: ConversationTurn[];
  };
  /**
   * Ground-truth memories the extractor is expected to produce. An empty
   * array means "this fixture is noise — produce nothing". This is critical
   * for measuring false-positive rate; the extractor is judged not just on
   * what it finds but on what it correctly doesn't.
   */
  expected: ExpectedMemory[];
}

/**
 * One ground-truth memory the extractor should surface, expressed as a
 * keyword filter rather than an exact string match. Keyword matching is
 * deliberate: LLM phrasing varies across runs, but the *concepts* it must
 * capture are stable. A reviewer adding a fixture should ask "what words
 * would the model HAVE to use to demonstrate it understood this fact?".
 */
export interface ExpectedMemory {
  /** Optional id stable across runs (helps when comparing two scorecards). */
  id?: string;
  /** Required type. Wrong type → no match. */
  type: MemoryType;
  /**
   * Substrings (case-insensitive) that must ALL appear somewhere in
   * title + content + reasoning + alternatives joined with spaces.
   */
  must_contain: string[];
  /**
   * Substrings that, if present, disqualify the candidate. Optional.
   * Use sparingly — they encode "this is a different memory of the
   * same topic" rather than quality criticism.
   */
  must_not_contain?: string[];
  /** Free-form reviewer note — not used for scoring, only displayed in reports. */
  note?: string;
}

// ---------- Match outcomes ----------

/**
 * One row in the per-fixture match log. `expected_id` is null for false
 * positives; `extracted_index` is null for false negatives.
 */
export interface MatchRow {
  fixture_id: string;
  expected_id: string | null;
  expected_type: MemoryType | null;
  extracted_index: number | null;
  extracted_type: MemoryType | null;
  extracted_title: string | null;
  outcome: "tp" | "fp" | "fn";
  /** When tp, which keywords matched (debug aid). */
  matched_keywords?: string[];
  /** When fn, why no candidate matched (closest type/title for triage). */
  miss_reason?: string;
}

// ---------- Scorecard ----------

export interface TypeScores {
  type: MemoryType | "overall";
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface FixtureScore {
  fixture_id: string;
  description: string;
  expected_count: number;
  extracted_count: number;
  tp: number;
  fp: number;
  fn: number;
  /**
   * Per-fixture F1, useful for finding the worst offenders. Computed against
   * the fixture's own expected set; a fixture with `expected: []` and zero
   * false positives has f1 = 1 (no expected, no extracted = "perfect noise rejection").
   */
  f1: number;
  /** True if everything the fixture asked for matched and nothing extra was extracted. */
  perfect: boolean;
  /** Wall-clock ms spent on this fixture's LLM call(s). */
  latency_ms: number;
  /** When extraction failed (LLM error etc.) we record it here and exclude from aggregate scoring. */
  error?: string;
}

/**
 * Top-level CCEB result. Both the human-readable Markdown report and the
 * machine-readable JSON dump come from this struct, so they stay in sync.
 */
export interface Scorecard {
  /** ISO timestamp when this run started. */
  ran_at: string;
  /** Tool version that ran the benchmark. */
  tool_version: string;
  /** Model identifier reported by the LLM client (or "<dry-run>"). */
  model: string;
  /** Total wall-clock seconds for the whole run. */
  total_seconds: number;
  /** Pure dry run (no LLM calls)? */
  dry_run: boolean;
  /** Total fixtures attempted. */
  fixture_count: number;
  /** Number of fixtures whose extractor invocation failed (excluded from per-type aggregates). */
  error_count: number;
  /** Aggregate scores per memory type + overall. */
  by_type: TypeScores[];
  /** Per-fixture summary. */
  by_fixture: FixtureScore[];
  /** Full match log (every TP/FP/FN row). Useful for reviewing hard cases. */
  matches: MatchRow[];
}
