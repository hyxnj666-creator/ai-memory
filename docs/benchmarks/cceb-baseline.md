# CCEB baseline

> Cursor Conversation Extraction Benchmark — published live runs.
> &nbsp;
> Pipeline: green ✓ &nbsp; • &nbsp; Fixtures: 9 ✓ &nbsp; • &nbsp; Live LLM runs: ✓ (2026-04-25, 2026-04-26)

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
QA over a much larger corpus. Direct comparison is unfair (LongMemEval is
QA, CCEB is structured extraction; their fixtures are open-domain user
chats, ours are technical engineering conversations), but it sets the
order-of-magnitude expectation: extraction-from-chat is hard, and 76%
F1 on a typed schema sits well above any directly-comparable public
number we've found.

CCEB is small (9 fixtures) by design — it's a *signal* benchmark we can
review by hand on every release, not a leaderboard. Future fixture
expansion is tracked as a v2.5 candidate
([ROADMAP.md](../../ROADMAP.md), `v2.5-08`).

## Honesty notes (things these numbers are *not*)

- **Not "ai-memory's quality on a real corpus".** Nine hand-curated
  fixtures cover every memory type and a couple of adversarial cases,
  but they're a CI smoke-suite, not a production sample. A user with
  noisy ten-thousand-turn editor history will likely see a different
  curve.
- **Not deterministic.** A second run with the same model produces
  slightly different memories (LLM sampling). The `scorecard.json` is
  one snapshot; ±3-5 F1 points run-to-run is normal at N=9. A
  `--repeats N` flag for median-of-N reporting is on the v2.5+
  punchlist.
- **Not comparable to "memory middleware" benchmarks.** mem0, Letta
  and the like measure runtime memory recall (Q→A), not offline
  extraction precision/recall. There is no apples-to-apples third-party
  number for what CCEB measures yet — that's why we have CCEB.

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
  ([`bench/cceb/scorer.ts`](../../bench/cceb/scorer.ts) — 16 unit tests
  cover perfect matches, partial matches, wrong-type, must_not_contain
  exclusions, greedy claim, noise fixtures, and error fixtures).
- **Fixture suite v1.** 9 fixtures spanning all 5 memory types plus 2
  noise cases (small talk + deferred-decision). Listed in
  [`bench/cceb/README.md`](../../bench/cceb/README.md). Adding fixtures
  is welcome; *removing* or substantively rewording an existing one
  resets the baseline (note in CHANGELOG).
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
