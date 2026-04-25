# Competitive Landscape — April 2026

> Snapshot of the "AI memory for coding agents" niche as of 2026-04-25.
> Refresh every 3-6 months. Last updated by ADR
> [2026-04-25-category-positioning.md](decisions/2026-04-25-category-positioning.md).

## Market shape

As of late April 2026 the niche has dozens of MCP-style memory servers and a
visible 191★ leader (`memory-graph/memory-graph`), but **no dominant winner
on chat-history extraction** — every project we audited requires the host
agent to call `add()` / `remember()` / `recall()` explicitly. None ingest
finished editor conversations as their primary input.

This is the asymmetry the v2.4 launch is built around: same git-markdown
storage everyone else has converged on, but a totally different *input* —
your already-existing Cursor/Claude/Windsurf/Copilot chat logs.

## Three-bucket competitive map

We previously listed competitors flat. After the 2026-04-25 refresh, that
collapsed two very different categories — runtime memory middleware and
offline knowledge pipelines — into one bucket and made differentiation hard
to read. The three-bucket view below is now canonical (per
[ADR 2026-04-25](decisions/2026-04-25-category-positioning.md)).

### Bucket 1 — Direct competitors: chat-history → structured knowledge

> Tools whose primary input is a finished editor chat log and whose primary
> output is structured, typed, persistent knowledge.

| Project | Stars | Input source | Output | Notes |
|---|---|---|---|---|
| **`ai-memory-cli` (us)** | (launching) | Cursor + Claude Code + Windsurf + VS Code Copilot chat history | 5 typed Markdown memory categories + Cursor Rules + AGENTS.md (v2.4) | The only project in this bucket as of 2026-04-25 |

This bucket is empty besides us. Most "AI memory" projects are runtime
middleware (Bucket 2 / 3); the ones that read editor data, like
`Ashprakash/cortexmem`, do so as a side feature (it generates `CLAUDE.md`
+ `.cursorrules` from arbitrary content but doesn't auto-extract from chat
history). That emptiness is the launch thesis.

### Bucket 2 — Adjacent: git-markdown runtime memory middleware

> Same storage shape as us (Markdown + git friendly), different input
> (host agent calls them at runtime). Closest in *appearance*, farthest in
> *workflow*.

| Project | Stars | Storage | MCP | Defining trait |
|---|---|---|---|---|
| **`Paul-Kyle/palinode`** | ~18 | Markdown + YAML + SQLite index | ✅ | LLM-driven KEEP/UPDATE/MERGE/SUPERSEDE/ARCHIVE compaction. **Show HN 2026-04-08 = 2 points** — git-markdown angle alone no longer captures HN |
| **`marcobambini/sqlite-memory`** | ~5-10 | Markdown + SQLite FTS5 + vector | ✅ | Offline-first sync. **Show HN 2026-04-07 = 2 points** |
| **`Ashprakash/cortexmem`** | — | Git + SQLite | ✅ | `npx cortexmem init` generates `CLAUDE.md` + `.cursorrules` (closest to our rules pipeline, but no chat-history ingestion) |
| **`grrowl/cairn`** | ~10 | Cloudflare Workers + Markdown | ✅ | WikiLink notes, 8 MCP tools, shared agent workspaces |

The two empirical 2-point HN scores in one week are the most important
signal in this table: they tell us "git-markdown memory" is no longer a
hook by itself. Our positioning has to lead with the input asymmetry, not
the storage format.

### Bucket 3 — Adjacent: opaque-DB runtime memory middleware

> Different storage and different input — solves a related problem
> (give an agent persistent state) but for a different audience.

