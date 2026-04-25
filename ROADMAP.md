# Roadmap

> ai-memory's journey from CLI tool to AI-native knowledge layer.

## Vision

Every AI coding session generates valuable decisions, architecture insights, and conventions — then loses them when the conversation ends. ai-memory makes this knowledge **persistent, searchable, and automatically available** to any AI assistant.

## v1.x — Foundation (Shipped)

The CLI foundation is complete and published. (Now superseded by v2.x; v1.4.x remains installable on npm for users who want the zero-runtime-deps posture.)

- [x] Multi-source extraction (Cursor, Claude Code)
- [x] 5 memory types: decision, architecture, convention, todo, issue
- [x] Incremental extraction with state tracking
- [x] Team-aware storage (per-author subdirectories)
- [x] Local keyword search with relevance ranking
- [x] Cursor Rules export (`.mdc` auto-generation)
- [x] Memory lifecycle management (resolve/reactivate)
- [x] Context generation with tiered compression
- [x] LLM retry with backoff, timeout protection
- [x] i18n support (zh/en), NO_COLOR, Node >= 18
- [x] CI pipeline, CHANGELOG, 115+ tests

## v2.0–v2.3 — MCP server, semantic search, dashboard, conversation scoping, portability (Shipped)

**Goal: Make ai-memory invisible.** Instead of running CLI commands, AI editors interact with memories automatically via MCP. Phases 1–5.3 shipped across v2.0 → v2.3.0.

### Phase 1: MCP Server Core ✅
- [x] `ai-memory serve` — start MCP server (stdio transport)
- [x] `remember` tool — AI stores knowledge during conversations
- [x] `recall` tool — AI retrieves relevant memories for current task
- [x] `search_memories` tool — keyword + filter search via MCP
- [x] `project-context` resource — auto-provide project context to AI
- [x] One-line setup: add to Cursor/Claude Code MCP config

### Phase 2: Semantic Search ✅
- [x] Embedding generation via OpenAI-compatible API
- [x] Flat-file vector storage (`.embeddings.json`, zero deps)
- [x] Hybrid retrieval: semantic + keyword + time decay
- [x] Automatic re-indexing on `remember`, manual via `reindex` command

### Phase 3: More Sources + Watch Mode ✅
- [x] Windsurf conversation support (chat mode via SQLite)
- [x] VS Code Copilot Chat support (JSON/JSONL session files)
- [x] `watch` command — auto-extract when conversations change (fs events + polling)
- [x] Local LLM support — Ollama and LM Studio (zero API key needed)

### Phase 4: Dashboard ✅
- [x] Local web UI for browsing and managing memories (`dashboard` command)
- [x] Knowledge graph visualization (D3.js force-directed graph)
- [x] Overview with stats, timeline chart, author breakdown
- [x] Export to Obsidian (YAML frontmatter) / JSON / Clipboard

### Phase 5: Core Algorithm Quality ✅ (v2.2.0)
- [x] CJK-aware tokenizer (bigrams + trigrams + bilingual stopwords)
- [x] Containment-based semantic subsumption dedup
- [x] Cross-extraction dedup (new vs existing memories on disk)
- [x] Conversation noise stripping (tool calls, hashes, data URIs)
- [x] Multi-signal vague content detection (22 specificity patterns)
- [x] Strengthened extraction prompt with quality checklist + WHY-BAD examples
- [x] Measured: vague rate ↓68%, duplicate pairs auto-merged

### Phase 5.1: Quality observability & cleanup tooling ✅ (v2.2.0)
- [x] `reindex --dedup` — retroactive cleanup for existing memory stores with `--dry-run`
- [x] Dashboard Quality tab — specificity histogram, vague list, duplicate pairs
- [x] Default quality summary in `extract` (retention % + filter breakdown, no `--verbose` needed)
- [x] `/api/quality` endpoint exposing health metrics + top flagged items
- [x] Measured on real store: 164/239 healthy (69%), 75 flagged = 40 vague + 25 dup + 2 subsumed

### Phase 5.2: Conversation-scoped context ✅ (v2.3.0)
Close the design gap where `context --copy` pulled memories from ALL conversations. Resuming "one chat" now actually scopes to that one chat.
- [x] `context --source-id <prefix>` — git-short-hash-style filter on conversation UUID
- [x] `context --convo <query>` — substring match on conversation title
- [x] `context --list-sources` — discover available conversation IDs/titles
- [x] `context --all-matching` — override "pick most recent" default for `--convo`
- [x] `summary` command inherits the same flags (`--source-id`, `--convo`, `--list-sources`, `--all-matching`)
- [x] Dashboard "Conversations" view with CLI copy-to-clipboard hint
- [x] `scopeBySource()` shared pure helper; 18 new tests

