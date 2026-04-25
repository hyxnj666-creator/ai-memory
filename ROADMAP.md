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

## v2.4 — Chat-history pipeline + launch credibility (Shipped 2026-04-26)

**Goal:** graduate from "works" to "works beautifully in 30 seconds" *and* claim
the chat-history extraction slot before the niche consolidates around runtime
middleware. v2.3 proved the extraction quality. v2.4 ships the distribution
surfaces (AGENTS.md auto-generation, git-history-aware recall) plus the
benchmark pair that makes "this thing actually works" defensible.

**Released:** `ai-memory-cli@2.4.0` to npm on 2026-04-26 (commit `3f21251`,
git tag `v2.4.0`). 431 tests, CCEB v1 baseline F1 56.0% on `gpt-4o-mini`.
Hero GIF render remains a deferred maintainer step (POSIX-only via `vhs`,
manual Windows fallback documented). HN promotion decoupled from publish —
target window Tue 2026-04-28 morning ET per [`docs/launch-plan.md`](docs/launch-plan.md).

Naming decided: staying as `ai-memory-cli` — see
[docs/decisions/2026-04-24-naming.md](docs/decisions/2026-04-24-naming.md).
Category positioning decided: chat-history extracting knowledge pipeline
(not runtime memory middleware) — see
[docs/decisions/2026-04-25-category-positioning.md](docs/decisions/2026-04-25-category-positioning.md).

### Tier 1 — must ship before public launch

First-run UX (✅ done):
- [x] `ai-memory doctor` — one-shot health check (runtime / editors / LLM + live probe / memory store + author / embeddings freshness / MCP config). Six sections, per-check `status + fix` guidance, `--no-llm-check` and `--json` modes, exit code 0/1 for CI. 30 new unit tests. Shipped 2026-04-25.
- [x] `ai-memory init --with-mcp` — writes / merges `.cursor/mcp.json` + `.windsurf/mcp.json` with idempotent semantics (already-registered → no-op, customised entry → preserved, invalid JSON → refuse). Pure `mergeMcpConfig()` + 17 new tests. Claude Desktop (OS-specific global path) gets a README-pointer hint instead of silent mutation. Also fixed a pre-existing label bug where `init` printed "Claude Code not found" three times. Shipped 2026-04-25.