| Project | Stars | Storage | Defining trait |
|---|---|---|---|
| **`memory-graph/memory-graph`** | **191** (niche leader) | Graph DB | Tracks intelligent relationships across memories. Multi-editor (Cursor/Claude/Windsurf/Copilot) but graph-first |
| **`alphaonedev/ai-memory-mcp`** | — | SQLite FTS5 | "97.8% R@5 on LongMemEval", TOON token reduction |
| **`tstockham96/engram`** | ~35 | TS + MCP | "80% LOCOMO with 93.6% fewer tokens", explicit/implicit/synthesised memory tiers |
| **`jasondostal/cairn-mcp`** | ~50-200 | PostgreSQL + pgvector + Neo4j | Semantic-episodic, HDBSCAN clustering, 4-container Docker |
| **`shane-farkas/memento-memory`** | ~20 | Bitemporal knowledge graph | "90.8% on LongMemEval", entity resolution, contradiction detection |
| **`Methux/mnemo`** | ~5-20 | Multi-backend embeddings | Weibull forgetting curves |
| **`mnemon-dev/mnemon`** | ~10 | Graph (Go) | LLM-supervised pattern |
| **`shackleai/memory-mcp`** | — | SQLite | "First MCP-native memory server", `npx` setup |
| **`AxmeAI/axme-code`** | ~50 | MCP | Hard enforcement hooks intercept dangerous commands |
| **`muonroi/experience-engine`** | — | 4-tier (principles → behaviours → QA → raw) | "Memory shrinks as agent learns" — facts evolve into principles |
| **`engram-memory/engram`** | ~6 | Python + SQLite FTS5 | Zero-config, REST + MCP |
| **`TheoV823/mneme`** | ~10 | JSON + deterministic retrieval | No vectors, no agent loops |
| **`CVPaul/mneme`** | ~5 | 3-layer (Ledger / Beads / Context) | Long-lived facts vs persistent state |
| **mem0**, **letta**, **zep** | (large, multi-thousand ★) | Vector DB | General-purpose LLM memory, not coding-agent specific |

### Not memory at all (but often confused for us)

| Project | Why it shows up in searches |
|---|---|
| `harshkedia177/axon` (646★) | Code-graph intelligence (structural indexing) — not chat memory |
| `deepseek-ai/Engram` (4.3k★) | LLM architecture research — not a memory server |
| `Clarit-AI/Engram` | Mamba SSM state — different problem |

## Where we actually differentiate

| Axis | `ai-memory-cli` | Bucket 2 (git-markdown runtime) | Bucket 3 (opaque-DB runtime) |
|---|---|---|---|
| **Primary input** | Cursor/Claude/Windsurf/Copilot **chat history**, automatically | `add()` / `remember()` calls from host agent | `add()` / `remember()` calls from host agent |
| **Storage** | Plain Markdown, one file per memory, PR-reviewable | Markdown + small SQLite/index | SQLite / pgvector / Neo4j / graph DB (opaque) |
| **Knowledge typing** | 5 typed categories (decision / architecture / convention / todo / issue), each with its own prompt + filter | Single memory blob | Single stream or graph relationships |
| **Editor coverage** | 4 editors simultaneously (Cursor + Claude + Windsurf + Copilot) | 1-3 editors via MCP | 1-3 editors via MCP; only `memory-graph` covers all 4 |
| **Rules export** | `.cursor/rules/*.mdc` + `AGENTS.md` (v2.4) + CLAUDE.md (v2.4) | `cortexmem` writes `.cursorrules` + `CLAUDE.md` | None |
| **Conversation scoping** | `--source-id` / `--convo` / `--list-sources` (v2.3) | Retrieval-only | Retrieval-only |
| **Portability** | Idempotent JSON `export`/`import` bundle (v2.3) | "Rsync your SQLite file" | "Rsync your SQLite file" |
| **Team-native** | Per-author subdirectories, no merge conflicts by design | Single-user assumed | Single-user assumed |
| **CJK quality** | v2.2 CJK tokenizer + bigram/trigram + bilingual stopwords | English-first | English-first |
| **No-embedding mode** | Works with keyword-only if no API key | Hard requirement (most) | Hard requirement |
| **Local LLM** | Ollama + LM Studio via 2 env vars | Some do, some don't | Some do, some don't |
| **Observability** | Dashboard Quality tab (specificity histogram, dup pairs) | Few have any UI | Few expose quality metrics |

## The four "only we do this" claims

> Updated 2026-04-25. Previous version listed three claims; the old #1
> ("git diff-able memory") is now contested by Palinode and SQLite Memory
> and has been demoted to a feature. The new #1 is the input asymmetry.

