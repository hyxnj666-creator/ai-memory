# Changelog

## [2.6.0] — 2026-04-27

### New features

- **`ai-memory link`** — scan recent git commits and auto-link them to the memories they implement. Uses weighted Jaccard scoring (`title×3 + type×2 + content×1` vs `subject×3 + paths×2 + body×1`) with a three-band threshold model (auto-link ≥0.70 / suggest 0.40–0.70 / drop <0.40). Links stored as `<!--links\n{JSON}\n-->` comment blocks in memory files (Markdown-invisible, no YAML dep, idempotent). `--dry-run` / `--clear-auto` / `--since` / `--auto-threshold` flags. Dashboard graph shows "implementation" edges between co-implementing memories. Full design in `docs/memory-commit-linking-spike-2026-04-27.md`.

- **`ai-memory init --schedule`** — register a daily `extract --incremental` job with the OS-native scheduler. macOS → `~/Library/LaunchAgents/com.ai-memory-cli.extract.<slug>.plist` (launchd); Linux → user crontab (marker-comment idempotent); Windows → `schtasks` Task Scheduler. Runs at 09:00 local time. Remove with `--unschedule`. Cross-platform, no new runtime deps.

- **Post-extraction dedup improvements** — two passes that jointly target F1 64.1% → 75%+:
  1. **Single-chunk dedup fix**: single-LLM-call extractions (the common case) now go through `deduplicateMemories` — previously only multi-chunk runs were deduped.
  2. **Cross-type TODO subsumption**: if a TODO's shingles are ≥75% contained within a same-extraction decision/architecture/convention, it is a sub-step of that larger memory and is dropped. New `filteredSubsumed` counter in `QualityStats` and extract summary.

- **Dashboard graph enhancements** — on top of the existing D3.js force-directed graph: edge type differentiation (indigo solid = same conversation / gray dashed = shared keyword / green arrow = co-implementing memories); type filter toggle buttons; hover highlight (dims non-neighbors); stats bar (node count, edge count, edge-type breakdown); connection count in tooltip.

### Test suite: **585** (+4 `parseBulkLog` pure-function tests)

---

## [2.5.0] — 2026-04-27

### Status — 2026-04-27 close-out + v2.5-08 baselines live

**Agent-side work for v2.5 is complete; v2.5-08 baselines are now live.** Items 01 / 02 / 04 / 05 / 06 / 08 / 09 / 10 are shipped and merged; items 03 / 07 have all preparation in tree (spec docs, fixtures, scripts, runbooks, drift guards). Three maintainer-only tasks remain — v2.4 GIF render + v2.5-07 eval run + v2.5-03 marketplace submissions — each gated on resources the agent can't access (POSIX shell with `vhs`, local Cursor / Claude Code CLI, npm publish credentials, marketplace accounts).

Single-page execution guide: [`docs/v2.5-maintainer-handoff.md`](docs/v2.5-maintainer-handoff.md). It lists each remaining task with prerequisites, verbatim commands, expected wall-clock + dollar cost, and the exact downstream surfaces to update on completion. The publish sequence is `GIF (any time) → v2.5-07 eval → npm publish 2.5.0 → v2.5-03 submissions`.

**v2.5-08 baselines published live (2026-04-27, `gpt-4o-mini`):**

