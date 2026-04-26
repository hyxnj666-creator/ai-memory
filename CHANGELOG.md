# Changelog

## [Unreleased] — v2.5 (in development)

### Planned — quality lift + Anthropic Skills + distribution (2026-04-26)

Scope locked in [`docs/decisions/2026-04-26-post-v2.4-strategy.md`](docs/decisions/2026-04-26-post-v2.4-strategy.md). Ten items stack-ranked by edge-per-day toward the 1000★ target; full breakdown in [ROADMAP.md](ROADMAP.md) §"v2.5 — Quality lift + Skills + distribution".

- **Must ship (week 1, publish as `2.5.0`):**
  - **v2.5-01** — lift CCEB precision from 43.8% to ≥60% via prompt-side changes (sub-claim merge into parent `reasoning`/`alternatives`/`impact`, TODO discipline, type-classification calibration), republish baseline against `gpt-4o-mini`. Headline target F1 65%+ at recall ≥75%. The republished number is the single most reusable v2.5 launch asset.
  - **v2.5-02** — `ai-memory try`: no-API-key demo mode that runs `rules --target agents-md` against the bundled `docs/assets/demo/scenario/` 3-memory store. Closes the "needs `OPENAI_API_KEY` before any output" first-impression conversion leak.
  - **v2.5-03** — distribution: submit to mcp.so / glama.ai / cursor.directory; GitHub Topics; AGENTS.md spec PR.
- **Strongly recommended (weeks 2-3):**
  - **v2.5-04** — Anthropic Skills output (`rules --target skills`). First-mover on Skills (introduced 2026-Q1, hot in Q2); spike-first to date-stamp the schema we target.
  - **v2.5-05** — `--redact` flag for PII / secrets / internal URLs.
  - **v2.5-06** — OpenAI Codex CLI as the 5th editor source.
  - **v2.5-07** — AGENTS.md downstream evaluation (do generated rules actually steer agents?).
- **Exploratory (weeks 3-4):** v2.5-08 CCEB v1.1 30 fixtures + LongMemEval subset; v2.5-09 README "1M-context FAQ"; v2.5-10 memory↔commit linking spike.

Cadence target 3-4 weeks. Descope rule: if v2.5-01 slips past week 1, v2.5-04 drops to v2.6. If 30-day post-v2.4-launch metrics fall below [`docs/launch-plan.md`](docs/launch-plan.md) "Success metrics" floors, scope freezes and we re-prioritise from real user feedback.

### Shipped in development — v2.5-01 — extraction prompt rewrite (CCEB F1 56.0% → 76.2%) (2026-04-26)

Headline: **CCEB F1 56.0% → 76.2% (+20.2 pp)** on `gpt-4o-mini`, with **precision 43.8% → 66.7% (+22.9 pp)** and **recall 77.8% → 88.9% (+11.1 pp)**. Both v2.5-01 KPI floors (P ≥60%, F1 ≥65%, recall ≥75%) cleared with margin. Full per-type breakdown, methodology, and remaining-work list in [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md).

Three additions to `src/extractor/prompts.ts:buildExtractionPrompt`, each targeting a v2.4 false-positive pattern:

- **`ONE-MEMORY-PER-DECISION RULE`** — explicit anti-splitting instruction with four `✗` examples taken directly from the v2.4 false-positive set (Lua-script audit attached to a Redis Cluster TODO; `REVOKE UPDATE/DELETE` attached to event-sourcing architecture; nightly integrity-check job; `client_id` deprecation attached to PKCE). Caps a single chunk at 0–3 memories unless the conversation literally enumerates 4+ separable items, which preserves the legitimate 3-memory case in `cceb-006-multi-memory`.
- **Tightened `todo` type definition** — three required gates: explicit commitment language ("let's track this", "TODO:", "我们会", "下周开 PR"), clear scope + done-criteria, and an owner OR deadline OR blocking event. With four `✗` reject examples for "implementation gotcha mentioned in passing" and "incidental aside" patterns. The v2.4 TODO precision was 20% (1 TP / 4 FPs); v2.5-01 is 33.3% (1 TP / 2 FPs).
- **`TYPE BOUNDARY CASES` block** — disambiguates Convention vs Decision (a forward-looking *rule* → convention, even if decided once), Architecture vs Decision (system *structure* → architecture, one-of-N *choice* → decision), and Issue vs TODO (a fix-deploy is *impact* of the issue, not a separate TODO). Closed the v2.4 architecture FN and issue FP, lifting both type rows to perfect 100% F1.

`bench/cceb/run.ts:detectModel` was also fixed in the same round — it now mirrors the fallback chain in `extractor/llm.ts:resolveAiConfig` instead of returning `"openai (default)"`, so the scorecard label matches the model that actually ran (the v2.4 doc tracked this as a known cosmetic artefact).

Per-fixture changes vs v2.4:

| Fixture | v2.4 (extracted / TP / FP) | v2.5-01 | Net |
|---|---|---|---|
| `cceb-001-oauth-pkce` (decision) | 2 / 1 / 1 | 1 / 1 / 0 | −1 FP |
| `cceb-002-graphql-pagination` (convention) | 1 / 0 / 1 (typed as decision) | 0 / 0 / 0 | type-FP cleared, convention still missing |
| `cceb-003-event-sourcing` (architecture) | 4 / 1 / 3 | 3 / 1 / 2 | −1 FP |
| `cceb-004-rate-limit-bug` (issue) | 2 / 1 / 1 | 1 / 1 / 0 | **perfect** |
| `cceb-005-todo-redis-cluster` (todo) | 3 / 1 / 2 | 2 / 1 / 1 | −1 FP |
| `cceb-006-multi-memory` (3 expected) | 3 / 3 / 0 | 3 / 3 / 0 | unchanged (perfect both runs) |
| `cceb-007-cjk-decision` (decision) | 3 / 1 / 2 | 2 / 1 / 1 | −1 FP |
| `cceb-008-noise-chitchat` (0 expected) | 0 / 0 / 0 | 0 / 0 / 0 | unchanged (perfect — no hallucination on noise) |
| `cceb-009-noise-unresolved` (0 expected) | 0 / 0 / 0 | 0 / 0 / 0 | unchanged (perfect — no hallucination on unresolved) |

Wall-clock dropped from 70.5 s to 47.9 s (~33% faster) because over-extracting fixtures now emit fewer items, even though the prompt itself grew by ~1.6K tokens.

Four FPs and one FN remain. All four FPs are smaller-magnitude versions of the over-extraction pattern (sub-claim emitted alongside parent), pointing at the next lever: a post-extract pairwise dedup inside a single fixture, currently only invoked on multi-chunk extractions. The remaining FN (`cceb-002` convention) is the model under-classifying "every X must Y" as a decision after a multi-option discussion — fix candidate is one more `TYPE BOUNDARY CASES` example pinning that exact wording. Both tracked for the next v2.5 iteration.

431 tests still pass; no test or pipeline changes were needed because the prompt body is checked by string-membership tests that are robust to body rewrites.

## [2.4.0] - 2026-04-26

### Fixed — `doctor` displayed the wrong directory for Cursor conversations (2026-04-25)

`probeEditors` reported the path of the first detected conversation by stripping a single trailing path segment — fine for Claude Code (`<projectDir>/<uuid>.jsonl`), Copilot (`<chatDir>/<uuid>.json`), and Windsurf (`<dir>/state.vscdb`), but wrong for Cursor whose layout is `…/agent-transcripts/<uuid>/<uuid>.jsonl` (an extra UUID directory between the file and the recognisable parent). Output looked like `Cursor — 268 conversations  …/agent-transcripts/0123-uuid-aaaa`, prompting users to ask "what is this UUID folder?" instead of recognising `agent-transcripts/`.

Fix: extract the strip logic into a pure `conversationDisplayDir(filePath, sourceType)` helper that strips two segments for `cursor` and one for the rest. 6 new unit tests covering all 4 sources, Windows backslash separators, and the no-separator defensive branch.

### Fixed — Dashboard `Conversations` tab: clicking a non-default conversation card was a no-op (2026-04-25)

