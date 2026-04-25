# ADR 2026-04-25 — Category Positioning

**Status:** Accepted
**Date:** 2026-04-25
**Owner:** @hyxnj666-creator (Conor Liu)
**Supersedes / extends:** [2026-04-24-naming.md](2026-04-24-naming.md) — naming was settled (no rebrand). This ADR settles **what category we tell the world we are in**.

## Context

The naming ADR closed the "what do we call ourselves" question. It left the
harder question open: **which slot in the AI-memory market do we claim?**

The default move (mirroring competitors) was "git-trackable Markdown memory
for AI agents". A 2026-04-25 market refresh showed this slot is now contested
and still unproven on Hacker News:

| Recent launch | Date | HN score | Angle |
|---|---|---|---|
| `Paul-Kyle/palinode` | 2026-04-08 | **2 points** | Markdown + YAML frontmatter + SQLite index + git blame/diff, MCP-first |
| `marcobambini/sqlite-memory` | 2026-04-07 | **2 points** | Markdown + SQLite FTS5 + vector + offline sync |
| `Ashprakash/cortexmem` | (no HN) | — | Zero-config `npx`, generates `CLAUDE.md` + `.cursorrules` |

Two near-identical "git-markdown memory" Show HN posts inside one week, **both
sub-3 points**, signals the angle is no longer a fresh hook. Meanwhile the
loudest category leader, `memory-graph/memory-graph` (191★), already covers
all four editors we cover (Cursor / Claude Code / Windsurf / Copilot).

We also re-evaluated whether to follow the LongMemEval benchmark trail blazed
by `alphaonedev/ai-memory-mcp` (97.8% R@5), `shane-farkas/memento-memory`
(90.8%), and `tstockham96/engram` (80% LOCOMO). LongMemEval is a benchmark
for **runtime chat assistants with long-term memory** — i.e., an agent calling
`mem.recall()` mid-conversation. It is not the right yardstick for an offline
extraction pipeline that consumes already-finished chat logs.

In parallel, AGENTS.md crossed 60K adopting repositories and is now stewarded
by the Linux Foundation Agentic AI Foundation, with native support across
OpenAI Codex, Cursor, Windsurf, Sourcegraph Amp, and GitHub Copilot. No
existing memory tool auto-generates AGENTS.md from chat history. This is an
unclaimed, large adoption surface.

## Decision

**Position `ai-memory-cli` as a chat-history extracting knowledge pipeline,
not a runtime memory middleware.**

Concretely:

1. **Hero hook:** *"We read your editor's chat history directly. Zero
   `.remember()` calls."* This is the only claim no competitor (Palinode,
   MemoryGraph, mem0, letta, zep, cortexmem, cairn, memento) can make today.
2. **Three-bucket competitive map** replacing the previous flat "direct
   competitors" list:
   - **Direct (us, alone):** chat-history → structured knowledge extractors.
   - **Adjacent A — git-markdown runtime middleware:** Palinode, SQLite
     Memory, cortexmem, grrowl/cairn. Storage-similar, input completely
     different (they need `add`/`remember` calls).
   - **Adjacent B — opaque-DB runtime middleware:** mem0, letta, zep,
     MemoryGraph. Different on both axes.
3. **Four "only we do this" claims** replacing the previous three:
   1. Zero `.remember()` — auto-extraction from Cursor / Claude / Windsurf /
      Copilot chat history.
   2. Multi-target rules export — `.cursor/rules/*.mdc` **and** `AGENTS.md`
      (lands in v2.4).
   3. Typed memory schema — 5 categories (decision / architecture /
      convention / todo / issue) each with its own extraction prompt and
      quality filter. Palinode is single-blob; MemoryGraph is graph-first;
      none ship typed extraction.
   4. Team-native — per-author subdirectories so two devs running `extract`
      on the same repo don't merge-conflict.
4. **Dual benchmark, not single replacement.** Lead with **CCEB (Cursor
   Conversation Extraction Benchmark)** — Precision/Recall/F1 on annotated
   real chat logs, measuring what we actually optimize for. Run a 50-query
   **LongMemEval subset** as a secondary "we also speak the industry yardstick"
   sanity check. Publishing zero benchmark numbers reads as "untested toy";
   publishing only LongMemEval reads as "wrong yardstick"; publishing both
   reads as "rigorous and category-aware".

## Why

