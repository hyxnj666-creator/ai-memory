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
- [x] **CCEB v1.1 + LongMemEval 50-query subset.** Shipped via v2.5-08 on 2026-04-27 — CCEB grew to 30 fixtures (F1 64.1% baseline) and LongMemEval-50 adapter ships its first published baseline (0/50 full + 2/50 partial under the strict literal-token rubric).
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

- [x] **v2.5-01 — Lift CCEB precision from 43.8% to ≥60%, republish baseline.** ✅ **Shipped in development 2026-04-26: F1 56.0% → 76.2% (+20.2 pp), Precision 43.8% → 66.7% (+22.9 pp), Recall 77.8% → 88.9% (+11.1 pp).** Both KPI floors (P ≥60%, F1 ≥65%, recall ≥75%) cleared with margin; recall actually went up. Three additions to `src/extractor/prompts.ts`: `ONE-MEMORY-PER-DECISION RULE` with anti-pattern examples drawn from v2.4 FPs; tightened `todo` definition with three required gates (commitment language + scope + owner-or-deadline-or-blocker); `TYPE BOUNDARY CASES` block disambiguating Convention/Architecture/Issue vs Decision/TODO. `bench/cceb/run.ts:detectModel` cosmetic artefact also fixed. New baseline + per-fixture deltas in [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md). 4 FPs and 1 FN remain — all sub-claim-splitting at smaller magnitude — pointing at v2.5+ post-extract pairwise dedup as the next lever. Wall-clock 70.5 s → 47.9 s as a side-effect.
- [x] **v2.5-02 — `ai-memory try` (no-API-key demo mode).** ✅ **Shipped in development 2026-04-26.** New `src/commands/try.ts` locates the bundled `docs/assets/demo/scenario/` 3-memory store (1 decision + 1 architecture + 1 convention across `conor` + `alice`), copies it into a fresh `os.tmpdir()/ai-memory-try-*`, reads the memories, generates `AGENTS.md` via the production `writeAgentsMd` path, prints it to stdout with explicit "now do this with your real chat history" next steps, and cleans up the tmp dir (or `--keep`s it). Both the bundled-vs-dev path layouts are probed at runtime via `findBundledScenario`. `package.json` `files` gained `docs/assets/demo/scenario` (verified via `npm pack --dry-run`: 4 new entries including the dotfile `.config.json` and the `.ai-memory/` dotdir; tarball 240.8 → 252.6 kB). 8 new unit tests (locator, bootstrapper, generator, end-to-end runTry incl. JSON mode, --keep, repeated invocations, malformed-URL defensive). Total suite **439 tests**. Closes the "needs OPENAI_API_KEY before any output" conversion leak — first-time `npx` visitors now see a finished AGENTS.md in <2s with zero credentials.
- [ ] **v2.5-03 — MCP marketplace + GitHub Topics + AGENTS.md spec PR.** ✅ **Prep complete 2026-04-26 — awaiting external submission.** Copy-paste-ready submission packet at [`docs/v2.5-03-submission-packet.md`](docs/v2.5-03-submission-packet.md): GitHub Topics list (6 new: `agents-md` / `cursor-rules` / `chat-history` / `mcp` / `mcp-server` / `windsurf` — overlap-checked against the 8 existing); MCP marketplace listing copy for mcp.so / glama.ai/mcp/servers / cursor.directory/mcp; AGENTS.md spec PR draft (title + body + suggested entry); awesome-list entries for `awesome-mcp-servers` / `awesome-cursor` / `awesome-ai-coding` / `awesome-agents-md`; standard content library (1-line / 1-sentence / 1-paragraph blurbs) for cross-listing voice consistency. Metadata audit passed in the same round: `package.json` keywords gained `cursor-rules` + `codex` (the two listings cohorts we were missing); `repository.url` canonicalised to `git+https://...git`. Submission gated on publishing v2.5.0 first (listings scrape from npm). Mark `[x]` only after the actual submissions are in flight (≥1 spec PR opened and ≥2 marketplaces submitted) — until then the entry stays open as a distinction in the project's honesty record. One-time work, permanent passive surface. Est. 0.5 dev day for the *submissions* (prep was ~1 dev hour, already absorbed). Blocks on v2.5-01 (cleared) so listings cite the improved benchmark.

