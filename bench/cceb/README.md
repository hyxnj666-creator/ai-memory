# CCEB — Cursor Conversation Extraction Benchmark

A small, hand-curated benchmark that measures how well `ai-memory`'s
extractor turns raw editor conversations into the right structured
memories.

> **Why a custom benchmark?** Existing memory benchmarks (LongMemEval,
> LoCoMo) measure end-to-end question answering against a runtime
> memory store. `ai-memory` is a different layer: it turns conversations
> into typed knowledge artifacts that humans then review and ship to git.
> The relevant question for us is not "did the agent recall fact X" —
> it's **"did we extract the right decisions, architectures, conventions,
> todos, and issues, and did we leave the chitchat alone?"** CCEB
> measures exactly that.

## What CCEB scores

For every fixture (a hand-annotated conversation snippet), CCEB:

1. Feeds the conversation through `extractMemories()` — the same code
   path that `ai-memory extract` uses in production.
2. Compares the resulting `ExtractedMemory[]` against the fixture's
   ground-truth `expected` list.
3. Counts true positives (TP), false positives (FP), and false
   negatives (FN), then reports precision, recall, and F1, both per
   memory type and overall.

The fixtures deliberately mix five real-world cases:

| Fixture                          | What it tests                         |
| -------------------------------- | ------------------------------------- |
| `cceb-001-oauth-pkce`            | Single clear-cut decision             |
| `cceb-002-graphql-pagination`    | Single convention                     |
| `cceb-003-event-sourcing`        | Single architecture choice            |
| `cceb-004-rate-limit-bug`        | Single issue / bug write-up           |
| `cceb-005-todo-redis-cluster`    | Single explicit follow-up todo        |
| `cceb-006-multi-memory`          | One conversation → 3 memories         |
| `cceb-007-cjk-decision`          | Chinese-language decision             |
| `cceb-008-noise-chitchat`        | Pure noise (false-positive test)      |
| `cceb-009-noise-unresolved`      | Question deferred — must NOT extract  |

Noise fixtures matter as much as signal ones: an extractor that
finds every real memory but also fabricates plausible-sounding
"decisions" from chitchat is worse for users than one that misses a
few but stays quiet on noise.

## How to run

```bash
# Pure pipeline smoke test (no LLM tokens, ~1s):
npm run bench:cceb:dry

# Live run (requires AI_REVIEW_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY,
# costs a few cents at most):
npm run bench:cceb

# Run only matching fixtures:
npm run bench:cceb -- --filter cjk

# Override model:
npm run bench:cceb -- --model gpt-4o-mini
```

Output:

- **stdout** — Markdown scorecard
- `bench/cceb/out/scorecard.md` — same Markdown
- `bench/cceb/out/scorecard.json` — full match log + per-type scores

The published baseline lives at
[`docs/benchmarks/cceb-baseline.md`](../../docs/benchmarks/cceb-baseline.md).
Re-running the bench updates `bench/cceb/out/`; copying the report into
`docs/benchmarks/` is a deliberate human action so we never publish a
baseline we haven't reviewed.

## Fixture authoring guide

A fixture is a single JSON file under `bench/cceb/fixtures/` with this
shape:

```json
{
  "id": "cceb-NNN-short-slug",
  "description": "One sentence about what this fixture is testing",
  "difficulty": "easy | medium | hard",
  "tags": ["decision", "cjk"],
  "conversation": {
    "title": "Title shown in cursor",
    "turns": [
      { "role": "user",      "text": "..." },
      { "role": "assistant", "text": "..." }
    ]
  },
  "expected": [
    {
      "id": "decision-pkce",
      "type": "decision",
      "must_contain": ["PKCE"],
      "must_not_contain": ["implicit flow is fine"],
      "note": "Reviewer note, not used for scoring"
    }
  ]
}
```

Authoring rules:

1. **Pick keywords the model HAS to use to demonstrate it understood.**
   `must_contain: ["PKCE"]` is a good keyword — the only way to talk
   about the decision is to name it. `must_contain: ["use", "the"]`
   matches every memory and is useless.
2. **At least one keyword required.** A keyword-less expected matches
   any same-type extraction, which makes scoring meaningless. The
   loader rejects empty `must_contain` arrays.
3. **`expected: []` declares a noise fixture.** A noise fixture's
   F1 is 1 if the extractor produces nothing and 0 otherwise. Use
   noise fixtures liberally — they're how we keep the false-positive
   rate honest.
4. **Avoid scenarios that depend on the prompt's exact wording.**
   The conversation should make the right behavior obvious to a
   careful human reader; if you find yourself writing "the model
   should also extract X because the context says Y," your keywords
   probably encode X better than Y.
5. **Greedy matching, in declaration order.** When two `expected`
   entries can both match the same extracted memory, the earlier one
   wins. Order your `expected` list from most-specific to most-general
   if that matters for your fixture.

## Scoring algorithm (v1)

For each fixture:

```
For each expected E in order:
  candidates = extracted memories M where:
    M.type == E.type AND
    haystack(M) contains EVERY E.must_contain (case-insensitive) AND
    haystack(M) contains NONE of E.must_not_contain
  M = first unclaimed candidate (lowest index)
  if M: TP, claim M
  else: FN

Every unclaimed extracted memory: FP

haystack(M) = (title + content + reasoning + alternatives).lowercase()
```

Aggregation is the **micro-average** across types (sum TP/FP/FN, then
P/R/F1), which is the honest score for an unbalanced fixture set.
Per-fixture F1 is reported in the scorecard so you can spot the worst
offenders quickly.

## Limitations

- **Sample size.** The v1 fixture set is small (9 fixtures) on
  purpose: every fixture is hand-reviewed, and we want the bar for
  adding one to be high. We'll grow toward ~30 over the next two
  releases.
- **English-heavy.** v1 has 1 CJK fixture out of 9. As the suite
  grows we want at least 25% non-English.
- **Synthetic conversations.** Fixtures are written from real-world
  patterns but they're synthetic. A future v2 will mix in
  permission-cleared real Cursor sessions.
- **No determinism guarantee.** LLM extraction is non-deterministic;
  two consecutive runs of the same fixture against the same model
  can produce different scores by ±2-3 percentage points. Treat the
  baseline as an order-of-magnitude statement, not a regression
  oracle. Use `bench:cceb:dry` for deterministic CI smoke tests
  (it validates fixtures + pipeline shape, not LLM quality).

## Roadmap

- v1 (this release): 9 fixtures, hand-curated, P/R/F1 reporting,
  Markdown + JSON scorecard.
- v1.1: 5–10 more fixtures contributed via PR with author-supplied
  ground truth.
- v2: Optional LongMemEval 50-query subset adapter (so we can cite
  comparable numbers when reviewers ask). The adapter lives outside
  this benchmark — LongMemEval measures a fundamentally different
  thing — but the credibility shield is worth the engineering cost.
- v2: Run-stability harness (run each fixture N times, report mean
  + stddev) so the baseline number stops being a single-run
  artifact.
