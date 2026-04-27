# CCEB baseline

> Cursor Conversation Extraction Benchmark — published live runs.
> &nbsp;
> Pipeline: green ✓ &nbsp; • &nbsp; Fixtures v1.0: 9 ✓ (baseline runs 2026-04-25, 2026-04-26) &nbsp; • &nbsp; Fixtures v1.1: 30 ✓ (baseline run 2026-04-27 — see below; spike at [v2.5-08 spike doc](../cceb-v1.1-and-longmemeval-spike-2026-04-27.md))

---

## Baseline — `gpt-4o-mini` — 2026-04-27 (v1.1 fixture expansion to 30)

| Type           | TP | FP | FN | Precision | Recall  | F1        |
|----------------|---:|---:|---:|----------:|--------:|----------:|
| decision       |  9 |  5 |  0 |     64.3% |  100.0% |     78.3% |
| architecture   |  4 |  0 |  3 |    100.0% |   57.1% |     72.7% |
| convention     |  6 |  3 |  4 |     66.7% |   60.0% |     63.2% |
| todo           |  3 | 11 |  2 |     21.4% |   60.0% |     31.6% |
| issue          |  3 |  0 |  0 |    100.0% |  100.0% |    100.0% |
| **overall**    | 25 | 19 |  9 | **56.8%** | **73.5%** | **64.1%** |

- **Tool version:** `ai-memory-cli@2.4.0` HEAD + v2.5-01 prompt + v1.1
  fixture set (`bench/cceb/fixtures/cceb-001` — `cceb-030`). The
  prompt is unchanged from the v2.5-01 baseline above; what changed
  is the fixture set, not the model behaviour.
- **Model:** `gpt-4o-mini`.
- **Mode:** live, single run, `temperature=0.2`, no retries triggered.
- **Wall-clock:** 239.7 s for 30 fixtures (avg 8.0 s/fixture).
- **Approximate spend:** ≈ $0.02 (≈ 80K input + 18K output tokens
  across the 30 fixtures, on the published `gpt-4o-mini` token rates).
- **Raw artefacts:** [`bench/cceb/out/scorecard.json`](../../bench/cceb/out/scorecard.json) and
  [`bench/cceb/out/scorecard.md`](../../bench/cceb/out/scorecard.md) (regenerated on every
  `npm run bench:cceb`).

### Delta vs the v2.5-01 baseline (apples-to-oranges, see notes)

| Metric              | v2.5-01 (9 fixtures) | v1.1 (30 fixtures) | Δ          |
|---------------------|---------------------:|-------------------:|-----------:|
| **F1 (overall)**    |               76.2% |          **64.1%** | −12.1 pp   |
| **Precision**       |               66.7% |          **56.8%** | −9.9 pp    |
| **Recall**          |               88.9% |          **73.5%** | −15.4 pp   |
| FPs (total)         |                   4 |                 19 | +15        |
| FNs (total)         |                   1 |                  9 | +8         |
| `decision` F1       |               75.0% |              78.3% | +3.3 pp    |
| `architecture` F1   |              100.0% |              72.7% | −27.3 pp   |
| `convention` F1     |               66.7% |              63.2% | −3.5 pp    |
| `todo` F1           |               50.0% |              31.6% | −18.4 pp   |
| `issue` F1          |              100.0% |             100.0% | 0          |

This is the comparison the v2.5-08 spike doc §2 explicitly anticipated:

> "We expect the new 30-fixture F1 to land *near* the 9-fixture F1
> within run-to-run variance, possibly slightly lower as we add
> adversarial fixtures. A *lower* number is **not** a regression — it
> is a more honest measurement on a harder fixture set."

The 12.1-pp drop is bigger than "slightly lower" — but the per-type
breakdown shows the drop is concentrated in the cells the new fixtures
deliberately stressed:

- **`architecture` recall dropped from 100% → 57.1%** because the v1.1
  set added three architecture fixtures (`cceb-016` Redis cache-aside,
  `cceb-017` Kafka event bus, `cceb-018` OTel pipeline) that bundle
  architecture + convention in a single conversation. The extractor
  consistently classified the architectural piece as a `decision` and
  missed it as an architecture, even though it produced *something*
  for the conversation — a type-classification failure mode that didn't
  exist in v1.0 because v1.0 had no multi-memory-per-conversation
  architecture fixtures.
