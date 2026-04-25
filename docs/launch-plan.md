# Launch Plan — v2.4 push to 1000★

> How we go from "v2.3 shipped, handful of users" to "HN front page + sustained
> star velocity". Owner: @hyxnj666-creator. Target window: once v2.4 lands.

This is the working doc for the 1000-star push. Two decisions are now settled:

- **Naming** — see ADR [decisions/2026-04-24-naming.md](decisions/2026-04-24-naming.md). No rebrand.
- **Category positioning** — see ADR [decisions/2026-04-25-category-positioning.md](decisions/2026-04-25-category-positioning.md). We are a **chat-history extracting knowledge pipeline**, not a runtime memory middleware. Hero hook: *"Zero `.remember()` calls — we read your editor's chat history directly."*

Every dollar of effort goes into differentiation features (AGENTS.md sync,
`recall` time-travel) and benchmark credibility, not branding.

## Pre-reqs (must be true before launching)

1. `npm test` — 355 tests passing ✅ (as of 2026-04-25; +30 `doctor`, +17 `mcp-config-writer`, +1 `cli.test` `--with-mcp` assertion, +3 `doctor` local-LLM hint). v2.4 features will add roughly +60 tests on top.
2. `npm run typecheck` — 0 errors ✅
3. All CLI commands validated against README claims ✅ (audit 2026-04-24)
4. All public URLs point to `hyxnj666-creator/ai-memory` ✅
5. No `ExperimentalWarning` leaking on startup ✅ (SQLite warning filtered in `src/index.ts` as of 2026-04-24)
6. Competitive landscape refreshed ✅ ([competitive-landscape.md](competitive-landscape.md), 2026-04-25 with Palinode / SQLite Memory / MemoryGraph / Experience Engine added; bucketing decided in [ADR](decisions/2026-04-25-category-positioning.md))
7. AGENTS.md reverse-sync shipped ✅ (`ai-memory rules --target agents-md`, idempotent merge, 23 new tests, 2026-04-25 — backs the new claim #2)
8. `recall` git time-travel shipped ✅ (`ai-memory recall <query>`, `git log --follow` over `.ai-memory/`, soft fallback when no git, 22 new tests, 2026-04-25 — backs the "memory is reviewable history" claim)
9. CCEB v1 (framework + 9 fixtures + scorer + CI dry-run) shipped ✅ (2026-04-25); first published baseline shipped ✅ (2026-04-25, `gpt-4o-mini`, F1 56.0% / P 43.8% / R 77.8%); LongMemEval 50-query subset numbers ⏳ (v2.5 — apples-to-apples shield against runtime-memory benchmarks)
10. Demo GIF aligned to the new hero hook ⏳ (Tier 1)

## v2.4 engineering (required to launch credibly)

### Tier 1 — must do before HN

First-run UX (✅ done):
- [x] **`ai-memory doctor`** — six-section health check (runtime, editors + convo
      counts, LLM provider + live probe, memory store + author, embeddings
      freshness, MCP config registration). `--no-llm-check` for CI + `--json`
      for bug-report automation. Exit code 0/1 maps to CI gates. 30 unit tests.
      Shipped 2026-04-25. `src/commands/doctor.ts` + `src/__tests__/doctor.test.ts`.
- [x] **`ai-memory init --with-mcp`** — writes/merges `.cursor/mcp.json` and
      `.windsurf/mcp.json` with full idempotency. Re-runs are safe. User's
      customised `ai-memory` entry preserved (conflict action, not overwrite).
      Invalid JSON refused with a clear reason. Claude Desktop (OS-specific
      global path) gets a README pointer rather than silent mutation. 17 new
      unit tests. Closes the "MCP integration" skip section in `doctor` for
      fresh users. Shipped 2026-04-25.
      `src/mcp/config-writer.ts` + `src/__tests__/mcp-config-writer.test.ts`.

Differentiation (1-2 dev days remaining):
- [x] **`ai-memory rules --target agents-md`** — writes convention/decision
      memories to `AGENTS.md` (and `--target both` writes the Cursor `.mdc`
      side-by-side from the same store) so Codex / Cursor / Windsurf / Copilot
      / Amp read them natively. Idempotent merge: only the `<!-- ai-memory:
      managed-section ... -->` block is touched, hand-written content is
      preserved byte-for-byte. Conflict-aware (malformed markers refuse to
      write; exit 1). 23 new unit tests across every merge branch. Shipped
      2026-04-25 — backs claim #2 ("Conversations become AGENTS.md
      automatically") in [ADR](decisions/2026-04-25-category-positioning.md).
      A CLAUDE.md mirror remains a follow-up for v2.5 (Claude Code does not
      yet read AGENTS.md natively as of this writing).
- [x] **`ai-memory recall <query>`** ✅ — git-history-aware retrieval that
      surfaces how a decision *evolved* (current vs superseded vs reactivated),
      not just the latest snapshot. Uses `git log --follow` over `.ai-memory/`
      so renames are tracked transparently. Each commit shows short SHA, ISO
      date, author, status code (`+` added, `~` modified, `-` deleted, `R`
      renamed) and subject. Soft fallback: outside a git working tree (or
      before the first commit of the store) recall still returns the matching
      memories with a hint, so it's never strictly worse than `search`.
      Pure `parseGitLog` parser tested against synthetic fixtures plus 6
      real-git tmpdir scenarios; bounded `execFile` timeouts (10s) so a
      corrupt repo can't wedge the CLI. 22 new tests. Shipped 2026-04-25.

Launch credibility (in progress, ~1 dev day remaining):
- [x] **CCEB v1 (framework + 9 fixtures).** `bench/cceb/` ships the full
      pipeline: 9 hand-curated fixtures (5 memory types × ≥1 each, 1 CJK,
      2 noise — small-talk + deferred-decision for honest false-positive
      measurement), a pure scorer with 16 unit tests, a runner that drives
      the real `extractMemories()` path, and stable Markdown + JSON
      scorecards. `npm run bench:cceb:dry` runs <1s with no LLM tokens
      (CI-friendly); `npm run bench:cceb` is the live run. Methodology
      doc at [`bench/cceb/README.md`](../bench/cceb/README.md). Shipped
      2026-04-25 — total suite is now 422 tests.
- [x] **First published CCEB baseline** (shipped 2026-04-25). Captured
      against `gpt-4o-mini`: overall **F1 56.0%** (P 43.8% / R 77.8%) on
      9 fixtures, 70.5 s wall-clock, ≈ $0.005 spend. Recall is healthy
      across all five memory types (every signal-bearing fixture
      produced at least one TP of the correct type); precision is
      dragged down by *over-extraction* — one logical decision splitting
      into 2–4 candidate memories and follow-up actions being promoted
      to standalone TODOs. Both noise fixtures (chit-chat, deferred
      decision) returned zero memories — perfect score on the failure
      mode HN audiences poke at hardest. Full per-type table, sample
      misses / FPs, the v2.5 work this points at, and the
      `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` recipe for runs behind
      regional firewalls are documented in
      [`docs/benchmarks/cceb-baseline.md`](benchmarks/cceb-baseline.md).
- [ ] **CCEB v1.1 fixture growth + LongMemEval 50-query subset adapter.**
      Grow CCEB toward ~30 fixtures via PRs; add the LongMemEval adapter
      so we can cite apples-to-apples numbers against runtime memory
      benchmarks when reviewers ask. Per [ADR](decisions/2026-04-25-category-positioning.md),
      shipping both yardsticks takes both common critiques ("untested toy"
      and "wrong yardstick") off the table. Est. 1 dev day.
- [x] **Demo GIF — recording infrastructure** (shipped 2026-04-25). The
      headline GIF is generated from a checked-in `vhs` script + a hand-curated
      scenario, not screen-captured. Means re-renders are deterministic,
      `.tape` edits diff cleanly in PRs, and the asset never depends on
      whichever takes-three-attempts asciinema run produced it. Files:
      [`docs/assets/demo/demo.tape`](assets/demo/demo.tape) (5-frame, ≈30s
      script), [`docs/assets/demo/scenario/`](assets/demo/scenario/)
      (hand-curated 3-memory store: 1 decision + 1 convention + 1
      architecture across 2 authors, English-pinned for HN readability),
      [`docs/assets/demo/RECORDING.md`](assets/demo/RECORDING.md)
      (install + render + pre-commit checklist for vhs on macOS / Linux /
      WSL / Docker / scoop), and `npm run demo:render` script.
      Decisions baked into the script: (a) extract is **narrated**, not run
      live (would need an LLM key in render env), (b) recall is intentionally
      absent from the hero (per user note 2026-04-25 — "extract→reuse is the
      practical value, recall time-travel is power-user surface"), (c) flow
      = framing line → per-author layout listing → cat one decision →
      `rules --target agents-md` → head AGENTS.md → outro line.
- [ ] **Demo GIF — render + commit** (~10 min by maintainer with vhs
      installed). Run `npm run demo:render`, walk the [pre-commit checklist
      in RECORDING.md](assets/demo/RECORDING.md#pre-commit-checklist), commit
      `docs/assets/demo/demo.gif`, and swap the README's hero comment marker
      for `![ai-memory in 30 seconds](docs/assets/demo/demo.gif)` (Tier 2
      README rewrite covers the surrounding copy).

### Tier 2 — strongly recommended (post-Tier 1)

- [ ] **README top 30% rewrite** — new tagline anchored on the chat-history
      hook, four "only we do this" claims from
      [competitive-landscape.md](competitive-landscape.md), benchmark badge,
      embedded GIF. **Deliberately deferred until Tier 1 features ship** —
      writing the new pitch first would mean making claims the code can't
      back, and HN punishes that.
- [ ] **`package.json` description + keywords refresh** — align with the new
      chat-history-pipeline story (`chat-history`, `agents-md`, `extraction`,
      `git-trackable`, `multi-editor`).

### Tier 3 — optional polish (1-2 dev days)
- [ ] `ai-memory init --local` — one-flag path to Ollama without reading docs
- [ ] Dashboard screenshots (Overview / Conversations / Quality) for README
- [ ] `star-history` chart badge once we cross 100★

## Launch content (prepare before the HN day)

The pitch is now anchored on **input asymmetry, not storage format**. Every
piece of launch copy must lead with "we read your existing chat history" and
demote "git-trackable Markdown" to a supporting feature.

- **HN submission** — title leads with the chat-history hook, not the
  storage format. Three candidates to choose from on launch day (final pick
  in `D:\work\article\ai-memory\hackernews-launch-plan.md`, kept out of this
  repo so the launch playbook stays separate from the public docs):
  1. *"Show HN: ai-memory — Extract decisions from Cursor/Claude chats, no `.remember()` needed"*
  2. *"Show HN: ai-memory — Turn Cursor/Claude chat history into AGENTS.md + Cursor Rules"*
  3. *"Show HN: ai-memory — A git-trackable knowledge layer auto-extracted from your AI editor chats"*
  Post Tuesday morning US-Eastern (08:30 ET = 20:30 Beijing). One self-comment
  that honestly positions the trade-offs vs Palinode / MemoryGraph / mem0
  (humility earns credibility on HN; both Palinode and SQLite Memory stalled
  at 2 points in early April — under-positioning is fatal in this niche).
- **X / Twitter thread** — 8-12 tweets, each with a GIF or screenshot. Pin
  the post. Reply actively for the first 4 hours.
- **Reddit** — post 2 hours after HN, tailored versions for:
  - r/LocalLLaMA (emphasise Ollama support + local-first)
  - r/ClaudeAI (emphasise Claude Code integration + AGENTS.md auto-generation)
  - r/cursor (emphasise Cursor Rules + chat-history extraction)
- **Dev.to long-form** — "How I built a chat-history-extracting knowledge
  pipeline for coding agents" (technical story of the extraction pipeline +
  quality algorithms + the dual benchmark methodology).
- **Awesome-lists PRs** — awesome-mcp-servers, awesome-cursor, awesome-ai-coding,
  awesome-agents-md (if it exists by then).

## Day-of-launch

```
T-1 day:   final test suite + smoke test + dashboard screenshot refresh +
           verify all four "only we do this" claims have shipped code/numbers
T-0 08:30 ET: submit to HN, submit to X, pin tweet
T-0 10:30 ET: submit to r/LocalLLaMA, r/ClaudeAI, r/cursor
T-0 all day: reply to every comment; be honest about trade-offs
T+1:       write retrospective (what worked, what didn't) into
           docs/decisions/YYYY-MM-DD-launch-retrospective.md
```

## Success metrics (30 days after launch)

- **Stars:** 300+ (stretch: 1000)
- **npm weekly downloads:** 100+ (stretch: 1000)
- **MCP marketplace listing:** accepted on at least 2 (cline, Cursor, Claude)
- **Issues opened by strangers:** ≥5 (indicates real usage, not just stars)
- **Benchmark adoption:** at least one external project cites our CCEB
  methodology or runs the harness against their own tool

Below those floors we treat it as a signal to iterate on positioning before
re-launching.

## Decision log for this plan

When priorities change, don't rewrite this doc silently — add an entry here:

| Date | Change | Why |
|---|---|---|
| 2026-04-24 | Plan created. Naming settled (no rebrand), v2.4 tiers drafted. | Post-v2.3 audit confirmed product is solid; bottleneck is now positioning + first-run UX. |
| 2026-04-25 | First-run UX done (`doctor` + `init --with-mcp`, +47 tests). | Cleared Tier 1 first-run sub-bucket on schedule. |
| 2026-04-25 | Category positioning revised: chat-history extracting pipeline (not runtime middleware). Hero hook changed to "zero `.remember()` calls". 4 "only we do this" claims (was 3). | Market refresh: Palinode (HN 2 pts), SQLite Memory (HN 2 pts), MemoryGraph (191★) saturated the "git-markdown memory" angle. AGENTS.md hit 60K-repo adoption under Linux Foundation. See [ADR](decisions/2026-04-25-category-positioning.md). |
| 2026-04-25 | Tier 1 expanded: AGENTS.md reverse-sync promoted from Tier 2; `recall` time-travel added; LongMemEval-only benchmark replaced by CCEB primary + LongMemEval 50-query subset. | Backs the new claims #2 and #4. Single-track LongMemEval was wrong-yardstick (it measures runtime middleware). Single-track CCEB would read as "invented your own benchmark". Dual track defends both fronts. |
| 2026-04-25 | `ai-memory rules --target agents-md` shipped (idempotent merge with hand-written content preserved, conflict-aware on malformed markers, 23 new tests). Tier 1 now `recall` + benchmark + Demo GIF remaining. | First feature directly backing the new positioning (claim #2). Pure-merge module mirrors the `mcp/config-writer.ts` pattern — same idempotency / conflict / append branches users already trust from `init --with-mcp`. |
| 2026-04-25 | `ai-memory recall <query>` shipped (`git log --follow` over `.ai-memory/` with rename tracking, soft fallback when no git, 22 new tests; total 406). Tier 1 engineering complete; only CCEB+LongMemEval subset and Demo GIF remain before launch. | Last of the four "only we do this" claims. Differentiates from runtime-DB middleware (mem0/letta/zep/cortexmem): they store the latest snapshot only; we expose the entire commit-by-commit lineage of every fact. No new runtime dep — `node:child_process.execFile` against the user's existing `git` with bounded 10s timeouts. |
| 2026-04-25 | CCEB v1 shipped (framework + 9 fixtures + 16 scorer tests; total 422). First published baseline split out as a separate maintainer-driven step. | Custom-benchmark by design — LongMemEval-style end-to-end QA against a runtime store measures something we don't claim to do. Fixtures map directly onto our extraction claims. Splitting "ship the harness" from "publish the number" prevents shipping a baseline that drifts when the upstream model updates; the harness is in CI now (`bench:cceb:dry`, <1s, no LLM), the baseline is a deliberate human action. Three Tier-1 sub-buckets remain: (a) capture first published baseline, (b) CCEB v1.1 + LongMemEval subset adapter, (c) Demo GIF. |
| 2026-04-25 | **GIF hero narrative locked: extract → typed memory → AGENTS.md.** `recall` time-travel is intentionally NOT in the GIF. | User feedback (verbatim): *"我们这个工具主要是方便，提取记忆换个地方使用，多次去看差异化并不实用"* — the practical value is "extract knowledge from chat history so it can be reused elsewhere", not "review how a decision evolved over time". `recall` stays as a feature for power users (already in the README's command list) but does not lead the marketing story. Concretely affects: GIF storyboard, Tier 2 README rewrite (the four "only we do this" claims keep recall as #4, not promote it to #1), and HN post draft (lead with extract→reuse, not time-travel). |
| 2026-04-25 | **GIF tooling: vhs (charm.sh), not asciinema.** | User has no asciinema and won't install one-off demo tools. vhs is scripted (`.tape` file in repo, deterministic re-renders), Windows-friendly (`scoop install vhs` or pre-built binary), and produces GIFs directly. The `.tape` script becomes the single source of truth — no "I rendered three takes and they all look different" failure mode. Maintainer renders once and commits the GIF; CI does NOT re-render (GIF rendering needs vhs which we don't want as a CI dependency). |
| 2026-04-25 | **GIF flow keeps `extract` as narration, not as a live command.** | Running `extract` live in the GIF would require either (a) a real LLM call inside vhs's headless terminal — fragile, requires keys in render env — or (b) a mock LLM server — scope creep. Trade: instead, the demo opens with a comment line that names extract as the upstream step, then shows the artifacts (`.ai-memory/` markdown + `AGENTS.md` generation). Honest, runnable in any environment with vhs installed, no keys needed. The README + RECORDING.md cover what `extract` actually does. |
| 2026-04-25 | **First published CCEB baseline: F1 56.0% on `gpt-4o-mini`.** | 9 fixtures, 70.5 s, ≈ $0.005. Recall 77.8% (every signal-bearing fixture got at least one TP); Precision 43.8% dragged down by *over-extraction* (one logical decision splitting into 2–4 candidates, follow-up actions promoted to standalone TODOs). Both noise fixtures: 100% — no hallucinations under pressure, the failure mode HN audiences poke hardest. Number is honest, not gamed: published as-is rather than silently re-running until variance gave a prettier 60%+. The over-extraction pattern is the v2.5 prompt-tuning target (merge sub-claims into parent `reasoning`/`impact`; tighten TODO discipline). Full breakdown + sample misses + sample FPs in [`docs/benchmarks/cceb-baseline.md`](benchmarks/cceb-baseline.md). |
| 2026-04-25 | **Network recipe for runs behind regional firewalls: `HTTPS_PROXY=http://127.0.0.1:7890` + `NODE_USE_ENV_PROXY=1` (Node 24+).** | Hit during the first baseline run on a mainland-China connection. Node v18–23's built-in `fetch()` ignores `HTTPS_PROXY` entirely; Node v24 added `NODE_USE_ENV_PROXY` as the opt-in. Without both env vars set, `bench:cceb` (and any other LLM-calling command) silently bypasses the user's local proxy and times out. Captured in `docs/benchmarks/cceb-baseline.md` so the next maintainer doesn't re-discover this from scratch. No code change in `ai-memory` itself — the runner stays vanilla `fetch()`. |
| 2026-04-25 | **`package.json` bumped to 2.4.0 with pipeline-positioning description.** Description: "Turn editor chat history (Cursor, Claude Code, Windsurf, Copilot) into typed Markdown decisions + AGENTS.md rules — local-first, git-trackable, zero remember() calls." Keywords gained `agents-md` / `windsurf` / `github-copilot` / `knowledge-pipeline` / `chat-history` / `local-first`; dropped `model-context-protocol` (redundant with `mcp` + `mcp-server`) and `embeddings` (low search volume). | Both fields surface on the npmjs.com search results page and in package detail metadata. Version bump is mechanical-but-final: anything else CHANGELOG-worthy that lands before publish becomes 2.4.1, not v2.4. CHANGELOG date stamp deliberately *not* set yet — that's the publish-day step, setting it earlier would be a lie if publish slips. |