1. **Saturated overlap on the storage axis, empty space on the input axis.**
   Three "git-markdown memory" launches in two weeks proves storage
   format is no longer a moat. But none of them, and none of the runtime
   middleware leaders, ingest editor chat history automatically — they all
   require manual `add()` / `remember()`. That asymmetry is our slot.
2. **AGENTS.md is a pre-built distribution channel.** 60K repos already
   maintain an `AGENTS.md`. Auto-generating its content from chat history
   converts our extraction pipeline from "another tool to install" into
   "the supplier of the file the entire industry already reads".
3. **The pipeline framing is honest.** Calling ourselves "AI memory CLI"
   invites comparison to mem0/letta/Palinode on their terms (recall latency,
   token efficiency mid-conversation). On those metrics we'd lose — we're
   not in that game. Calling ourselves a knowledge pipeline reframes the
   comparison to extraction quality, structured typing, and team git
   workflow — where we win.
4. **Dual benchmark hedges credibility risk.** A LongMemEval-only number
   would invite "this isn't measuring what your tool does". A CCEB-only
   number invites "you invented your own benchmark". Shipping both, with
   honest scope notes, takes both critiques off the table.

## Consequences

### Documentation (this PR)

- [`competitive-landscape.md`](../competitive-landscape.md) restructured
  into 3 buckets, Palinode + SQLite Memory + Experience Engine + MemoryGraph
  added, "3 unique claims" → "4 unique claims" with #1 rewritten.
- [`../../ROADMAP.md`](../../ROADMAP.md) v2.4 Tier 1 expanded:
  AGENTS.md reverse sync promoted from Tier 2; `ai-memory recall` git
  time-travel added; LongMemEval-only benchmark replaced by "CCEB primary
  + LongMemEval 50-query subset".
- [`launch-plan.md`](../launch-plan.md) Tier 1 synced; pitch reframed
  around "chat-history extraction"; decision log appended.
- [`../../CHANGELOG.md`](../../CHANGELOG.md) `[Unreleased]` notes the v2.4
  scope expansion.

### Engineering (v2.4 work, post this PR)

- Implement `ai-memory rules --target agents-md` (writes/merges AGENTS.md
  from convention + decision memories).
- Implement `ai-memory recall <query>` — git-history-aware retrieval
  ("show me how this decision was made over the last 6 months"). Uses
  the existing memory store + git log to surface superseded vs current
  versions of the same fact.
- Build `bench/cceb/` — annotated dataset, runner, scorecard.
- Run LongMemEval subset, publish methodology + script + score.
- Demo GIF refilmed around the new hero hook (chat → extraction → AGENTS.md
  → next session reads its own conventions).

### README (deferred)

- Top-30% rewrite happens **after** AGENTS.md sync + recall ship, not now.
  Writing the new pitch before the features exist would be claim-without-
  substance and risk HN backlash. Tracked in launch-plan.md.

## Alternatives rejected

- **Stay on the "git-trackable Markdown memory" angle.** Two-week-old data
  shows this hook is no longer fresh; the 2-point HN ceiling on Palinode
  + SQLite Memory is the empirical signal.
- **Pivot fully to runtime middleware (build our own MCP `recall` to compete
  with Palinode head-on).** Throws away the v2.0–v2.3 investment in
  extraction quality and conversation scoping. Also fights on a battlefield
  where MemoryGraph (191★) already has incumbency.
- **Drop LongMemEval entirely in favour of CCEB only.** Loses the
  "we know the field" credibility signal that 3 competitor numbers exploit.

## Non-goals

- We are **not** abandoning the MCP server (`serve` command) — it remains
  the runtime delivery layer for memories the pipeline produces.
- We are **not** abandoning git-trackable Markdown — it stays as a feature
  and a layered claim, just not as the top-line hero hook.
- We are **not** committing the README rewrite in this PR. The pitch
  changes only after the features that justify it have shipped.

## References

- [`competitive-landscape.md`](../competitive-landscape.md) — full competitor
  table and bucket assignments.
- [`launch-plan.md`](../launch-plan.md) — v2.4 Tier 1 timeline.
- [2026-04-24-naming.md](2026-04-24-naming.md) — predecessor decision.
- AGENTS.md adoption snapshot: Linux Foundation announcement
  (60K+ repos, OpenAI/Cursor/Windsurf/Codex/Copilot/Amp native support).
- LongMemEval (Wu et al., ICLR 2025) — arxiv.org/abs/2410.10813.