- **`todo` F1 dropped from 50.0% → 31.6%** entirely on precision (FP
  count went from 2 → 11). The v1.1 set added 12 fixtures with TODO-or-
  no-TODO ambiguity (process commitments, decision impacts, postmortem
  next-steps), and the extractor still over-promotes follow-up actions
  to standalone TODOs. This is the v2.5-01 prompt-rewrite's known
  weakest cell, and it scales badly: at N=9 it was already weakest;
  at N=30 the same failure mode produces 5.5× the FPs.
- **`issue` F1 stayed at 100%.** The Issue-vs-TODO boundary case
  added in v2.5-01 is genuinely robust — three new issue fixtures
  (`cceb-021`, `cceb-027`, `cceb-028`) all clean.
- **`decision` F1 *improved* by +3.3 pp** despite +5 FPs, because the
  v1.1 set tripled the decision-fixture count from 3 to 9 and recall
  stayed at 100%. So the v2.5-01 prompt got every decision; it just
  also produced sub-claim FPs in a few of them.

### What the v1.1 numbers say (the honest read)

The 76% headline from v1.0 was *correct on the 9 fixtures it measured*,
but those 9 fixtures had a structural blind spot: they tested each type
in clean isolation. The v1.1 expansion adds three patterns v1.0 didn't
exercise — multi-memory-per-conversation (architecture + convention
together), commitment-shape ambiguity (process vs. technical TODOs),
and decision-impact-vs-followup-TODO triage — and each of those
patterns surfaces a real extractor weakness. The 64% number is therefore
the more honest measurement of the same extractor on a less
cherry-picked fixture distribution.

The clearest concrete signal: TODO precision is the single biggest
contributor to the F1 drop. 11 of the 19 FPs are TODOs. The v2.5+
work item this points at is unchanged from the v2.5-01 baseline:

> "The next lever is a post-extract dedup step that compares pairwise
> content within a single fixture rather than further prompt growth."  
> *— v2.5-01 baseline analysis*

Adding more prompt instructions to discipline the TODO type is hitting
diminishing returns. A post-extract pairwise-content dedup pass would
catch most of the multi-memory-per-conversation FPs without another
prompt round-trip. Tracked for v2.6.

### What the v1.1 numbers do *not* say

- **Not a regression vs v1.0.** The v1.0 → v1.1 delta is a
  fixture-distribution change, not a model-behaviour change. Running
  the v1.0 fixtures alone against the same v2.5-01 prompt would still
  produce 76.2% F1.
- **Not "the extractor is worse."** It's "the extractor is being
  measured on harder cases." Same number, more honest scope.
- **Not enough on its own to guide v2.6 prompt work.** The v1.1
  per-fixture breakdown points at TODO discipline as the highest-
  leverage cell; the v2.6 prompt-side spike will need its own
  fixture-author-pass before publishing.

---

## Baseline — `gpt-4o-mini` — 2026-04-26 (v2.5-01 prompt rewrite)

| Type           | TP | FP | FN | Precision | Recall    | F1        |
|----------------|---:|---:|---:|----------:|----------:|----------:|
| decision       |  3 |  2 |  0 |     60.0% |    100.0% |     75.0% |
| architecture   |  2 |  0 |  0 |    100.0% |    100.0% |    100.0% |
| convention     |  1 |  0 |  1 |    100.0% |     50.0% |     66.7% |
| todo           |  1 |  2 |  0 |     33.3% |    100.0% |     50.0% |
| issue          |  1 |  0 |  0 |    100.0% |    100.0% |    100.0% |
| **overall**    |  8 |  4 |  1 | **66.7%** | **88.9%** | **76.2%** |

- **Tool version:** `ai-memory-cli@2.4.0` HEAD + v2.5-01 prompt
  (`src/extractor/prompts.ts`). The version field still reads `2.4.0`
  because the bump to `2.5.0` lands when v2.5 publishes; what matters
  for reproducibility is the commit SHA recorded alongside this entry.
- **Model:** `gpt-4o-mini` (now correctly labelled in the scorecard —
  the cosmetic `openai (default)` artefact was fixed in this round; see
  `bench/cceb/run.ts:detectModel`).
