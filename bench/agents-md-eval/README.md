# `bench/agents-md-eval/` — AGENTS.md downstream-evaluation runbook

This is the **maintainer-facing runbook** for the v2.5-07 experiment:
*do the rules `ai-memory` generates actually steer agents during real
coding sessions?*

The methodology, scoring rubric, and publication template are locked in
[`docs/agents-md-eval-spike-2026-04-27.md`](../../docs/agents-md-eval-spike-2026-04-27.md).
**Read that first.** This file is the operational checklist that turns
the spike into a number.

> **Status:** prep complete (this directory, the spike doc, and the
> results-template skeleton are committed). What is **not** done yet is
> the actual two-editor execution + scoring + publishing — those are the
> three steps below. Until they're done, ROADMAP `v2.5-07` stays
> unchecked with status `prep complete; awaiting maintainer execution`.

---

## What lives here

| Path | Purpose |
|---|---|
| `controlled-repo/` | The "scratch project" you open in each editor. Frozen `AGENTS.md`, skeleton source files, no other rule files. Treat as read-only — copy elsewhere before each run. |
| `tasks/T01.md` … `T10.md` | The 10 micro-tasks. Each has the verbatim prompt + 0/1 observation rubric. |
| `scoring-template.csv` | 50 pre-filled rows (25 obs × 2 editors). Fill in the `score` column 0 / 1 and optional `note`. Keep the headers. |
| `scripts/verify-agents-md.ts` | Drift guard: regenerates AGENTS.md from the bundled demo scenario and diffs against the frozen fixture. Run before every scoring session. |
| `results/` | Per-run captures: `results/<editor>/T0X-response.md` for each task's verbatim agent output. |
| `results/scores.csv` | The completed copy of `scoring-template.csv` once both editor runs are done. (Not committed yet — fill it in during the run.) |

## The runbook (≈ 30 minutes per editor + 15 minutes scoring)

### 0. Pre-flight (once)

```bash
# Build the CLI so the verify script can call try-internals.
npm run build

# Confirm the frozen fixture matches what the current writer produces.
# If this fails, STOP — see docs/agents-md-eval-spike-2026-04-27.md §6.
npx tsx bench/agents-md-eval/scripts/verify-agents-md.ts
# Expected: "[verify-agents-md] OK — frozen fixture matches ..."
```

### 1. Set up a scratch copy

The controlled-repo lives inside this repo, but you don't run the eval
*against* this repo — you run it against a clean copy elsewhere, so
`.git`, `node_modules`, etc. don't bias the agent's view.

```bash
# macOS / Linux
mkdir -p /tmp/ai-memory-eval && cp -r bench/agents-md-eval/controlled-repo/. /tmp/ai-memory-eval/internal-tools

# Windows PowerShell
New-Item -ItemType Directory -Path $env:TEMP\ai-memory-eval -Force | Out-Null
Copy-Item -Recurse bench\agents-md-eval\controlled-repo\* $env:TEMP\ai-memory-eval\internal-tools\
```

### 2. Run the 10 tasks in Cursor

1. Open `/tmp/ai-memory-eval/internal-tools` (or the Windows equivalent)
   in Cursor.
2. Open the AI panel. **Confirm `AGENTS.md` is being read** — Cursor's
   docs as of 2026-04 confirm `AGENTS.md` is auto-loaded; verify by
   asking the agent "what files are in your context?" once and checking
   AGENTS.md is named.
3. **For each task `T01.md` ... `T10.md`:**
   - Reset the working tree: `cd <scratch-dir> && git stash` (if you've
     `git init`'d it) or simply re-copy `controlled-repo/`.
   - Open a **new chat / Composer session** to avoid carryover.
   - Send the **verbatim prompt** from the task file. One message. No
     follow-ups. No "actually, what about…".
   - Save the agent's complete response (text + any code) as
     `bench/agents-md-eval/results/cursor/T0X-response.md`.

### 3. Run the same 10 tasks in Claude Code

Same routine in Claude Code (CLI). For each task:

```bash
cd /tmp/ai-memory-eval/internal-tools
# (reset between tasks: re-copy controlled-repo/ or git stash)
claude  # or whatever your invocation is
# paste verbatim prompt; capture output
```

Save responses to `bench/agents-md-eval/results/claude-code/T0X-response.md`.

### 4. Score

For each `(editor, task, observation)` row in `scoring-template.csv`:

1. Open the corresponding `tasks/T0X.md` and look up the **literal
   pattern** specified in the observation row.
2. Look at the saved response in `results/<editor>/T0X-response.md`.
3. Score `1` if the literal pattern matches, `0` otherwise. Ties (rule
   was implicit but not stated) score `0`. The spike doc §4 commits us
   to a strict rubric; do not relax it post-hoc.
4. Optional `note` column for "agent did X which is partial credit but
   the strict rubric resolves down" — useful for the publication
   writeup.

Save the filled CSV as `bench/agents-md-eval/results/scores.csv`.

### 5. Publish

1. Tally the scores:
   ```powershell
   $rows = Import-Csv bench\agents-md-eval\results\scores.csv
   $cursor = ($rows | Where-Object { $_.editor -eq 'cursor' -and $_.score -eq '1' }).Count
   $cc = ($rows | Where-Object { $_.editor -eq 'claude-code' -and $_.score -eq '1' }).Count
   "cursor: $cursor / 25; claude-code: $cc / 25; total: $($cursor + $cc) / 50"
   ```
   Or the bash equivalent:
   ```bash
   awk -F, '$1=="cursor" && $4=="1" {c++} $1=="claude-code" && $4=="1" {cc++} END {print "cursor:", c, "/ 25; claude-code:", cc, "/ 25; total:", c+cc, "/ 50"}' bench/agents-md-eval/results/scores.csv
   ```
2. Fill in `docs/agents-md-eval-results.md` (skeleton already committed
   with all 8 required sections per spike doc §7). The headline is
   "X / 50 rule observations honored across Cursor + Claude Code."
3. Update README.md, `docs/competitive-landscape.md`, and
   `docs/v2.5-03-submission-packet.md` with the headline number — see
   the spike doc §7 for required edit locations.
4. Add the CHANGELOG entry under the v2.5 section.
5. Flip the ROADMAP `v2.5-07` checkbox to `[x]` and write the
   one-paragraph completion note (per the convention every other
   completed v2.5-* item follows).

## What if the frozen AGENTS.md drifts mid-cycle?

If `verify-agents-md.ts` fails before scoring is complete:

- **Don't update the fixture and keep going** — that produces a number
  derived from a writer that nobody can reproduce.
- Run through spike doc §6 (re-spike triggers) and pick one of the three
  options. If you choose "update the fixture," all prior scoring is
  invalidated and the experiment restarts from §1.

If it fails *after* scoring is complete and published, you treat it like
v2.5-06 audit pass: file the regression as a bug, fix the writer (or
re-run the eval), and add a "scoring captured against writer ${commit}"
footnote to `docs/agents-md-eval-results.md`.
