/**
 * Pure scoring engine for CCEB. No imports from runners, IO, or LLM clients —
 * `scoreFixture` and `aggregateScorecard` should be drivable from synthetic
 * data in unit tests.
 *
 * Algorithm sketch (v1):
 *
 *   For each fixture:
 *     1. Build a string-bag for every extracted memory (title + content +
 *        reasoning + alternatives, lowercased, joined by spaces).
 *     2. For each expected memory in declaration order:
 *          a. Find candidates whose `type` matches and string-bag contains
 *             every `must_contain` substring (case-insensitive) and contains
 *             none of the `must_not_contain` substrings.
 *          b. Greedily pick the candidate that's not already claimed by a
 *             previous expected. Tie-break by lowest extracted index (stable).
 *          c. Mark TP if a candidate is found; FN otherwise.
 *     3. Every unclaimed extracted memory is an FP for that fixture.
 *
 *   Aggregation: per-type counts of TP/FP/FN sum across fixtures, then
 *   precision / recall / F1 follow the standard formulas. Overall is the
 *   micro-average across all types.
 *
 * Why greedy and not optimal assignment (Hungarian-style)?
 *   The fixtures are designed so each expected has at most a handful of
 *   plausible candidates and `must_contain` keywords are picked to avoid
 *   ambiguity. When a fixture *is* ambiguous, that's a fixture-quality
 *   problem (the reviewer needs tighter keywords) and we want the scorer
 *   to surface it as an FP/FN noise rather than paper over it.
 */

import type { ExtractedMemory, MemoryType } from "../../src/types.js";
import type {
  ExpectedMemory,
  Fixture,
  FixtureScore,
  MatchRow,
  Scorecard,
  TypeScores,
} from "./types.js";

const ALL_TYPES: MemoryType[] = [
  "decision",
  "architecture",
  "convention",
  "todo",
  "issue",
];

// ---------- Helpers ----------

function memoryHaystack(m: ExtractedMemory): string {
  return [m.title, m.content, m.reasoning ?? "", m.alternatives ?? ""]
    .join(" ")
    .toLowerCase();
}

function containsAll(haystack: string, needles: string[]): boolean {
  return needles.every((n) => haystack.includes(n.toLowerCase()));
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n.toLowerCase()));
}

function expectedId(e: ExpectedMemory, idx: number): string {
  return e.id ?? `${e.type}#${idx}`;
}

function safeDiv(num: number, den: number): number {
  if (den === 0) return 0;
  return num / den;
}

function f1(precision: number, recall: number): number {
  const sum = precision + recall;
  if (sum === 0) return 0;
  return (2 * precision * recall) / sum;
}

// ---------- Per-fixture scoring ----------

export interface FixtureScoreResult {
  score: FixtureScore;
  matches: MatchRow[];
}

/**
 * Score a single fixture's extraction output. Pure: same input → same output.
 */
export function scoreFixture(
  fixture: Fixture,
  extracted: ExtractedMemory[],
  opts: { latencyMs?: number; error?: string } = {}
): FixtureScoreResult {
  const latency = opts.latencyMs ?? 0;
  const matches: MatchRow[] = [];

  if (opts.error) {
    return {
      score: {
        fixture_id: fixture.id,
        description: fixture.description,
        expected_count: fixture.expected.length,
        extracted_count: 0,
        tp: 0,
        fp: 0,
        fn: 0,
        f1: 0,
        perfect: false,
        latency_ms: latency,
        error: opts.error,
      },
      matches,
    };
  }

  const claimed = new Set<number>();
  let tp = 0;
  let fn = 0;

  fixture.expected.forEach((exp, expIdx) => {
    const expId = expectedId(exp, expIdx);
    const candidate = findCandidate(exp, extracted, claimed);
    if (candidate !== null) {
      claimed.add(candidate.index);
      tp += 1;
      matches.push({
        fixture_id: fixture.id,
        expected_id: expId,
        expected_type: exp.type,
        extracted_index: candidate.index,
        extracted_type: extracted[candidate.index].type,
        extracted_title: extracted[candidate.index].title,
        outcome: "tp",
        matched_keywords: exp.must_contain,
      });
    } else {
      fn += 1;
      matches.push({
        fixture_id: fixture.id,
        expected_id: expId,
        expected_type: exp.type,
        extracted_index: null,
        extracted_type: null,
        extracted_title: null,
        outcome: "fn",
        miss_reason: explainMiss(exp, extracted),
      });
    }
  });

  let fp = 0;
  extracted.forEach((m, i) => {
    if (claimed.has(i)) return;
    fp += 1;
    matches.push({
      fixture_id: fixture.id,
      expected_id: null,
      expected_type: null,
      extracted_index: i,
      extracted_type: m.type,
      extracted_title: m.title,
      outcome: "fp",
    });
  });

  const precision = safeDiv(tp, tp + fp);
  const recall = fixture.expected.length === 0 ? (fp === 0 ? 1 : 0) : safeDiv(tp, tp + fn);
  // Special case: fixture with no expected and no extracted = perfect noise
  // rejection. We define f1 = 1 in that case so noise fixtures contribute
  // positively to the per-fixture distribution. The aggregate is still the
  // honest TP/FP/FN sum.
  const fixtureF1 =
    fixture.expected.length === 0 && fp === 0
      ? 1
      : f1(precision, recall);

  return {
    score: {
      fixture_id: fixture.id,
      description: fixture.description,
      expected_count: fixture.expected.length,
      extracted_count: extracted.length,
      tp,
      fp,
      fn,
      f1: fixtureF1,
      perfect: tp === fixture.expected.length && fp === 0,
      latency_ms: latency,
    },
    matches,
  };
}