- **Mode:** live, single run, `temperature=0.2` (extractor default), no retries triggered.
- **Wall-clock:** 47.9 s for 9 fixtures (avg 5.3 s/fixture — ~33% faster
  than the v2.4 run, mostly because the over-extracting fixtures now emit
  fewer items and the JSON parsing/quality-filter stages have less work).
- **Approximate spend:** ≈ $0.006 (≈ 22K input + 5K output tokens; the
  prompt grew by ~1.6K tokens in the rewrite).
- **Raw artefacts:** [`bench/cceb/out/scorecard.json`](../../bench/cceb/out/scorecard.json) and
  [`bench/cceb/out/scorecard.md`](../../bench/cceb/out/scorecard.md) (regenerated on every
  `npm run bench:cceb`).

### Delta vs the v2.4 baseline

| Metric                | v2.4    | v2.5-01 | Δ          |
|-----------------------|--------:|--------:|-----------:|
| **F1 (overall)**      | 56.0%   | **76.2%** | **+20.2 pp** |
| **Precision**         | 43.8%   | **66.7%** | **+22.9 pp** |
| **Recall**            | 77.8%   | **88.9%** | +11.1 pp   |
| FPs (total)           | 9       | 4       | −5         |
| FNs (total)           | 2       | 1       | −1         |
| `decision` F1         | 66.7%   | 75.0%   | +8.3 pp    |
| `architecture` F1     | 50.0%   | 100.0%  | +50.0 pp   |
| `todo` precision      | 20.0%   | 33.3%   | +13.3 pp   |
| `issue` F1            | 66.7%   | 100.0%  | +33.3 pp   |

The v2.5-01 KPI floor was P ≥60% / F1 ≥65% with recall not regressing
below 75%. All three thresholds were cleared with margin.

### What changed in the prompt

`src/extractor/prompts.ts:buildExtractionPrompt` got three additions
that target the over-extraction pattern surfaced by the v2.4 baseline:

1. **`ONE-MEMORY-PER-DECISION RULE`** — an explicit instruction with
   four anti-pattern examples taken straight from the v2.4 false-positive
   set (Lua-script audit attached to a Redis Cluster TODO; `REVOKE
   UPDATE/DELETE` attached to event-sourcing architecture; nightly
   integrity-check job attached to event sourcing; `client_id`
   deprecation attached to PKCE). Caps a single chunk at 0–3 memories
   unless the conversation literally enumerates 4+ separable items.
2. **Tightened `todo` type definition** — three required gates: explicit
   commitment language, clear scope + done-criteria, and an owner OR
   deadline OR blocking event. With four `✗` reject examples for
   "implementation gotcha mentioned alongside a decision" and
   "incidental aside" patterns.
3. **`TYPE BOUNDARY CASES` block** — disambiguates Convention vs
   Decision (a forward-looking *rule* → convention, even if decided
   once), Architecture vs Decision (system *structure* → architecture,
   one-of-N *choice* → decision), and Issue vs TODO (a fix-deploy is
   *impact* of the issue, not a separate TODO).

### What the new numbers say

- **Precision lifted by +22.9 pp** with **recall +11.1 pp on top** —
  no precision/recall trade-off. The headline goal of v2.5-01 was a
  precision lift without giving back recall, and the rewrite achieved
  both directions simultaneously. This is consistent with the v2.4
  hypothesis that over-extraction was a *prompt-discipline* problem,
  not a *model-doesn't-see-the-signal* problem.
- **`architecture` and `issue` are now perfect** (F1 100% on both).
  The v2.4 architecture FN (sub-claim missing the keyword match) was
  fixed by the merge-don't-split instruction, and the v2.4 issue FP
  (a fix-deploy promoted to a TODO) was fixed by the Issue-vs-TODO
  boundary case.
- **`todo` precision is still the weakest cell** at 33.3%. Two FPs
  remain: `cceb-005` extracted "Switch to Redis Cluster for
  scalability" as both a TODO *and* a decision (the conversation
  legitimately has both flavours, but the scorer expects only the TODO);
  and `cceb-007` extracted "更新 CI 和 lockfile, 删除旧的
  package-lock.json" as a TODO instead of merging it into the pnpm
  decision's `impact`. Both are smaller-magnitude versions of the same
  pattern v2.5-01 targeted, suggesting the next lever is a post-extract
  dedup step that compares pairwise content within a single fixture
  rather than further prompt growth.
