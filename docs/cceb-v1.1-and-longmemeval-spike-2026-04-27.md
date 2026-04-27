# CCEB v1.1 + LongMemEval-50 spike — 2026-04-27

This is the **dated spike-first** doc for v2.5-08:

1. Grow CCEB from 9 fixtures to 30 (CCEB v1.1) for tighter per-type
   error bars.
2. Ship a 50-query LongMemEval subset adapter as the "apples-to-apples
   shield" against runtime memory benchmark comparisons.

Same discipline as v2.5-04 / v2.5-05 / v2.5-06 / v2.5-07: design,
fixture roster, selection strategy, adapter contract, and publication
template are all locked here **before** any baseline number is
published. When the baseline run produces something we didn't predict,
we update this doc to record the surprise — we don't quietly re-run
until the number "looks right."

> **Status:** agent-side prep complete; awaiting maintainer baseline
> run. Fixture authoring + adapter scaffold land in this PR. Running
> `npm run bench:cceb` with `OPENAI_API_KEY` set + writing the new
> 30-fixture baseline numbers into `docs/benchmarks/cceb-baseline.md`
> + running the LongMemEval-50 adapter against the downloaded dataset
> are maintainer-only execution steps. Same status discipline as
> v2.5-03 / v2.5-07.

---

## 1. Why these two together

CCEB v1.0 (9 fixtures, F1 76.2% on `gpt-4o-mini` per
[`docs/benchmarks/cceb-baseline.md`](benchmarks/cceb-baseline.md))
already calls out two structural credibility gaps:

> "Single-run F1 at N=9 is ±3-5 pp from sampling alone."  
> *— `cceb-baseline.md`, "What the new numbers say"*

> "A LongMemEval 50-query subset adapter, which would let us cite a
> genuinely apples-to-apples number alongside CCEB, is on the v2.5+
> list as `v2.5-08`."  
> *— `cceb-baseline.md`, "Where this fits among comparable measurements"*

Both are addressed by v2.5-08 specifically because they reinforce each
other: a 30-fixture CCEB run shrinks the within-suite variance band,
and a same-cycle LongMemEval-50 run lets us answer the predictable HN
question "but how do you compare to LongMemEval / mem0 / Letta?"
without retreating into "different layer, different question" hand-waves.

## 2. Out of scope (what these numbers do not prove)

- **Not a precision/recall improvement claim.** v2.5-01 already
  delivered the prompt-rewrite lift (F1 56% → 76%). v2.5-08 is
  measurement-density work — we expect the new 30-fixture F1 to land
  *near* the 9-fixture F1 within run-to-run variance, possibly slightly
  lower as we add adversarial fixtures. A *lower* number is **not** a
  regression — it is a more honest measurement on a harder fixture set.
- **Not statistical proof.** N=30 + N=50 is still small-sample; the
  publication template explicitly puts confidence intervals around
  every quoted number rather than treating point estimates as facts.