Differentiation features (shipped):
- [x] **`ai-memory rules --target agents-md`** — writes `AGENTS.md` (and side-by-side with `.cursor/rules/*.mdc` via `--target both`) so Codex / Cursor / Windsurf / Copilot / Amp all read the same conventions natively. Idempotent merge: only the section between `<!-- ai-memory:managed-section ... -->` markers is touched, every hand-written line is preserved. Conflict-aware (malformed markers refuse the write, exit 1). Code-fence-safe (markers are only recognised at column 0 of their own line, so quoting them inside a tutorial doesn't trigger a false conflict). 26 new unit tests across every merge branch. Shipped 2026-04-25.
- [x] **`ai-memory recall <query>`** — git-history-aware retrieval that surfaces *how a decision evolved over time*, not just the current snapshot. Uses `git log --follow` on `.ai-memory/` to show every commit that touched a memory file (short SHA, ISO date, author, status code, subject), with rename-tracking through file moves. Soft fallback: outside a git repo (or before the first commit of the store) recall still returns the matching memories with a hint, so it's never strictly worse than `search`. Pure `parseGitLog` parser tested against synthetic fixtures plus 6 real-git tmpdir scenarios; bounded `execFile` timeouts so a corrupt repo can't wedge the CLI. 22 new unit tests. Shipped 2026-04-25.

Launch credibility (shipped except GIF render):
- [x] **CCEB v1 (primary benchmark) — framework + 9 hand-curated fixtures + first published baseline.** `bench/cceb/` ships the full pipeline: pure scorer with 16 unit tests, fixture loader with strict validation, runner that calls the real `extractMemories()` path, and stable Markdown + JSON scorecards. Coverage: 5 memory types + 1 CJK fixture + 2 noise fixtures (small-talk + deferred-decision) for honest false-positive measurement. `bench:cceb:dry` runs <1s with no LLM tokens (CI-friendly); `bench:cceb` is the live run. **First published baseline (2026-04-25, `gpt-4o-mini`):** overall **F1 56.0%** (P 43.8% / R 77.8%, 9 fixtures, 70.5 s, ≈ $0.005). Recall is healthy across all types; precision is dragged down by over-extraction (one logical decision splitting into 2–4 candidates, plus follow-up actions getting promoted to standalone TODOs). Noise handling: 100% on both adversarial fixtures. Full per-type table, sample misses / false positives, and the v2.5 work this points at are in [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md). Shipped 2026-04-25.
- [ ] **CCEB v1.1 + LongMemEval 50-query subset.** Moved to v2.5 — see v2.5-08 below. Grow CCEB toward ~30 fixtures via PRs; add the LongMemEval adapter as a credibility shield against "but how do you compare to runtime memory benchmarks?" Est. 3-4 dev days.
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

## v2.5 — Quality lift + Skills + distribution (NEXT)

**Goal:** turn v2.4's "we shipped" into v2.5's "we listened, here's the new
number" — a re-postable HN narrative — while staking an early claim on
Anthropic Skills before the niche consolidates around `AGENTS.md` alone.

Strategy + alternatives + risk are in
[`docs/decisions/2026-04-26-post-v2.4-strategy.md`](docs/decisions/2026-04-26-post-v2.4-strategy.md).
Items below are stack-ranked by **edge-per-day toward the 1000★ target**,
not by feature size. Items 01–03 are committed (must ship); 04–07 are
strongly recommended; 08–10 are exploratory.

### Must ship — week 1 (publish as `2.5.0` patch)

- [ ] **v2.5-01 — Lift CCEB precision from 43.8% to ≥60%, republish baseline.** Three concrete prompt-side changes: "one decision per discussion thread" instruction, TODO-discipline gating on explicit commitment language, type-classification few-shot for the convention-vs-decision and architecture-vs-decision boundaries. Target F1 65%+ at recall ≥75% (no recall regressions below ~75%, recall regressions are silent failures). Republished baseline is the single most reusable v2.5 launch asset. Also fixes the cosmetic `openai (default)` model-label artefact called out in the v1 baseline. Est. 2-3 dev days.
- [ ] **v2.5-02 — `ai-memory try` (no-API-key demo mode).** Repurpose the existing `docs/assets/demo/scenario/` 3-memory hand-curated store as a runnable demo; bootstrap a tmp dir, run `rules --target agents-md`, show the generated `AGENTS.md` inline. No LLM call, no API key. Closes the "needs OPENAI_API_KEY before any output" conversion leak that loses every visitor who lands on the npm page without API credentials handy. Est. 0.5-1 dev day.
- [ ] **v2.5-03 — MCP marketplace + GitHub Topics + AGENTS.md spec PR.** Submit to mcp.so, glama.ai/mcp/servers, cursor.directory/mcp; add Topics `agents-md` / `cursor-rules` / `claude-code` / `chat-history` / `mcp-server`; PR to the AGENTS.md spec repo (Linux Foundation Agentic AI Foundation) listing `ai-memory-cli` under "known generators / consumers"; submit to `awesome-mcp-servers` / `awesome-cursor` / `awesome-ai-coding` / `awesome-agents-md`. One-time work, permanent passive surface. Est. 0.5 dev day. Blocks on v2.5-01 so listings cite the improved benchmark.

### Strongly recommended — weeks 2-3

- [ ] **v2.5-04 — Anthropic Skills output (`rules --target skills`).** First-mover on Skills (introduced 2026-Q1, hot in Q2): one skill per (memory type × theme), `description` field auto-generated from constituent memory titles for dynamic-loading, body composed from the relevant typed memories. Spike-first: validate Skills schema against current Anthropic docs and land a date-stamped schema-snapshot doc before implementing. The same play that worked for `AGENTS.md` reverse-sync in v2.4 — claim the unclaimed surface before competitors notice. Est. 2-3 dev days (1 spike + 1-2 impl). Risk: Skills spec instability — Anthropic shipped breaking changes twice in 2026-Q1.
- [ ] **v2.5-05 — `--redact` flag for PII / secrets / internal URLs.** Today `extract` sends conversation excerpts to the configured LLM provider; "local-first" applies to storage, not extraction calls. Default rules: common token shapes (`(sk|pk|aws|github_pat|ghp|xoxb)_[A-Za-z0-9]{20,}`), internal-domain hostnames (`*.internal`/`*.corp`/`*.local`/`*.lan`), RFC5322 emails, optional JWT tokens. Custom rules via `.ai-memory/.config.json` `redact` array. Opens enterprise / safety-conscious users without changing the architecture. Est. 1 dev day.
- [ ] **v2.5-06 — OpenAI Codex CLI source (5th editor).** OpenAI's `codex` CLI (released 2026-Q1, separate from codex.com) joins Cursor / Claude Code / Windsurf / Copilot as the 5th editor. Conversation files live in `~/.codex/sessions/` (verify path during implementation). Same shape as Claude Code adapter — JSONL per session, source detection in `doctor`, source driver under `src/sources/codex/`. ~10-15 unit tests. Est. 1-2 dev days.
- [ ] **v2.5-07 — AGENTS.md downstream evaluation.** CCEB measures *extraction* quality. We have no number for "do the rules we generate actually steer agents?" Methodology: drop generated `AGENTS.md` into a controlled empty repo, define 10 micro-tasks exercising specific rules, run each in Cursor + Claude Code, manually score "rule followed" 0/1. Publish a single number: "X / 50 rule observations honored across Cursor + Claude Code." Complementary credibility lever to CCEB — addresses "AGENTS.md / Cursor Rules don't actually steer agents reliably" comment HN will produce. Est. 1-2 dev days.

### Exploratory — weeks 3-4 (if scope allows)

- [ ] **v2.5-08 — CCEB v1.1 (30 fixtures) + LongMemEval 50-query subset.** Grow CCEB to 30 fixtures for tighter per-type error bars; LongMemEval subset is the apples-to-apples shield against "how do you compare to runtime memory benchmarks?" Est. 3-4 dev days (mostly fixture authoring). Blocks on v2.5-01.
- [ ] **v2.5-09 — README FAQ: "Doesn't 1M-token context obsolete you?"** One section, 1-2 paragraphs pre-empting an HN question we know will come. Key points: at $3/1M input tokens dumping raw chat history per query is expensive ($3/query); long context degrades on tail retrieval (needle-in-haystack failure modes); `AGENTS.md` is loaded per-session not per-query so cost compounds. Est. 0.5 dev day.
- [ ] **v2.5-10 — Memory ↔ commit / file-path linking (spike only).** Each memory `.md` gets `implemented_in: [<sha>, <path>]` metadata populated by scanning `git log` for keyword/title overlap; surfaces in `recall` and dashboard. Spike-only in v2.5 because similarity-scoring (substring vs embedding vs LLM-judged) and UX (auto-link vs manual confirm) decisions are non-trivial — bad auto-linking is worse than no linking. No competitor in any of our three buckets can do this — git-native plain-Markdown substrate is the substrate that enables it. Lands the design doc this cycle, ships in v2.6. Est. 1 dev day.

**Cadence target:** 3-4 weeks. Week 1 = `2.5.0` patch with items 01-03; weeks 2-3 = items 04-07; week 4 = exploratory items if scope allows. **Re-launch window:** Tue 08:30 ET ~4 weeks after the v2.4 launch. **Descope rule:** if v2.5-01 slips past week 1, item 04 (Skills) drops to v2.6 — better to ship a clean precision improvement than a mediocre Skills spike.

If 30-day metrics from v2.4 launch fall below
[`launch-plan.md`](docs/launch-plan.md) "Success metrics" floors, v2.5
scope freezes; we write a post-mortem ADR and re-prioritise against
real user feedback rather than this stack rank.

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

*Last updated: 2026-04-26 (v2.4.0 published to npm + git tag `v2.4.0` pushed. v2.5 scope locked in [`docs/decisions/2026-04-26-post-v2.4-strategy.md`](docs/decisions/2026-04-26-post-v2.4-strategy.md) — 10 items stack-ranked by edge-per-day toward 1000★, headlined by CCEB precision lift 43.8% → ≥60% (republishable as second HN narrative) and Anthropic Skills first-mover output (`rules --target skills`). Items 01–03 committed for week 1 patch (CCEB precision + `try` demo mode + MCP marketplace distribution); 04–07 strongly recommended weeks 2–3 (Skills + redact + Codex + AGENTS.md downstream eval); 08–10 exploratory. Only the first GIF render (POSIX-only via `vhs` — deferred to a macOS/Linux machine) remains pending as a v2.4-tail maintainer step. 431 tests.)*