- **`convention` recall is still 50%.** `cceb-002` (cursor pagination)
  still doesn't get classified as a convention. The v2.5-01 boundary
  case got `cceb-006`'s "every job handler must be idempotent" right
  but missed the "every paged GraphQL endpoint must use cursor
  pagination" twin. Looks like the model's prior over-weights the
  presence of an "options were considered" framing toward decision,
  even when the user explicitly says "let's make it a convention".
  Fix candidate: a fourth boundary-case example pinning that exact
  wording. Tracked for v2.5+.
- **Noise rejection still perfect** (`cceb-008`, `cceb-009`). The
  added instructions did not cause the model to start hallucinating
  on chit-chat or on explicitly-unresolved questions.

### Concrete v2.5+ work this baseline points at

1. **Post-extract pairwise dedup within a single fixture.** Three of
   the four remaining FPs are sub-claims emitted alongside their
   parent. A symmetric content-shingle compare (jaccard ≥ 0.5) inside
   the existing `deduplicateMemories()` path, currently only invoked
   on multi-chunk extractions, would catch most of these without
   another prompt round-trip.
2. **Convention recall on the cursor-pagination shape.** Add one more
   `TYPE BOUNDARY CASES` example pinning "let's make it a convention:
   every X must Y" → convention, after a multi-option discussion.
3. **Run-to-run variance instrumentation.** Single-run F1 at N=9 is
   ±3-5 pp from sampling alone. A `--repeats N` flag on the runner
   that takes the median across N runs would let us claim the v2.5-01
   number with a tighter confidence interval.

---

## Baseline — `gpt-4o-mini` — 2026-04-25 (v2.4 — historical)

| Type           | TP | FP | FN | Precision | Recall  | F1        |
|----------------|---:|---:|---:|----------:|--------:|----------:|
| decision       |  3 |  3 |  0 |     50.0% |  100.0% |     66.7% |
| architecture   |  1 |  1 |  1 |     50.0% |   50.0% |     50.0% |
| convention     |  1 |  0 |  1 |    100.0% |   50.0% |     66.7% |
| todo           |  1 |  4 |  0 |     20.0% |  100.0% |     33.3% |
| issue          |  1 |  1 |  0 |     50.0% |  100.0% |     66.7% |
| **overall**    |  7 |  9 |  2 | **43.8%** | **77.8%** | **56.0%** |

- **Tool version:** `ai-memory-cli@2.4.0`
- **Model:** `gpt-4o-mini` (the `extractor/llm.ts` default; the v2.4
  scorecard reported `openai (default)` because `detectModel()` returned
  the env-detected fallback rather than the llm-layer fallback — known
  cosmetic artefact, fixed in v2.5-01).
- **Mode:** live, single run, no temperature override, no retries.
- **Wall-clock:** 70.5 s for 9 fixtures (avg 7.8 s/fixture).
- **Approximate spend:** ≈ $0.005 (≈ 18K input + 4.5K output tokens).

### v2.4 commentary (historical — superseded by v2.5-01 above)

The v2.4 baseline was published with the analysis: **"high recall (77.8%),
lower precision (43.8%) — the model rarely misses signal but frequently
splits one logical memory into several."** The single biggest contributor
was `cceb-003-event-sourcing` (1 expected → 4 extracted), with the same
pattern at smaller magnitude on `001`, `005`, and `007`.

The three concrete v2.5 work items called out from that pattern were
(1) merge sub-claims back into parent memory via prompt + post-extract
dedup, (2) type-classification calibration on convention/architecture vs
decision boundaries, and (3) TODO discipline via explicit commitment
language. Items (1) and (2) and the prompt-side half of (3) all landed
in v2.5-01 above; the post-extract dedup half of (1) is still on the
v2.5+ list and is what would close the four remaining FPs.

The cosmetic `model` field artefact (the v2.4 scorecard reading
`openai (default)` because `detectModel()` returned the env-detected
string rather than the llm-layer fallback) was fixed in this round.

---

## Where this fits among comparable measurements