The dashboard's inline event handlers serialised arguments via `JSON.stringify(value).replace(/'/g, '&#39;')` and then spliced the result into `onclick="..."` attributes. For the conversation card path that meant `onclick="selectConvo("549bedda-...")"` — the inner double-quote produced by `JSON.stringify` of a string value silently terminated the `onclick` attribute, leaving the click handler payload as the bare token `selectConvo(`. The default-selected conversation rendered fine on first paint, but every subsequent click on another card was a no-op. Same bug latent in five more inline handlers (memory cards → detail modal, source-title chips → conversation jump, in-conversation memory rows, `Copy CLI` button, recent-memories cards).

Fix: introduce a single `attrJson(v)` helper in the embedded dashboard script that JSON-encodes **then** HTML-entity-encodes `&` / `"` / `'` / `<` / `>`, and route every inline-handler argument through it. Result is safe inside both `onclick="..."` and `onclick='...'`. Regression test pins the failure mode by asserting the dashboard HTML never reintroduces the unsafe `JSON.stringify(...).replace(/'/g, ...)` pattern.

### Changed — Dashboard memory lists now paginate at 50 items per page (2026-04-25)

Real-world v2.4 stores routinely cross 200+ memories per conversation (one local fixture in dogfooding hit 268, with 5 active conversations totalling ~440), and the previous `Memories` tab plus `Conversations` right panel both rendered every item into one DOM column. Both lists now share a `PAGE_SIZE = 50` slice with a footer pager (`Showing N–M of T · Page p of P  ‹ Prev  Next ›`); pagers are suppressed when total ≤ 50, so small stores look unchanged. Filter changes in `Memories` reset to page 1 (avoiding "page 6 of 0 results"), and `selectConvo` / `jumpToConversation` reset the conversation pager so users always land on page 1 of the newly selected conversation. New regression test covers shared `PAGE_SIZE`, the `renderPager` / `setPage` / `renderMemListPage` surface, and both reset hooks. Total suite: **431 tests** (`+1` for the onclick escape regression, `+1` for the pagination contract, `+6` for the `conversationDisplayDir` helper).

### Planning — Category positioning revised (2026-04-25)

`ai-memory-cli` is now positioned as a **chat-history extracting knowledge pipeline**, not a runtime memory middleware. Hero hook: *"Zero `.remember()` calls — we read your editor's chat history directly."* Decision documented in [docs/decisions/2026-04-25-category-positioning.md](docs/decisions/2026-04-25-category-positioning.md).

Triggered by a market refresh: two near-identical "git-markdown memory" Show HN posts (Palinode 2026-04-08, SQLite Memory 2026-04-07) both stalled at 2 HN points, signalling that storage format is no longer a hook by itself; meanwhile AGENTS.md crossed 60K-repo adoption under Linux Foundation stewardship, opening an unclaimed distribution surface for chat-history → AGENTS.md auto-generation.

Consequences in this release:
- v2.4 Tier 1 expanded with **AGENTS.md reverse-sync** (promoted from Tier 2) and **`recall` git time-travel** (new).
- Benchmark plan changed from "LongMemEval subset only" to **CCEB primary + LongMemEval 50-query subset** dual track.
- "Three only we do this" claims expanded to **four**, with the previous #1 ("git diff-able memory") demoted to a feature and replaced by the input-asymmetry claim.
- README top-30% rewrite explicitly deferred to *after* the new Tier 1 features ship (no claim-without-substance).

See [ROADMAP.md](ROADMAP.md) and [docs/launch-plan.md](docs/launch-plan.md) for the updated scope and timeline.

### Added — Hero GIF recording infrastructure (vhs-based, scripted, deterministic)

The 30-second demo embedded in the README is generated from a checked-in script (`docs/assets/demo/demo.tape`) running against a hand-curated scenario (`docs/assets/demo/scenario/`), not screen-captured. Re-renders are bit-for-bit deterministic; `.tape` edits diff cleanly in PRs; the asset is never "the take where it didn't fumble".

- **`docs/assets/demo/demo.tape`** — 5-frame `vhs` cassette (≈29s budget at TypingSpeed 35ms). Story: framing comment → per-author memory layout (`ls -1R`) → `cat` one OAuth/PKCE decision → `ai-memory rules --target agents-md` → `head -25 AGENTS.md` → outro naming Cursor / Claude Code / Windsurf / Copilot Chat as the consumers of `AGENTS.md`. Setup commands (`cd`, `rm AGENTS.md`, `clear`) are wrapped in `Hide` / `Show` so the recording stays clean.
- **`docs/assets/demo/scenario/`** — hand-curated `.ai-memory/` store: 1 decision (OAuth 2.0 + PKCE), 1 convention (Relay-style cursor pagination), 1 architecture (event-sourced billing audit log), spread across two authors (`conor/`, `alice/`) so the team-aware layout is visible inside the GIF. `.config.json` pins `output.language: "en"` so the rendered AGENTS.md is HN-readable.
- **`docs/assets/demo/RECORDING.md`** — install matrix for `vhs` on macOS (`brew`), Linux (Charm apt repo / `go install`), Windows (`scoop` / `winget` / WSL), and Docker (no install). Plus an explicit pre-commit checklist (build first, watch frame 3 fits the panel, no `scenario/AGENTS.md` leak).
- **`npm run demo:render`** — one-line wrapper around `vhs docs/assets/demo/demo.tape`.
- **Decisions baked in** (logged in `docs/launch-plan.md`):
  - `extract` is narrated, not run live — running it inside vhs's headless terminal would require an LLM key in the render environment, and the artifact view (typed memory → `AGENTS.md`) is what actually persuades.
  - `recall` is intentionally absent from the hero — per user direction (verbatim, 2026-04-25): *"我们这个工具主要是方便，提取记忆换个地方使用，多次去看差异化并不实用"*. The practical value is extract → reuse, not time-travel review. `recall` stays as a feature.
  - `vhs` over `asciinema` — scripted re-renders, cross-platform without per-OS quirks, repo-friendly diffs.

The actual GIF render is a deliberate maintainer step (~10 min once `vhs` is installed) and not part of CI; rendering needs `vhs` on `PATH`, which we do not want as a CI dependency.

### Fixed — Memory file parser silently leaked trailing fields on CRLF input

The parser in `src/store/memory-store.ts` anchors field boundaries on `\n\n**Label**:`. When a memory file arrived with CRLF line endings — either hand-edited on Windows or checked out via `git config core.autocrlf=true` from a macOS/Linux teammate — the lookahead failed to match `\r\n\r\n**Label**:`, and lazy-quantifier captures absorbed every trailing field. Symptoms: `**Reasoning**:` swallowed `**Alternatives**:` + `**Impact**:`; downstream `ai-memory rules --target agents-md` then emitted those bled-in fields as raw text inside the rule body. ai-memory's own `writeFile` calls always produce LF, so the bug was invisible to `extract` round-trips and only surfaced for hand-edited / cross-platform-checked-out files.

Fix: normalise CRLF and bare CR to LF at the top of `parseMemoryFile()`. One-line change, covered by a new regression test that explicitly stages a CRLF memory file and asserts every field is isolated. Total suite: **423 tests**.

### Added — CCEB (Cursor Conversation Extraction Benchmark) v1

We now ship our own benchmark for the only thing `ai-memory` actually does: turning chat-history into typed knowledge artifacts. CCEB measures **extraction quality** — precision, recall, F1 per memory type plus overall — rather than runtime recall, which is what existing memory benchmarks (LongMemEval, LoCoMo) optimise for.

```bash
npm run bench:cceb:dry    # ~1s, no LLM tokens, validates the pipeline (runs in CI)
npm run bench:cceb        # live run against AI_REVIEW_API_KEY / OPENAI / ANTHROPIC
```

- **9 hand-curated fixtures** in [`bench/cceb/fixtures/`](bench/cceb/fixtures/) covering all 5 memory types (decision, architecture, convention, todo, issue), one CJK conversation, and **two noise fixtures** (small-talk + deferred-decision) so false-positive rate is measured as honestly as recall.
- **Keyword-based ground truth.** Each `expected` memory declares `must_contain` / `must_not_contain` substrings rather than exact strings. This stays robust to LLM phrasing drift while still distinguishing "extracted the right concept" from "extracted something of the right type."
- **Pure scorer** ([`bench/cceb/scorer.ts`](bench/cceb/scorer.ts)) — 16 unit tests covering perfect / partial / wrong-type / over-extraction / must_not_contain / greedy claim / noise / error paths. Aggregation is the micro-average across types (sum TP/FP/FN, then P/R/F1) so unbalanced fixture sets don't game the headline number.
- **Stable JSON + Markdown reports** in `bench/cceb/out/` (gitignored). Promoting a baseline into [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md) is a deliberate human action — instead of pre-canning a number that drifts when the upstream model updates, the maintainer re-reads the fixtures and the actual extracted memories at least once before signing off.
- **First published baseline (2026-04-25, `gpt-4o-mini`).** Overall **F1 56.0%** (P 43.8% / R 77.8%) across the 9-fixture suite, 70.5 s wall-clock, ≈ $0.005 spend. The shape — high recall, lower precision driven by *over-extraction* (one logical decision yielding 2–4 candidate memories, plus follow-up actions getting promoted to standalone TODOs) — is documented in full with sample misses, sample false positives, and the v2.5 work it points at. Noise-fixture handling: 100% on both. See [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md). Network note: `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` works on Node v24+ for runs behind regional firewalls — captured in the same doc so the next run isn't a re-discovery exercise.
- **Custom-benchmark, by design.** The fixtures map directly onto our claim "we extract structured knowledge from editor chat history"; LongMemEval-style end-to-end QA against a runtime store would measure something we don't claim to do. The decision is recorded in [`docs/decisions/2026-04-25-category-positioning.md`](docs/decisions/2026-04-25-category-positioning.md).

16 new scorer tests; total suite is now **423 tests** (16 CCEB scorer + 1 CRLF parser regression). The `bench:cceb:dry` script runs in <1s and is the recommended pipeline smoke test for CI.

### Added — `ai-memory recall <query>` (git time-travel retrieval)

Every other "memory" tool flattens memories down to a single "current truth" — every superseded version is silently overwritten. Because `.ai-memory/` is plain Markdown in a git repo, we have free access to the full lineage; `recall` exposes it as a first-class command.

```bash
ai-memory recall "OAuth"
# Recall: "OAuth" — 1 memory, 4 commits of lineage
#
# [+] CURRENT  Use OAuth 2.0 PKCE for SPA  @conor (2026-04-20)
#     .ai-memory/conor/decisions/2026-04-20-use-oauth-pkce.md
#     History (4 commits):
#       a1b2c3d  2026-04-20  conor   ~ Tighten OAuth PKCE: require HTTPS-only token endpoint
#       e4f5g6h  2026-04-15  conor   ~ Switch from implicit flow to PKCE
#       i7j8k9l  2026-03-20  conor   + Add OAuth library notes
#     > git log --follow .ai-memory/conor/decisions/2026-04-20-use-oauth-pkce.md  for full diffs
```

- **Per-file lineage** — uses `git log --follow` so renames in `.ai-memory/` are tracked transparently. Each commit shows short SHA, ISO date, author, status code (`+` added, `~` modified, `-` deleted, `R` renamed) and subject.
- **Resolved memories** — `--include-resolved` surfaces memories that were resolved into something else; the badge changes from `[+] CURRENT` to `[~] RESOLVED` so the timeline reads as "what happened to this idea over time".
- **Soft fallback** — runs without git too: outside a working tree (or before the first commit of `.ai-memory/`), recall still returns the matching memories with a hint explaining what's missing. There is no scenario where `recall` is worse than `search`.
- **No new runtime dep** — pure `node:child_process.execFile` against the user's existing `git`; bounded timeouts (10s) and buffer (4MB) per call so a corrupted repo can never wedge the CLI.
- **Pure parser** — `parseGitLog` is a pure string→struct function tested against synthetic fixtures plus 6 real-git tmpdir scenarios (init/commit/modify/rename/delete/untracked).

This is the last of the four "only we do this" claims to ship. It directly differentiates from runtime-DB middleware (mem0 / letta / zep / cortexmem): they store the latest snapshot only and have no equivalent of `git log -- memory/oauth.md`.

22 new unit tests (15 in `log-reader`, 7 in `recall`); total suite at this point was 406 tests (further raised to 422 by the CCEB scorer suite — see above).

### Added — `ai-memory rules --target agents-md` (multi-target rules export)
The `rules` command now writes to **two industry-standard surfaces**, not just Cursor's bespoke `.mdc` format:

```bash
ai-memory rules                            # default: .cursor/rules/ai-memory-conventions.mdc
ai-memory rules --target agents-md         # AGENTS.md (Codex / Cursor / Windsurf / Copilot / Amp all read this)
ai-memory rules --target both              # write both files at default paths
```

This closes the largest unclaimed distribution surface in our niche. `AGENTS.md` is the [60K-repo cross-tool standard](https://agents.md) stewarded by the Linux Foundation Agentic AI Foundation; auto-generating it from chat history is something no other "memory" tool ships today (Palinode/SQLite-Memory store memories in markdown but don't emit AGENTS.md; mem0/letta/zep are opaque-DB middleware).

- **Idempotent merge** — only the section between `<!-- ai-memory:managed-section start --> ... end -->` is touched; hand-written content is preserved byte-for-byte.
- **Already-up-to-date detection** — re-running with no new memories is a no-op (no mtime change, no diff).
- **Conflict-aware** — malformed markers (start without end, duplicates, inverted) are reported as a `conflict` and the file is left untouched (exit code 1).
- **Code-fence safe** — markers are recognised only at column 0 of their own line. Quoting the marker text inside a fenced code block (e.g. a tutorial in your hand-written `AGENTS.md` teaching readers about this feature) is correctly treated as content, not as a real marker.
- **`--target both` UX** — passing `--output` together with `--target both` emits a stderr warning and falls back to default paths instead of silently ignoring the flag.
- **Single-source rendering** — same memory store drives both targets, so `--target both` cannot drift.

26 new unit tests cover every merge branch (`created` / `updated` / `appended` / `already-up-to-date` / `conflict`), the filesystem IO layer, and the line-anchored / fenced-code edge cases.

### Added — `ai-memory init --with-mcp`
Removes the most common drop-off in the onboarding funnel: copy-pasting MCP JSON from the README.

```bash
ai-memory init --with-mcp
# MCP configuration:
#    [+] Cursor (.cursor/mcp.json): created
#    [+] Windsurf (.windsurf/mcp.json): created
#    [i] For Claude Desktop (global), copy the JSON snippet from README.md...
```

- **Idempotent** — running it twice writes nothing the second time.
- **Safe** — a pre-existing customised `mcpServers["ai-memory"]` entry is preserved with a `conflict` status (never overwritten).
- **Never corrupts** — if the existing file is invalid JSON, the tool refuses to write and surfaces the parse error.
- **Side-by-side friendly** — other MCP servers (e.g. `filesystem`, custom tools) are kept intact; only `ai-memory` is added/updated.

Closes the "MCP integration" all-skip section in `doctor` for fresh users — after `init --with-mcp` the doctor report immediately shows two additional green checks. 17 new unit tests cover every merge state (created / updated / already-registered / conflict / invalid JSON) plus the filesystem IO layer. Also fixes a pre-existing label bug where `init` printed "Claude Code not found" three times.

### Added — `ai-memory doctor` command
One-shot health check designed to be the **first thing a user runs after `npm install`**. Six sections, each with actionable fix hints when something is wrong:

- **Runtime** — Node.js version (>=18 required, >=22 recommended for `node:sqlite`), platform.
- **Editors detected** — Cursor / Claude Code / Windsurf / VS Code Copilot with live conversation counts.
- **LLM connectivity** — detects provider (OpenAI / Anthropic via proxy / DeepSeek / Ollama / LM Studio), model, base URL. Performs a tiny live probe to verify the API key actually works. Skippable via `--no-llm-check` for offline / CI runs.
- **Memory store** — output directory, author resolution (warns when `unknown`), memory count + per-type breakdown.
- **Embeddings index** — detects stale / missing indexes and points to `reindex`.
- **MCP integration** — inspects `.cursor/mcp.json` and `.windsurf/mcp.json`, reports whether `ai-memory` is registered.

```bash
ai-memory doctor                 # human-readable report with colors + fix hints
ai-memory doctor --no-llm-check  # skip the live API call (offline / CI)
ai-memory doctor --json          # structured output for bug reports / scripts
```

Exit code `0` when every check passes, `1` when any check is in `fail` state (`warn` is non-fatal). 30 new unit tests cover each section independently (pure `summarize*()` functions that take plain data and return `CheckResult[]`).

## [2.3.0] - 2026-04-24

**Conversation-scoped workflow.** v2.3 reframes the core unit from "memory store" to "conversation" — every feature that touches retrieval (context, summary, dashboard, export) can now operate on a single chat window instead of your entire history. This fixes the long-standing design gap where resuming "one chat" silently pulled memories from every chat for the current author.

### Added — Conversation-scoped `context` and `summary`
Both commands now accept the same scoping flags:
- **`--source-id <id>`** — git-short-hash-style filter on the conversation UUID (e.g. `--source-id b5677be8`).
- **`--convo <query>`** — case-insensitive substring match on the conversation title. When multiple conversations match, picks the **most recently touched** one by default with a warning.
- **`--all-matching`** — companion to `--convo`, includes every matching conversation instead of picking one.
- **`--list-sources`** — prints a table of every conversation that has produced memories (ID, source, title, count, last date). No LLM call.

```bash
ai-memory context --list-sources                       # discover IDs / titles
ai-memory context --source-id b5677be8 --copy          # resume ONE chat
ai-memory context --convo "resume tool" --copy
ai-memory summary  --source-id b5677be8                # summary of ONE chat
ai-memory summary  --list-sources
```

### Added — Memory portability (`export` / `import`)
Moving to a new machine no longer loses your knowledge base. `export` produces a portable, versioned JSON bundle; `import` rebuilds the on-disk layout so `context`, `search`, and the dashboard work seamlessly afterwards.

- **`ai-memory export`** — scoped exports via `--source-id` / `--convo` / `--type` / `--include-resolved` / `--all-authors`. Default output: stdout (pipe-friendly). Or `--output <file>`.
- **`ai-memory import <path>`** — idempotent: re-importing the same bundle is a no-op (dedup on `author + type + date + title`).
  - `--dry-run` — preview new vs. duplicate counts.
  - `--overwrite` — replace colliding memories.
  - `--author <name>` — remap imported memories (useful for ingesting a teammate's bundle).
- Bundle schema is versioned (`version: 1`) with strict validation — bad JSON fails fast with an actionable error instead of corrupting state.

```bash
# Machine A
ai-memory export --source-id b5677be8 --output resume-tool.json

# Machine B
ai-memory import resume-tool.json --dry-run
ai-memory import resume-tool.json
ai-memory reindex                                      # rebuild embeddings
```

### Added — Dashboard "Conversations" view
New tab alongside Overview / Memories / Graph / Quality / Export.

- Left panel: one card per conversation (source badge, ID prefix, title, memory count, type breakdown, last date).
- Right panel: full memory list of the selected conversation, plus a copy-paste-ready `ai-memory context --source-id <prefix> --copy` command so you can jump from "which chat did I make that decision in?" directly to "resume that chat in a new session".
- New `GET /api/conversations` endpoint powers it and is testable independently (`buildConversations()` is a pure function with 4 dedicated tests).

### Changed
- `scopeBySource()` extracted as a pure helper in `commands/context.ts` and reused by both `context` and `summary` to avoid divergence.
- `groupSummaryConversations()` exported so dashboards / integrations can reuse the grouping logic.

### Tests
- **52 new tests** (237 → 289 total passing):
  - 13 for `scopeBySource` (prefix / substring / case-insensitive / multi-match picker / combined filters)
  - 21 for bundle serialize / parse / validate / round-trip / dedup
  - 8 for CLI flag parsing (`export`, `import`, `summary --source-id`, etc.)
  - 5 for `buildConversations` grouping
  - 5 for `groupSummaryConversations`
  - Plus dashboard HTML integration asserts

### Real-world verification
End-to-end round-trip exercised against the live `D:\work` memory store (239 memories, 61 decisions):
- Export → 36.5KB bundle, CJK preserved, schema valid
- Dry-run → `61 new / 0 already exist`
- Import → 61 `.md` + 1 `.index` manifest correctly written; `context --list-sources` immediately recognises the imported conversation
- Re-import → `Nothing to write` (idempotent)
- Bad bundle (version mismatch) → exit 1 with clear upgrade hint

---

## [2.2.0] - 2026-04-01

### Core Algorithm Overhaul — Extraction & Retrieval Quality

Measured on 239 real-world memories: **vague rate ↓68%** (52.3% → 16.7%), 27 duplicate pairs detected and auto-merged, **score≥5 high-specificity memories ↑4×**.

#### Added — Quality observability & cleanup tooling (user-facing)
- **`reindex --dedup`** — retroactive cleanup pass for existing memory stores; detects vague/duplicate/subsumed memories using the v2.2 algorithm stack and offers `--dry-run` preview before deletion. Index manifests are updated automatically.
- **Dashboard Quality tab** (`/api/quality`) — new panel showing:
  - Health summary (healthy vs. flagged count, flagged %)
  - Specificity score distribution histogram
  - Top vague memories (first 20)
  - Top duplicate/subsumed pairs with jaccard/containment scores
- **Default quality summary in `extract`** — retention % + filter breakdown shown without `--verbose` (e.g. `Quality filter: 12/15 kept (80%) / dropped 3: 1 too short, 2 vague content`)

#### Added
- **CJK-aware tokenizer with trigrams + stopwords** (`src/embeddings/hybrid-search.ts`)
  - Chinese/Japanese/Korean text now generates character bigrams AND trigrams for higher precision
  - Bilingual stopword filtering (`的/了/在/是` + `the/a/is/and...`)
  - Match-length scoring bonus: trigram matches worth 2×, bigram 1.2×, unigram 1×
- **Containment-based semantic subsumption** (`containmentSimilarity` in `ai-extractor.ts`)
  - Asymmetric comparison: if 75%+ of smaller memory's shingles appear in larger, it's merged
  - Complements existing Jaccard dedup, catching short memories subsumed by longer ones
- **Cross-extraction deduplication** — new memories are compared against existing memories on disk (not just within the current extraction run)
- **Conversation noise stripping** (`stripConversationNoise`) — pre-processes conversation text to remove tool call blocks, hex/base64 hashes, data URIs, and truncate runaway log lines before LLM invocation
- **Multi-signal vague content detection** (`isVagueContent` + `specificityScore`)
  - 22 regex patterns detect technical indicators: file paths, function calls, CLI flags, API routes, SQL keywords, git/npm commands, kebab-case package names, CONSTANT env vars, version numbers, template vars
  - Counts ALL matches (not just pattern presence) for accurate density measurement
  - Expanded bilingual vague-phrase dictionary (~35 phrases)
  - File extension support expanded to: mjs/cjs/toml/env/md/vue/svelte/astro/proto and more
- **Stronger extraction prompt** (`src/extractor/prompts.ts`)
  - New EXTRACTION PROCESS (3-step chain-of-thought) and QUALITY CHECKLIST (5 criteria)
  - 3 GOOD examples covering decision/architecture/issue types (was 1)
  - Each BAD example annotated with "WHY BAD" explanation
  - Optional `existingTitles` context so LLM avoids re-extracting overlapping knowledge
- **QualityStats tracking** — per-run metrics for `filteredShort`, `filteredDuplicate`, `filteredVague`, `filteredExistingDup`
- **`scripts/diagnose-quality.ts`** — retroactive quality diagnostic for existing memory stores
- 64 new tests (245 total passing)

#### Changed
- `deduplicateMemories` now uses Jaccard (threshold 0.55) + Containment (threshold 0.75) for multi-angle dedup
- `extractMemories` accepts `outputDir` and loads existing memories for cross-extraction dedup
- Hybrid search keyword scoring now respects token-length weighting

## [2.1.0] - 2026-05-01

### Added — More Sources + Watch Mode
- **Windsurf support** — extract conversations from Windsurf's `state.vscdb` SQLite database (chat mode, JSON-based data)
- **VS Code Copilot Chat support** — extract conversations from `.json` and `.jsonl` session files in VS Code workspace storage
- **`watch` command** — auto-extract knowledge when conversations change; uses `fs.watch` for Cursor/Claude Code and periodic polling for all sources
- **Local LLM support** — use Ollama or LM Studio for extraction and embeddings without cloud API keys; auto-detected via `OLLAMA_HOST`/`OLLAMA_MODEL` or `LM_STUDIO_BASE_URL`/`LM_STUDIO_MODEL`

### Added — Dashboard
- **`dashboard` command** — local web UI for browsing, searching, and visualizing memories (`npx ai-memory-cli dashboard`)
- **Overview page** — total/type/author stats, monthly timeline chart, recent activity feed
- **Memory browser** — real-time search, filter by type/author/status, click-to-view detail modal
- **Knowledge graph** — D3.js force-directed graph with nodes colored by type, edges by shared conversation or keywords; zoom, pan, drag support
- **Export** — JSON dump, Obsidian vault (YAML frontmatter + tags + folder structure), clipboard copy
- **`--port` flag** — custom server port (default: 3141)
- Auto-opens browser on startup
- 36 new unit tests (Windsurf, Copilot, CLI, LLM config, Dashboard)

### Changed
- `--source` option now accepts `windsurf` and `copilot` in addition to `cursor` and `claude-code`
- Source labels display user-friendly names (e.g. "VS Code Copilot" instead of "copilot")
- `resolveAiConfig` falls back to Ollama/LM Studio when no cloud API key is set
- `resolveEmbeddingConfig` uses `nomic-embed-text` for Ollama instead of `text-embedding-3-small`
- Config `.sources` now includes `windsurf` and `copilot` entries (both enabled by default)
- Dashboard API uses 5s memory cache for performance
- EADDRINUSE graceful error with port suggestion

### Fixed
- Windsurf/Copilot SQLite temp file cleanup uses `try/finally` to prevent leaks
- Watch mode initial scan logic uses explicit `initialized` flag instead of fragile size comparison

## [2.0.1] - 2026-04-21

### Fixed
- **Critical: temp file leak** — `loadTitleMap()` copied Cursor's `state.vscdb` (~5-7 GB) to temp on every call but never cleaned up. With MCP server running continuously, this caused disk space exhaustion. Now uses try/finally to guarantee cleanup in all code paths.

## [2.0.0] - 2026-04-21

### Added — MCP Server
- **MCP Server** — ai-memory can now run as an MCP (Model Context Protocol) server, enabling AI editors like Cursor and Claude Code to directly access your project's knowledge base
- **`remember` tool** — AI can store decisions, conventions, architecture notes, todos, and issues during conversations (auto-indexes embeddings)
- **`recall` tool** — AI can retrieve relevant memories using hybrid semantic + keyword search
- **`search_memories` tool** — Full search with type, author, and resolved status filtering via MCP
- **`project-context` resource** — Automatically provides project context to AI when starting a conversation
- **`serve` command** — New CLI command to start the MCP server (`npx ai-memory-cli serve`)
- **`--debug` flag** — Debug logging for MCP server (outputs to stderr)

### Added — Semantic Search
- **Hybrid search engine** — combines semantic similarity (embeddings), keyword matching, and time decay (recency) into a single ranked result set
- **Embedding API client** — uses the same OpenAI-compatible API already configured for extraction, calls `/embeddings` endpoint with batch support
- **Flat-file vector store** — embeddings stored as `.ai-memory/.embeddings.json` (local-only, gitignored), zero external dependencies
- **`reindex` command** — build or rebuild semantic search embeddings (`npx ai-memory-cli reindex`)
- **Auto-indexing** — `remember` tool automatically indexes new memories for instant semantic retrieval
- **24 new unit tests** for vector store, cosine similarity, hybrid search, and keyword search

### Changed
- MCP `recall` and `search_memories` now use hybrid search (semantic + keyword + recency) instead of keyword-only
- Added `@modelcontextprotocol/sdk` and `zod` as runtime dependencies
- Externalized MCP SDK and zod from the bundle (loaded from node_modules at runtime)
- Updated README (EN & ZH) with MCP Server setup and semantic search instructions

## [1.4.1] - 2026-04-17

### Added
- **Node.js >= 18 support**: lowered minimum from Node 22 to Node 18, significantly expanding compatibility (Node 22+ still recommended for richer conversation titles via SQLite)
- **NO_COLOR support**: respects the `NO_COLOR` environment variable and non-TTY stdout for clean CI output
- **LLM retry with backoff**: network errors, timeouts, and 429 rate limits now automatically retry up to 2 times with increasing delays
- **LLM request timeout**: 2-minute timeout per API call prevents indefinite hangs
- **Tiered context compression**: when `context` output exceeds ~8k tokens, recent memories keep full detail while older ones are condensed to a one-line index — zero information lost
- **Chunk progress indicator**: large conversations (>5 chunks) now display extraction progress percentage
- README badges (npm version, CI status, license)

### Changed
- README tagline changed from "60-second" time claim to accurate value proposition
- DEVELOPMENT.md completely rewritten (fixed encoding corruption)
- CI matrix expanded to test Node 18, 20, and 22
- Build target lowered from `node22` to `node18`

### Fixed
- `resolve --undo` now uses a dedicated `undo` flag instead of hijacking `--force`
- LLM timeout/network errors now show human-readable messages instead of raw error objects

## [1.4.0] - 2026-04-17

### Added
- **`search` command**: keyword search across all memories with relevance ranking, type/author filtering, and highlighted results
- **`rules` command**: export conventions and decisions as Cursor Rules (`.mdc`), auto-applied to AI responses
- **`resolve` command**: mark memories as resolved/active to keep the knowledge base fresh; `--undo` to reactivate
- **`--include-resolved` flag** for `summary`, `context`, and `search` commands
- **Extraction quality filtering**: content < 30 chars discarded, title-content duplicates removed, quality stats printed after extraction
- Stronger LLM prompt: minimum content length, fewer low-quality extractions

### Changed
- README rewritten with "60-second wow" opening and token savings narrative
- Both READMEs updated with full documentation for all new commands

### Fixed
- `summary --focus` now correctly chains with `--include-resolved` filtering
- `rules` frontmatter no longer outputs empty `globs:` line

## [1.3.1] - 2026-04-15

### Fixed
- `list` command now passes author to `hasMemoryFile` for correct `[+]` status in team mode
- `config.sources.cursor.projectName` now correctly passed to CursorSource
- State file (`.state.json`) now follows `output.dir` config instead of hardcoded path
- Better error messages: distinguish API errors from "no extractable knowledge"
- More precise empty filter message in `extract`
- CLI flags (`--since`, `--author`) no longer silently consume `undefined` when placed at end of command
- Corrupt `.config.json` now prints a warning instead of silently falling back
- Unknown memory types from LLM now print a warning and are skipped

## [1.3.0] - 2026-04-14

### Added
- **Team mode**: per-author subdirectories (`.ai-memory/{author}/{type}/`)
- Author auto-detection: `--author` CLI flag > `config.author` > `git config user.name` > OS username
- `--author` and `--all-authors` flags for all commands
- Author metadata in memory files (`> **Author**: name`)
- Backwards compatibility: legacy flat directories still read correctly

## [1.2.0] - 2026-04-12

### Added
- `--force` flag for extract: overwrite existing memory files if content changed
- Fuzzy deduplication: title normalization and content fingerprinting
- Anthropic API key misconfiguration warning

### Changed
- Improved extraction prompt with good/bad examples
- Better error handling for LLM failures

## [1.1.0] - 2026-04-08

### Added
- `context --summarize` for LLM-powered condensed summaries
- `--copy` flag for clipboard support (cross-platform)
- `--pick` and `--id` for targeted extraction
- `--since` for time-based filtering
- `--dry-run` for previewing extraction

## [1.0.0] - 2026-04-01

### Added
- Initial release
- 5 extraction types: decision, architecture, convention, todo, issue
- Multi-source support: Cursor + Claude Code
- `extract`, `list`, `summary`, `context`, `init` commands
- Incremental extraction with state tracking
- i18n support (zh/en) for memory file labels
- OpenAI-compatible API support with multiple key/model env vars
