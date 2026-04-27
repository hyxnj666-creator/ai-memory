/**
 * LongMemEval-50 loader. Reads `longmemeval_s_cleaned.json` from a
 * caller-supplied path and applies the deterministic-by-id selection
 * rule from the spike doc §4.2 + `expected-distribution.json`.
 *
 * Two operating modes:
 *
 *   - `loadFromManifest(dataPath, manifestPath)` — production mode:
 *     loads the dataset, picks the 50 samples whose question_ids are
 *     listed in `selected-questions.json`, and returns them in manifest
 *     order. Fails loudly if any listed id isn't present (the dataset
 *     was re-cleaned upstream → re-spike trigger #2).
 *
 *   - `selectQuestions(dataset, distribution)` — bootstrap mode:
 *     pure function used by `select-questions.ts` to *generate* the
 *     manifest the first time a maintainer downloads the dataset. No
 *     filesystem dependency.
 *
 * Both paths share `groupAndSortByType` so the selection rule can be
 * pinned by unit tests on small fixtures without needing the 200 MB
 * dataset.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { answerToKeyTokens } from "./adapter.js";
import type {
  LongMemEvalSample,
  LongMemEvalType,
  SelectedManifest,
} from "./types.js";

/** Treat any question_id ending in `_abs` as an abstention sample.
 *  Excluded from selection per spike §4.2. */
function isAbstention(s: LongMemEvalSample): boolean {
  return s.question_id.endsWith("_abs");
}

/** Treat any sample whose `answer` is not a string as out-of-rubric.
 *
 *  Upstream LongMemEval-S-cleaned has ~6% of samples (e.g. `00ca467f`,
 *  `0a995998`, `0bc8ad92` in the 2026-04 snapshot) where `answer` is a
 *  raw integer count for "how many times did X happen" questions. The
 *  evidence-preservation rubric is undefined for numeric answers — a
 *  one-character "answer" key-token of `"2"` falls below MIN_TOKEN_LEN
 *  and degenerates to the empty-token fallback (`full: true`), which
 *  would silently inflate the headline. Filtering at selection time is
 *  the spike-§4.2-faithful fix: it shifts which 50 questions get
 *  picked but keeps the rubric clean. Re-spike outcome 2026-04-27. */
function isNonStringAnswer(s: LongMemEvalSample): boolean {
  return typeof s.answer !== "string";
}

/** Treat any sample whose `answer` produces zero key tokens after the
 *  adapter's standard cleaning (lowercase, strip punctuation, drop stop
 *  words and tokens shorter than MIN_TOKEN_LEN=3) as out-of-rubric.
 *
 *  Same shape of bug as `isNonStringAnswer`, surfaced after fixing the
 *  numeric-typeof crash: ~9 of the previously-selected 50 questions had
 *  string answers like `"$12"`, `"20%"`, `"2"`, `"43"` — all of which
 *  clean down to a 1-or-2-character numeric token that gets filtered,
 *  leaving an empty key-token list. The empty-token branch in
 *  `scoreEvidencePreserved` returns `full: true` (defensible only as a
 *  divide-by-zero guard, NOT as a model success), and that quietly made
 *  9 measurements worth of "the rubric has nothing to measure" land in
 *  the `full` bucket of the scorecard. Filter at selection time so the
 *  rubric never has to think about empty-token answers in production.
 *  Re-spike outcome 2026-04-27 (second re-spike trigger of v2.5-08). */
function hasZeroKeyTokens(s: LongMemEvalSample): boolean {
  return answerToKeyTokens(s.answer).length === 0;
}

const KNOWN_TYPES: ReadonlySet<LongMemEvalType> = new Set([
  "single-session-user",
  "single-session-assistant",
  "single-session-preference",
  "temporal-reasoning",
  "knowledge-update",
  "multi-session",
]);

function asKnownType(t: string): LongMemEvalType | null {
  return KNOWN_TYPES.has(t as LongMemEvalType) ? (t as LongMemEvalType) : null;
}

/** Pure: group non-abstention samples by question_type and sort each
 *  group ascending by question_id. */
export function groupAndSortByType(
  samples: LongMemEvalSample[],
): Map<LongMemEvalType, LongMemEvalSample[]> {
  const out = new Map<LongMemEvalType, LongMemEvalSample[]>();
  for (const s of samples) {
    if (isAbstention(s)) continue;
    if (isNonStringAnswer(s)) continue;
    if (hasZeroKeyTokens(s)) continue;
    const t = asKnownType(s.question_type);
    if (t === null) continue; // unknown upstream type — skip rather than guess
    if (!out.has(t)) out.set(t, []);
    out.get(t)!.push(s);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => a.question_id.localeCompare(b.question_id));
  }
  return out;
}

/**
 * Pure selection function. Given the full dataset and the per-type
 * distribution, returns the first N ids per group in concatenation
 * order. Throws if any group is short.
 */
export function selectQuestions(
  samples: LongMemEvalSample[],
  distribution: Partial<Record<LongMemEvalType, number>>,
): { picked: LongMemEvalSample[]; ids: string[] } {
  const grouped = groupAndSortByType(samples);
  const orderedTypes: LongMemEvalType[] = [
    "single-session-user",
    "multi-session",
    "single-session-preference",
    "single-session-assistant",
    "temporal-reasoning",
    "knowledge-update",
  ];
  const picked: LongMemEvalSample[] = [];
  for (const t of orderedTypes) {
    const want = distribution[t] ?? 0;
    if (want === 0) continue;
    const have = grouped.get(t) ?? [];
    if (have.length < want) {
      throw new Error(
        `LongMemEval selection: requested ${want} samples of type "${t}" ` +
          `but only ${have.length} available in dataset (after dropping abstention). ` +
          `Re-spike trigger #3 — see spike doc §7.`,
      );
    }
    picked.push(...have.slice(0, want));
  }
  return { picked, ids: picked.map((s) => s.question_id) };
}

export function sha256OfFile(path: string): string {
  const buf = fs.readFileSync(path);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Read a JSON dataset file. The on-disk shape is an array of samples. */
export function readDataset(path: string): LongMemEvalSample[] {
  const raw = fs.readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `LongMemEval dataset at ${path}: expected top-level array, got ${typeof parsed}`,
    );
  }
  return parsed as LongMemEvalSample[];
}

/** Production mode: load 50 samples whose ids appear in the manifest. */
export function loadFromManifest(
  dataPath: string,
  manifest: SelectedManifest,
): LongMemEvalSample[] {
  const all = readDataset(dataPath);
  const byId = new Map<string, LongMemEvalSample>();
  for (const s of all) byId.set(s.question_id, s);
  const out: LongMemEvalSample[] = [];
  const missing: string[] = [];
  for (const id of manifest.question_ids) {
    const s = byId.get(id);
    if (!s) missing.push(id);
    else out.push(s);
  }
  if (missing.length > 0) {
    throw new Error(
      `LongMemEval manifest references ${missing.length} question_id(s) ` +
        `not present in ${dataPath}. First missing: ${missing[0]}. ` +
        `Either the manifest is stale (regenerate via select-questions.ts) ` +
        `or the dataset was re-cleaned upstream (re-spike trigger #2 — see spike doc §7).`,
    );
  }
  return out;
}

export function readManifest(path: string): SelectedManifest {
  const raw = fs.readFileSync(path, "utf8");
  const obj = JSON.parse(raw) as SelectedManifest;
  if (!Array.isArray(obj.question_ids)) {
    throw new Error(`LongMemEval manifest at ${path}: missing question_ids array`);
  }
  return obj;
}