1. **"Zero `.remember()` calls — we read your editor's chat history
   directly."** Palinode, MemoryGraph, mem0, letta, zep, cortexmem, cairn,
   and memento all require the host agent (or you) to call `add()` /
   `remember()`. We extract from already-finished Cursor / Claude / Windsurf
   / Copilot conversations.
2. **"Your conversations become AGENTS.md and Cursor Rules automatically."**
   AGENTS.md is now adopted by 60K+ repositories under Linux Foundation
   stewardship, with native support across OpenAI Codex / Cursor / Windsurf
   / Sourcegraph Amp / GitHub Copilot. No memory tool ships chat-history →
   AGENTS.md auto-generation. (`cortexmem` writes the file from prompts,
   not from chat logs.) Lands in v2.4.
3. **"Typed memory schema, not one big stream."** Five categories
   (`decision` / `architecture` / `convention` / `todo` / `issue`), each
   with its own extraction prompt and quality filter. Palinode is single-blob;
   MemoryGraph is graph-first; nobody ships category-typed extraction with
   per-type prompts.
4. **"Team-native by file layout."** Per-author subdirectories mean two
   developers running `extract` against the same repo never collide on the
   same Markdown file. Every other tool we audited assumes a single user.

## Benchmarks — dual track

> Per ADR 2026-04-25, we publish both an own-grown benchmark (CCEB) and a
> 50-query subset of LongMemEval. Single-track on either side has a
> credibility hole.

| Benchmark | Status | What it measures | Why we ship it |
|---|---|---|---|
| **CCEB** (Cursor Conversation Extraction Benchmark) — primary | v2.4 work item | Precision / Recall / F1 of typed extraction on annotated real Cursor + Claude chat logs | Measures what our pipeline actually optimises for. Inventing the benchmark for our own niche is itself a category-leadership signal |
| **LongMemEval 50-query subset** — secondary | v2.4 work item | Industry-recognised long-term memory recall accuracy | Three direct-bucket competitors publish numbers (alphaonedev 97.8% R@5, memento-memory 90.8%, engram 80% on LOCOMO). Skipping it reads as "untested toy" |

CCEB scope: ≥30 annotated conversations, balanced across the 5 memory types,
released as a separate `bench/cceb/` directory with dataset + runner +
scorecard. Anyone can fork the repo and reproduce.

LongMemEval subset scope: 50 queries, scored against our `recall` /
`search_memories` MCP tools (not our extractor — different category). Methodology
disclosed honestly: this is testing the *runtime retrieval surface* of
ai-memory, while CCEB tests the *extraction surface*.

## What recent HN launches teach us

> Two near-identical "git-markdown memory" Show HN posts in a single week
> (2026-04-07 SQLite Memory, 2026-04-08 Palinode), both stalled at 2 points.

Lessons baked into the v2.4 launch plan:

1. **"Git-versioned Markdown memory"** as the *headline* is no longer
   sufficient — the HN audience has heard it. Our headline must lead with
   the chat-history input asymmetry.
2. **Stars in this niche move slowly.** The visible leader (memory-graph)
   sits at 191★ after months. 1000-star push is realistic but not given.
3. **Benchmark numbers are the single biggest credibility lever.** Three
   competitors lead with one. Shipping ours (both CCEB and LongMemEval)
   immediately cuts off the "unmeasured toy" critique.
4. **Multi-editor coverage is no longer unique.** memory-graph covers the
   same four editors. Differentiate on what the editors *give* us
   (chat history) rather than the count.

## How this doc is maintained

- Refresh every 3-6 months or whenever a new credible entrant appears
  (e.g. a Show HN that breaks 100 points, a new editor-native memory
  feature from Cursor/Anthropic, a benchmark we hadn't seen).
- Cite concrete URLs and star counts from a specific inspection date.
- Do not wait for the project to "stabilise" before updating — competitors
  ship weekly; a 6-month-old snapshot is worthless.
- Material restructures (e.g. the 1-bucket → 3-bucket move on 2026-04-25)
  must be backed by an ADR in `decisions/`.