### Phase 5.3: Cross-device memory portability ✅ (v2.3.0)
Conversations live in AI editor local state and are machine-scoped. Previously, moving to a new machine meant losing all extracted knowledge. Solved via versioned JSON bundle export/import.
- [x] `ai-memory export` — portable JSON bundle with schema validation (stdout or `--output`)
- [x] `ai-memory import <path>` — idempotent import with dedup on `(author, type, date, title)`
- [x] `--dry-run`, `--overwrite`, `--author` remap for teammates / conflict resolution
- [x] Bundle schema `version: 1` with `BundleParseError` for bad inputs
- [x] 21 new tests covering serialize / parse / validation / round-trip / dedup
- [x] Real-world round-trip validated on 239-memory store (CJK + .index manifests preserved)

## v2.4 — Chat-history pipeline + launch credibility (NEXT)

**Goal:** graduate from "works" to "works beautifully in 30 seconds" *and* claim
the chat-history extraction slot before the niche consolidates around runtime
middleware. v2.3 proved the extraction quality. v2.4 ships the distribution
surfaces (AGENTS.md auto-generation, git-history-aware recall) plus the
benchmark pair that makes "this thing actually works" defensible.

Naming decided: staying as `ai-memory-cli` — see
[docs/decisions/2026-04-24-naming.md](docs/decisions/2026-04-24-naming.md).
Category positioning decided: chat-history extracting knowledge pipeline
(not runtime memory middleware) — see
[docs/decisions/2026-04-25-category-positioning.md](docs/decisions/2026-04-25-category-positioning.md).

### Tier 1 — must ship before public launch

First-run UX (✅ done):
- [x] `ai-memory doctor` — one-shot health check (runtime / editors / LLM + live probe / memory store + author / embeddings freshness / MCP config). Six sections, per-check `status + fix` guidance, `--no-llm-check` and `--json` modes, exit code 0/1 for CI. 30 new unit tests. Shipped 2026-04-25.
- [x] `ai-memory init --with-mcp` — writes / merges `.cursor/mcp.json` + `.windsurf/mcp.json` with idempotent semantics (already-registered → no-op, customised entry → preserved, invalid JSON → refuse). Pure `mergeMcpConfig()` + 17 new tests. Claude Desktop (OS-specific global path) gets a README-pointer hint instead of silent mutation. Also fixed a pre-existing label bug where `init` printed "Claude Code not found" three times. Shipped 2026-04-25.

