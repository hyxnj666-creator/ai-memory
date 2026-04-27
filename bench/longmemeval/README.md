# LongMemEval-50 — apples-to-apples shield

A 50-question subset of [LongMemEval](https://github.com/xiaowu0162/LongMemEval)
(ICLR 2025) that we run alongside CCEB to give the predictable HN
question — *"how do you compare to mem0/Letta/runtime memory benchmarks?"*
— a defensible answer.

> **Headline number:** `X / 50 answer-supporting evidence preserved in extracted memories`. 
> **NOT** LongMemEval native QA correctness. See
> [spike doc §4.3](../../docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md)
> for why we measure a proxy and not the upstream rubric.

## What this measures

For each of 50 deterministically-selected LongMemEval questions:

1. Feed the entire `haystack_sessions` chat history to
   `extractMemories()` — the same code path `ai-memory extract` uses.
2. Concatenate the resulting memories' searchable text.
3. Check whether the LongMemEval `answer` field's key tokens (defined
   in [spike §4.4](../../docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md))
   all appear in that concatenation.

Score 1 when all key tokens present, 0.5 when ≥50% present, 0 otherwise.
Headline = count of fully-evidenced (score = 1) questions.

This is **evidence-preservation**, not QA-correctness. The
distinction matters: ai-memory extracts and stores memories offline
(for human review + git tracking); a runtime QA layer is downstream
of us. The proxy answers "would a downstream QA layer have access to
the right evidence if it read our memories instead of the raw
haystack?" That's a meaningful number — but it isn't the LongMemEval
leaderboard number.

## What's frozen across releases

- **The 50 selected question_ids** (pinned in
  `selected-questions.json` once the maintainer generates it; sampling
  rule is deterministic-by-id per spike §4.2).
- **The scoring rubric** (`adapter.ts:scoreEvidencePreserved`, unit-tested in
  `__tests__/adapter.test.ts`).
- **The skipped-types policy** (no abstention questions; spike §4.2).

## Maintainer runbook (one-time setup, then per-release)

### Pre-flight (one-time)

Download the upstream dataset (we deliberately don't ship it — ~150 MB,
licence is upstream's, and pinning a specific snapshot is brittle):

```bash
mkdir -p bench/longmemeval/data
cd bench/longmemeval/data
wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
cd -
```

Generate the manifest. This script is deterministic: every maintainer
running it against the same dataset gets the same 50 ids.

```bash
npx tsx bench/longmemeval/select-questions.ts \
  --data bench/longmemeval/data/longmemeval_s_cleaned.json
```

This writes `bench/longmemeval/selected-questions.json` (currently
gitignored). **Commit the manifest** so subsequent baselines are
apples-to-apples comparable; the file ends up at
`bench/longmemeval/selected-questions.json` and looks like:

```json
{
  "source_dataset": "longmemeval_s_cleaned.json",
  "generated_at": "2026-XX-XXTXX:XX:XXZ",
  "source_sha256": "...",
  "distribution": {
    "single-session-user": 10,
    "multi-session": 10,
    "single-session-preference": 8,
    "single-session-assistant": 8,
    "temporal-reasoning": 7,
    "knowledge-update": 7
  },
  "question_ids": ["...", "..."]
}
```

When you commit it, edit `.gitignore` in this directory to remove the
`selected-questions.json` line so future readers can `git diff`
against the published manifest.

### Per-release: run + publish

```bash
export OPENAI_API_KEY=<your key>
export LONGMEMEVAL_DATA=bench/longmemeval/data/longmemeval_s_cleaned.json
npx tsx bench/longmemeval/run.ts --model gpt-4o-mini
```

Output lands in `bench/longmemeval/out/`:

- `scorecard.json` — machine-readable, full per-question detail.
- `scorecard.md` — human-readable Markdown.

Append a new section to
`docs/benchmarks/cceb-baseline.md` per the publication template in
[spike §6](../../docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md):

- Headline: **`X / 50 answer-supporting evidence preserved in extracted memories`**
  on a deterministic 50-question subset of LongMemEval-S-cleaned.
- Per-question-type breakdown.
- Disclaimer paragraph linking the spike doc.
- Replication command + dataset download URL.
- Tokens / spend / wall-clock.

Update the headline number in:

- `README.md` — "How well does the extractor measure?" subsection.
- `docs/competitive-landscape.md` — replace the "no apples-to-apples
  third-party number" cell with the new figure.
- HN/Reddit launch comment if applicable.

### Re-spike triggers

See [spike doc §7](../../docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md).
The four headline triggers:

1. CCEB schema or scorer behaviour changes.
2. LongMemEval dataset re-cleaned upstream — selection-list test
   surfaces missing ids and we re-validate before publishing.
3. The 50-question selection produces a degenerate distribution.
4. A reader points out a defensible scoring edge case.

## Why this isn't part of CI

The full LongMemEval-50 run takes ~10 min wall-clock and ~$0.30-0.50
in `gpt-4o-mini` tokens. That's comfortable per-release; it would be
prohibitive per-PR. The pure-function tests
(`__tests__/adapter.test.ts`, `__tests__/selection.test.ts`) DO run in
CI — they pin the rubric and the selection rule without needing the
dataset.

`bench/longmemeval/run.ts --dry-run` validates the pipeline shape
against whatever manifest + dataset are present (or no-ops cleanly if
they aren't yet). It is part of the typecheck gate.

## Files

| Path | Purpose |
|---|---|
| `types.ts` | Pure types (LongMemEvalSample, SelectedManifest, QuestionScore, scorecard). |
| `expected-distribution.json` | Locked per-type counts (50 = 10+10+8+8+7+7). |
| `loader.ts` | Read dataset; group + sort + select; deterministic. |
| `adapter.ts` | Pure: haystack → ConversationTurn[]; answer → key tokens; scoring. |
| `runner.ts` | Glue between samples and `extractMemories()`. |
| `run.ts` | CLI entry: arg parse, scorecard render, file I/O. |
| `select-questions.ts` | One-time bootstrap: generate `selected-questions.json` from a downloaded dataset. |
| `__tests__/adapter.test.ts` | Pin the rubric. |
| `__tests__/selection.test.ts` | Pin the deterministic-by-id selection rule. |
| `selected-questions.json` | Gitignored on initial commit; maintainer commits after first generation. |
| `data/longmemeval_s_cleaned.json` | Gitignored; maintainer downloads. |
| `out/` | Gitignored; per-run output. |