function findCandidate(
  exp: ExpectedMemory,
  extracted: ExtractedMemory[],
  claimed: Set<number>
): { index: number } | null {
  for (let i = 0; i < extracted.length; i++) {
    if (claimed.has(i)) continue;
    const m = extracted[i];
    if (m.type !== exp.type) continue;
    const hay = memoryHaystack(m);
    if (!containsAll(hay, exp.must_contain)) continue;
    if (exp.must_not_contain && containsAny(hay, exp.must_not_contain)) continue;
    return { index: i };
  }
  return null;
}

/**
 * Generate a short explanation for why an expected memory wasn't matched.
 * Used in reports to make triaging missed cases faster.
 */
function explainMiss(exp: ExpectedMemory, extracted: ExtractedMemory[]): string {
  const sameType = extracted.filter((m) => m.type === exp.type);
  if (sameType.length === 0) {
    return `no extracted memory of type "${exp.type}"`;
  }
  // Find the candidate that matched the most must_contain needles
  let bestHits = 0;
  let bestTitle = "";
  for (const m of sameType) {
    const hay = memoryHaystack(m);
    const hits = exp.must_contain.filter((n) => hay.includes(n.toLowerCase())).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestTitle = m.title;
    }
  }
  if (bestHits === 0) {
    return `${sameType.length} candidate(s) of correct type but none contained any required keyword`;
  }
  return `closest candidate "${bestTitle}" matched ${bestHits}/${exp.must_contain.length} keyword(s)`;
}

// ---------- Aggregation ----------

/**
 * Aggregate per-type TP/FP/FN across all fixture scores and compute
 * precision/recall/F1. The "overall" row is the micro-average (sum of
 * counts), which is the honest score for an unbalanced fixture set.
 */
export function aggregateByType(
  fixtures: Fixture[],
  matches: MatchRow[]
): TypeScores[] {
  const counts: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const t of ALL_TYPES) counts[t] = { tp: 0, fp: 0, fn: 0 };

  // FP rows have no expected_type; we charge them to the *extracted_type*.
  // FN rows have no extracted_type; we charge them to the expected_type.
  // TP rows charge to either (they agree by construction); use expected_type.
  for (const m of matches) {
    const bucket =
      m.outcome === "fp" ? m.extracted_type : m.expected_type;
    if (!bucket) continue;
    if (m.outcome === "tp") counts[bucket].tp += 1;
    else if (m.outcome === "fp") counts[bucket].fp += 1;
    else counts[bucket].fn += 1;
  }

  const rows: TypeScores[] = ALL_TYPES.map((t) => {
    const c = counts[t];
    const precision = safeDiv(c.tp, c.tp + c.fp);
    const recall = safeDiv(c.tp, c.tp + c.fn);
    return {
      type: t,
      tp: c.tp,
      fp: c.fp,
      fn: c.fn,
      precision,
      recall,
      f1: f1(precision, recall),
    };
  });

  // Overall = micro-average (sum of counts).
  const total = rows.reduce(
    (acc, r) => ({ tp: acc.tp + r.tp, fp: acc.fp + r.fp, fn: acc.fn + r.fn }),
    { tp: 0, fp: 0, fn: 0 }
  );
  const oP = safeDiv(total.tp, total.tp + total.fp);
  const oR = safeDiv(total.tp, total.tp + total.fn);
  rows.push({
    type: "overall",
    tp: total.tp,
    fp: total.fp,
    fn: total.fn,
    precision: oP,
    recall: oR,
    f1: f1(oP, oR),
  });

  // Mark unused parameter to satisfy linters and keep the door open for
  // weighted aggregation per fixture in v2.
  void fixtures;
  return rows;
}

