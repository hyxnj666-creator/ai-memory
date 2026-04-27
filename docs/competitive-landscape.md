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
your already-existing Cursor/Claude/Windsurf/Copilot/Codex CLI chat logs.

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
| **`ai-memory-cli` (us)** | (launching) | Cursor + Claude Code + Windsurf + VS Code Copilot + Codex CLI chat history | 5 typed Markdown memory categories + Cursor Rules + AGENTS.md + Anthropic Skills (v2.5) | The only project in this bucket as of 2026-04-26 |

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
| **`memory-graph/memory-graph`** | **191** (niche leader) | Graph DB | Tracks intelligent relationships across memories. Multi-editor (Cursor/Claude/Windsurf/Copilot, no Codex) but graph-first |
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
| **Primary input** | Cursor/Claude/Windsurf/Copilot/Codex CLI **chat history**, automatically | `add()` / `remember()` calls from host agent | `add()` / `remember()` calls from host agent |
| **Storage** | Plain Markdown, one file per memory, PR-reviewable | Markdown + small SQLite/index | SQLite / pgvector / Neo4j / graph DB (opaque) |
| **Knowledge typing** | 5 typed categories (decision / architecture / convention / todo / issue), each with its own prompt + filter | Single memory blob | Single stream or graph relationships |
| **Editor coverage** | 5 editors simultaneously (Cursor + Claude + Windsurf + Copilot + Codex CLI, v2.5-06) | 1-3 editors via MCP | 1-3 editors via MCP; only `memory-graph` covers all 4 (no Codex) |
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
| **CCEB** (Cursor Conversation Extraction Benchmark) — primary | v1.1 baseline live 2026-04-27 `gpt-4o-mini`, **30 fixtures**: **P 56.8 / R 73.5 / F1 64.1** (v1.0 / 9-fixture row: F1 76.2 still in [baseline doc](benchmarks/cceb-baseline.md) for delta-tracking) | Precision / Recall / F1 of typed extraction on annotated synthetic Cursor + Claude chat logs | Measures what our pipeline actually optimises for. Inventing the benchmark for our own niche is itself a category-leadership signal |
| **LongMemEval 50-query subset** — secondary | live run 2026-04-27 `gpt-4o-mini`: **0 / 50 full + 2 / 50 partial** evidence preserved | **Evidence preservation proxy** — fraction of LongMemEval `answer` key tokens that survive into our extracted memories. **Not** native QA correctness | Three direct-bucket competitors publish LongMemEval-style numbers (alphaonedev 97.8% R@5, memento-memory 90.8%, engram 80% on LOCOMO). Shipping our 0/50 + 2/50 *with the rubric attached* cuts off "unmeasured toy" critique while honestly disclosing that our metric is scoped to the extraction surface, not their runtime QA surface |

CCEB scope: 30 annotated conversations as of v1.1 (cceb-001 — cceb-030),
balanced across the 5 memory types plus 3 noise/boundary cases, released
in `bench/cceb/fixtures/` with runner + scorecard. Anyone can fork the
repo and reproduce. Roster locked in
[`docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md`](cceb-v1.1-and-longmemeval-spike-2026-04-27.md).

LongMemEval subset scope: a deterministically selected 50-question slice
of [`xiaowu0162/LongMemEval`](https://github.com/xiaowu0162/LongMemEval)
(`longmemeval_s_cleaned.json`), scored against the **extracted memory
text** produced by `extract` — *not* against our `recall` /
`search_memories` MCP tools. The metric is intentionally a proxy: for
each question, we check how many normalised key tokens from the
LongMemEval `answer` survive as substrings in the concatenated
`title + content + reasoning + alternatives + impact` of our extracted
memories. This tests whether the extraction stage *preserves the
evidence* a downstream retriever would need; native QA correctness on
LongMemEval is a different system (live retriever + re-ranker + answer
generator) and out of scope for `ai-memory` v2.5. The proxy framing,
including the conceptual mismatch with competitor numbers, is disclosed
on every published scorecard.

The 2026-04-27 baseline run came in at **0 / 50 full + 2 / 50 partial**
on `gpt-4o-mini`. Two notes on reading that number alongside the
competitor 80-97% headlines in the table above:

1. **Different rubrics.** alphaonedev's 97.8% is `recall@5` on a
   live retriever (top-5 of returned chunks contains the gold answer
   span); memento-memory's 90.8% is full LongMemEval QA-correctness
   with their retriever + answer pipeline; engram's 80% is LOCOMO
   F1 (the longer-context cousin of LongMemEval). Our 0/50 is
   "every key token of the answer must appear as a literal substring
   in our extracted memory text," with no retriever and no answer
   generator in the loop. They're not the same number; that's the
   honesty cost we're choosing to pay.
2. **Direction over magnitude.** The per-question matched/total
   counts in the [baseline doc](benchmarks/cceb-baseline.md#longmemeval-50--gpt-4o-mini--2026-04-27-v25-08-evidence-preservation-rubric)
   show real partial signal on `single-session-preference`
   (3-6 of 17-43 tokens consistently); the rubric is strict enough
   that the 0/50 is the rubric correctly reporting "extractor over
   single-pass-conversation rarely captures every literal token of
   an open-domain user fact." We're pointed at typed-schema
   engineering chat (CCEB), not open-domain conversation QA — the
   0/50 is the price of being honest about that scope.

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
4. **Multi-editor coverage is no longer unique on its own.** memory-graph
   covers the same four IDE editors (Cursor / Claude / Windsurf /
   Copilot). v2.5-06 added Codex CLI as a 5th source, putting us one
   ahead, but the lead is small enough that "5 editors" is a feature
   detail, not the wedge. Differentiate on what the editors *give* us
   (chat history) rather than the count.
5. **The "1M-token context obsoletes you" objection.** Frontier model
   context windows hit 1M tokens during the v2.4 cycle and the question
   shows up on every memory-tool HN thread. Our standing answer is the
   FAQ section in README.md ("Doesn't 1M-token context obsolete you?")
   — three claims, all hyperlink-cited: cost compounds per-query while
   extraction amortises; long-context retrieval still degrades on
   non-headline information past ~128–256K tokens
   ([Liu et al. 2023](https://arxiv.org/abs/2307.03172),
   [BABILong 2024](https://arxiv.org/abs/2406.10149)); long context is
   per-machine while `AGENTS.md` is per-repo. Spike + re-spike triggers
   in [`docs/1m-context-faq-spike-2026-04-27.md`](1m-context-faq-spike-2026-04-27.md).
   Don't re-argue here — link to the FAQ.

## How this doc is maintained

- Refresh every 3-6 months or whenever a new credible entrant appears
  (e.g. a Show HN that breaks 100 points, a new editor-native memory
  feature from Cursor/Anthropic, a benchmark we hadn't seen).
- Cite concrete URLs and star counts from a specific inspection date.
- Do not wait for the project to "stabilise" before updating — competitors
  ship weekly; a 6-month-old snapshot is worthless.
- Material restructures (e.g. the 1-bucket → 3-bucket move on 2026-04-25)
  must be backed by an ADR in `decisions/`.