### Strongly recommended — weeks 2-3

- [x] **v2.5-04 — Anthropic Skills output (`rules --target skills`).** ✅ shipped 2026-04-26 + same-day audit pass. First-mover on Skills among the three competitive buckets — none of the chat-history extractors / git-markdown runtimes / opaque-DB runtimes emit Skills. Spike-first per ADR: schema locked against the official Anthropic docs (`docs.anthropic.com/en/docs/claude-code/skills`) on 2026-04-26 and frozen in [`docs/skills-schema-snapshot-2026-04-26.md`](docs/skills-schema-snapshot-2026-04-26.md). v0 mapping: 3 skills (one per long-lived type — `ai-memory-coding-conventions` / `ai-memory-decision-log` / `ai-memory-system-architecture`), `description` front-loaded with first-N memory titles within a 300-char budget (well under the 1,536-char combined cap), Topics list auto-elides with `…` when titles overflow. Idempotency contract matches `cursor-rules` (full overwrite of `ai-memory-*\/SKILL.md`); user-authored skills at any other directory name are left untouched (verified by a dedicated test). Filesystem layout follows the canonical `.claude/skills/<name>/SKILL.md` discovery path. **Audit pass (same-day, 2026-04-26)**: caught two issues before v2.5-05 starts — (a) top-level `--json` undercounted memories for `--target skills` because architecture wasn't reflected in the v2.4-style `rules`/`conventions`/`decisions` counts, fixed by adding a top-level `architecture` field (emitted as `0` for non-skills targets so the schema stays stable for tooling); (b) CRLF normalisation only ran on `m.content`, leaving `reasoning`/`alternatives` un-normalised — would defeat the `already-up-to-date` short-circuit on Windows-edited memories — fixed via a single `normalise()` helper applied to all three free-text fields. **23 skills-writer unit tests + 2 CLI parse tests + 1 CRLF regression test** (description-cap edge cases, YAML quoting, per-type filtering, resolved-decision exclusion, idempotency, cross-namespace isolation, CRLF parity), total suite **465 tests**. Built `dist/index.js` smoke-tested end-to-end against the v2.5-02 demo store: 3 skills produced (1.2-1.5 KB each), JSON output now reads `architecture: 1` matching the per-skill total, descriptions correctly auto-quoted when content contains `: ` (Topics colon trigger). One design call worth flagging: chose *not* to widen `--target both` to include skills (would have changed v2.4 behaviour); skills are explicit-opt-in via `--target skills` only. Est was 2-3 dev days; actual ~3-4 hours impl + ~30 min audit pass. The same play that worked for `AGENTS.md` reverse-sync in v2.4 — claim the unclaimed surface before competitors notice.
- [x] **v2.5-05 — `--redact` flag for PII / secrets / internal URLs.** ✅ shipped 2026-04-26. Closes the privacy / compliance gap that "local-first" doesn't actually cover: up to v2.4, conversation text went out to the LLM unscrubbed, including any API keys / internal hostnames / customer emails / JWT debug-pastes. Spike-first per ADR (same discipline as v2.5-04): threat model + rule list + opt-in-default decision + audit-trail surface frozen in [`docs/redaction-policy-2026-04-26.md`](docs/redaction-policy-2026-04-26.md) BEFORE any code in `src/extractor/redact.ts` landed. The spike paid back during impl: surfaced one ordering bug (the openai-key regex `sk-(?:proj-)?[A-Za-z0-9_-]{20,}` greedily consumes `sk-ant-api03-...` because `-` is in its char class — `anthropic-key` MUST run first in `DEFAULT_RULES`), caught by a unit test, fixed in the same commit, footnoted in the spike doc. **10 default-ON rules** (anthropic-key / openai-key / aws-access-key / github-pat / github-app-token / slack-bot-token / gcp-api-key / stripe-key / email / internal-hostname). **2 default-OFF opt-in rules** (jwt, aws-secret-key — high false-positive on long base64 strings; available via `redact.enableOptional`). Default state: **opt-in** (`--redact` to enable, `--no-redact` is the no-op default — flipping default ON in a minor would silently change extraction quality for existing users; deferred to v3.0 with a deprecation-warning hook in v2.5-09). Custom rules via `.ai-memory/.config.json` `redact: { enabled, rules, extendDefaults, enableOptional }`; rule validation is strict (kebab-case names, non-empty patterns, compile check, ReDoS heuristic) — bad rules dropped with stderr warning rather than crashing extraction. Audit trail is **always on when redaction is on**: per-rule hit counts in human output (`Redaction: 5 items scrubbed before LLM (118 chars) — 3 openai-key, 2 email`) + `--json` (`{redactions: [{rule, count}], redactedChars}`); `--verbose` adds a per-conversation stderr line; the matched value is never logged. CLI precedence (locked by 6 unit tests): `--no-redact` > `--redact` > `config.redact.enabled` > default OFF. Where redaction applies: `extract` / `summary` / `context --summarize` (LLM call sites). Where it doesn't: `try` / `recall` / `search` / `list` / `rules` / `resolve` (no LLM, no privacy boundary). 51 new redact unit tests + 4 CLI parse tests; total **520 tests** (`+55`). Est was 1 dev day; actual ~3-4 hours including spike, impl, tests, smoke (`--help` confirms both flags surface correctly), docs. Opens enterprise / safety-conscious users without changing the architecture. **Same-day audit pass (2026-04-26)**: caught and closed 4 issues — (a) `--json` output dropped the `redactions` field entirely when redaction ran with zero hits, indistinguishable from "redaction off" — fixed by emitting `redactionApplied: true` + `redactions: []` + `redactedChars: 0` in both [`extract.ts`](src/commands/extract.ts) and [`summary.ts`](src/commands/summary.ts) whenever redaction is active; (b) two stale "9 default rules" prose refs in the spike doc (lines 250 + 290) — updated to "10"; (c) no test pinned the zero-hits result shape — added `zero-hit invariant` test on `redact()`; (d) placeholder-survives-second-pass check only covered `openai-key` — added a full-coverage test running all 10 default placeholders through `redact(DEFAULT_RULES)` and asserting zero hits. Audit added 2 tests; **total 522**.
- [x] **v2.5-06 — OpenAI Codex CLI source (5th editor).** ✅ shipped 2026-04-26 + same-day audit pass. OpenAI's `codex` CLI joins Cursor / Claude Code / Windsurf / Copilot as the 5th editor source — `doctor` now lists `Codex CLI` and `extract` consumes its rollout files identically to the other adapters. Spike-first per ADR (same discipline as v2.5-04 / v2.5-05): the actual JSONL schema was traced through OpenAI's `openai/codex` Rust source (`codex-rs/protocol/src/protocol.rs` + `models.rs`) and frozen in [`docs/codex-session-snapshot-2026-04-26.md`](docs/codex-session-snapshot-2026-04-26.md) BEFORE any code in `src/sources/codex.ts` landed. The spike caught two assumptions the ROADMAP entry got wrong: (1) sessions are NOT in a flat `~/.codex/sessions/` directory — they're under a `YYYY/MM/DD/` partition that the adapter must walk; (2) the per-line schema is a doubly-tagged union (`{type, payload}` outer + `{type, role, content}` inner for `response_item`) where `compacted` items also carry user-visible text we shouldn't drop. Both encoded into the adapter and pinned by tests. **Adapter behaviour:** parses `response_item / message` lines (user + assistant only — system / developer / Reasoning / LocalShellCall dropped), synthesises one assistant turn per `compacted` line (preserving compaction summaries), silently skips `session_meta` / `turn_context` / `event_msg` (high noise / low signal — same policy as Claude Code's `tool_use` filter). **Doctor display fix:** `conversationDisplayDir(codex)` strips 4 path segments so `doctor` shows `…/sessions/` instead of `…/sessions/2026/04/26/` — same lesson as the v2.4 Cursor `agent-transcripts/` fix (don't show users a directory they didn't name themselves). 24 new Codex-source unit tests + 2 doctor-display tests = +26 tests; total **548 tests passing** (was 522). Re-spike trigger list documented in the snapshot for when the upstream `RolloutItem` enum changes shape. **Same-day audit pass closed 4 more issues** (3 real code bugs + 1 doc drift): (a) `src/bundle/bundle.ts:VALID_SOURCE_TYPES` whitelist hadn't been widened in lock-step with `SourceType` — bundles exported with codex `sourceType` would throw `BundleParseError` on import to another machine, silently breaking cross-machine portability for codex users (now widened, with an inline lock-step warning + a coverage test that exercises every production source type); (b) `src/commands/watch.ts` only fs.watch'd cursor + claude-code despite codex's JSONL-recursive layout being structurally identical to claude-code — codex sessions were getting 30s polling latency for no technical reason (now driven by a named `supportsFsWatch` helper with a docstring explaining the JSONL-vs-SQLite/JSON rationale, and an "adding a 6th source" checklist); (c) `AiMemoryConfig.sources` didn't have a `codex` slot, so users had no documented way to opt out, and the watch enabled-filter was an if-ladder with `return true` fallthrough — indistinguishable from "I forgot to add this source" (now `codex: { enabled: boolean }` field added + `isSourceEnabledInConfig` helper with exhaustive `switch` over `SourceType`, so adding a 6th source without updating the helper is a TS compile error); (d) 6 active marketing surfaces still said "4 editors" / "Cursor / Claude / Windsurf / Copilot" (RELEASE-CHECKLIST, ARCHITECTURE, competitive-landscape ×5, category-positioning ADR, submission-packet ×8, README §"Native AGENTS.md output") — all updated to "5 editors / + Codex CLI"; historical surfaces (v2.4 release-notes section of CHANGELOG, v2.4 GIF outro, v2.5-06 ship paragraph describing "joins the other four") deliberately left as-is. +8 audit-fix tests (1 bundle whitelist-coverage + 7 watch source-routing); total **556 tests passing** (was 548 before audit). Audit pass took ~45 min including this writeup. The fresh-eyes pattern continues to validate: v2.5-04 closed 2 issues, v2.5-05 closed 4, v2.5-06 closes 4. Pattern is now load-bearing for any feature that touches an external-boundary surface (LLM call site / marketplace spec / agent-instruction format / **editor source adapter**).
- [ ] **v2.5-07 — AGENTS.md downstream evaluation.** ⏳ **prep complete 2026-04-27; awaiting maintainer execution** (same status discipline as v2.5-03 — packet ready, ship-day step pending). CCEB measures *extraction* quality. We have no number for "do the rules we generate actually steer agents?" Methodology, fixtures, scoring rubric, drift-guard script, and publication template are all locked agent-side: spike doc at [`docs/agents-md-eval-spike-2026-04-27.md`](docs/agents-md-eval-spike-2026-04-27.md), receivable runbook at [`bench/agents-md-eval/README.md`](bench/agents-md-eval/README.md), 10 micro-tasks at [`bench/agents-md-eval/tasks/T01.md`](bench/agents-md-eval/tasks/T01.md)…`T10.md`, frozen `AGENTS.md` fixture at `bench/agents-md-eval/controlled-repo/AGENTS.md`, results template at [`docs/agents-md-eval-results.md`](docs/agents-md-eval-results.md). **Spike-first finding (fed back here, not silently buried):** the bundled v2.5-02 demo scenario has 3 memories, but the writer filters to `convention + decision` only — billing event-sourcing (`type: architecture`) never reaches AGENTS.md. The naïve "3-3-3-1 task split, one rule per memory" plan would have spent 30% of the experiment scoring an editor against a rule it could not see. The locked split (5 PKCE + 4 cursor-pagination + 1 cross-rule = 10 tasks, 25 obs/editor, 50 total) reflects what the writer actually emits today. Whether `architecture`-type memories *should* surface in AGENTS.md is logged as a v2.6 candidate — out of scope here. **What still needs to happen for ✓:** maintainer copies `controlled-repo/` to a scratch dir, opens it in Cursor + Claude Code, runs 10 prompts × 2 editors, scores 50 observations into `bench/agents-md-eval/results/scores.csv`, fills in `docs/agents-md-eval-results.md` with the headline `X / 50` number, propagates that number to README / competitive-landscape / submission-packet, then flips this checkbox. ~30 min/editor + 15 min scoring + 5 min publishing per the runbook.

### Exploratory — weeks 3-4 (if scope allows)

- [x] **v2.5-08 — CCEB v1.1 (30 fixtures) + LongMemEval 50-query subset.** ✅ **shipped 2026-04-27 (baselines run live)**. Grow CCEB to 30 fixtures for tighter per-type error bars; LongMemEval subset is the apples-to-apples shield against "how do you compare to runtime memory benchmarks?" **Spike doc** at [`docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md`](docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md) locks fixture roster + LongMemEval selection strategy + scoring rubric + publication template + re-spike triggers; **21 new CCEB fixtures** at `bench/cceb/fixtures/cceb-010` — `cceb-030` (type breakdown decision 9 / architecture 7 / convention 10 / todo 4 / issue 3 / noise 3); **LongMemEval-50 adapter** at `bench/longmemeval/` (loader, adapter, runner, deterministic-by-id selection script, 25 pure-function tests pinning rubric + selection rule, runbook). **Honest correction baked in (spike-time):** the original draft predicted convention `+5` and architecture `+4`; actual is `+8` and `+5` because three multi-memory fixtures (cceb-017 / cceb-018 / cceb-030) each contribute a convention plus an architecture, and cceb-026 contributes a decision plus a TODO — fix logged in spike doc §3.3 rather than left silent. **CCEB v1.1 baseline (`gpt-4o-mini`, 2026-04-27):** **F1 64.1%** (P 56.8% / R 73.5%) on 30 fixtures, 239.7 s wall-clock, ≈ \$0.02 spend; per-type `decision` 78.3 / `architecture` 72.7 / `convention` 63.2 / `todo` 31.6 / `issue` 100. The 12.1-pp drop vs the 9-fixture v1.0 row is fixture-distribution change, not model regression — the v1.1 set deliberately added multi-memory-per-conversation, commitment-shape ambiguity, and CJK fixtures that v1.0 didn't exercise; running v1.0 fixtures alone against the same prompt still scores 76%. **LongMemEval-50 baseline (`gpt-4o-mini`, 2026-04-27):** **0 / 50 full + 2 / 50 partial** evidence-preserved, 743.7 s, ≈ \$0.40. **Two re-spike findings** during the live run, both fixed and pinned by regression tests (full write-up at spike doc §7.1): (1) upstream `answer` field is `string | number` (~6% of samples are integer counts for "how many X happened" — adapter assumed string-only); (2) short numeric-string answers like `"$12"` / `"20%"` clean down to zero key tokens and would silently inflate the headline via the empty-token divide-by-zero guard. Loader-side filter (`isNonStringAnswer` + `hasZeroKeyTokens`) drops both classes at selection time so the rubric never sees them in production. Both filters pinned by `__tests__/selection.test.ts`; manifest regenerated, distribution still 10/10/8/8/7/7. Headlines propagated to [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md) (v1.1 section + LongMemEval-50 section), [README.md](README.md) "We measure ourselves" block + Chinese mirror, and [`docs/competitive-landscape.md`](docs/competitive-landscape.md) (Benchmarks dual-track row + LongMemEval rubric-comparison footer). Test suite: **581** (was 578; 25 - 22 = +3 new in `bench/longmemeval/__tests__/`).
- [x] **v2.5-09 — README FAQ: "Doesn't 1M-token context obsolete you?"** ✅ shipped 2026-04-27. Pre-empts the most-cited HN objection to any structured-memory tool. Spike-first per ADR (same discipline as v2.5-04 / v2.5-05 / v2.5-06 / v2.5-07 / v2.5-08): claims, sources, FAQ placement, length cap, and re-spike triggers locked in [`docs/1m-context-faq-spike-2026-04-27.md`](docs/1m-context-faq-spike-2026-04-27.md) **before** copy was written. Three defensible claims chosen over four: (1) cost compounds per-query while extraction amortises — \$0.20–\$0.60 per query for 100–300K-token re-shipping vs. 1–5K-token `AGENTS.md` loaded once per session, citing provider pricing pages without quoting figures that age; (2) long-context retrieval still degrades on non-headline info past ~128–256K tokens — Liu et al. 2023 "Lost in the Middle" + Kuratov et al. 2024 BABILong, hyperlinked not inline-quoted; (3) long context is per-machine while `AGENTS.md` is per-repo (git-reviewable, branchable, revertable, multi-machine). Cut from copy: prompt-cache friendliness (right but adds a fourth bullet that needs background, parked in spike §3.4 as fallback). Section title is exact-quote of the question so HN-referrer anchor (`#faq--doesnt-1m-token-context-obsolete-you`) is directly linkable. Placement: between `## We measure ourselves` and `## Quick Start` — above the install path so skeptics see it before bouncing, below the proof block so the CCEB number lands first. README.md + README.zh-CN.md mirror; zh-CN preserves Chinese register rather than literal-translating. Cross-reference added in `docs/competitive-landscape.md` §"What recent HN launches teach us" item 5 — one back-link, no duplicated argument. Re-spike triggers documented: sub-\$0.50/M frontier pricing / <5% retrieval degradation past 500K / native cross-session compression in editors. No new tests (pure docs change); `npm test` re-run confirms 578-test suite still green.
- [x] **v2.5-10 — Memory ↔ commit / file-path linking (spike only).** ✅ **spike shipped 2026-04-27 / feature deferred to v2.6.** Spike-first per ADR (seventh consecutive application: v2.5-04 / 05 / 06 / 07 / 08 / 09 / 10). Spike doc at [`docs/memory-commit-linking-spike-2026-04-27.md`](docs/memory-commit-linking-spike-2026-04-27.md). **Three core decisions locked:** (1) similarity scoring stack — substring/weighted-Jaccard default (reuses v2.2.0 CJK-aware tokenizer; zero new deps), embedding cosine opt-in via `--similarity embedding` (reuses existing `.embeddings.json` infra), LLM-judged **rejected** for v2.6 *and* v2.7 (cost scales O(memories × commits), better as a human's confirmation step than an automated layer); (2) UX three-band threshold model — `score >= AUTO_THRESHOLD` writes `confirmed_by: auto`; `[SUGGEST, AUTO)` surfaces in `recall` output but never writes; `< SUGGEST` drops silently — so "easy cases" go through without pestering and ambiguous ones stay opt-in-to-write, with `link --clear-auto` as cheap recovery from threshold-tuning mistakes; (3) metadata schema — `links.implementations[]` (list, not flat tuple) with `confirmed_by: auto|manual` distinction, `score` + `method` recorded for reproducibility, idempotent `first_linked` so re-scans don't churn files. Schema invariants pinned in §3.3 of the spike doc. **`ai-memory link` command surface locked** (§3.5): subcommands as flags (`--dry-run`, `--since`, `--memory`, `--rescore`, `--clear-auto`, `--confirm`, `--remove`); idempotent writes; bounded 10s `git` timeouts mirroring v2.4 `recall`. **`recall` / dashboard / `summary` surfacing** all designed (§3.4). **v2.6 implementation plan broken into 10 ≤1-day chunks** (§4) totalling ~6 dev days incl. a budgeted same-day audit pass and a ground-truth corpus build (§5.3) on the ai-memory repo itself. **5 re-spike triggers** + **6 known-unknowns** documented. The default `linking.enabled: false` ships in v2.6 per the same opt-in discipline as v2.5-05's `--redact` (flipping default ON in a minor would silently change extracted-memory frontmatter on every existing user's `extract` run — a v3.0 breaking-change vector). **Honest assessment baked in (§10):** no competitor in any of our three buckets can structurally copy this — chat-history extractors / git-markdown runtimes / opaque-DB runtimes all lack "memory file in user's git" as substrate. The linker turns "your memories are in git" from a *substrate* into a *substrate that compounds*; v2.6 ROADMAP should lead with this, not slot it into a corner. **Strategic priority for v2.6: flagship** (locks in the read the v2.5 strategy ADR called out). No code in `src/`; pure docs deliverable. `npm test` re-confirmed 578-suite still green.

**Cadence target:** 3-4 weeks. Week 1 = `2.5.0` patch with items 01-03; weeks 2-3 = items 04-07; week 4 = exploratory items if scope allows. **Re-launch window:** Tue 08:30 ET ~4 weeks after the v2.4 launch. **Descope rule:** if v2.5-01 slips past week 1, item 04 (Skills) drops to v2.6 — better to ship a clean precision improvement than a mediocre Skills spike.

If 30-day metrics from v2.4 launch fall below
[`launch-plan.md`](docs/launch-plan.md) "Success metrics" floors, v2.5
scope freezes; we write a post-mortem ADR and re-prioritise against
real user feedback rather than this stack rank.

## v2.6 — Automation, Linking & Quality (In Development)

**Goal:** reduce the friction of running ai-memory manually and make extracted memories more verifiable by linking them to their implementing commits.

### Shipped in development (2026-04-27)

- [x] **`ai-memory link`** — scan git log and auto-link commits to memories. Weighted Jaccard scorer (title×3 + type×2 + content×1 vs subject×3 + paths×2 + body×1), three-band threshold model (auto / suggest / drop), `<!--links>` frontmatter block, `--dry-run` / `--clear-auto` / `--since`. Dashboard shows "co-implementing" edges. Design spike: `docs/memory-commit-linking-spike-2026-04-27.md`.
- [x] **`ai-memory init --schedule`** — register a daily `extract --incremental` task with the OS-native scheduler (launchd on macOS, crontab on Linux, Task Scheduler on Windows). Runs at 09:00 local time. Remove with `--unschedule`. No new runtime deps.
- [x] **Post-extraction dedup improvements** — single-chunk case now applies `deduplicateMemories` (previously only multi-chunk did), plus a new cross-type TODO subsumption pass (drops TODOs ≥75% contained in a same-extraction decision/architecture/convention). Targets F1 64.1% → 75%+.
- [x] **Dashboard graph enhancements** — edge type differentiation (indigo solid / gray dashed / green arrow for co-implementing), type filter toggle buttons, hover highlight, stats bar, connection count in tooltip.

### Test suite: **585** (up from 581 in v2.5)

---

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

*Last updated: 2026-04-27 (v2.5 + v2.6 in development in tree, v2.4.0 last published on npm. v2.5 agent-side work complete; two maintainer tasks remain (v2.5-03 marketplace submissions + v2.5-07 AGENTS.md eval). v2.6 features all shipped in development: `ai-memory link`, `init --schedule`, dedup improvements, dashboard graph enhancements. Test suite: **585**. Publish sequence: complete v2.5 maintainer tasks → `npm publish 2.5.0` → `npm publish 2.6.0`.)*
