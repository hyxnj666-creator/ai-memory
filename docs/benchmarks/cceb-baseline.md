# CCEB baseline

> Cursor Conversation Extraction Benchmark — first published live run.
> &nbsp;
> Pipeline: green ✓ &nbsp; • &nbsp; Fixtures: 9 ✓ &nbsp; • &nbsp; Live LLM run: ✓ (2026-04-25)

---

## Baseline — `gpt-4o-mini` — 2026-04-25

| Type           | TP | FP | FN | Precision | Recall  | F1        |
|----------------|---:|---:|---:|----------:|--------:|----------:|
| decision       |  3 |  3 |  0 |     50.0% |  100.0% |     66.7% |
| architecture   |  1 |  1 |  1 |     50.0% |   50.0% |     50.0% |
| convention     |  1 |  0 |  1 |    100.0% |   50.0% |     66.7% |
| todo           |  1 |  4 |  0 |     20.0% |  100.0% |     33.3% |
| issue          |  1 |  1 |  0 |     50.0% |  100.0% |     66.7% |
| **overall**    |  7 |  9 |  2 | **43.8%** | **77.8%** | **56.0%** |

- **Tool version:** `ai-memory-cli@2.4.0`
- **Model:** `gpt-4o-mini` (the `extractor/llm.ts` default; the raw scorecard
  reports `openai (default)` because `OPENAI_MODEL` was unset and
  `detectModel()` reports the env-detected fallback rather than the
  llm-layer fallback — known cosmetic artefact, see *Honesty notes* below).
- **Mode:** live, single run, no temperature override, no retries.
- **Wall-clock:** 70.5 s for 9 fixtures (avg 7.8 s/fixture).
- **Approximate spend:** ≈ $0.005 (≈ 18K input + 4.5K output tokens).
- **Raw artefacts:** [`bench/cceb/out/scorecard.json`](../../bench/cceb/out/scorecard.json) and
  [`bench/cceb/out/scorecard.md`](../../bench/cceb/out/scorecard.md) (regenerated on every
  `npm run bench:cceb`).

### What the numbers say

The shape — **high recall (77.8%), lower precision (43.8%)** — is the most
honest signal in this baseline. The model rarely *misses* signal but
frequently *splits* one logical memory into several.

- **Recall is healthy across the board.** Every signal-bearing fixture
  produced at least one true-positive of the correct type. The two
  false negatives are *type-classification* mistakes (e.g. a convention
  emerged as a decision, an architecture sub-claim missed the keyword
  match) — not "the model didn't notice".
- **Precision is dragged down by over-extraction.** The single biggest
  hit is `cceb-003-event-sourcing` (1 expected → 4 extracted: 1
  architecture + 1 decision + 2 todos), where downstream actions and
  sub-claims of the same architectural decision were each promoted to
  their own memory. Same pattern, smaller magnitude, on `001`, `005`,
  and `007` (CJK).
- **Noise handling is perfect.** Both noise fixtures (chit-chat and
  unresolved questions) returned zero memories — no hallucinations under
  pressure, which is the failure mode HN audiences poke at hardest.

### Where this fits among comparable measurements

The "expected" reference for chat→knowledge extraction is
[LongMemEval](https://github.com/xiaowu0162/LongMemEval) (NeurIPS 2024),
which reports SOTA F1s in the **30–40% range** on conversation-grounded
QA over a much larger corpus. Direct comparison is unfair (LongMemEval is
QA, CCEB is structured extraction; their fixtures are open-domain user
chats, ours are technical engineering conversations), but it sets the
order-of-magnitude expectation: extraction-from-chat is hard, and 56% F1
on a typed schema is meaningfully better than the 0% you'd get without
any extraction, while still leaving obvious headroom.

CCEB is small (9 fixtures) by design — it's a *signal* benchmark we can
review by hand on every release, not a leaderboard. Future fixture
expansion is tracked as a v2.5 candidate
([ROADMAP.md](../../ROADMAP.md)).

### Concrete v2.5 work this baseline points at

The over-extraction pattern is actionable, not aesthetic:

1. **Merge sub-claims back into parent memory.** When a single logical
   decision yields N candidates, hoist the `reasoning` / `alternatives`
   / `impact` content from the sub-claims onto the parent rather than
   keeping each as an independent memory. Most likely needs a
   prompt-side change (explicit "one decision per discussion thread"
   instruction) and a post-extract dedup that compares pairwise
   `content` similarity within a single fixture.
2. **Type-classification calibration on the boundary cases.**
   Convention-vs-decision (cceb-002) and architecture-vs-decision
   (cceb-003) are the two recurring confusions. A targeted few-shot
   examples in the prompt that pin "if it's a *rule* the team agrees
   to follow → convention, even if a single discussion produced it"
   would address both.
3. **TODO discipline.** Today the model treats follow-up actions
   mentioned alongside a decision as standalone TODOs, which is what
   tanks `todo` precision to 20%. Either suppress TODO extraction when
   the parent decision already captures impact ("Deprecate old
   `client_id` by end of quarter" is *impact* of the PKCE decision, not
   an independent TODO), or raise the bar — TODO requires explicit
   commitment language ("we will", "TODO:") rather than implication.

### Honesty notes (things this number is *not*)

- **Not "ai-memory's quality on a real corpus".** Nine hand-curated
  fixtures cover every memory type and a couple of adversarial cases,
  but they're a CI smoke-suite, not a production sample. A user with
  noisy ten-thousand-turn editor history will likely see a different
  curve.
- **Not deterministic.** A second run with the same model produces
  slightly different memories (LLM sampling). The `scorecard.json` is
  one snapshot; ±3-5 F1 points run-to-run is normal at N=9.
- **Not comparable to "memory middleware" benchmarks.** mem0,
  Letta and the like measure runtime memory recall (Q→A), not offline
  extraction precision/recall. There is no apples-to-apples third-party
  number for what CCEB measures yet — that's why we have CCEB.
- **The `model` field in the scorecard reads `openai (default)`.** This
  is the env-detected fallback string, not a lie about which model ran:
  the actual extraction call goes through `extractor/llm.ts` whose
  fallback is `gpt-4o-mini`. Fix tracked for v2.5: have `detectModel()`
  resolve through to the llm-layer default so the scorecard label
  matches reality without needing `--model gpt-4o-mini` on the CLI.

---

## How to capture a new baseline

```bash
# In the ai-memory checkout, with an OpenAI-compatible API key in env:
export OPENAI_API_KEY=<your key>             # or AI_REVIEW_API_KEY
npm run bench:cceb -- --model gpt-4o-mini    # explicit label avoids the
                                             # "openai (default)" cosmetic
                                             # artefact noted above
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