- **CCEB v1.1 (30 fixtures):** **F1 64.1%** (P 56.8% / R 73.5%), 239.7 s, ≈ \$0.02. Per-type: `decision` 78.3 / `architecture` 72.7 / `convention` 63.2 / `todo` 31.6 / `issue` 100. The 12.1-pp drop vs the 9-fixture v1.0 row (F1 76.2%) is fixture-distribution change, not a regression — running v1.0 alone against the same prompt still scores 76%.
- **LongMemEval-50:** **0 / 50 full + 2 / 50 partial** evidence-preserved on the literal-token rubric, 743.7 s, ≈ \$0.40. Strict by design; per-question matched/total counts in the [baseline doc](docs/benchmarks/cceb-baseline.md#longmemeval-50--gpt-4o-mini--2026-04-27-v25-08-evidence-preservation-rubric) show real partial signal on `single-session-preference`.

**Two re-spike findings during the live LongMemEval run** (full write-up at [`docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md`](docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md) §7.1):

1. Upstream `answer` field is `string | number` (~6% of LongMemEval-S-cleaned samples are short integer counts); adapter's type signature widened, loader filters non-string answers via `isNonStringAnswer`.
2. Short numeric-string answers like `"$12"` / `"20%"` clean down to zero key tokens and would silently inflate the headline via the empty-token divide-by-zero guard; loader filters via `hasZeroKeyTokens` so the rubric never sees them in production. The first complete run before this fix reported "9/50 full" — every one with `0/0` matched/total tokens. Both filters pinned by regression tests in `bench/longmemeval/__tests__/selection.test.ts`.

Headlines propagated: [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md) (CCEB v1.1 section + new LongMemEval-50 section + honesty notes update), [README.md](README.md) "We measure ourselves" block + Chinese mirror, [`docs/competitive-landscape.md`](docs/competitive-landscape.md) (Benchmarks dual-track row + LongMemEval rubric-comparison footer).

Test suite as of close-out: **581** (was 578; +3 new in `bench/longmemeval/__tests__/`). `npm run typecheck`, `npm test`, `npm run bench:cceb` (live), `npm run bench:longmemeval` (live) all green.

### Planned — quality lift + Anthropic Skills + distribution (2026-04-26)

Scope locked in [`docs/decisions/2026-04-26-post-v2.4-strategy.md`](docs/decisions/2026-04-26-post-v2.4-strategy.md). Ten items stack-ranked by edge-per-day toward the 1000★ target; full breakdown in [ROADMAP.md](ROADMAP.md) §"v2.5 — Quality lift + Skills + distribution".

- **Must ship (week 1, publish as `2.5.0`):**
  - **v2.5-01** ✅ shipped 2026-04-26 — extraction prompt rewrite landed CCEB F1 56.0% → 76.2% on `gpt-4o-mini` (P 43.8% → 66.7%, R 77.8% → 88.9%), both KPI floors cleared with margin. Full breakdown in the "Shipped in development" subsection below and in [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md).
  - **v2.5-02** ✅ shipped 2026-04-26 — `ai-memory try`: no-API-key demo mode that bootstraps a tmp dir from the bundled `docs/assets/demo/scenario/` 3-memory store and prints the generated AGENTS.md inline. Tarball gained `docs/assets/demo/scenario/**` (4 files / +11.8 kB). Full breakdown in the "Shipped in development — v2.5-02" subsection below.
  - **v2.5-03** ✅ prep 2026-04-26, **awaiting external submission** — Copy-paste-ready packet at [`docs/v2.5-03-submission-packet.md`](docs/v2.5-03-submission-packet.md) covering: 6 new GitHub Topics (overlap-checked against the 8 existing), 3 MCP marketplace listings (mcp.so / glama / cursor.directory), AGENTS.md spec PR draft, 4 awesome-list entries, and a standard-content library for voice consistency. `package.json` metadata tightened in the same round (keywords +`cursor-rules` +`codex`; `repository.url` canonicalised to `git+https://...git`). Submission gated on publishing v2.5.0 first.
- **Strongly recommended (weeks 2-3):**
  - **v2.5-04** ✅ shipped 2026-04-26 — `rules --target skills`: writes Anthropic Skills under `.claude/skills/ai-memory-*\/SKILL.md` (one skill per long-lived memory type — convention / decision / architecture). Spike-first per ADR: schema frozen against the official Anthropic docs in [`docs/skills-schema-snapshot-2026-04-26.md`](docs/skills-schema-snapshot-2026-04-26.md). 23 new skills-writer unit tests + 2 CLI parse tests + 1 CRLF regression from the same-day audit pass; total **465**. Full breakdown in the "Shipped in development — v2.5-04" subsection below.
  - **v2.5-05** ✅ shipped 2026-04-26 — `--redact` flag for PII / secrets / internal URLs at the LLM-call boundary (extract / summary / context --summarize). Spike-first per ADR: threat model + 10 default-on rule list + 2 opt-in rules + opt-in-default decision frozen in [`docs/redaction-policy-2026-04-26.md`](docs/redaction-policy-2026-04-26.md) BEFORE any code in `src/extractor/redact.ts` landed. Same-day audit closed a `--json` shape ambiguity (zero-hits-with-redaction-on was indistinguishable from "redaction off") + two stale "9 default" prose refs in the spike doc. 53 new redact unit tests + 4 CLI parse tests; total **522**. Full breakdown in the "Shipped in development — v2.5-05" subsection below.
  - **v2.5-06** ✅ shipped 2026-04-26 + same-day audit pass — OpenAI Codex CLI as the 5th editor source. `doctor` now lists `Codex CLI`, `extract` consumes `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` files identically to other adapters. Spike-first per ADR: per-line JSONL schema traced through OpenAI's `openai/codex` Rust source and frozen in [`docs/codex-session-snapshot-2026-04-26.md`](docs/codex-session-snapshot-2026-04-26.md) BEFORE any adapter code landed — caught two ROADMAP assumptions that turned out wrong (sessions are date-partitioned, not flat; per-line schema is a doubly-tagged union not a single-level shape). Same-day audit closed 4 issues: bundle-import whitelist missed `codex` (silent cross-machine breakage), `watch` never fs.watch'd codex sessions (~30s latency regression), `AiMemoryConfig.sources.codex` field missing (no opt-out config surface), and 6 active marketing surfaces still said "4 editors". 24 Codex unit tests + 2 doctor-display + 8 audit-fix tests; total **556**. Full breakdown in the "Shipped in development — v2.5-06" + "Same-day audit fixes — v2.5-06" subsections below.
  - **v2.5-07** ⏳ prep complete 2026-04-27, awaiting maintainer execution — AGENTS.md downstream evaluation (do generated rules actually steer agents?). Methodology, fixtures, scoring rubric, drift guard, and publish-ready report template are all committed; spike-first per ADR §v2.5-07 froze the experiment design before any number is published. Spike doc [`docs/agents-md-eval-spike-2026-04-27.md`](docs/agents-md-eval-spike-2026-04-27.md), fixture pack [`bench/agents-md-eval/`](bench/agents-md-eval/) (10 micro-tasks × 2 editors × literal-pattern obs = 50 scoring rows), `verify-agents-md.ts` drift guard, results template [`docs/agents-md-eval-results.md`](docs/agents-md-eval-results.md). Same status discipline as v2.5-03 — packet ready, ship-day step pending; ROADMAP item stays `[ ]` until maintainer publishes the headline `X / 50` number. **Spike-first finding worth surfacing**: the AGENTS.md writer emits only `convention + decision` (not `architecture`), so the bundled v2.5-02 demo scenario's 3 memories produce 2 rules, not 3 — a naïve "one rule per bundled memory" 10-task plan would have measured compliance against a rule the agent never saw. Locked task split is 5 PKCE + 4 cursor-pagination + 1 cross-rule = 10 tasks / 25 obs/editor / 50 total. Whether architecture-type memories should surface in AGENTS.md is logged as a v2.6 candidate, out of scope here. Total test suite remains **556** (no production code paths touched; verify-agents-md script imports from existing `src/commands/try.ts` helpers).
- **Exploratory (weeks 3-4):**
  - **v2.5-08** ✅ shipped 2026-04-27 — CCEB v1.1 (9 → 30 fixtures) + LongMemEval-50 adapter (apples-to-apples shield against runtime memory benchmarks), with both baselines run live. Spike doc [`docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md`](docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md) locks the fixture roster + 50-question selection strategy + scoring rubric ("X / 50 answer-supporting evidence preserved", **NOT** native QA-correctness — proxy made loud per spike §4.3) + publication template + 5 re-spike triggers + 2 re-spike outcomes recorded mid-run. **21 new CCEB fixtures** at `bench/cceb/fixtures/cceb-010-postgres-vs-mysql.json` through `cceb-030-mixed-cjk-english-architecture.json` (type breakdown decision 9 / architecture 7 / convention 10 / todo 4 / issue 3 / noise 3 — 12 → 36 expected memories). **LongMemEval-50 adapter** at [`bench/longmemeval/`](bench/longmemeval/): `loader.ts` + `adapter.ts` (pure: haystack→ConversationTurn[]; answer→key tokens; substring scoring rubric), `runner.ts` glue, `run.ts` CLI, `select-questions.ts` deterministic-by-id bootstrap with `--force` overwrite guard, `expected-distribution.json` per-type pin (10+10+8+8+7+7=50, abstention skipped), runbook `bench/longmemeval/README.md`, 25 new pure-function tests pinning rubric + selection rule + two filter outcomes. Total test suite **556 → 581** (+25). **Headline numbers (`gpt-4o-mini`, 2026-04-27):** CCEB v1.1 **F1 64.1%** (P 56.8% / R 73.5%, 239.7 s, ≈ \$0.02); LongMemEval-50 **0 / 50 full + 2 / 50 partial** (743.7 s, ≈ \$0.40). **Honest correction baked in (spike-time):** original spike draft predicted convention `+5` and architecture `+4`; actual is `+8` and `+5` because three multi-memory fixtures (cceb-017 Kafka, cceb-018 OTel, cceb-030 mixed-CJK Typesense) each contribute a convention plus an architecture, and cceb-026 contributes a decision plus a TODO — fix logged in spike doc §3.3 (same spike-first discipline as v2.5-07's architecture-filter finding). **Two upstream-data re-spike findings caught mid-run** (spike doc §7.1): (1) `answer` is `string | number` — ~6% of samples are integer counts for "how many X happened" framings; loader filters via `isNonStringAnswer`; (2) short numeric-string answers like `"$12"` / `"20%"` clean down to zero key tokens and silently inflated the first complete run's headline to "9/50 full" via the empty-token divide-by-zero guard (every "full" hit was 0/0 matched); loader filters via `hasZeroKeyTokens`. Both pinned by regression tests; manifest regenerated, distribution still 10/10/8/8/7/7. **Numbers propagated** to [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md), [README.md](README.md) + [README.zh-CN.md](README.zh-CN.md) "We measure ourselves" block, and [`docs/competitive-landscape.md`](docs/competitive-landscape.md) Benchmarks dual-track row + LongMemEval rubric-comparison footer.
  - **v2.5-09** ✅ shipped 2026-04-27 — README FAQ "Doesn't 1M-token context obsolete you?". Pre-empts the most-cited HN objection to any structured-memory tool. Spike-first per ADR: claims + sources + placement + length cap + 4 re-spike triggers locked in [`docs/1m-context-faq-spike-2026-04-27.md`](docs/1m-context-faq-spike-2026-04-27.md) before copy was written. Three defensible claims chosen over four (cost compounds; long-context retrieval still degrades on non-headline info past ~128–256K; long context is per-machine while `AGENTS.md` is per-repo). Cut from copy: prompt-cache friendliness — right but adds a fourth bullet that needs background, parked in spike §3.4 as fallback. README.md + README.zh-CN.md mirrored; cross-reference in `docs/competitive-landscape.md` §"What recent HN launches teach us" item 5 (one back-link, no duplicated argument). No new tests (pure docs change); test suite remains **578**. Full breakdown in the "Shipped in development — v2.5-09" subsection below.
  - **v2.5-10** ✅ spike shipped 2026-04-27 / feature deferred to v2.6 — Memory ↔ commit / file-path linking. Spike-first per ADR (seventh consecutive application). Spike doc [`docs/memory-commit-linking-spike-2026-04-27.md`](docs/memory-commit-linking-spike-2026-04-27.md) locks: similarity-scoring stack (substring default + embedding opt-in + LLM rejected), three-band threshold UX (auto / suggest / drop), `links.implementations[]` schema with auto-vs-manual provenance and idempotent `first_linked`, `ai-memory link` command surface, `recall` / dashboard / `summary` integration points, v2.6 implementation plan broken into 10 ≤1-day chunks (~6 dev days incl. budgeted audit pass + ground-truth corpus), 5 re-spike triggers, 6 known-unknowns. **Honest assessment baked in (§10):** no competitor in any of the three buckets can structurally copy this — substrate-level moat. v2.6 ROADMAP flagship. Pure docs deliverable; no code in `src/`; test suite remains **578**. Full breakdown in the "Shipped in development — v2.5-10" subsection below.

Cadence target 3-4 weeks. Descope rule: if v2.5-01 slips past week 1, v2.5-04 drops to v2.6. If 30-day post-v2.4-launch metrics fall below [`docs/launch-plan.md`](docs/launch-plan.md) "Success metrics" floors, scope freezes and we re-prioritise from real user feedback.

### Shipped in development — v2.5-01 — extraction prompt rewrite (CCEB F1 56.0% → 76.2%) (2026-04-26)

Headline: **CCEB F1 56.0% → 76.2% (+20.2 pp)** on `gpt-4o-mini`, with **precision 43.8% → 66.7% (+22.9 pp)** and **recall 77.8% → 88.9% (+11.1 pp)**. Both v2.5-01 KPI floors (P ≥60%, F1 ≥65%, recall ≥75%) cleared with margin. Full per-type breakdown, methodology, and remaining-work list in [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md).

Three additions to `src/extractor/prompts.ts:buildExtractionPrompt`, each targeting a v2.4 false-positive pattern:

- **`ONE-MEMORY-PER-DECISION RULE`** — explicit anti-splitting instruction with four `✗` examples taken directly from the v2.4 false-positive set (Lua-script audit attached to a Redis Cluster TODO; `REVOKE UPDATE/DELETE` attached to event-sourcing architecture; nightly integrity-check job; `client_id` deprecation attached to PKCE). Caps a single chunk at 0–3 memories unless the conversation literally enumerates 4+ separable items, which preserves the legitimate 3-memory case in `cceb-006-multi-memory`.
- **Tightened `todo` type definition** — three required gates: explicit commitment language ("let's track this", "TODO:", "我们会", "下周开 PR"), clear scope + done-criteria, and an owner OR deadline OR blocking event. With four `✗` reject examples for "implementation gotcha mentioned in passing" and "incidental aside" patterns. The v2.4 TODO precision was 20% (1 TP / 4 FPs); v2.5-01 is 33.3% (1 TP / 2 FPs).
- **`TYPE BOUNDARY CASES` block** — disambiguates Convention vs Decision (a forward-looking *rule* → convention, even if decided once), Architecture vs Decision (system *structure* → architecture, one-of-N *choice* → decision), and Issue vs TODO (a fix-deploy is *impact* of the issue, not a separate TODO). Closed the v2.4 architecture FN and issue FP, lifting both type rows to perfect 100% F1.

`bench/cceb/run.ts:detectModel` was also fixed in the same round — it now mirrors the fallback chain in `extractor/llm.ts:resolveAiConfig` instead of returning `"openai (default)"`, so the scorecard label matches the model that actually ran (the v2.4 doc tracked this as a known cosmetic artefact).

Per-fixture v2.5-01 results (the v2.4 per-fixture scorecard was not preserved on disk — the live `scorecard.json` was overwritten by a subsequent dry-run between v2.4 and v2.5-01, so the v2.4 baseline doc only retains the per-type aggregates and the cceb-003 callout):

| Fixture | v2.5-01 (extracted / TP / FP / FN) | Change vs v2.4 (where determinable) |
|---|---|---|
| `cceb-001-oauth-pkce` (decision) | 1 / 1 / 0 / 0 — **perfect** | v2.4 commentary listed `001` among the smaller-magnitude over-extraction cases; that excess is gone here. |
| `cceb-002-graphql-pagination` (convention) | 0 / 0 / 0 / 1 | v2.4 emitted this convention as a decision (the convention recall miss called out in the v2.4 doc); that type-mis-classification FP is gone. The convention recall miss itself is unchanged — fix-candidate tracked below. |
| `cceb-003-event-sourcing` (architecture) | 3 / 1 / 2 / 0 | extracted-count 4 → 3. The v2.4 doc explicitly recorded this fixture as `1 expected → 4 extracted` (1 architecture + 1 decision + 2 todos); v2.5-01 cuts one of the spurious items. Still the largest single source of FPs in the suite. |
| `cceb-004-rate-limit-bug` (issue) | 1 / 1 / 0 / 0 — **perfect** | v2.4 issue row was 1 TP / 1 FP; the FP is gone. |
| `cceb-005-todo-redis-cluster` (todo) | 2 / 1 / 1 / 0 | v2.4 todo row was 1 TP / 4 FPs across the suite; v2.5-01 todo row is 1 TP / 2 FPs. The "audit your Lua scripts before flipping the switch" gotcha-as-TODO pattern was the documented v2.4 failure here. |
| `cceb-006-multi-memory` (3 expected) | 3 / 3 / 0 / 0 — **perfect** | Unchanged from v2.4 (already perfect there). Confirms the new "0–3 unless explicitly enumerated" cap does not break the legitimate multi-memory case. |
| `cceb-007-cjk-decision` (decision) | 2 / 1 / 1 / 0 | v2.4 commentary listed `007` (CJK) among the smaller-magnitude over-extraction cases; one of the spurious items is gone, one remains (the "更新 CI 和 lockfile" sub-step still gets emitted as its own TODO). |
| `cceb-008-noise-chitchat` (0 expected) | 0 / 0 / 0 / 0 — **perfect** | Unchanged from v2.4. Noise rejection is preserved despite the more aggressive "merge sub-claims" instruction — i.e. the new prompt does not accidentally hallucinate to fill the implicit "find me 1–3 memories" expectation. |
| `cceb-009-noise-unresolved` (0 expected) | 0 / 0 / 0 / 0 — **perfect** | Unchanged from v2.4. Deferred-decision rejection still works. |

Wall-clock dropped from 70.5 s to 47.9 s (~33% faster) because over-extracting fixtures now emit fewer items, even though the prompt itself grew by ~1.6K tokens.

Four FPs and one FN remain. All four FPs are smaller-magnitude versions of the over-extraction pattern (sub-claim emitted alongside parent), pointing at the next lever: a post-extract pairwise dedup inside a single fixture, currently only invoked on multi-chunk extractions. The remaining FN (`cceb-002` convention) is the model under-classifying "every X must Y" as a decision after a multi-option discussion — fix candidate is one more `TYPE BOUNDARY CASES` example pinning that exact wording. Both tracked for the next v2.5 iteration.

431 tests still pass; no test or pipeline changes were needed because the prompt body is checked by string-membership tests that are robust to body rewrites.

### Shipped in development — v2.5-02 — `ai-memory try` no-API-key demo mode (2026-04-26)

Closes the largest avoidable conversion leak in the funnel: today's first-run path requires `OPENAI_API_KEY` before the user sees any output, so every visitor who lands on the npm page without API credentials handy bounces. `npx ai-memory-cli try` now produces a finished AGENTS.md in <2 seconds with zero credentials.

```bash
$ npx ai-memory-cli try

ai-memory -- AI conversation knowledge extractor

[try] Bootstrapping a 3-memory demo store in /tmp/ai-memory-try-RgjlD2
      1 decision · 1 convention · 1 architecture (across 2 authors: alice, conor)

[try] Generated AGENTS.md (read by Codex / Cursor / Windsurf / Copilot / Amp at session start)
──────────────────────────────────────────────────────────────────────
# AGENTS.md
... (full generated file, 2 entries: 1 convention + 1 decision)
──────────────────────────────────────────────────────────────────────

[+] No API key was needed — this output came entirely from the bundled demo scenario.
    To get the same output from your real editor chat history:

      export OPENAI_API_KEY=sk-...
      npx ai-memory-cli init --with-mcp
      npx ai-memory-cli extract
      npx ai-memory-cli rules --target agents-md

[~] Tmp dir cleaned up. Use `ai-memory try --keep` to inspect the bundled scenario in place.
```

Implementation choices worth flagging:

- **Reuses the `writeAgentsMd` production path, not a parallel renderer.** What the user sees in `try` is byte-identical to what `rules --target agents-md` would produce against the same memories — when the prompt or rules-writer is updated, the demo updates with it. New helpers in `src/commands/try.ts` are: `findBundledScenario` (path-resolves both built and dev layouts), `bootstrapTryStore` (`fs.cp` into `os.tmpdir()`), `generateAgentsMdFromStore` (read → filter → `writeAgentsMd` → readback). `runTry` is the user-facing entry point; the three helpers are individually unit-tested.
- **Bundles the scenario via `package.json` `files`.** Added `docs/assets/demo/scenario` to the `files` array. `npm pack --dry-run` confirms the dotfile `.config.json` and the `.ai-memory/` dotdir are both included (a known npm-packaging trap with hidden paths). Tarball: 240.8 kB → 252.6 kB (+11.8 kB / +4 entries).
- **Does not touch the user's working directory.** The point of `try` is "see what ai-memory does" without commitment — writing AGENTS.md into the user's cwd would be an undeclared side effect, so everything happens in tmp and gets cleaned up. `--keep` opts in to leaving the tmp dir behind for inspection.
- **`--json` mode emits a single-line structured payload** with per-type counts, authors, and the full AGENTS.md content. Useful for CI / health-check integrations and lets `doctor`-style tooling hand off to `try` later without re-rendering.
- **`try` doesn't depend on `loadConfig` or the user's cwd.** Reusing `runRules` would have required `process.chdir()` into the tmp dir, which is brittle in async flows. `try` calls `readAllMemories` and `writeAgentsMd` directly with explicit paths — no process state mutation.

8 new unit tests covering: locator (dev layout, missing path, malformed URL defensive return), bootstrapper (dotfile copy + multi-author preservation), generator (architecture filtered out, both expected titles present, AGENTS.md markers preserved), end-to-end `runTry` (default cleanup, `--keep` retention, repeated invocations get distinct tmp dirs). Total suite: **439 tests** (`+8`).

Built `dist/index.js` smoke-tested end-to-end: `node dist/index.js try --json` resolves the bundled scenario via `../docs/assets/demo/scenario` (the built layout), runs the demo, and cleans up — confirming the runtime path resolution and the npm packaging both hold.

### Shipped in development — v2.5-04 — `rules --target skills`: Anthropic Skills output (2026-04-26)

Adds Anthropic Skills as a third `rules` target alongside `cursor-rules` and `agents-md`. Skills sit complementary to AGENTS.md as Claude Code's emerging cross-tool agent-instruction layer — loaded **dynamically** by description matching rather than always-on. As of the strategy ADR, no project in any of our three competitive buckets emits Skills from chat history; v2.5-04 claims the unclaimed surface.

```bash
$ npx ai-memory-cli rules --target skills

[+] Anthropic Skills written -> .claude/skills
    + ai-memory-coding-conventions (1 memory)
    + ai-memory-decision-log (1 memory)
    + ai-memory-system-architecture (1 memory)
   1 conventions + 1 decisions

   Claude Code will auto-load these skills when their description matches your request.
```

**Spike-first per ADR.** The Anthropic Skills spec moved twice in 2026-Q1; rather than write code against a moving target we landed [`docs/skills-schema-snapshot-2026-04-26.md`](docs/skills-schema-snapshot-2026-04-26.md) before any implementation, capturing: (a) the canonical sources we consulted (`docs.anthropic.com/en/docs/claude-code/skills` + the API docs are authoritative; community docs were cross-checked and one — claiming description ≤ 200 chars — was confirmed wrong against the official 1,536-char combined-cap rule), (b) which fields we set vs skip and why, (c) memory→skills mapping rationale, (d) re-spike triggers for when the spec changes again. The snapshot is dated and append-only — when the schema next moves, we add a `skills-schema-snapshot-<new-date>.md` rather than overwriting.

**Memory → Skills mapping (v0).** Three skills, one per long-lived memory type:

| Skill | Source memory type | What goes in `description` (trigger signal) |
|---|---|---|
| `ai-memory-coding-conventions` | `convention` | "Project coding conventions… Load when writing new code, naming things, designing APIs… Topics: <comma-separated convention titles, elided with `…` when over 300 chars>" |
| `ai-memory-decision-log` | `decision` (status ≠ resolved) | "Technical decisions… Load when proposing architectural changes…" |
| `ai-memory-system-architecture` | `architecture` | "System architecture facts: components, data flow, integration boundaries…" |

`todo` and `issue` types are deliberately excluded — encoding a half-resolved TODO as an auto-loaded skill risks teaching Claude to "follow" something that's already done. They stay accessible via `recall` / `search` / `list`, just not as Skills.

Implementation choices worth flagging:

- **`ai-memory-` prefix on skill names is the ownership signal.** Anything inside `.claude/skills/ai-memory-*/SKILL.md` is fully regenerated each run; user-authored skills under any other directory name are left untouched. A dedicated test (`does not touch unrelated .claude/skills/* directories outside the ai-memory- namespace`) pins this contract — pre-existing user skills survive `rules --target skills` byte-for-byte.
- **Description budget: ≤ 300 chars per skill** (well under the documented 1,536-char combined `description + when_to_use` cap). The renderer front-loads the prefix + when-context, then appends a Topics list of memory titles, eliding with `…` when adding the next title would overflow. A dedicated edge case (`hard-truncates a single overlong title with an ellipsis when even one won't fit`) covers the pathological case where a single title exceeds the cap.
- **YAML scalar quoting is conservative.** The description gets emitted as a quoted scalar when the content contains `: ` (would parse as a YAML map), starts with a reserved indicator, contains `#` (line comment), or has embedded quotes. Most real descriptions parse fine unquoted, but the Topics-list separator `, ` combined with our memory titles regularly produces `: ` pairs (e.g. `Topics: Adopt OAuth…`), so the quote path is exercised in practice — confirmed in the smoke test.
- **`--target both` semantics deliberately unchanged from v2.4.** "both" remains `cursor-rules + agents-md`. Users who want the third format opt in via `--target skills` explicitly. Widening "both" would have silently changed v2.4 behaviour for existing users.
- **`process.chdir` not used; cwd-coupling stays in `loadConfig` only.** The skills writer takes an explicit `outputDir` parameter; `runRules` passes either the default `.claude/skills` or `--output`'s value. Tests use a tmpdir per case, no cwd switching.

23 new unit tests in `src/__tests__/skills-writer.test.ts` covering: description-cap edge cases (5 — prefix-only / topic-list / cap-with-elision / single-overlong-title hard-truncate / Chinese localisation), `buildSkillContent` rendering (6 — frontmatter shape / human-edit warning / rejected alternatives / idempotency / CRLF normalisation / YAML quoting trigger), `writeSkills` filesystem behaviour (8 — per-type filtering / resolved-decision exclusion / todo+issue never appear / second-run already-up-to-date / second-run with edits → updated / cross-namespace isolation / deep-output mkdir / total counts), and catalogue invariants (4 — exactly 3 entries / `ai-memory-` prefix on every name / valid kebab-case ≤ 64 chars / discovery path matches Anthropic spec). Plus 2 new CLI parse tests for `--target skills`.

Built `dist/index.js` smoke-tested end-to-end against the v2.5-02 demo store: `cd <tmp> && node dist/index.js rules --target skills --all-authors --json` produces 3 valid SKILL.md files (1.2 / 1.4 / 1.5 KB), YAML frontmatter parses, descriptions are correctly auto-quoted when content contains `: ` (Topics colon trigger), all bodies contain expected memory content + Why / Rejected sections.

Estimated 2-3 dev days in the ADR; actual work was ~3-4 hours including the spike, implementation, tests, smoke-test, and documentation sync. The estimate held room for spec instability that didn't materialise this round.

**v2.5-04 audit pass (same-day, 2026-04-26).** Two issues caught while reviewing the implementation against the strategy doc, fixed before v2.5-05 starts:

1. **Top-level `--json` output undercounted memories for `--target skills`.** The `rules` / `conventions` / `decisions` counts are filtered through the v2.4 rules-pipeline subset (convention + active-decision), which silently excludes architecture memories. When `--target skills` ran against the demo store the response showed `rules: 2, conventions: 1, decisions: 1` even though the skills writer correctly produced an `ai-memory-system-architecture` skill from the third memory. Consumers reading the top-level counts would be misled about what actually got written. Fix: added an `architecture` field at the top level of the `--json` payload, populated only when a `skills` target ran (still emitted as `0` for other targets so the schema stays stable for tooling). After fix the demo-store JSON reads `rules: 2, conventions: 1, decisions: 1, architecture: 1` — `conv + dec + arch = 3` matches the per-skill `memories` totals exactly.
2. **CRLF normalisation gap inside `renderEntry`.** The body renderer normalised `m.content` to LF (so byte-identical idempotency would survive a Windows-edited memory) but left `m.reasoning` and `m.alternatives` untouched. A `Why:` or `Rejected:` line authored on Windows would therefore produce a spurious diff against the on-disk SKILL.md on every regen, defeating the `already-up-to-date` short-circuit. Fix: extracted a local `normalise(s)` helper and applied it to all three free-text fields. New regression test (`normalises CRLF in 'reasoning' and 'alternatives' too (idempotency parity)`) pins the contract.

Final test count after the audit: **465 tests** (`+26` vs v2.5-02 baseline of 439 — 23 skills-writer + 2 CLI parse + 1 CRLF regression). Architecture-count fix is verified via smoke-test against the built `dist/index.js`; the broader gap of "no runRules-level integration tests" is logged as future work — v2.5-04 didn't add them either, none currently exist for the `rules` command.

### Shipped in development — v2.5-05 — `--redact` flag for outbound LLM calls (2026-04-26)

Closes the privacy / compliance gap that "local-first" doesn't actually cover. `ai-memory extract`, `ai-memory summary`, and `ai-memory context --summarize` send conversation excerpts to a configured LLM provider (OpenAI by default). Up to v2.4, the conversation went out unscrubbed — including any API keys, internal hostnames, customer emails, or JWT debug-pastes that happened to be in the chat. v2.5-05 adds an opt-in scrubber with a locked default rule set, a transparent audit trail, and zero behavioural change for users who don't pass the flag.

```bash
$ ai-memory extract --redact
   ...
Redaction: 5 items scrubbed before LLM (118 chars) — 3 openai-key, 2 email
```

```bash
$ ai-memory extract --redact --json | jq .redactions
[{ "rule": "openai-key", "count": 3 }, { "rule": "email", "count": 2 }]
```

**Spike-first discipline (same as v2.5-04).** [`docs/redaction-policy-2026-04-26.md`](docs/redaction-policy-2026-04-26.md) was written *before* a single line of `src/extractor/redact.ts` landed. The policy doc IS the spec — locks down the threat model (defense-in-depth, **not** a substitute for proper secret management), the 10 default-on rules + 2 opt-in rules, the opt-in-by-default decision (flipping default ON in a minor would silently change extraction quality for existing users — deferred to v3.0 with a deprecation-warning hook in v2.5-09), the audit-trail surface, the failure modes (incl. ReDoS), and the explicit out-of-scope list (image attachments, retroactive scrubbing of pre-existing `.ai-memory/*.md`, structured-PII vault inspection). The doc also surfaced one impl-time gotcha that would have been a nasty bug otherwise: the `openai-key` regex `sk-(?:proj-)?[A-Za-z0-9_-]{20,}` greedily consumes `sk-ant-api03-...` because `-` is in its char class — so `anthropic-key` MUST run first in `DEFAULT_RULES` ordering. Caught by a unit test, fixed in the same commit, recorded as a footnote in the spike doc.

**The 10 default-on rules** (frozen in the spike doc, locked by a catalogue-invariant test): `anthropic-key`, `openai-key` (in this order — see above), `aws-access-key`, `github-pat`, `github-app-token`, `slack-bot-token`, `gcp-api-key`, `stripe-key`, `email`, `internal-hostname` (matches `*.internal` / `*.corp` / `*.local` / `*.lan` / `*.intra`). The 2 opt-in rules: `jwt`, `aws-secret-key` — both omitted from the default set because they have high false-positive rates against conversational prose containing long base64 strings, but available via `redact.enableOptional: ["jwt", "aws-secret-key"]` in `.ai-memory/.config.json`.

**Custom rules.** Users can extend or replace the defaults via the `redact` block in `.ai-memory/.config.json`:
```json
{ "redact": { "enabled": false, "rules": [{ "name": "internal-jira", "pattern": "JIRA-[0-9]{4,}" }] } }
```
Validation is strict: kebab-case names only, non-empty patterns only, regex must compile, and a heuristic ReDoS sniff rejects patterns with well-known catastrophic-backtracking shapes (`(.+)+`, `(.*)*`, `([^x]*)*`, `(a+)+`). Bad rules are dropped with a stderr warning rather than crashing extraction.

**Where redaction applies.** The boundary is the LLM call site, not the memory store: `extract` (per-conversation, after `formatConversation`, before chunking — single redaction pass per conversation, not per chunk), `summary` (against the JSON-serialised memory payload before `buildSummaryPrompt`), and `context --summarize` (same shape as `summary`). Where it deliberately does NOT apply: `try` (bundled scenario, no real secrets), `recall` / `search` / `list` / `resolve` (no LLM call), `rules` (deterministic Markdown renderer over already-on-disk memories — by definition local-only).

**CLI precedence** (locked by 6 unit tests in `redact.test.ts`): `--no-redact` > `--redact` > `config.redact.enabled` > default OFF. Paranoid wins absolutely — passing both `--redact` and `--no-redact` disables redaction.

**Audit trail.** When redaction runs, the run-end summary always shows what got scrubbed: a count per rule, sorted by frequency. The matched value is **never** logged — that would defeat the purpose. `--verbose` adds a per-conversation stderr line so users can correlate with their own conversation files.

51 new unit tests in `src/__tests__/redact.test.ts` covering: catalogue invariants (5 — exactly 10 default-on, exactly 2 opt-in, kebab-case names, unique names, frozen opt-in list), golden inputs per default rule (12 — one positive test per rule + boundary checks for AKIA-prefix length and the five internal-domain TLDs), false-positive guards (5 — prose mentions of token names, sub-threshold prefix matches, base64 prose under default rules, JWT-shape under default rules, public-DNS hostnames), opt-in toggle (3), config merging (5 — extendDefaults true/false, enableOptional + extendDefaults=false interaction, custom replacement, custom group:1), validation + ReDoS guard (5 — bad name, empty pattern, invalid regex, ReDoS shapes, non-object entry), idempotency / ordering (6 — second-pass byte-equality, placeholder doesn't re-match, multi-rule ordering, char totals, empty input fast path, no-rules passthrough), `shouldRedact` precedence (6 — full truth table), `formatAuditTrail` (3 — empty/single/multi). Plus 4 new CLI parse tests for `--redact` / `--no-redact` on `extract` and `summary`.

Built `dist/index.js` smoke-tested: `node dist/index.js --help` confirms both flags appear in the `Extract options:` and `Summary options:` blocks with correct doc references. End-to-end LLM-call testing of the redaction pass requires a real API key and was deferred to a follow-up RELEASE-CHECKLIST step (low risk — the redaction pass is pure-functional and unit-tested 51 ways; the wiring into `extractMemories` / `runSummary` / `runContext` is verified by typecheck + the existing extract integration tests still passing).

Estimated 1 dev day in the ROADMAP; actual work was ~3-4 hours including the spike, implementation, tests, and documentation sync. The estimate held room for spec instability that didn't materialise — the threat model + rule list locked cleanly on the first pass.

#### Same-day audit fixes

After v2.5-05 shipped, an audit pass surfaced four issues that were closed in the same wave:

- **`--json` output ambiguity (real, MEDIUM).** When `--redact` was passed but the conversation contained no secrets, the `--json` output omitted the `redactions` field entirely — making it indistinguishable from a run where `--redact` was never set. A privacy-conscious CI consumer couldn't tell "redacted, found nothing" from "user forgot the flag". Fix: track `redactionApplied` separately from hit counts in both [`src/commands/extract.ts`](src/commands/extract.ts) and [`src/commands/summary.ts`](src/commands/summary.ts); always emit `redactionApplied: true` + `redactions: []` + `redactedChars: 0` when redaction ran with zero hits. Human output also gained a `Redaction: enabled, no matches found.` line for the same case.
- **Stale "9 default rules" prose in spike doc (NIT).** Two references at lines 250 + 290 of [`docs/redaction-policy-2026-04-26.md`](docs/redaction-policy-2026-04-26.md) still said "9" after the impl-time fix bumped the table to "10". Now updated.
- **Test gap C: no test pinned the zero-hits result shape (MEDIUM).** Added `redact: zero-hit invariant` test that asserts `redact()` always returns `{ redacted, hits: [], totalChars: 0 }` (NOT `null` / `undefined`) when the corpus is clean — would have caught the JSON ambiguity above before it shipped.
- **Test gap D: placeholder-survives-second-pass only checked `openai-key` (LOW).** Added a full-coverage test that concatenates all 10 default placeholders and runs them through `redact(DEFAULT_RULES)`, asserting zero hits. Now any future regression where a default rule starts matching its own placeholder is caught immediately.

`+2` audit-fix tests; **total suite 522** (was 520 before audit). All pre-existing tests still pass; no rule logic changed.

### Shipped in development — v2.5-06 — OpenAI Codex CLI as the 5th editor source (2026-04-26)

OpenAI's `codex` CLI joins Cursor / Claude Code / Windsurf / VS Code Copilot as the fifth editor whose conversation history `ai-memory` reads natively. After this release, `doctor` lists `Codex CLI` alongside the other four sources, and `extract` consumes Codex rollout files identically — same `--source codex` flag, same JSON output shape, same memory-store layout downstream. Users with Codex installed get knowledge extraction over their CLI-driven sessions for free; users without it see one extra `[ ] Codex CLI: not installed` line in `doctor` and nothing else changes.

**Spike-first discipline (same pattern as v2.5-04 / v2.5-05).** [`docs/codex-session-snapshot-2026-04-26.md`](docs/codex-session-snapshot-2026-04-26.md) was written *before* a single line of `src/sources/codex.ts` landed. The spike doc traced the on-disk format through OpenAI's `openai/codex` Rust source — specifically `codex-rs/protocol/src/protocol.rs:2827-2835` (the `RolloutItem` tagged enum) and `codex-rs/protocol/src/models.rs:684-703` (the `ResponseItem::Message` variant + `ContentItem` enum) — locked the schema with citations, and pinned the failure modes the adapter must defend against. The spike caught two assumptions the original ROADMAP entry got wrong:

1. **Sessions are NOT in a flat directory.** ROADMAP entry: *"Conversation files live in `~/.codex/sessions/`"*. Reality: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — three levels of date partitioning the adapter must walk recursively. Encoded in `collectRolloutFiles` (depth-first walk, defends against future re-partitioning by not hardcoding the depth).
2. **The per-line schema is a doubly-tagged union.** Each line is `{timestamp, type, payload}` (Rust's `RolloutLineRef` with a flattened timestamp + a `tag="type", content="payload"` tagged-union); for `type="response_item"`, the `payload` is *itself* a tagged union with `type="message"` and a `content: ContentItem[]` array (`input_text` / `output_text` / `input_image`). Encoded in `lineToTurn` + `joinContentBlocks`.

**Adapter behaviour** (locked in the spike doc, pinned by tests):

- **Emits user/assistant turns from** `type="response_item"` + `payload.type="message"` + `payload.role ∈ {"user","assistant"}` + non-empty text content. `system` / `developer` roles are dropped (system prompts are not user knowledge); `Reasoning` / `LocalShellCall` and other `ResponseItem` variants are dropped (the user never sees Reasoning text in the TUI by default — treating it as user-authored knowledge would distort extraction, same policy as Claude Code's `tool_use` / `tool_result` filter).
- **Synthesises one assistant turn per `type="compacted"` line** from `payload.message`. When Codex auto-compacts a long conversation, the summary is what survives — extracting it preserves any decision the user agreed to during the compacted span, which would otherwise be invisible.
- **Silently skips** `session_meta` (pure metadata — id / cwd / cli_version), `turn_context` (per-turn config snapshot — approval_policy / sandbox_policy / model), and `event_msg` (tool-call events — high noise, low signal). Same defensive "skip unrecognised lines without throwing" policy as `claude-code.ts:parseJsonlContent`.

**Doctor display fix bundled in.** `conversationDisplayDir(codex)` strips four path segments so `doctor` shows `…/sessions/` rather than `…/sessions/2026/04/26/`. Same lesson as the v2.4 Cursor `agent-transcripts/` fix: don't show users a directory they didn't name themselves and would have to ask "what is this date folder?" to understand. Helper now signature-cleaner: a single `stripCount` lookup (`cursor → 1, codex → 3, others → 0`) replaces the previous Cursor-specific branch.

**24 new Codex-source unit tests** in `src/__tests__/codex-source.test.ts`: 5 happy-path turn-extractions (user / assistant / multi-block content / compacted line / mixed turn-order preservation), 6 deliberately-dropped variants (session_meta / turn_context / event_msg / non-message response_items / non-user-assistant roles / empty-message compacted), 5 defensive-parsing cases (malformed JSON / whitespace lines / missing payload / image-only content / string-form `content` shortcut), and 8 file-system cases (missing dir / present dir / recursive YYYY/MM/DD walk / mtime-descending sort / empty-dir-no-throw / loadConversation correctness / first-user-message title / fallback-to-id-prefix title). Plus 2 doctor-display tests (`codex` strip-count for both POSIX and Windows separators). Total suite: **548 tests** (was 522).

**Re-spike triggers documented.** The snapshot doc lists 5 conditions under which we should re-spike rather than silently chase the upstream schema: new `RolloutItem` variant carrying user/assistant text; `type` discriminator field rename or restructure; filename pattern change away from `rollout-*.jsonl`; path move away from `~/.codex/sessions/YYYY/MM/DD/`; or OpenAI shipping a competing first-class output (e.g. AGENTS.md emission inside the rollout file).

**Honest known unknowns.** Without a real `rollout-*.jsonl` file from a Codex CLI install, the adapter is verified against the upstream Rust source, not against byte-checked sample data. Mitigation: the defensive parser fails *soft* (skip unrecognised lines, no throw) on every shape ambiguity, and the re-spike trigger list catches the failure modes that would silently lose data. Future work (deferred): drop an anonymised Codex sample into `src/__tests__/fixtures/` once a maintainer captures one, and add an integration test that round-trips the full file through `extract`.

Estimated 1-2 dev days in the ROADMAP; actual work was ~3 hours including the spike, 24 tests, the doctor display fix, and documentation sync.

#### Same-day audit fixes — v2.5-06

After v2.5-06 shipped, an audit pass surfaced **four** issues — the same-shape "fresh-eyes re-read of every code-and-doc artifact the feature touches" pattern that closed v2.5-04 (2 issues) and v2.5-05 (4 issues). Three of the four are real code bugs that would have silently broken downstream flows for users with Codex installed; the fourth is doc drift in active marketing surfaces. All four closed in the same wave.

- **Finding A — Bundle import rejected `codex` sourceType (HIGH, real bug, silent data loss).** [`src/bundle/bundle.ts:VALID_SOURCE_TYPES`](src/bundle/bundle.ts) is a hardcoded whitelist that `parseBundle()` validates `sourceType` against on every import. v2.5-06 widened `SourceType` in `src/types.ts` to include `"codex"` but didn't widen this whitelist — meaning any bundle exported on a machine with Codex memories would throw `BundleParseError: sourceType must be one of: cursor, claude-code, windsurf, copilot` on import to another machine. Cross-machine portability silently broken for Codex users. Fix: append `"codex"` to `VALID_SOURCE_TYPES` and add an inline comment explicitly tying the list to `SourceType` so the next person adding a 6th source has the lock-step requirement in their face. Pinned by a new `parseBundle accepts every production sourceType (covers all 5 sources)` test that exercises every entry in the whitelist — any future widening of `SourceType` that forgets the bundle whitelist will now fail this test.
- **Finding B — `watch` never fs.watch'd Codex sessions (HIGH, real bug, ~30s latency regression).** [`src/commands/watch.ts:164`](src/commands/watch.ts) decides which sources qualify for fs.watch-based incremental updates (vs. polling-only). The check was an inline `source.type === "cursor" || source.type === "claude-code"` — Codex's layout (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`) is structurally identical to Claude Code (recursive JSONL scan), so it should have been on the fs.watch list. Without it, Codex sessions only got picked up by the 30s polling fallback — a full order of magnitude latency regression vs. the other JSONL sources, despite no technical reason for it. Fix: extracted a named pure helper `supportsFsWatch(sourceType)` with a docstring explaining the JSONL-vs-SQLite/JSON-blob rationale, and explicitly added `"codex"` to the truthy set. The helper now also drives a "decide whether to add a 6th source here" checklist directly in the comment.
- **Finding C — `AiMemoryConfig.sources.codex` field missing (MEDIUM, missing config surface).** [`src/types.ts`](src/types.ts) `AiMemoryConfig.sources` typed only `cursor` / `claudeCode` / `windsurf` / `copilot`, with no `codex` slot. As a result, `.ai-memory/.config.json` had no documented way to opt out of Codex monitoring (a privacy-conscious user couldn't say "I want extract to ignore my Codex sessions"). The `watch.ts` enabled-filter mirrored this gap with a 4-source if-ladder + `return true` fallthrough — same shape as "I forgot to add this source", indistinguishable at the call site. Fix: added `codex: { enabled: boolean }` to both `AiMemoryConfig.sources` typing and `DEFAULT_CONFIG.sources`, and replaced the if-ladder with a named `isSourceEnabledInConfig` helper backed by an exhaustive `switch` over `SourceType` (TS compile error if a 6th source is added and this helper isn't updated). Pinned by 7 unit tests in [`src/__tests__/watch-source-routing.test.ts`](src/__tests__/watch-source-routing.test.ts) covering: default config ON for all 5 sources, explicit `enabled: false` per source, legacy-config compatibility (a `.config.json` from before v2.5-06 that omits the `codex` key entirely must still default-enable codex — additive-flag policy), and exhaustiveness across `SourceType`.
- **Finding D — Doc drift in active marketing / current-state surfaces (LOW, but cumulative).** Several active-use documents still described `ai-memory` as covering "the four editors" or listed the source set as `Cursor / Claude / Windsurf / Copilot`: `RELEASE-CHECKLIST.md` smoke-test comment, `docs/ARCHITECTURE.md` extract-pipeline diagram, `docs/competitive-landscape.md` (5 spots — bucket-1 row, memory-graph row, primary-input row, editor-coverage row, "no-longer-unique" closer), `docs/decisions/2026-04-25-category-positioning.md` (the post-v2.4 positioning ADR), `docs/v2.5-03-submission-packet.md` (8 spots across MCP marketplace listings, awesome-list entries, AGENTS.md spec PR draft, and standard 1-line / 1-paragraph blurbs), and the README §"Native AGENTS.md output" prose. Submission packet is consumed *after* `v2.5.0` ships (which includes v2.5-06), so 5-source claims are accurate at submission time and would otherwise have been silently downgraded. Fix: updated every active surface to "5 editors / Cursor + Claude Code + Windsurf + Copilot + Codex CLI". Historical surfaces (v2.4 release-notes section of CHANGELOG, the v2.4 GIF outro, v2.5-06 ship paragraph itself when describing "joins the other four") were deliberately **left as historical record** — being correct about a past state matters more than retrofitting consistency.

**Code touches:** 4 source files (`src/types.ts` / `src/bundle/bundle.ts` / `src/commands/watch.ts` + `src/__tests__/watch-source-routing.test.ts` new file). **Test additions:** 1 new bundle whitelist-coverage test + 7 new watch-source-routing tests = +8 vs the v2.5-06 baseline of 548; total **556 tests passing**. **Doc touches:** 8 markdown files (RELEASE-CHECKLIST + ARCHITECTURE + competitive-landscape + category-positioning + submission-packet + README + README.zh-CN + CHANGELOG/ROADMAP/launch-plan/ADR for the audit narrative).

The pattern continues to validate: every shipped feature that touches an external-boundary surface (LLM call site / marketplace spec / agent-instruction format / **editor source adapter**) gets one same-day fresh-eyes re-read with explicit "what would I test if I'd never seen this" framing. v2.5-04 closed 2 issues, v2.5-05 closed 4, v2.5-06 closes 4. Cost per audit pass: ~30-60 min including this writeup. Net signal per audit pass: 1-4 real bugs caught before they reach a user, plus the institutional memory that the audit-fix tests encode (any future "added a 6th source" PR that misses one of the surfaces these tests pin will fail loudly in CI rather than silently in a user's bundle import or watch session).

### Shipped in development — v2.5-09 — README "1M-context FAQ" (2026-04-27)

**Headline:** new `## FAQ` section in `README.md` and `README.zh-CN.md` answering the most-cited HN objection to any structured-memory tool — *"Doesn't 1M-token context obsolete you?"* No code change; pure docs surface that becomes a passive shield against the same critique on every future launch thread.

Spike-first per ADR (same discipline as v2.5-04 / v2.5-05 / v2.5-06 / v2.5-07 / v2.5-08): claims, sources, FAQ placement, length cap, and re-spike triggers locked in [`docs/1m-context-faq-spike-2026-04-27.md`](docs/1m-context-faq-spike-2026-04-27.md) **before** any README copy was written. The discipline paid back during drafting in two places — a fourth bullet (prompt-cache friendliness) was cut to spike §3.4 fallback before it diluted the section, and the inline-quote-vs-link decision was made up front so the section doesn't carry numbers that will age.

**Three claims chosen, one rejected:**

| Claim | Status | Why |
|---|---|---|
| Cost compounds — re-shipping history pays per-query, extraction amortises | ✅ shipped | Reader can multiply by their own team size. \$0.20–\$0.60/query for 100–300K-token re-shipping vs. 1–5K-token `AGENTS.md` once-per-session = two orders of magnitude. Provider pricing pages linked, no specific saving figure quoted. |
| Long-context retrieval still degrades on non-headline info past ~128–256K tokens | ✅ shipped | Liu et al. 2023 "Lost in the Middle" + Kuratov et al. 2024 BABILong, hyperlink-cited not inline-quoted. Honest framing: long context "works well for the most-recent and most-prominent turns; degrades on the everyday 'what did we decide three weeks ago' question". Not "long context is broken." |
| Long context is per-machine; `AGENTS.md` is per-repo | ✅ shipped | Re-states the existing v2.4 positioning argument in long-context-can't-do-that form. Cross-links to README §"What only ai-memory does" instead of duplicating the prose. |
| Prompt-cache friendliness (Anthropic / OpenAI 90% read discount on cached `AGENTS.md`) | ❌ cut | Right but adds a fourth bullet that needs background on how prompt caches work — inflates the section past the 2-3 paragraph cap. Parked in spike §3.4 as fallback for specific HN counter-arguments. |

**Placement:** between `## We measure ourselves` and `## Quick Start`. Above the install path so skeptics see the answer before bouncing; below the proof block so the CCEB number lands first. Section heading is exact-quote of the question so HN-referrer anchors (`#faq--doesnt-1m-token-context-obsolete-you`) are directly linkable from threads.

**Surfaces touched:**

- `README.md` §"FAQ" — 4 paragraphs (~430 words), 3 hyperlinked claims, 1 cross-link to "What only ai-memory does", 1 cross-link to spike doc with re-spike trigger summary.
- `README.zh-CN.md` — mirrored, 4 paragraphs, same 3 claims, register adjusted (e.g. "成本会复利积累" rather than literal "cost compounds"). Chinese typography preserved per zh-CN README convention. Code/tool names left in English (`AGENTS.md`, `tool_use`, `1M token`).
- `docs/competitive-landscape.md` §"What recent HN launches teach us" item 5 — single back-reference (one paragraph, no duplicated argument), points readers at the README FAQ as the canonical location.
- `docs/1m-context-faq-spike-2026-04-27.md` — the spike doc itself ships alongside the FAQ so future re-spikes have the locked claims + sources + acceptance criteria + known unknowns to anchor against.

**Re-spike triggers** (when this FAQ has to be revised, locked in spike §5):

1. Sub-\$0.50/M frontier pricing for ≥1M-token windows. Cost argument weakens to a 4-5x ratio rather than 50-100x; needs reframing around determinism / sharing.
2. Long-context retrieval benchmarks publish <5% degradation past 500K on multi-hop tasks. Lost-in-the-middle argument has to be retired or narrowed.
3. Native cross-session conversation compression in Cursor / Claude Code. "Per-session" weakens; pivot to "per-machine, non-reviewable, no provenance".
4. Provider prompt-cache pricing changes (e.g. Anthropic drops the 90% read discount). Promotes prompt-cache from optional to required.

**Honest gaps documented in spike §7:**

- We have not first-party-measured Gemini 1.5 Pro retrieval degradation past 256K. Relying on Kuratov et al.'s BABILong numbers; first-party measurement is a v2.6 candidate if a reviewer demands it.
- "Moderate Cursor session = 100–300K tokens" is from the maintainer's own ~50 sessions, not a community-wide measurement; could be off by 2-3x at the long-tail. FAQ uses range language to reflect this.
- Prompt-cache pricing is provider-specific and subject to change — pinning it accurately is more work than the rhetorical value warrants, hence cut from the headline copy.

**Tests:** none. Pure docs change; no production code path or fixture surface modified. `npm test` re-run after the README edits to confirm no README-snapshot tests exist that would have to be updated alongside the copy. Test suite remains **578**. `npm run bench:cceb:dry` and `npm run bench:longmemeval:dry` re-run as smoke checks; both green.

Effort: ~45 min total — ~25 min spike doc, ~10 min EN README, ~5 min zh-CN README mirror, ~5 min competitive-landscape cross-ref + ROADMAP / CHANGELOG / launch-plan / ADR sync. Below the 0.5 dev-day estimate from the v2.5 strategy ADR.

### Same-day audit — v2.5-09 — 2 doc-drift issues closed (2026-04-27)

Fresh-eyes re-read of every v2.5-09 artefact closed two issues, both LOW-severity but both real. Same audit-pass discipline as v2.5-04 (2 issues), v2.5-05 (4), v2.5-06 (4), and now v2.5-09 (2). Pattern continues to validate at the smallest-possible scope — single-section README change still benefits from a 15-min fresh-eyes pass.

- **(A, LOW real bug):** `README.md` had unescaped `~$1–$3 per 1M tokens` in the FAQ's cost paragraph while every other dollar amount in the section was escaped (`\$0.20–\$0.60`, `\$0.50/M`). On strict-MathJax / KaTeX renderers the `$1–$3` substring could be misparsed as inline math. zh-CN mirror and the spike doc both already escaped consistently. Fixed by escaping the EN occurrence to match.
- **(B, LOW doc drift):** Both `README.md` and `README.zh-CN.md` "We measure ourselves" section said *"A LongMemEval-50 adapter is on the v2.5+ list"* — but v2.5-08 prep complete on 2026-04-27 already shipped the adapter scaffold at `bench/longmemeval/` (loader, adapter, runner, deterministic-by-id selection, 22 unit tests). Statement was technically correct on 2026-04-26 and stale on 2026-04-27. Fixed by replacing the lagging line with the actual status: "ships in `bench/longmemeval/` as a deliberate proxy ('did the answer's key tokens survive into our extracted memories?', not native QA correctness — rationale in spike doc); the headline `X / 50 evidence-preserved` number is published in the baseline doc the moment a maintainer downloads the dataset and runs it." zh-CN mirrored. Cross-reference to v2.5-08 spike doc inserted in both.

The audit also re-verified: anchor links resolve (`#what-only-ai-memory-does` matches `## What only ai-memory does` post-slugification on both EN + zh-CN README rendering passes); no README-snapshot tests exist that would have to be updated alongside copy changes; spike doc's stop-list of arguments-we-will-NOT-make is consistent with what actually shipped in the README; launch-plan table ordering is intentional (newest-first within day, append-only across days) per the existing convention. Test suite remains **578**.

### Shipped in development — v2.5-10 — Memory ↔ commit / file-path linking (spike only) (2026-04-27)

**Headline:** design-only deliverable for the v2.6 flagship. Spike doc at [`docs/memory-commit-linking-spike-2026-04-27.md`](docs/memory-commit-linking-spike-2026-04-27.md) locks every decision the v2.6 implementer would otherwise have to make under deadline pressure. No code in `src/`; pure docs. Same spike-first discipline as v2.5-04 / 05 / 06 / 07 / 08 / 09 — **seventh consecutive application** of the pattern, now applied to a feature spike (vs. v2.5-09's copywriting spike) at the smallest scope where it still pays back.

**Three core decisions locked:**

| Decision | Choice | Why |
|---|---|---|
| **Similarity scoring** | Substring / weighted Jaccard **default** (zero new deps; reuses v2.2.0 CJK-aware tokenizer) + embedding cosine **opt-in** via `--similarity embedding` (reuses existing `.embeddings.json` infra) | LLM-judged **rejected for v2.6 and v2.7** — cost scales O(memories × commits), better as a human's confirmation step than an automated scoring layer. Matches the project's "local-first by default, embeddings opt-in" stance from v2.0 semantic search and v2.4 `recall`. |
| **UX threshold model** | Three-band: `score >= AUTO` writes `confirmed_by: auto`; `[SUGGEST, AUTO)` surfaces in `recall` output but never writes; `< SUGGEST` drops silently | Single-threshold = "auto-link or nothing"; auto-link bad → silent damage. Three-band lets easy cases auto-link while ambiguous ones stay opt-in-to-write. `link --clear-auto` is cheap recovery from threshold-tuning mistakes — wipes every `auto` entry without touching `manual` confirmations. Conservative starting defaults (0.70 Jaccard auto / 0.40 suggest) bias toward precision; v2.6 publishes empirical thresholds derived from the §5.3 ground-truth corpus. |
| **Metadata schema** | `links.implementations[]` (list, not flat tuple) with per-entry `sha + paths + subject + author + date + method + score + confirmed_by + first_linked`. Schema invariants pinned: idempotent `first_linked`; `auto` removable by `--clear-auto`, `manual` only by explicit `--remove`; `paths` = the subset matching the memory's tokens, not the commit's full path-set. | Original ROADMAP sketch `implemented_in: [<sha>, <path>]` was a flat tuple — couldn't represent multi-commit implementations or auto-vs-manual provenance. Schema mistakes are migration costs forever; the spike's 30 minutes saves a v2.7 schema-migration headache. |

**`ai-memory link` command surface** (§3.5 of spike, ships v2.6): `link` (default scan + apply at AUTO) / `--dry-run` / `--since "1 week ago"` / `--memory <id>` / `--rescore` / `--clear-auto` / `--confirm <mem> <sha>` / `--remove <mem> <sha>`. Subcommands as flags (matches `rules --target` and `extract --redact` conventions); idempotent writes; bounded 10s `git` timeouts mirroring v2.4 `recall`. **`linking.enabled: false` opt-in default** — flipping default ON in a minor would silently mutate every existing user's memory frontmatter on `extract`, a v3.0 breaking-change vector (same discipline as v2.5-05 `--redact`).

**`recall` / dashboard / `summary` integration:**
- `recall <query>` gains an `Implementations` block per result memory with confirmed (`✓`, read from frontmatter) and suggested (`?`, re-derived per-call) entries.
- Dashboard cards gain an "Implementations" column with confirmed-count + suggested-count badges (clickable → diff view).
- `summary` gains a "Recently implemented" section summarising 30-day link activity. Lightweight; ignored when `linking.enabled = false`.

**v2.6 implementation plan** (§4 of spike, broken into 10 ≤1-day chunks):
4.1 scorer (~25 unit tests, 1 day) → 4.2 git-walker (~10 tests, 0.5 day) → 4.3 embedding-scorer opt-in (~12 tests, 1 day) → 4.4 frontmatter-writer (~20 tests, 1 day) → 4.5 `link` CLI (~12 tests, 0.5 day) → 4.6 `recall` integration (~6 tests, 0.5 day) → 4.7 dashboard panel (~4 tests, 0.5 day) → 4.8 `summary` section (~3 tests, 0.25 day) → 4.9 ground-truth corpus + threshold-tuning baseline on the ai-memory repo itself (0.5 day) → 4.10 same-day audit pass (0.5 day, now budgeted as a line item not free overhead). **Total ~6 dev days; ~92 new tests; expected suite size 670+.** Original strategy ADR estimated v2.5-10 at "1 dev day for the spike" + v2.6 ship presumed 3-5 days; locked-in 6 days reflects the audit-pass discipline now being budgeted.

**Re-spike triggers (§6, 5 of them):**
1. Substring scoring's recall on §5.3 corpus < 50% at 80%+ precision → promote embedding default; substring drops to fallback.
2. Embedding storage size for the commit-set crosses 50% of `.embeddings.json` budget on a 1000-commit repo → reconsider commit embeddings as a separate file or re-derive on every scan.
3. A competitor in any bucket ships any form of memory↔commit linking → expect to compete on linking accuracy (the corpus-derived numbers) rather than novelty.
4. False-positive rate in `link --dry-run` across the maintainer's first 10 personal repos > 5% on auto-linked entries → tighten thresholds before opening v2.6 to non-maintainer testers.
5. `git log --follow` proves unreliable across rename + content-edit boundaries → expand path tracking to also store file blob OID; verify via `git log --find-copies` rather than `--follow`.

**Known unknowns (§7, 6 of them):** no labeled corpus exists yet (default thresholds are educated guesses, not empirically tuned — v2.6 first-ship is beta-quality on accuracy until corpus published); single-author repos inflate lexical similarity; renamed-then-edited paths break path-based stored-link-resolution; reverted commits/memories aren't modeled (v2.7 candidate `reverted_in: [<sha>]`); multi-repo memory stores break the in-this-repo-git-log assumption (out of scope, flagged); threshold defaults are opinions until corpus exists (README + dashboard copy in v2.6 must say so).

**Honest assessment of strategic value (§10):** per `docs/competitive-landscape.md` §"Bucket 3", **no competitor in any of our three buckets can structurally copy this** — chat-history extractors lack commit linking, git-markdown runtimes lack memory files (they store git-tracked snapshots of an internal store), opaque-DB runtimes (mem0/letta/zep/cortexmem) have no memory-in-user's-git substrate at all. Linker turns "your memories are in git" from a *substrate* into a *substrate that compounds*. **Strategic priority for v2.6: flagship.** The spike confirms the read the v2.5 strategy ADR called out; v2.6 ROADMAP should lead with this, not slot it into a corner.

Effort: ~50 min total — ~40 min spike doc authoring (~470 lines, longest spike doc to date because the design space spans 3 simultaneously-locked dimensions), ~10 min ROADMAP / CHANGELOG / launch-plan / ADR sync. The strategy ADR estimated 1 dev day for the spike; came in well under because the "decisions locked early, alternatives evaluated for future re-visit" structure of all six prior spike docs gave a re-usable template.

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
