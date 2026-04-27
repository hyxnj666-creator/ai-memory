/**
 * Pure adapter functions: convert LongMemEval haystack to our
 * ConversationTurn shape, and score whether extracted memories preserve
 * the upstream answer's key tokens.
 *
 * Pure (no IO, no LLM) so the unit tests can pin behaviour without a
 * dataset on disk. See spike doc §4.3 / §4.4 for rubric.
 */

import type { ConversationTurn, ExtractedMemory } from "../../src/types.js";
import type { HaystackTurn } from "./types.js";

/** Stop words filtered out of LongMemEval `answer` fields when computing
 *  key tokens. Kept short on purpose — over-aggressive filtering hides
 *  whether the memory genuinely captured the evidence. Matches spike §4.4. */
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "that",
  "this",
  "these",
  "those",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "and",
  "or",
  "but",
  "as",
  "by",
  "from",
  "into",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "my",
  "your",
  "our",
  "their",
  "do",
  "did",
  "does",
  "have",
  "had",
  "has",
  "will",
  "would",
  "can",
  "could",
  "should",
]);

/** Minimum length (in characters) below which a token is considered too
 *  noisy to score on. 3 is just past common particles ("of", "in"). */
const MIN_TOKEN_LEN = 3;

/**
 * Flatten N haystack sessions into a single ConversationTurn[]. We tag
 * session boundaries inline as user-side narrative so the extractor has
 * the same temporal context a human would have reading the haystack
 * top-to-bottom.
 *
 * The ordering matches LongMemEval's own session ordering (chronological
 * for `_s` and `_m`; arbitrary for `_oracle`). We do not sort.
 */
export function haystackToConversationTurns(
  sessions: HaystackTurn[][],
  sessionDates?: string[],
): ConversationTurn[] {
  const out: ConversationTurn[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const date = sessionDates?.[i];
    if (date) {
      out.push({
        role: "user",
        text: `[Session ${i + 1} — ${date}]`,
      });
    }
    for (const turn of sessions[i]) {
      out.push({ role: turn.role, text: turn.content });
    }
  }
  return out;
}

/**
 * Extract the key tokens from a LongMemEval `answer` field. Lowercase,
 * strip punctuation, drop stop words and tokens shorter than
 * MIN_TOKEN_LEN. Stable across runs — pure function of the input.
 *
 * Accepts `string | number` because upstream `answer` is occasionally a
 * raw count (see types.ts). Numeric inputs coerce via `String(answer)`,
 * but in practice the loader filters non-string answers out before they
 * reach this function (see loader.ts:isNonStringAnswer); the coercion
 * is a defensive belt-and-braces against off-path callers.
 */
export function answerToKeyTokens(answer: string | number): string[] {
  const cleaned = String(answer)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ") // keep letters/digits/hyphens, blank everything else
    .split(/\s+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of cleaned) {
    if (!tok) continue;
    if (tok.length < MIN_TOKEN_LEN) continue;
    if (STOP_WORDS.has(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

/** Concatenate all extracted memories' searchable text fields, lowercased
 *  for case-insensitive substring matching. */
export function memoriesToSearchableText(memories: ExtractedMemory[]): string {
  return memories
    .flatMap((m) => [m.title, m.content, m.reasoning ?? "", m.alternatives ?? "", m.impact ?? ""])
    .join(" \n ")
    .toLowerCase();
}

export interface EvidenceScore {
  matched: string[];
  missed: string[];
  full: boolean;
  partial: boolean;
}

/**
 * Score whether the extracted memories preserve the LongMemEval answer's
 * key tokens. Rubric per spike §4.4:
 *   - full: every key token appears as a substring in the joined text
 *   - partial: ≥50% of key tokens match (and not full)
 *   - 0: less than 50%
 *
 * Substring matching is case-insensitive and unicode-safe (we lowercase
 * with the default unicode locale; both sides are lowercased before
 * compare). Substring (not whole-word) is intentional — agents
 * paraphrase, and a token like "rotation" should match "rotations" /
 * "rotated" without the rubric having to model morphology.
 */
export function scoreEvidencePreserved(
  answer: string | number,
  memories: ExtractedMemory[],
): EvidenceScore {
  const tokens = answerToKeyTokens(answer);
  if (tokens.length === 0) {
    // Empty key-token list. In production this code path is not reached
    // because `loader.ts:hasZeroKeyTokens` filters such samples out at
    // selection time (see re-spike outcome 2026-04-27 — short numeric
    // string answers like "$12" / "20%" / "2" all clean down to empty).
    // We still return `full: true` defensively to avoid divide-by-zero
    // in any off-path caller (custom fixtures, dry-run, future tests),
    // but loader-side filtering means the headline can never be inflated
    // by this branch silently again.
    return { matched: [], missed: [], full: true, partial: false };
  }
  const text = memoriesToSearchableText(memories);
  const matched: string[] = [];
  const missed: string[] = [];
  for (const tok of tokens) {
    if (text.includes(tok)) matched.push(tok);
    else missed.push(tok);
  }
  const ratio = matched.length / tokens.length;
  const full = matched.length === tokens.length;
  const partial = !full && ratio >= 0.5;
  return { matched, missed, full, partial };
}