/**
 * Build a final Scorecard from per-fixture results and meta info.
 */
export function buildScorecard(
  fixtures: Fixture[],
  perFixture: FixtureScoreResult[],
  meta: {
    ranAt: string;
    toolVersion: string;
    model: string;
    totalSeconds: number;
    dryRun: boolean;
  }
): Scorecard {
  const allMatches = perFixture.flatMap((r) => r.matches);
  const byType = aggregateByType(fixtures, allMatches);
  const errorCount = perFixture.filter((r) => r.score.error).length;

  return {
    ran_at: meta.ranAt,
    tool_version: meta.toolVersion,
    model: meta.model,
    total_seconds: meta.totalSeconds,
    dry_run: meta.dryRun,
    fixture_count: fixtures.length,
    error_count: errorCount,
    by_type: byType,
    by_fixture: perFixture.map((r) => r.score),
    matches: allMatches,
  };
}

// ---------- Markdown rendering ----------

function pct(x: number): string {
  return (x * 100).toFixed(1) + "%";
}

/**
 * Render a Scorecard as Markdown. Used by the runner to write
 * `docs/benchmarks/cceb-baseline.md` and to print to stdout.
 */
export function renderScorecard(card: Scorecard): string {
  const lines: string[] = [];
  lines.push(`# CCEB Scorecard`);
  lines.push("");
  lines.push(`> Cursor Conversation Extraction Benchmark`);
  lines.push("");
  lines.push(`- **Ran at:** ${card.ran_at}`);
  lines.push(`- **Tool version:** ${card.tool_version}`);
  lines.push(`- **Model:** ${card.model}`);
  lines.push(`- **Mode:** ${card.dry_run ? "dry run (no LLM)" : "live"}`);
  lines.push(`- **Fixtures:** ${card.fixture_count}${card.error_count > 0 ? ` (${card.error_count} errored)` : ""}`);
  lines.push(`- **Wall-clock:** ${card.total_seconds.toFixed(1)}s`);
  lines.push("");

  lines.push(`## Aggregate scores (by memory type)`);
  lines.push("");
  lines.push(`| Type | TP | FP | FN | Precision | Recall | F1 |`);
  lines.push(`|---|---:|---:|---:|---:|---:|---:|`);
  for (const r of card.by_type) {
    const label = r.type === "overall" ? `**${r.type}**` : r.type;
    const f1Cell = r.type === "overall" ? `**${pct(r.f1)}**` : pct(r.f1);
    lines.push(
      `| ${label} | ${r.tp} | ${r.fp} | ${r.fn} | ${pct(r.precision)} | ${pct(r.recall)} | ${f1Cell} |`
    );
  }
  lines.push("");

  lines.push(`## Per-fixture detail`);
  lines.push("");
  lines.push(`| Fixture | Description | Expected | Extracted | TP | FP | FN | F1 | Latency |`);
  lines.push(`|---|---|---:|---:|---:|---:|---:|---:|---:|`);
  for (const f of card.by_fixture) {
    const fLabel = f.error ? `${f.fixture_id} ⚠️` : f.perfect ? `${f.fixture_id} ✓` : f.fixture_id;
    const latency =
      f.latency_ms === 0 ? "—" : `${(f.latency_ms / 1000).toFixed(1)}s`;
    // Sanitise pipes in description so they don't break the table.
    const desc = f.description.replace(/\|/g, "\\|");
    lines.push(
      `| ${fLabel} | ${desc} | ${f.expected_count} | ${f.extracted_count} | ${f.tp} | ${f.fp} | ${f.fn} | ${pct(f.f1)} | ${latency} |`
    );
  }
  lines.push("");

  // Show first 10 misses + first 10 false positives for triage
  const misses = card.matches.filter((m) => m.outcome === "fn").slice(0, 10);
  if (misses.length > 0) {
    lines.push(`## Sample misses (FN, first ${misses.length})`);
    lines.push("");
    for (const m of misses) {
      lines.push(`- **${m.fixture_id}** [${m.expected_type}] _${m.expected_id}_ — ${m.miss_reason ?? "no candidate"}`);
    }
    lines.push("");
  }

  const fps = card.matches.filter((m) => m.outcome === "fp").slice(0, 10);
  if (fps.length > 0) {
    lines.push(`## Sample false positives (FP, first ${fps.length})`);
    lines.push("");
    for (const m of fps) {
      lines.push(`- **${m.fixture_id}** [${m.extracted_type}] "${m.extracted_title}"`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