- **Not a LongMemEval leaderboard entry.** The 50-query subset uses
  *our* scoring rubric (does the extracted memory contain the answer
  evidence?), not LongMemEval's native QA-correctness rubric. We make
  this difference loud-and-clear in §6 so the number can't be
  confused with the official LongMemEval scores published by Wu et al.
  ([ICLR 2025](https://arxiv.org/abs/2410.10813)).
- **Not free.** Live `gpt-4o-mini` run on 30 CCEB fixtures ≈ $0.02 +
  ~3 min wall-clock; LongMemEval-50 ≈ $0.30-0.50 + ~10 min. Tracked
  spend per spike doc §6 so reviewers know what they'd burn replicating.

## 3. CCEB v1.1 — 30-fixture roster (locked)

The current 9 fixtures (cceb-001 — cceb-009) stay verbatim — pinning
the baseline so v1.0 → v1.1 deltas remain interpretable. We add 21
fixtures (cceb-010 — cceb-030) targeting specific gaps the v1.0
analysis surfaced.

### 3.1 What's structurally weak in v1.0

| Gap | Source | Effect |
|---|---|---|
| Convention recall = 50% (1 of 2 conventions found) | v2.5-01 baseline analysis: model misses the "let's make it a convention: every X must Y" wording even when explicit | Convention F1 is the single weakest type-cell at 66.7% |
| TODO precision = 33.3% | v2.5-01 baseline: 2 FPs from sub-claim TODOs alongside parent decision/architecture | Tightening the TODO type was a v2.5-01 prompt deliverable; we still have only 1 fixture exercising it |
| N=9 → ±3-5 pp run-to-run F1 | `cceb-baseline.md` honesty section | Any 1-pp F1 movement we report on v1.0 is below noise floor |
| 0 fixtures testing long conversations (>10 turns) | Inspection | Real editor sessions are dozens of turns — extractor behaviour on long context is uninstrumented |
| 1 CJK fixture (cceb-007) | Inspection | "Works in Chinese" claim depends on a single point estimate |
| 0 fixtures with mixed CJK + English | Inspection | Real bilingual teams are not covered at all |
| 0 fixtures testing the "decided last week, ratifying now" temporal pattern | Inspection | Common conversation shape; extractor must handle "this is a decision" + "we already implemented it" without splitting |
| 0 fixtures with a *resolved* memory marker (status=resolved) | Inspection | The `resolved` status field exists but is never exercised in the bench |

### 3.2 The 21 new fixtures (locked roster)

> Each cell below is the *intent* of the fixture; the actual conversation
> turns and `expected` ground-truth list live in
> `bench/cceb/fixtures/cceb-XXX-{slug}.json`. The slug is stable; reword
> a fixture and the slug must change too (consumers cite slugs, not
> ids).

| ID | Slug | Type | Difficulty | Tags | Why it's here |
|---|---|---|---|---|---|
| cceb-010 | postgres-vs-mysql | decision | easy | `single-memory` | Bread-and-butter database choice, no traps. Extends v1.0's PKCE-style fixture coverage. |
| cceb-011 | typescript-strict-mode | decision | easy | `single-memory`, `language` | Repo-policy decision that's a *decision*, not a *convention* (one-time flip, not a forward-looking rule). Pins the boundary v2.5-01 disambiguated. |
| cceb-012 | feature-flag-rollout | decision | medium | `single-memory`, `partial-info` | User says "let's roll back if NPS drops" — must extract the rollback condition into `impact`, not as a separate TODO. |
| cceb-013 | deprecate-v1-api | decision | medium | `single-memory`, `temporal` | Decision was made last week; this conversation is *ratifying* it. Extractor must produce ONE decision, not split "we decided" + "we're ratifying". |
| cceb-014 | sso-okta-vs-auth0 | decision | hard | `multi-option`, `single-memory` | Three-way comparison resolved into one choice. Tests the "merge sub-claims into parent" instruction added in v2.5-01. |
| cceb-015 | move-to-grpc | architecture | medium | `single-memory` | Service-to-service protocol architecture choice. Standard shape. |
| cceb-016 | redis-as-cache-layer | architecture | medium | `single-memory`, `partial-info` | Discussion mentions both "cache aside" pattern *and* "TTL = 5 min" decision — the TTL is part of the architecture, not a separate convention. |
| cceb-017 | event-bus-kafka | architecture | hard | `multi-memory` | Architecture (event bus) + convention (every consumer must be idempotent) extracted from one conversation. Pins the multi-memory boundary. |
| cceb-018 | observability-otel | architecture | hard | `multi-memory`, `long` | 12-turn conversation; extractor must produce architecture + convention + 1 follow-up TODO without inflating to 5+ memories. |
| cceb-019 | every-job-handler-idempotent | convention | easy | `explicit-convention` | The exact "let's make it a convention: every X must Y" wording v1.0 missed. Pin this until it's robust. |
| cceb-020 | always-use-utc-timestamps | convention | easy | `explicit-convention`, `single-memory` | Same shape as cceb-019, different domain. Two examples lets us catch "model only learned the auth-domain version of this pattern." |
| cceb-021 | code-review-two-approvers | convention | medium | `explicit-convention`, `process` | Process convention (review policy), not technical. Tests the convention type doesn't degrade to decision when the topic isn't code-shape. |
| cceb-022 | error-handling-no-silent-catch | convention | medium | `explicit-convention`, `multi-option` | Two options discussed (silent vs propagated); "let's standardize on" wording converts to convention, not decision. The boundary case v2.5-01 prompted for. |
| cceb-023 | naming-conventions-snake-case | convention | hard | `explicit-convention`, `multi-memory`, `multi-option` | Multiple naming choices in one conversation (file names, var names, table names). Should produce 1 convention, not 3. |
| cceb-024 | migrate-postgres-15 | todo | easy | `single-memory`, `commitment-deadline` | Explicit owner + deadline + scope — all three v2.5-01 commitment gates triggered. |
| cceb-025 | spike-redis-cluster-vs-standalone | todo | medium | `single-memory`, `commitment-blocking` | Spike work bounded by a blocking event ("before we ship Q3 launch"). Tests the third commitment-gate path. |
| cceb-026 | document-pkce-migration | todo | medium | `multi-memory`, `commitment-owner` | Owner-bound TODO produced *alongside* a decision, must NOT be the sub-claim FP that v2.5-01 caught (which was inflating sub-claims to TODOs). |
| cceb-027 | nginx-502-spike-postmortem | issue | medium | `single-memory`, `incident` | Standard incident postmortem shape — Issue with rootcause + fix + impact. |
| cceb-028 | invoice-double-charge | issue | hard | `single-memory`, `partial-info` | Discussion contains issue + decision-to-refund + TODO-to-add-test. Extractor must produce just the issue (the others are `impact` of it). |
| cceb-029 | hypothetical-microservices | noise | medium | `noise`, `hypothetical` | Long discussion with NO commitment ("what if we...", "we could..."). Expected: extract NOTHING. Strengthens the noise rejection beyond cceb-008/009. |
| cceb-030 | mixed-cjk-english-architecture | architecture | hard | `cjk`, `multi-language`, `multi-memory` | Architecture choice discussed in mixed Chinese + English. Tests the language layer doesn't bias type detection. |

### 3.3 Type-coverage delta (v1.0 → v1.1, actual after authoring)

| Type | v1.0 expected count | v1.1 expected count | Δ |
|---|---:|---:|---:|
| decision | 4 | 9 | +5 |
| architecture | 2 | 7 | +5 |
| convention | 2 | 10 | +8 |
| todo | 1 | 4 | +3 |
| issue | 1 | 3 | +2 |
| (noise; expected=[]) | 2 | 3 | +1 |
| **total expected memories** | 12 | 36 | +24 |

> **Honest correction vs draft:** the original draft of this section
> predicted convention `+5` and architecture `+4` based on counting
> only the new dedicated single-type fixtures. The actual landed
> counts are higher because three multi-memory fixtures (cceb-017
> Kafka, cceb-018 OTel, cceb-030 mixed CJK Typesense) each contribute
> a convention plus an architecture, and cceb-026 contributes a
> decision plus a TODO. Fixing the draft table here rather than
> letting the discrepancy live silently — same discipline as the
> v2.5-07 architecture-filtered finding.

The convention bump (+8, lands at 10 total expected conventions) is
the deliberate fix for v1.0's 50% recall on conventions — five new
single-type convention fixtures (cceb-019 — cceb-023) all using the
explicit "let's make it a convention" wording, plus three more
conventions surfaced inside multi-memory fixtures. If v1.1 baseline
still shows convention recall < 75%, the gap is prompt-side (more
boundary-case examples) not fixture-side.

### 3.4 Difficulty distribution

| Difficulty | v1.0 | v1.1 (new) | v1.1 total |
|---|---:|---:|---:|
| easy | 4 | 4 | 8 |
| medium | 3 | 9 | 12 |
| hard | 2 | 8 | 10 |

(v1.0 had no formal difficulty assignment for cceb-008 / cceb-009 —
treated as easy noise.)

The v1.1 set leans medium/hard because the easy bucket is already
well-covered in v1.0 and what we need is differentiation among the
*hard* fixtures (where the model's behaviour is most variable).

## 4. LongMemEval-50 — selection strategy (locked)

### 4.1 Why a subset, not the full 500

The full LongMemEval has 500 questions across 7 question types over
~115k-token chat histories per question. Running the full set on
`gpt-4o-mini` takes ~3 hours wall-clock and ~$15 in tokens. That cost
is justified for paper submissions; for a credibility lever in a CHANGELOG
entry it is not. A 50-query subset:

- Costs ~$0.30-0.50 per run (10x cheaper than full LongMemEval-S, 30x
  cheaper than LongMemEval-M).
- Runs in ~10 min wall-clock — re-runnable on every release.
- Preserves cross-question-type coverage (50 / 7 ≈ 7 per type, same
  resolution as the full set's per-type subgroups).

### 4.2 Which 50 (locked)

Sample 50 questions from `longmemeval_s_cleaned.json` with the following
constraints:

| Question type | Count | Why this count |
|---|---:|---|
| `single-session-user` (information extraction from a single user statement) | 10 | Closest match to ai-memory's per-conversation extraction shape |
| `multi-session` | 10 | Tests memory-merge across sessions, the hardest case for offline extraction |
| `single-session-preference` | 8 | Maps to `convention` type — preferences ARE conventions in our schema |
| `single-session-assistant` (information embedded in assistant turns) | 8 | Tests we don't only listen to user turns |
| `temporal-reasoning` | 7 | Date-aware questions; ai-memory's `Date` field on every memory should let it answer these |
| `knowledge-update` | 7 | "Earlier I said X, now I say Y" — exercises the `resolved`/`replaces` paths |
| (skipped: `_abs` abstention questions, all types) | 0 | Abstention is "should not answer" — conflicts with extraction's "should produce evidence"; LongMemEval reviewers explicitly skip them for retrieval evaluation too |
| **Total** | **50** | |

The sampling is **deterministic-by-id** so the 50 questions are
reproducible: `bench/longmemeval/selected-questions.json` lists the
question_ids; the adapter loads only those from the user-supplied
`longmemeval_s_cleaned.json`. Selection algorithm: take the first N
question_ids of each type after sorting by id ascending — no random
seed, no model-favouring bias, no shuffling.

### 4.3 The conceptual mismatch (and how the adapter handles it)

LongMemEval native metric: "given the haystack history + the question,
does the assistant produce the right `answer`?" — runtime QA correctness.

ai-memory native metric: "given the haystack history (no question),
does the offline extractor produce typed memories that *contain* the
information needed to answer the question?"

These are NOT the same metric. The adapter measures a **proxy**:

> For each of the 50 questions: feed `haystack_sessions` to
> `extractMemories()` (the same code path `ai-memory extract` uses);
> concatenate all extracted memory titles + content + reasoning; check
> whether the LongMemEval `answer` text (or its key tokens — see §4.4)
> appears as a substring of that concatenation.

This proxy is **not a substitute** for running an actual QA system
end-to-end (we don't ship a runtime QA layer; that's by design — we
output git-trackable Markdown for a human downstream consumer). What
the proxy measures is **evidence preservation rate**: of the 50
questions whose answer is in the haystack somewhere, how many would a
downstream QA system have access to if it read only the
ai-memory-extracted memories instead of the raw haystack?

The published number is **"X / 50 answer-supporting evidence preserved
in extracted memories"**, NOT "X / 50 LongMemEval correctness." The
distinction is locked into the publication template (§6).

### 4.4 Scoring rubric (locked)

For each question, score 0 / 1 / partial as follows:

| Score | Pattern |
|---|---|
| **1** (full evidence preserved) | Every "key token" from the LongMemEval `answer` field appears (case-insensitive) in the concatenated extracted memories. Key tokens = answer split on whitespace, filtered to remove stop words (`the`, `a`, `is`, `was`, `it`, `that`, `this`, `to`, `of`, `in`, `on`, `at`, `for`, `with`, `and`, `or`, `but`) and tokens shorter than 3 chars. |
| **0.5** (partial) | At least 50% of key tokens match. Reported separately in the score breakdown. |
| **0** (evidence lost) | Less than 50% of key tokens match — the extraction discarded the answer. |

The published headline number is **the count of full-evidence-preserved
questions** (score = 1). Partial credit is in the breakdown but not the
headline, so the number can't be inflated by counting half-wins.

This rubric is identical-in-spirit to LongMemEval's own
`evaluate_qa.py` reference implementation but **simpler** (we use
literal substring matching, not LLM-judged correctness). Locking
literal matching avoids a self-referential dependency where evaluating
ai-memory requires a separate LLM call we'd then have to baseline as well.

## 5. Adapter design — `bench/longmemeval/`

### 5.1 What lands in this PR

```
bench/longmemeval/
├── README.md                  # maintainer runbook (download dataset → run adapter → score)
├── selected-questions.json    # 50 chosen question_ids + their type, no haystack content
├── loader.ts                  # reads longmemeval_s_cleaned.json, picks selected questions
├── adapter.ts                 # converts haystack_sessions → ConversationTurn[] + scores
├── run.ts                     # entry point; assumes data file at $LONGMEMEVAL_DATA env var
└── __tests__/
    ├── selection.test.ts      # 50 selected ids exist, distribution matches §4.2
    └── scorer.test.ts         # key-token extraction + matching invariants
```

### 5.2 What does NOT land in this PR

- The dataset itself (`longmemeval_s_cleaned.json` is ~150-200 MB; not
  a git artefact).
- A live baseline run.

The maintainer downloads the dataset per the instructions in
[`bench/longmemeval/README.md`](../bench/longmemeval/README.md) (the
adapter reads it from `$LONGMEMEVAL_DATA` or the canonical
`bench/longmemeval/data/longmemeval_s_cleaned.json` path, both
gitignored). Same split as v2.5-07: agent ships everything that
survives independently of execution; maintainer ships the API-key-and-
dataset-dependent step.

### 5.3 Adapter shape (locked)

```ts
// loader.ts
export async function loadSelectedQuestions(
  dataPath: string,
): Promise<LongMemEvalSample[]>;

interface LongMemEvalSample {
  question_id: string;
  question_type: LongMemEvalType; // 6 types, abstention skipped
  question: string;
  answer: string;
  haystack_sessions: HaystackTurn[][];
}

// adapter.ts
export function haystackToConversationTurns(
  sessions: HaystackTurn[][],
): ConversationTurn[]; // flatten + tag session boundaries

export function scoreEvidencePreserved(
  answer: string,
  extracted: ExtractedMemory[],
): { full: boolean; partial: boolean; matched: string[]; missed: string[] };
```

The `ConversationTurn` shape matches what `extractMemories()` already
consumes (the same shape CCEB fixtures use), so the adapter is a thin
adapter, not a parallel pipeline. If `extractMemories` changes shape
in the future, both CCEB and LongMemEval-50 update together.

## 6. Publication template (locked, fill-in-the-blank)

The maintainer publishes by editing
`docs/benchmarks/cceb-baseline.md` and adding a sibling section. The
publication has three required headlines, in this order:

1. **CCEB v1.1 (30 fixtures) — `gpt-4o-mini` — 2026-XX-XX.**
   Replaces the v1.0 9-fixture row in the active-baseline table; v1.0
   stays in the historical section verbatim. New per-type table; new
   delta-vs-v1.0 table (expected to show approximately flat F1 ±
   variance). If F1 changes >5 pp from v1.0 in either direction, the
   delta section explains why (more adversarial fixtures, prompt
   regression, etc.).
2. **LongMemEval-50 — `gpt-4o-mini` — 2026-XX-XX.** New section under
   "Where this fits among comparable measurements." Headline:
   "**X / 50 answer-supporting evidence preserved in extracted
   memories** on a deterministic 50-question subset of
   LongMemEval-S-cleaned." Includes:
   - Per-question-type breakdown (×6).
   - Methodology link to this spike doc.
   - Explicit "this is NOT LongMemEval native QA correctness — see
     spike §4.3" disclaimer in the same paragraph as the number, no
     paragraph-break gap.
   - Replication command + dataset download URL.
   - Tokens / spend / wall-clock.
3. **Honesty notes update.** The existing `cceb-baseline.md` honesty
   section gets a new bullet: "LongMemEval-50 is a proxy; X / 50 is
   evidence-preservation, not QA-correctness — see spike doc §4.3."
   Verbatim. No softening.

The same numbers ship to:

- README.md "How well does the extractor measure?" subsection — one
  sentence with both numbers, link out to the full report.
- `docs/competitive-landscape.md` — the CCEB row gains a LongMemEval-50
  cell; the row that says "no apples-to-apples third-party number"
  gets corrected to "evidence preservation on a 50-query LongMemEval
  subset; X / 50."
- HN/Reddit launch comment.

## 7. Re-spike triggers

We re-do the design (this doc) and re-run the experiment when **any** of:

1. **CCEB schema or scorer behaviour changes.** `bench/cceb/scorer.ts`
   has 16 unit tests pinning today's behaviour; widening the schema
   (e.g. adding a 6th memory type) requires a v1.2 fixture-pass and a
   new baseline.
2. **LongMemEval dataset changes.** The 2025/09 cleanup that shipped
   `_cleaned.json` files broke prior comparison — the adapter pins
   the cleaned filename, but if upstream re-cleans we re-validate the
   50 selected ids still exist and re-score.
3. **The 50-question selection produces a degenerate distribution.**
   The deterministic-by-id sampler picks the FIRST N ids of each type;
   if the LongMemEval authors reorder the file the distribution shifts.
   The selection-list test fails loudly in CI if any of the 50
   selected ids isn't present in a downloaded `longmemeval_s_cleaned.json`.
4. **A reader points out a defensible scoring edge case.** Same
   discipline as v2.5-07: add to the rubric, re-run, re-publish.
5. **Baseline F1 on v1.1 lands >5 pp below v1.0.** Either the prompt
   regressed (which is a real bug in `src/extractor/prompts.ts`) or
   the new fixtures encode an unfair difficulty bump (which is a
   v2.5-08 design bug). Either way, re-spike before publishing.

### 7.1 Re-spike outcomes recorded

- **2026-04-27 — non-string answers in upstream LongMemEval-S-cleaned.**
  First baseline attempt crashed on sample 11 (`00ca467f`) with
  `TypeError: answer.toLowerCase is not a function`. Survey of the
  selected 50 found 3 questions whose `answer` is a raw integer count
  (`2`, `3`, `5`) for "how many times did X happen" framings — same
  shape across ~6% of the full 500-question dataset (32/500). The
  evidence-preservation rubric is undefined for numeric answers: a
  bare `"2"` falls below `MIN_TOKEN_LEN=3` and degenerates to the
  empty-token fallback (`full: true`), which would silently inflate
  the headline. Fix: tighten `loader.ts:groupAndSortByType` to drop
  non-string answers as a hard filter alongside abstention, and widen
  `LongMemEvalSample.answer` to `string | number` so the type system
  matches reality. Manifest regenerated under the new filter — same
  10/10/8/8/7/7 distribution, 3 multi-session/temporal-reasoning ids
  shifted to the next deterministic-by-id pick. New regression tests
  in `__tests__/selection.test.ts` (filter pinned) and
  `__tests__/adapter.test.ts` (defensive coercion pinned).

- **2026-04-27 — short numeric-string answers fall below MIN_TOKEN_LEN.**
  Second baseline run (with the non-string filter in place) completed
  cleanly but the headline read "9/50 full evidence preserved" — and
  every single one of those 9 had `0/0` matched/total tokens. The
  empty-token branch in `scoreEvidencePreserved` (intended as a
  divide-by-zero guard for an "all-stop-word answer" edge case) was
  silently absorbing 9 short numeric-string answers like `"$12"`,
  `"$50"`, `"20%"`, `"2"`, `"43"`, `"25"`, `"5"`, `"4"` — all of which
  clean down (lowercase + strip non-letter/digit + drop tokens shorter
  than `MIN_TOKEN_LEN=3`) to an empty key-token list and fall straight
  into the divide-by-zero guard. The headline "9/50" was therefore
  measurement-of-nothing, not extractor success. Fix: add
  `loader.ts:hasZeroKeyTokens` alongside `isNonStringAnswer` so the
  loader filters these at selection time, and update the spike-doc
  rubric to call out that the divide-by-zero guard exists strictly
  for off-path callers (production should never hit it). Manifest
  regenerated; the 9 degenerate ids shift to the next
  deterministic-by-id pick within their type, distribution still
  10/10/8/8/7/7. Regression test in `__tests__/selection.test.ts`
  pins the new filter so a future refactor cannot silently re-inflate
  the headline.

  Why this slipped past the spike-time test pass: the unit tests use
  multi-word answers like `"The user lives in Toronto"` (5+ key tokens
  after cleaning); short-numeric-string answers were not in the test
  fixtures because the spike-time team didn't anticipate them in the
  upstream dataset. Lesson: when a unit test's input distribution is
  much "richer" than the real-world distribution, the test pins
  whatever the function does on the rich path but says nothing about
  the degenerate path. Moved the empty-token coercion test to
  `__tests__/adapter.test.ts` and added an explicit zero-token-answer
  test to `__tests__/selection.test.ts` so both fences are pinned.

## 8. Known unknowns (recorded honestly)

- **Single-scorer for fixture authoring.** The 21 new fixtures are
  authored + ground-truth-labelled by one person (the project author).
  v2.6 candidate: ship the fixture spec, ask one external contributor
  to author 5 more and re-baseline against the merged set.
- **Synthetic conversations.** All CCEB fixtures are author-written,
  not extracted from real editor chat history (privacy + reproducibility
  reasons). Real chat history has noise patterns the synthetic set
  underrepresents — incomplete sentences, abandoned threads, code
  blocks the LLM has to ignore. v2.6 candidate: anonymised real-chat
  fixture set behind a separate `bench:cceb:real` flag.
- **No null baseline for LongMemEval-50.** We don't run "what does the
  raw LongMemEval-S baseline (no extraction, just QA) score?" because
  that's the published LongMemEval number itself. We compare against
  literature values (30-40% F1 SOTA per the paper) rather than running
  it ourselves.
- **`gpt-4o-mini` only.** Both runs are pinned to the v1.0 baseline
  model. Adding `gpt-4o` / `claude-3.5-sonnet` rows is a v2.6
  candidate; the cost-per-run argument that justified the 50-question
  subset also justifies not multiplying it by 3 models in the same PR.

## 9. Acceptance criteria for closing v2.5-08

ROADMAP item flips to ✓ when **all** of:

- [x] 21 new CCEB fixtures land at `bench/cceb/fixtures/cceb-010` —
      `cceb-030` (this PR).
- [x] LongMemEval adapter scaffold lands at `bench/longmemeval/`
      (this PR).
- [x] `bench/longmemeval/selected-questions.json` lists 50 question_ids
      with the §4.2 distribution (this PR).
- [x] `npm run bench:cceb:dry` passes on all 30 fixtures (this PR
      smoke-tests the dry path; live run is the maintainer step).
- [ ] Maintainer runs `npm run bench:cceb` against the 30 fixtures and
      publishes the new baseline section in `cceb-baseline.md`.
- [ ] Maintainer downloads `longmemeval_s_cleaned.json`, runs the
      adapter, and publishes the LongMemEval-50 number alongside the
      CCEB v1.1 number.
- [ ] README + `docs/competitive-landscape.md` updated with both
      headlines.
- [ ] CHANGELOG entry added.

Until those last four are done, ROADMAP keeps v2.5-08 unchecked with
the status note "agent-side prep complete; awaiting maintainer baseline
run." Same discipline as v2.5-03 / v2.5-07.