Differentiation features (in progress):
- [x] **`ai-memory rules --target agents-md`** — writes `AGENTS.md` (and side-by-side with `.cursor/rules/*.mdc` via `--target both`) so Codex / Cursor / Windsurf / Copilot / Amp all read the same conventions natively. Idempotent merge: only the section between `<!-- ai-memory:managed-section ... -->` markers is touched, every hand-written line is preserved. Conflict-aware (malformed markers refuse the write, exit 1). Code-fence-safe (markers are only recognised at column 0 of their own line, so quoting them inside a tutorial doesn't trigger a false conflict). 26 new unit tests across every merge branch. Shipped 2026-04-25.
- [x] **`ai-memory recall <query>`** — git-history-aware retrieval that surfaces *how a decision evolved over time*, not just the current snapshot. Uses `git log --follow` on `.ai-memory/` to show every commit that touched a memory file (short SHA, ISO date, author, status code, subject), with rename-tracking through file moves. Soft fallback: outside a git repo (or before the first commit of the store) recall still returns the matching memories with a hint, so it's never strictly worse than `search`. Pure `parseGitLog` parser tested against synthetic fixtures plus 6 real-git tmpdir scenarios; bounded `execFile` timeouts so a corrupt repo can't wedge the CLI. 22 new unit tests. Shipped 2026-04-25.

Launch credibility (in progress):
- [x] **CCEB v1 (primary benchmark) — framework + 9 hand-curated fixtures + first published baseline.** `bench/cceb/` ships the full pipeline: pure scorer with 16 unit tests, fixture loader with strict validation, runner that calls the real `extractMemories()` path, and stable Markdown + JSON scorecards. Coverage: 5 memory types + 1 CJK fixture + 2 noise fixtures (small-talk + deferred-decision) for honest false-positive measurement. `bench:cceb:dry` runs <1s with no LLM tokens (CI-friendly); `bench:cceb` is the live run. **First published baseline (2026-04-25, `gpt-4o-mini`):** overall **F1 56.0%** (P 43.8% / R 77.8%, 9 fixtures, 70.5 s, ≈ $0.005). Recall is healthy across all types; precision is dragged down by over-extraction (one logical decision splitting into 2–4 candidates, plus follow-up actions getting promoted to standalone TODOs). Noise handling: 100% on both adversarial fixtures. Full per-type table, sample misses / false positives, and the v2.5 work this points at are in [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md). Shipped 2026-04-25.
- [ ] **CCEB v1.1 + LongMemEval 50-query subset.** Grow CCEB toward ~30 fixtures via PRs; add the LongMemEval adapter as a credibility shield against "but how do you compare to runtime memory benchmarks?" Est. 1-2 dev days.
- [x] **Demo GIF — recording infrastructure** ✅ (2026-04-25). 5-frame `vhs` cassette + hand-curated 3-memory scenario + Windows-friendly `RECORDING.md` + `npm run demo:render`. Lives at `docs/assets/demo/`. Scripted (`.tape`-based) instead of asciinema-recorded so re-renders are deterministic. Decisions baked in: `extract` narrated rather than live, `recall` intentionally absent from the hero (per user 2026-04-25: extract→reuse is the practical value).
- [ ] **Demo GIF — render + commit** (~10 min). Maintainer with `vhs` installed runs `npm run demo:render`, walks the pre-commit checklist in [`docs/assets/demo/RECORDING.md`](docs/assets/demo/RECORDING.md), and commits `docs/assets/demo/demo.gif`. Tier 2 README rewrite then swaps the README's hero comment marker for the actual `<img>` tag.

### Tier 2 — strongly recommended (post-Tier 1)

- [x] **README top-30% rewrite** ✅ (2026-04-25). New tagline ("Turn AI editor chat history into typed Markdown + `AGENTS.md` rules — local-first, git-trackable, zero `.remember()` calls"), reordered hero commands (`extract` / `rules --target agents-md` / `recall` / `context`), four "only we do this" claims pulled from [`docs/competitive-landscape.md`](docs/competitive-landscape.md), CCEB v1 baseline table inline, demo GIF placeholder comment with render instructions. `README.zh-CN.md` mirrored. The actual `<img>` swap waits on the GIF render (Tier 1 last item).
- [x] **`package.json` description + keywords refresh** ✅ (2026-04-25). Description now reads "Turn editor chat history (Cursor, Claude Code, Windsurf, Copilot) into typed Markdown decisions + AGENTS.md rules — local-first, git-trackable, zero remember() calls." Keywords now include `agents-md`, `knowledge-pipeline`, `chat-history`, `conversation-history` — surfacing the pipeline category instead of the generic "memory" bucket.

### Tier 3 — polish
- [ ] `ai-memory init --local` — one-flag Ollama path without reading docs.
- [ ] Dashboard screenshots (Overview / Conversations / Quality) in README.
- [ ] `star-history` chart badge once we cross 100★.

Full timing + content / launch-day runbook lives in [docs/launch-plan.md](docs/launch-plan.md).

## Future Ideas (Unscheduled)

These are ideas we're considering but haven't committed to:

- **Multi-project knowledge sharing** — common conventions across repos
- **Smart context injection** — auto-select relevant memories based on open files and git diff
- **Plugin system** — custom extractors for domain-specific knowledge
- **Cloud sync** — optional encrypted sync for distributed teams
- **IDE extensions** — native VS Code / JetBrains sidebar

## How to Influence the Roadmap

- **Vote on issues** — thumbs-up (👍) on issues you care about
- **Open a discussion** — propose new features in [GitHub Discussions](https://github.com/hyxnj666-creator/ai-memory/discussions)
- **Contribute** — see [CONTRIBUTING.md](CONTRIBUTING.md)

---

*Last updated: 2026-04-25 (v2.4 Tier 1: `doctor` + `init --with-mcp` + `rules --target agents-md` + `recall` time-travel + CCEB v1 (framework + 9 fixtures + first published baseline at F1 56.0% on `gpt-4o-mini`) + Demo GIF recording infrastructure shipped; CRLF parser fix; dashboard polish (Conversations card click escape fix + pagination at 50/page on Memories tab and conversation memory lists, surfaced during dogfooding against a 268-memory conversation); `doctor` now displays the recognisable parent directory for Cursor conversations instead of an extra UUID subdir; package metadata bumped to 2.4.0 with pipeline-positioning description and `agents-md` keyword; Tier 2 README + Chinese README rewrites done; CCEB v1.1 / LongMemEval subset queued for v2.5. Only the first GIF render (POSIX-only via `vhs` — deferred to a macOS/Linux machine) and `npm publish` + git tag remain as maintainer steps. 431 tests.)*