The "expected" reference for chat→knowledge extraction is
[LongMemEval](https://github.com/xiaowu0162/LongMemEval) (NeurIPS 2024),
which reports SOTA F1s in the **30–40% range** on conversation-grounded
QA over a much larger corpus. Direct comparison is *unfair in both
directions* (LongMemEval is QA over open-domain user chats with a
much harder retrieval surface; CCEB is structured extraction over
technical engineering conversations with curated, scope-limited
fixtures), so the order-of-magnitude takeaway is what survives:
chat→knowledge is hard enough that 30–40% counts as state-of-the-art
on the canonical benchmark, and 64% F1 on a typed-schema task with
30 engineering fixtures is meaningfully better than the 0% you'd
get without any extraction — but this number does **not** translate
directly to "ai-memory is 2× better than LongMemEval SOTA". Different
layer, different question, fundamentally smaller corpus.

To pin a more honest cross-corpus number, v2.5-08 added a 50-query
LongMemEval-S-cleaned subset adapter; the baseline is below.

### LongMemEval-50 — `gpt-4o-mini` — 2026-04-27 (v2.5-08, evidence-preservation rubric)

**Headline: 0 / 50 answer-supporting evidence preserved in extracted memories**, plus 2 / 50 partial-evidence questions reported separately, on a deterministic 50-question subset of LongMemEval-S-cleaned. **NOT** LongMemEval native QA-correctness — this is evidence-preservation under our literal-token rubric (substring match, no stemming, 100% token coverage required for `full`); see [the v2.5-08 spike doc §4.3](../cceb-v1.1-and-longmemeval-spike-2026-04-27.md) for the rubric in full.

| Type                         |  n | Full | Partial | Full rate |
|------------------------------|---:|-----:|--------:|----------:|
| single-session-user          | 10 |    0 |       1 |      0.0% |
| multi-session                | 10 |    0 |       0 |      0.0% |
| single-session-preference    |  8 |    0 |       0 |      0.0% |
| single-session-assistant     |  8 |    0 |       1 |      0.0% |
| temporal-reasoning           |  7 |    0 |       0 |      0.0% |
| knowledge-update             |  7 |    0 |       0 |      0.0% |
| **overall**                  | 50 |    0 |       2 |  **0.0%** |

- **Tool version:** `ai-memory-cli@2.4.0` HEAD (same prompt as the
  CCEB v1.1 row above).
- **Model:** `gpt-4o-mini`.
- **Dataset:** `longmemeval_s_cleaned.json`, sha256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442` (the 2026-04 snapshot the manifest pins).
- **Wall-clock:** 743.7 s for 50 questions (avg 14.9 s/question; each
  question is 469-600 turns of session history flattened into the
  extractor input).
- **Approximate spend:** ≈ $0.40 (≈ 1.4M input + 75K output tokens; the
  per-question token count is 50× larger than CCEB because LongMemEval
  questions span entire haystacks).
- **Errors:** 0 in this run (transient 503s in earlier runs are
  recoverable; the runner excludes errored extractions from the
  headline by design).
- **Raw artefacts:** [`bench/longmemeval/out/scorecard.json`](../../bench/longmemeval/out/scorecard.json) and
  [`bench/longmemeval/out/scorecard.md`](../../bench/longmemeval/out/scorecard.md).

#### Replication

```bash
# 1) one-time dataset download (~265 MB)
mkdir -p bench/longmemeval/data
wget -O bench/longmemeval/data/longmemeval_s_cleaned.json \
  https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json

# 2) regenerate manifest (idempotent for a pinned dataset sha)
npx tsx bench/longmemeval/select-questions.ts \
  --data bench/longmemeval/data/longmemeval_s_cleaned.json

# 3) run the baseline (live LLM, ~12 min, ~$0.40)
LONGMEMEVAL_DATA=bench/longmemeval/data/longmemeval_s_cleaned.json \
  OPENAI_API_KEY=... npm run bench:longmemeval -- --model gpt-4o-mini
```

#### What the 0/50 number says

A 0/50 headline reads worse than it is. Three pieces of context to
read it correctly:

- **The rubric is deliberately strict.** "Full" requires **every** key
  token (≥3 chars, non-stop-word) of the upstream answer to appear as a
  literal substring in the joined extracted-memory text. Multi-token
  answers like LongMemEval's preference questions (single-session-
  preference averages 25 key tokens) get scored against gpt-4o-mini's
  best 5-7 extracted memories per question — at 100% token coverage,
  most realistic extraction misses one of those 25, falls below the
  partial threshold (50%), and lands in the 0 bucket. The
  partial-credit row + per-question matched/total counts are where
  the real signal lives, not the headline.
- **`single-session-preference` does the actual work.** The per-question
  detail in [`bench/longmemeval/out/scorecard.md`](../../bench/longmemeval/out/scorecard.md)
  shows preference questions consistently match 3-6 of 17-43 key
  tokens (`0edc2aef`: 6/25, `195a1a1b`: 4/17, `0a34ad58`: 4/26); not
  enough for partial under our rubric, but a measurable signal that
  the extractor *is* picking up real preference content from the
  long-conversation flatten. Temporal-reasoning is the inverse —
  small token counts (3-6) and the extractor recovers 0-2.
- **Two genuine partial hits.** `19b5f2b3` (single-session-user, 1/2
  tokens, 50%) and `1b9b7252` (single-session-assistant, 1/2, 50%)
  both clear the partial threshold. Both are short, single-fact
  answers — the extractor's cleanest case.

The real takeaway is *direction*, not magnitude:

- **CCEB-shape (typed-schema extraction over engineering chat) is
  where this tool is pointed.** F1 64.1% is a real measurement on a
  task ai-memory was designed for.
- **LongMemEval-shape (open-domain QA-evidence preservation across a
  500-turn haystack) is what this tool is *not* pointed at.** 0/50
  full-evidence is not a bug; it's the rubric correctly reporting
  that gpt-4o-mini, asked to extract structured engineering memories
  from 500 turns of unrelated chat, doesn't preserve every literal
  token of an open-domain user fact. Different problem.

This baseline therefore *answers* the predictable HN/Reddit question
"how do you compare to LongMemEval / mem0 / Letta?" without
hand-waving — and the answer is "we don't, and here's the number that
shows we don't, with the rubric and replication command attached."

#### Two re-spike findings during this baseline

The first live run on this rubric surfaced two upstream-data issues
the spike-time tests didn't catch. Documented in full at
[the v2.5-08 spike doc §7.1](../cceb-v1.1-and-longmemeval-spike-2026-04-27.md#71-re-spike-outcomes-recorded);
short version:

1. **Upstream `answer` field is `string | number`.** ~6% of LongMemEval-
   S-cleaned samples are short integer counts (e.g. `2`, `3`, `5`) for
   "how many X happened" questions. Adapter assumed string-only;
   loader now filters non-string answers as out-of-rubric.
2. **Short numeric-string answers (`"$12"`, `"20%"`, `"2"`, `"43"`)
   clean down to zero key tokens** under the locked
   `MIN_TOKEN_LEN=3` rule. The empty-token branch in
   `scoreEvidencePreserved` returns `full: true` defensively (a
   divide-by-zero guard for an "all-stop-word answer" edge case). The
   first complete run hit that branch on 9/50 questions and reported
   "9/50 full" — every one with `0/0` matched/total. Loader now
   filters zero-token answers as out-of-rubric so the divide-by-zero
   guard can't silently inflate the headline.

Both filters are pinned by regression tests in
`bench/longmemeval/__tests__/selection.test.ts`. Manifest regenerated
with the new filters; distribution still 10/10/8/8/7/7. The 0/50
headline above is the third live run, post-fix.

CCEB is small (30 fixtures) by design — it's a *signal* benchmark we
can review by hand on every release, not a leaderboard. The
fixture-expansion + LongMemEval-50 adapter from `v2.5-08` together
shrunk the within-suite variance band and pinned a cross-corpus
sanity check; further fixture growth and a `--repeats N` flag for
median-of-N reporting are tracked for v2.6.

## Honesty notes (things these numbers are *not*)

- **Not "ai-memory's quality on a real corpus".** 30 hand-curated
  fixtures cover every memory type and a dozen adversarial cases,
  but they're a CI signal-suite, not a production sample. A user
  with noisy ten-thousand-turn editor history will likely see a
  different curve.
- **Not deterministic.** A second run with the same model produces
  slightly different memories (LLM sampling). The `scorecard.json`
  is one snapshot; ±3-5 F1 points run-to-run is normal at N=30. A
  `--repeats N` flag for median-of-N reporting is on the v2.6 list.
- **Not comparable to "memory middleware" benchmarks.** mem0, Letta
  and the like measure runtime memory recall (Q→A), not offline
  extraction precision/recall. There is no apples-to-apples third-
  party number for what CCEB measures — that's why we built CCEB.
- **LongMemEval-50 is a proxy.** The 0/50 full + 2/50 partial number
  is *evidence-preservation under our literal-token rubric*, not
  LongMemEval's native QA-correctness. See spike doc §4.3 for the
  full rubric definition. Don't quote the LongMemEval-50 number
  without that disclaimer.

---

## How to capture a new baseline

```bash
# In the ai-memory checkout, with an OpenAI-compatible API key in env:
export OPENAI_API_KEY=<your key>             # or AI_REVIEW_API_KEY
npm run bench:cceb -- --model gpt-4o-mini    # --model is now optional
                                             # since the cosmetic
                                             # detectModel() artefact
                                             # was fixed in v2.5-01;
                                             # passing it explicitly is
                                             # still good practice for
                                             # locking the label.
```

Reports land in [`bench/cceb/out/`](../../bench/cceb/out/). When you're
satisfied the numbers reflect intent (re-read the fixtures and the
extracted memories at least once — keyword expectations occasionally
need a refresh as upstream model phrasing drifts), append a new
`### Baseline — {{model}} — {{date}}` section above this one and commit.

### Behind a corporate / regional firewall

Node v24+ honours `HTTPS_PROXY` *only* when `NODE_USE_ENV_PROXY=1` is
set. The two env vars together are the cheapest way to route the
benchmark through a local HTTP proxy (e.g. Clash / v2rayN on
`127.0.0.1:7890`):

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export NODE_USE_ENV_PROXY=1
npm run bench:cceb -- --model gpt-4o-mini
```

This applies to any LLM-calling command (`extract`, `bench:cceb`,
`doctor --no-llm-check=false`), not just the benchmark.

## What's frozen across releases

- **Scoring algorithm.** Pure, deterministic, fully tested
  ([`bench/cceb/scorer.ts`](../../bench/cceb/scorer.ts) — unit tests
  cover perfect matches, partial matches, wrong-type, must_not_contain
  exclusions, greedy claim, noise fixtures, and error fixtures).
- **Fixture suite v1.0.** 9 fixtures (cceb-001 — cceb-009) spanning
  all 5 memory types plus 2 noise cases (small talk + deferred-
  decision). These nine are pinned verbatim across releases — *removing*
  or substantively rewording any one of them resets the baseline (note
  in CHANGELOG).
- **Fixture suite v1.1** *(shipped 2026-04-27, baseline run pending)*.
  Adds 21 fixtures (cceb-010 — cceb-030) targeting v1.0 weaknesses
  (convention recall, todo precision, "let's make it a convention"
  wording, multi-memory boundaries, long conversations, mixed CJK).
  Roster + rationale frozen in
  [`docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md`](../cceb-v1.1-and-longmemeval-spike-2026-04-27.md).
  Listed in [`bench/cceb/README.md`](../../bench/cceb/README.md).
- **Reporting format.** Per-type and overall P/R/F1 micro-averages,
  per-fixture detail, sample misses, sample false positives. Both
  Markdown (`scorecard.md`) and JSON (`scorecard.json`) shapes are
  stable across releases.
- **Pipeline.** `npm run bench:cceb:dry` runs end-to-end in ~1 second
  with no LLM dependency, and is part of the typecheck gate.

## Why the baseline isn't shipped pre-built (until now)

CCEB intentionally requires a human to:

1. Pick a model and lock its identifier into the published scorecard.
2. Re-read the fixtures and the actual extracted memories to confirm
   the scoring keywords still reflect intent (LLMs change phrasing
   over time and `must_contain` keywords occasionally need a refresh).
3. Sign off that the published number is honest and up-to-date.

A pre-canned baseline would invite "this commit broke our F1" panic
when in reality the model upstream was updated. We'd rather publish a
smaller, hand-stewarded number than a larger one that drifts.
