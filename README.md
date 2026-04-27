# ai-memory

[![npm version](https://img.shields.io/npm/v/ai-memory-cli.svg)](https://www.npmjs.com/package/ai-memory-cli)
[![CI](https://github.com/hyxnj666-creator/ai-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/hyxnj666-creator/ai-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Turn AI editor chat history into typed Markdown + `AGENTS.md` rules — local-first, git-trackable, zero `.remember()` calls.

![ai-memory in 30 seconds](docs/assets/demo/demo.gif)

```bash
npx ai-memory-cli extract                     # read your editor's chat history → typed Markdown
npx ai-memory-cli rules --target agents-md    # → AGENTS.md (Cursor / Claude / Windsurf / Copilot / Codex all read it)
npx ai-memory-cli recall "OAuth"              # show the full git lineage of any decision
npx ai-memory-cli context --copy              # resume any session with full context
```

Every other "AI memory" tool starts with a `remember()` API and asks you to instrument your code. **`ai-memory` reads your editor's chat history directly** — Cursor, Claude Code, Windsurf, Copilot Chat, Codex CLI — and turns it into typed, git-trackable Markdown that every AI editor reads back via `AGENTS.md`. No new API surface to learn, no runtime memory store to keep alive between sessions.

**Local-first by default.** Conversations never leave your machine; the only network call is to whichever LLM provider you've configured for extraction. Or use Ollama / LM Studio for fully offline operation.

> **[中文文档](README.zh-CN.md)**

---

## What only ai-memory does

Four things you won't find together anywhere else. The first three are structural; the fourth is engineering investment nobody else is making.

1. **Zero `.remember()` boilerplate.** We read what you've already written — the Cursor / Claude Code / Windsurf / Copilot Chat / Codex CLI transcripts that already live on your disk. No SDK to import, no runtime memory store to keep alive. Compare with mem0 / Letta / Zep / cortexmem, which require `client.add(...)` calls from your application code.

2. **Native `AGENTS.md` output.** `ai-memory rules --target agents-md` writes the cross-tool standard rules file that Cursor, Claude Code, Windsurf, Copilot, and OpenAI Codex CLI all consume. The merge is idempotent: only the section between `<!-- ai-memory:managed-section start --> ... end -->` is touched; any hand-written content in your `AGENTS.md` is preserved byte-for-byte. `AGENTS.md` adoption crossed 60K repos and is now under Linux Foundation stewardship — most projects hand-write theirs from scratch; we generate it from your conversation history.

3. **Plain Markdown in git — no database.** `.ai-memory/` is the source of truth: Markdown files you `git diff`, code-review, branch, and revert. Other tools that advertise "git-trackable" memory ship git-tracked snapshots of their *internal store*; we ship the human-readable file format and let git own everything. Cross-machine sync is `git pull`.

4. **Time-travel recall via git history.** `ai-memory recall <query>` shows the full commit-by-commit lineage of every memory: what the decision said on April 1, what it said on April 15, what changed and who changed it. Every other memory tool returns "the latest" only — superseded versions are silently overwritten. No new runtime dep: `recall` shells out to your existing `git` with a 10-second timeout.

## We measure ourselves

[CCEB — Cursor Conversation Extraction Benchmark](docs/benchmarks/cceb-baseline.md), `gpt-4o-mini`, 30 hand-curated fixtures (v1.1 expansion):

| Metric | v1.1 (2026-04-27, **30 fixtures**) | v1.0 / v2.5-01 (2026-04-26, 9 fixtures) | v2.4 (2026-04-25, 9 fixtures) |
|---|---|---|---|
| Overall F1 | **64.1%** (P 56.8% / R 73.5%) | 76.2% (P 66.7% / R 88.9%) | 56.0% (P 43.8% / R 77.8%) |
| `decision` / `issue` F1 | **78.3% / 100%** | 75.0% / 100% | 66.7% / 66.7% |
| `architecture` F1 | 72.7% (recall the new bottleneck) | 100% | 50% |
| Noise rejection (chit-chat / deferred / hypothetical) | 100% — no hallucinated memories on any of the 4 noise fixtures | 100% (2 fixtures) | 100% (2 fixtures) |
| Wall-clock | 239.7 s | 47.9 s | 70.5 s |
| Spend | ≈ \$0.02 | ≈ \$0.006 | ≈ \$0.005 |

The v1.1 expansion (cceb-001 — cceb-030) deliberately added harder cases v1.0 didn't exercise: multi-memory-per-conversation (architecture + convention together), commitment-shape ambiguity (process vs. technical TODOs), CJK/mixed-language conversations, and decision-impact-vs-followup-TODO triage. F1 dropped 12 pp from the 9-fixture row above; that's not a model regression — running the v1.0 fixtures alone against the same prompt still scores 76%. The 64% is the more honest measurement of the same extractor on a less cherry-picked fixture distribution. The biggest remaining lever is `todo` precision (11 of the 19 false positives are TODOs); per the baseline-doc analysis the next move is a post-extract pairwise-content dedup pass, tracked for v2.6.

Sample misses, sample false positives, the per-fixture detail, the v1.0 → v1.1 delta analysis, and the methodology are all in the [baseline doc](docs/benchmarks/cceb-baseline.md). We'd rather publish numbers we can defend on cross-examination than shop a leaderboard score that drifts the moment the upstream model updates.

**LongMemEval-50** (cross-corpus sanity check, [`bench/longmemeval/`](bench/longmemeval/)): on a deterministic 50-question subset of LongMemEval-S-cleaned, our literal-token evidence-preservation rubric scores **0 / 50 full + 2 / 50 partial** with `gpt-4o-mini` (~12 min, ~\$0.40). This is a deliberately strict proxy ("did every key token of the upstream answer survive into our extracted memories?", **not** LongMemEval native QA correctness — see [the spike doc §4.3](docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md) for the rubric); 0/50 says ai-memory is *not* pointed at open-domain QA over a 500-turn haystack, and the per-question matched/total counts in the [baseline doc](docs/benchmarks/cceb-baseline.md#longmemeval-50--gpt-4o-mini--2026-04-27-v25-08-evidence-preservation-rubric) show where partial signal does land (single-session-preference: 3-6 of 17-43 tokens consistently). LongMemEval, LoCoMo, et al. measure runtime *recall* (did the agent remember a fact); we measure *extraction* (did we get the right structured artefact out of the chat). Different layer, different question — see also the [category-positioning ADR](docs/decisions/2026-04-25-category-positioning.md).

### Other things it handles

- **Token savings** — `context` compresses thousands of turns into a focused prompt (typically 90%+ reduction vs. pasting raw history).
- **Team-aware** — per-author subdirectories under `.ai-memory/{author}/`, no merge conflicts when two people commit memories from the same project.
- **Cross-device portable** — `export` / `import` round-trip the whole store as a versioned JSON bundle.
- **Zero config** — `npx ai-memory-cli init --with-mcp` and you're done.

---

## FAQ

### "Doesn't 1M-token context obsolete you?"

Short answer: long context and `ai-memory` solve different parts of
the same problem. 1M-token windows let the model *see* a long
conversation in one query; `ai-memory` makes that conversation's
*decisions* persistent, reviewable, and shareable across sessions,
machines, and teammates. We answer the question seriously below
because it's the most-cited objection on HN to any structured-memory
tool.

**Cost compounds when you re-ship history every query.** Frontier
input pricing as of 2026-04 sits at ~\$1–\$3 per 1M tokens
([Anthropic](https://www.anthropic.com/pricing) /
[OpenAI](https://openai.com/api/pricing) /
[Google AI](https://ai.google.dev/pricing)). A two-week Cursor
session reliably runs 100–300K tokens once tool-call payloads and
file diffs are included; pasting that into every turn costs
**\$0.20–\$0.60 per query** before you've asked anything. An
`AGENTS.md` generated from the same conversation is on the order of
1–5K tokens, loaded **once per session**. Multiply by your team
size and queries-per-day; the gap is two orders of magnitude.

**Long-context retrieval still degrades on non-headline
information.** "Lost in the middle"
([Liu et al. 2023](https://arxiv.org/abs/2307.03172)) and
needle-in-haystack at 1M scale
([BABILong, Kuratov et al. 2024](https://arxiv.org/abs/2406.10149))
both show measurable recall drop on multi-hop retrieval past
~128–256K tokens, even on models that advertise 1M-token windows.
Long context works well for the most-recent and most-prominent
turns; it degrades on the everyday "wait, what did we decide about
X three weeks ago?" question — exactly the queries memory tools are
designed for. Extraction is lossless on the only signal that
matters (the typed decision / convention / architecture).

**Long context is per-machine; `AGENTS.md` is per-repo.** Your
laptop's chat history doesn't help your teammate's first day. A
`.ai-memory/` directory committed to git does — it's reviewable in
PRs, branchable, revertable, and re-readable by every editor on
every machine that clones the repo. See
[What only ai-memory does](#what-only-ai-memory-does) — points 3
and 4 are the long form.

We'll re-spike this FAQ if (a) sub-\$0.50/M frontier pricing ships,
(b) long-context benchmarks show <5% retrieval degradation past
500K, or (c) editors start shipping native cross-session
conversation compression. Trigger list and full reasoning are in
[`docs/1m-context-faq-spike-2026-04-27.md`](docs/1m-context-faq-spike-2026-04-27.md).

---

## Quick Start

```bash
# 30-second demo — no API key required.
# Bootstraps a 3-memory hand-curated store in a tmp dir and prints the
# AGENTS.md it generates (the file Cursor / Codex / Windsurf / Copilot all
# read at session start). Cleans up afterwards.
npx ai-memory-cli try

# Set up API key (any OpenAI-compatible provider)
export AI_REVIEW_API_KEY=sk-...    # or OPENAI_API_KEY

# Initialise project (optionally register ai-memory as an MCP server)
npx ai-memory-cli init --with-mcp

# One-shot health check — verifies editors, API key, store, MCP config
npx ai-memory-cli doctor

# Extract knowledge from all conversations
npx ai-memory-cli extract

# Search your knowledge base
npx ai-memory-cli search "authentication"

# Generate Cursor Rules from conventions
npx ai-memory-cli rules

# Generate a context prompt and copy to clipboard
npx ai-memory-cli context --copy

# Commit to git
git add .ai-memory/ && git commit -m "chore: add ai-memory knowledge base"
```

---

## Commands

### `try` — No-API-key demo (30 seconds, zero credentials)

Bootstraps a hand-curated 3-memory store in a tmp dir, runs the real `rules --target agents-md` pipeline against it, and prints the generated AGENTS.md inline. No LLM call, no API key, no changes to your working directory — just a concrete answer to "what does this thing actually produce?" before you commit to setup.

```bash
npx ai-memory-cli try                     # full demo, tmp dir cleaned up afterwards
npx ai-memory-cli try --keep              # leave the tmp scenario on disk for inspection
npx ai-memory-cli try --json              # structured output (counts, AGENTS.md content, paths)
```

The bundled scenario contains 1 decision (PKCE auth flow), 1 architecture record (event-sourced billing audit log), and 1 convention (Relay-style cursor pagination) across two authors. Only conventions and decisions land in AGENTS.md — the same filter the real `rules` command uses on your own memories.

### `doctor` — One-shot health check

Run this after `try` if you decide to set ai-memory up against your real chat history. It diagnoses the six most common setup problems and tells you exactly how to fix each one.

```bash
npx ai-memory-cli doctor                 # human-readable report
npx ai-memory-cli doctor --no-llm-check  # skip live API call (offline / CI)
npx ai-memory-cli doctor --json          # structured output for automation / bug reports
```

Checks cover: Node.js version, detected editors (Cursor / Claude Code / Windsurf / Copilot / Codex CLI + conversation counts), LLM provider + live connectivity probe, memory store + author resolution, embeddings freshness, and MCP config registration. Exit code is `0` if everything passes, `1` if any check fails. When no API key is configured, `doctor` now points at `try` as the no-key fast path.

### `list` — Show available conversations

```bash
npx ai-memory-cli list                            # show all conversations
npx ai-memory-cli list --source cursor             # only Cursor conversations
npx ai-memory-cli list --json                      # JSON output
```

### `extract` — Extract memories from conversations

```bash
npx ai-memory-cli extract                          # extract all conversations
npx ai-memory-cli extract --incremental             # only new conversations
npx ai-memory-cli extract --pick 3                  # only conversation #3
npx ai-memory-cli extract --pick 1,4,7              # multiple conversations
npx ai-memory-cli extract --id b5677be8             # match by ID prefix
npx ai-memory-cli extract --since "3 days ago"      # only recent conversations
npx ai-memory-cli extract --type decision,todo      # only specific types
npx ai-memory-cli extract --dry-run                 # preview without writing
npx ai-memory-cli extract --force                   # overwrite existing files
npx ai-memory-cli extract --author "alice"          # override author name
npx ai-memory-cli extract --redact                  # scrub secrets / PII before LLM call (v2.5+)
npx ai-memory-cli extract --verbose                 # show LLM request details
npx ai-memory-cli extract --json                    # JSON output (CI friendly)
```

#### `--redact` — scrub secrets / PII / internal hostnames before sending to the LLM (v2.5+)

`extract`, `summary`, and `context --summarize` ship conversation excerpts to your configured LLM provider. "Local-first" applies to the **storage layer** — `.ai-memory/` is plain Markdown that we never upload — but the **extraction call** is necessarily an outbound HTTPS request. If your chat history contains accidentally pasted API keys, internal hostnames in stack traces, or customer email addresses in logs, `--redact` scrubs them before the request leaves your machine.

```bash
$ ai-memory extract --redact
   ...
Redaction: 5 items scrubbed before LLM (118 chars) — 3 openai-key, 2 email
```

Default-on rules (10): OpenAI / Anthropic / AWS / GitHub / Slack / GCP / Stripe API keys, RFC5322 emails, and `*.internal` / `*.corp` / `*.local` / `*.lan` / `*.intra` hostnames. Two opt-in rules (`jwt`, `aws-secret-key`) are off by default because they have high false-positive rates against long base64 strings; enable them via `.ai-memory/.config.json`:

```json
{
  "redact": {
    "enabled": true,
    "enableOptional": ["jwt"],
    "rules": [{ "name": "internal-jira", "pattern": "JIRA-[0-9]{4,}" }]
  }
}
```

CLI overrides config: `--no-redact` always disables, `--redact` always enables. The audit trail (per-rule hit counts) is always on when redaction is on, in both human and `--json` output. The matched value is **never** logged — that would defeat the purpose.

> **Threat model.** Defense-in-depth, **not** a substitute for proper secrets management. The full policy doc — including out-of-scope items (image attachments, retroactive scrubbing of pre-existing memories, structured-PII vault inspection) and the threat-model boundaries — lives at [`docs/redaction-policy-2026-04-26.md`](docs/redaction-policy-2026-04-26.md).

### `search` — Search through extracted memories

```bash
npx ai-memory-cli search "OAuth"                   # keyword search across all memories
npx ai-memory-cli search "payment" --type decision  # filter by type
npx ai-memory-cli search "auth" --author alice      # filter by author
npx ai-memory-cli search "API" --include-resolved   # include resolved memories
npx ai-memory-cli search "config" --json            # JSON output
```

Results are ranked by relevance (title matches > content > context) with highlighted keywords.

### `recall` — Time-travel a memory through git history

Every other "memory" tool flattens its store down to "the latest" — every
superseded version is silently overwritten. Because `.ai-memory/` is plain
Markdown in a git repo, the *full lineage* of every fact is already on disk;
`recall` exposes it as a first-class command.

```bash
npx ai-memory-cli recall "OAuth"                   # show how the OAuth decision evolved
npx ai-memory-cli recall "OAuth" --include-resolved # include superseded / resolved memories
npx ai-memory-cli recall "API" --type decision      # filter by type
npx ai-memory-cli recall "auth" --all-authors       # search across the whole team
npx ai-memory-cli recall "OAuth" --json             # structured output (one entry per memory + its commit list)
```

Output looks like:

```
Recall: "OAuth" — 1 memory, 4 commits of lineage

[+] CURRENT  Use OAuth 2.0 PKCE for SPA  @conor (2026-04-20)
    .ai-memory/conor/decisions/2026-04-20-use-oauth-pkce.md
    History (4 commits):
      a1b2c3d  2026-04-20  conor   ~ Tighten OAuth PKCE: require HTTPS-only token endpoint
      e4f5g6h  2026-04-15  conor   ~ Switch from implicit flow to PKCE
      i7j8k9l  2026-03-20  conor   + Add OAuth library notes
    > git log --follow .ai-memory/conor/decisions/2026-04-20-use-oauth-pkce.md  for full diffs
```

- Uses `git log --follow` so renames inside `.ai-memory/` are tracked
  transparently.
- Each line shows short SHA, ISO date, author, status code (`+` added, `~`
  modified, `-` deleted, `R` renamed), and commit subject.
- **Soft fallback** — outside a git repo, or before the first commit of
  `.ai-memory/`, recall still returns the matching memories with a hint
  explaining what's missing. There is no scenario where `recall` is worse
  than `search`.
- No new runtime dep — pure `node:child_process.execFile` against your
  existing `git` with bounded 10s timeouts.

### `rules` — Export conventions as Cursor Rules, AGENTS.md, **and** Anthropic Skills

Generate editor rules that every AI tool reads natively:

```bash
npx ai-memory-cli rules                            # default: .cursor/rules/ai-memory-conventions.mdc
npx ai-memory-cli rules --target agents-md         # AGENTS.md (Codex / Cursor / Windsurf / Copilot / Amp)
npx ai-memory-cli rules --target skills            # Anthropic Skills (Claude Code) — v2.5+
npx ai-memory-cli rules --target both              # write Cursor Rules + AGENTS.md at default paths
npx ai-memory-cli rules --output my-rules.mdc      # custom output (single-target only)
npx ai-memory-cli rules --all-authors              # include team conventions
```

`--target agents-md` performs an **idempotent merge**: only the section between
`<!-- ai-memory:managed-section start --> ... end -->` is touched, so any
hand-written content in your `AGENTS.md` is preserved byte-for-byte. Re-running
with no new memories is a no-op (`already-up-to-date`); malformed markers from
a partial edit are reported as a conflict and the file is left untouched.

`--target skills` writes [Anthropic Skills](https://docs.anthropic.com/en/docs/claude-code/skills) under `.claude/skills/`. Three skills get generated, one per long-lived memory type:

| Skill | Source | What it tells Claude |
|---|---|---|
| `.claude/skills/ai-memory-coding-conventions/SKILL.md` | `convention` memories | When writing new code / naming things / designing APIs |
| `.claude/skills/ai-memory-decision-log/SKILL.md` | `decision` memories (status ≠ resolved) | When proposing architectural changes / asked why a choice was made |
| `.claude/skills/ai-memory-system-architecture/SKILL.md` | `architecture` memories | When implementing cross-component features / debugging integration |

Skills are loaded **dynamically** by Claude Code based on the YAML frontmatter `description` matching your request — unlike AGENTS.md (always-on context), the body only enters context when relevant. The schema we target (frozen 2026-04-26) lives at [`docs/skills-schema-snapshot-2026-04-26.md`](docs/skills-schema-snapshot-2026-04-26.md). The `ai-memory-` prefix on skill names is an ownership signal: anything inside `.claude/skills/ai-memory-*/` is **fully regenerated** every run; user-authored skills under any other directory name are left alone.

This is the **conversation-to-rules pipeline** — extract conventions from chat
history, auto-generate the rules files every AI editor reads. No other tool
emits all three of Cursor Rules + AGENTS.md + Anthropic Skills from a single chat-history input.

### `resolve` — Mark memories as resolved

Decisions get overturned. TODOs get completed. Keep your knowledge base fresh:

```bash
npx ai-memory-cli resolve "OAuth"                  # mark matching memories as resolved
npx ai-memory-cli resolve "OAuth" --undo           # reactivate resolved memories
```

Resolved memories are automatically excluded from `context`, `summary`, and `search` results. Use `--include-resolved` to force inclusion.

### `summary` — Generate a project-level summary

```bash
npx ai-memory-cli summary                          # write/update SUMMARY.md
npx ai-memory-cli summary --output MEMORY.md       # custom output path
npx ai-memory-cli summary --focus "payment module"  # focus on a topic
npx ai-memory-cli summary --all-authors             # include all team members
npx ai-memory-cli summary --include-resolved        # include resolved memories

# Scope summary to a single conversation (no LLM cost for the wrong chats)
npx ai-memory-cli summary --list-sources           # list conversations first
npx ai-memory-cli summary --source-id b5677be8     # summarize ONE chat
npx ai-memory-cli summary --convo "payment refactor"
```

### `context` — Generate a continuation prompt

For seamlessly resuming work in a new conversation or on another machine:

```bash
npx ai-memory-cli context                          # generate context block (instant, no LLM)
npx ai-memory-cli context --copy                   # generate and copy to clipboard
npx ai-memory-cli context --topic "coupon system"  # focus on a specific topic
npx ai-memory-cli context --recent 7               # only last 7 days of memories
npx ai-memory-cli context --output CONTEXT.md      # write to file
npx ai-memory-cli context --summarize              # use LLM for condensed prose summary
npx ai-memory-cli context --all-authors            # include all team members
npx ai-memory-cli context --include-resolved       # include resolved memories
```

**Scope context to a single conversation** — because in real life you usually want to resume *one* chat, not dump everything:

```bash
# 1. See which conversations produced memories
npx ai-memory-cli context --list-sources
#  #  Date        Source        ID        Count  Types              Title
#  ------------------------------------------------------------------------------
#   1  2026-04-01  cursor        b5677be8    12  D:4 A:3 C:5        resume tool
#   2  2026-03-28  claude-code   ff12abc3     7  A:4 T:3            ai-lab

# 2. Copy context from ONE conversation (ID prefix, like git short hash)
npx ai-memory-cli context --source-id b5677be8 --copy

# 3. Or match by conversation title — picks the most recent if multiple match
npx ai-memory-cli context --convo "resume tool" --copy
npx ai-memory-cli context --convo "resume" --all-matching --copy   # include every "resume*" chat
```

### `link` — Link memories to the commits that implement them (v2.6)

```bash
npx ai-memory-cli link                             # scan last 30 days of commits
npx ai-memory-cli link --since "7 days ago"        # custom time window
npx ai-memory-cli link --dry-run                   # preview links without writing
npx ai-memory-cli link --clear-auto                # remove all auto-generated links
```

Scans your git log and scores each (memory, commit) pair using weighted token overlap: memory title × 3, type × 2, content × 1 vs commit subject × 3, changed paths × 2, body × 1. High-confidence matches (`score ≥ 0.70`) are written into the memory file as an invisible HTML comment block that the dashboard can surface. The default threshold is conservative — a bad auto-link is worse than no link. Use `--dry-run` first on a real repo to calibrate.

### `init` — Initialize configuration

```bash
npx ai-memory-cli init                             # detect editors, create config
npx ai-memory-cli init --with-mcp                  # also register ai-memory as MCP server
npx ai-memory-cli init --schedule                  # register a daily extract --incremental cron job
npx ai-memory-cli init --unschedule                # remove the scheduled task
```

With `--with-mcp`, ai-memory writes / merges `.cursor/mcp.json` and `.windsurf/mcp.json` so your editor picks up the MCP server automatically. With `--schedule`, a daily extraction job is registered with the OS-native scheduler (launchd on macOS, crontab on Linux, Task Scheduler on Windows) — so your knowledge base stays fresh without any manual runs. Both flags are idempotent and safe.

### `export` / `import` — Move memories between machines (NEW)

Cursor / Claude Code conversations live in each machine's local state, so a new laptop starts with no history. `export` and `import` create a portable JSON bundle that round-trips cleanly — same files, same conversation grouping, same `context --source-id` behavior on the destination.

```bash
# On the old machine — export everything (or scope with --source-id / --convo / --type)
npx ai-memory-cli export --output backup.ai-memory.json
npx ai-memory-cli export --source-id b5677be8 --output resume-tool.json  # one chat only
npx ai-memory-cli export --convo "coupon" --output coupons.json          # match by title

# Copy / commit / share the bundle (it's a plain JSON file)

# On the new machine — preview first, then apply
npx ai-memory-cli import backup.ai-memory.json --dry-run
npx ai-memory-cli import backup.ai-memory.json               # default: skip duplicates
npx ai-memory-cli import teammate-bundle.json --author me    # remap teammate's memories
npx ai-memory-cli import stale.json --overwrite              # replace local copies

# Rebuild embeddings so semantic search/MCP work on the imported memories
npx ai-memory-cli reindex
```

Bundle format is versioned (`version: 1`) and import is **idempotent** — running the same import twice is a no-op (dedup on author + type + date + title).

---

## MCP Server (NEW)

ai-memory can run as an **MCP server**, giving AI editors (Cursor, Claude Code) direct access to your knowledge base — no manual commands needed.

### Setup

Add to your Cursor MCP config (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "npx",
      "args": ["ai-memory-cli", "serve"]
    }
  }
}
```

Or for Claude Code (`.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "npx",
      "args": ["ai-memory-cli", "serve"]
    }
  }
}
```

### What the AI gets

| MCP Capability | What it does |
|---|---|
| `remember` tool | AI stores decisions/conventions/todos during conversations (auto-indexed) |
| `recall` tool | AI retrieves relevant memories using semantic + keyword hybrid search |
| `search_memories` tool | Full search with type/author/resolved filtering, semantic-aware |
| `project-context` resource | Auto-provides project context when starting a conversation |

Once configured, the AI can automatically remember important decisions and recall them in future sessions — without you running any commands.

### Semantic Search

ai-memory uses **hybrid search** combining semantic similarity (via embeddings), keyword matching, and time decay. This means you can search by meaning, not just exact keywords.

```bash
# Build search index (uses your existing LLM API for embeddings)
npx ai-memory-cli reindex

# Now search works semantically — "database choice" finds "PostgreSQL decision"
npx ai-memory-cli search "database choice"
```

The MCP `recall` and `search_memories` tools use hybrid search automatically. Embeddings are stored locally in `.ai-memory/.embeddings.json` and auto-indexed when using the `remember` tool.

### Manual start (for testing)

```bash
npx ai-memory-cli serve           # start MCP server
npx ai-memory-cli serve --debug   # with debug logging
```

---

## Watch Mode (NEW)

Automatically extract knowledge when conversations change — zero manual effort:

```bash
npx ai-memory-cli watch
```

Watch mode monitors all detected sources for new conversation activity and runs extraction automatically. It uses file system events (for Cursor/Claude Code) and periodic polling (for all sources) to detect changes.

```
ai-memory watch — auto-extract on conversation changes

   Author: conor
   Output: .ai-memory/
   [+] Watching: Cursor
   [+] Watching: Claude Code

Initial scan complete — watching for changes...

10:15:32 [Cursor] "OAuth refactor discussion" (+8 turns) — extracting...
10:15:37 [+] 2 decision, 1 convention
```

Press `Ctrl+C` to stop.

---

## Dashboard (NEW)

Browse, search, and visualize your knowledge base in a local web UI:

```bash
npx ai-memory-cli dashboard
```

Opens `http://localhost:3141` with:

- **Overview** — stats cards, monthly timeline chart, author breakdown, recent activity
- **Memory browser** — real-time search, filter by type/author/status, detail modal
- **Conversations** — one card per chat window that produced memories, with a one-click `context --source-id` copy so you can jump from "which chat did I make that decision in?" to "resume that chat in a new session"
- **Knowledge graph** — interactive D3.js force-directed graph (nodes colored by type, edges by shared conversation or keywords)
- **Quality** — specificity histogram, vague content list, duplicate/subsumed pairs (powered by the v2.2 algorithm stack)
- **Export** — download as JSON, Obsidian vault (with YAML frontmatter), or copy to clipboard

```bash
npx ai-memory-cli dashboard --port 8080   # custom port
```

### Clean up existing memories with the new algorithms

If you upgraded from an older version and want to retroactively apply the v2.2 quality algorithms to remove vague/duplicate memories you accumulated earlier:

```bash
npx ai-memory-cli reindex --dedup --dry-run   # preview what would be deleted
npx ai-memory-cli reindex --dedup             # actually delete + update index
```

Typical cleanup on a 200+ memory store removes 20–30% as vague/duplicate/subsumed.

---

## Local LLM Support (NEW)

Use Ollama or LM Studio instead of cloud APIs — **no API key needed**:

### Ollama

```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.2              # download a model
ollama pull nomic-embed-text      # (optional) for semantic search

export OLLAMA_HOST=http://localhost:11434
export OLLAMA_MODEL=llama3.2      # extraction model
npx ai-memory-cli extract
```

### LM Studio

```bash
# Start LM Studio and load a model
export LM_STUDIO_BASE_URL=http://localhost:1234/v1
export LM_STUDIO_MODEL=your-model-name
npx ai-memory-cli extract
```

Cloud API keys always take priority over local LLM. If you have `OPENAI_API_KEY` or `AI_REVIEW_API_KEY` set, those will be used.

| Variable | Description |
|----------|-------------|
| `OLLAMA_HOST` | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model for extraction (default: `llama3.2`) |
| `OLLAMA_EMBEDDING_MODEL` | Model for semantic search (default: `nomic-embed-text`) |
| `LM_STUDIO_BASE_URL` | LM Studio server URL (default: `http://localhost:1234/v1`) |
| `LM_STUDIO_MODEL` | Model name |

---

## Supported Sources

| Source | Data location | Status |
|--------|---------------|--------|
| **Cursor** | `~/.cursor/projects/{name}/agent-transcripts/` | Stable |
| **Claude Code** | `~/.claude/projects/{path}/*.jsonl` | Stable |
| **Windsurf** | `~/AppData/Windsurf/User/workspaceStorage/*/state.vscdb` | Beta |
| **VS Code Copilot** | `~/AppData/Code/User/workspaceStorage/*/chatSessions/*.json` | Beta |
| **Codex CLI** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Beta — v2.5+ |

---

## Typical Workflow

### First extraction

```bash
npx ai-memory-cli list                    # see what conversations are available
npx ai-memory-cli extract                 # extract everything (few minutes on first run)
npx ai-memory-cli rules                   # generate Cursor Rules
git add .ai-memory/ .cursor/rules/
git commit -m "chore: add ai-memory knowledge base"
```

### Daily use (incremental)

```bash
npx ai-memory-cli extract --incremental   # after a productive coding session
npx ai-memory-cli rules                   # refresh Cursor Rules
git add .ai-memory/ && git commit -m "chore: update memories"
```

### Starting a new conversation

```bash
npx ai-memory-cli context --copy          # copy context to clipboard
# Paste into new Cursor/Claude Code session
```

The output looks like:

```markdown
## Project Context

### Key Decisions (follow without re-discussion)
- **Use OAuth Bridge pattern**: WebView cannot receive redirect directly...

### Conventions (always follow)
- **Never call getServerSideProps in this project**: ...

### Active TODOs
- [ ] Add retry logic to payment webhook handler
```

### Finding specific knowledge

```bash
npx ai-memory-cli search "payment"        # find all payment-related memories
npx ai-memory-cli search "auth" --type decision  # only decisions about auth
```

---

## Team Workflow

When multiple people use ai-memory in the same git repo, each person's memories are automatically stored in their own subdirectory.

### How it works

Author identity is auto-detected (priority: `--author` CLI flag > `config.author` > `git config user.name` > OS username). No manual setup needed.

```
.ai-memory/
├── conor/
│   ├── decisions/
│   │   └── 2026-04-15-oauth-bridge.md
│   └── todos/
│       └── 2026-04-15-add-retry.md
├── alice/
│   ├── decisions/
│   │   └── 2026-04-16-payment-design.md
│   └── architecture/
│       └── 2026-04-16-module-split.md
└── .config.json
```

### Usage

```bash
# Everyone extracts normally — writes to their own directory
npx ai-memory-cli extract --incremental

# Generate your own context (default: only your memories)
npx ai-memory-cli context --copy

# Include the whole team's memories
npx ai-memory-cli summary --all-authors
npx ai-memory-cli context --all-authors --copy

# Override author name
npx ai-memory-cli extract --author "alice"
```

### Upgrading existing projects

Memories created before v1.3 are stored in flat directories (`.ai-memory/decisions/`). After upgrading:

- Old files are still read normally (backwards compatible), with `author` empty
- New extractions go to `.ai-memory/{author}/decisions/` etc.
- No manual migration required

---

## Cross-Device Workflow

```
Work machine                                   Home machine
────────────                                   ────────────
Cursor / Claude Code dev work
        -> npx ai-memory-cli extract --incremental
        -> git add .ai-memory/
git commit && git push
                                               git pull
                                               -> npx ai-memory-cli context --topic "today's work"
                                               -> Paste context into new conversation
                                               -> Seamlessly resume
```

---

## Configuration

`ai-memory` works with zero config. To customize, run `npx ai-memory-cli init` or create `.ai-memory/.config.json` manually:

```jsonc
{
  "sources": {
    "cursor": { "enabled": true, "projectName": "my-project" },
    "claudeCode": { "enabled": true },
    "windsurf": { "enabled": true },
    "copilot": { "enabled": true }
  },
  "extract": {
    "types": ["decision", "architecture", "convention", "todo", "issue"],
    "ignoreConversations": [],    // conversation UUIDs to skip
    "minConversationLength": 5   // skip very short conversations
  },
  "output": {
    "dir": ".ai-memory",
    "summaryFile": "SUMMARY.md",
    "language": "zh"             // "zh" or "en" — output language for summaries
  },
  "model": "",                   // leave empty for auto-selection
  "author": ""                   // leave empty to auto-detect from git config user.name
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `AI_REVIEW_API_KEY` | API key (preferred, shared with ai-review-pipeline) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_BASE_URL` | Custom OpenAI-compatible API base URL |
| `OPENAI_MODEL` | Model override for OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key (requires compatible proxy) |
| `ANTHROPIC_BASE_URL` | Anthropic proxy base URL |
| `AI_REVIEW_BASE_URL` | Custom API base URL |
| `AI_REVIEW_MODEL` | Model to use (default: `gpt-4o-mini`) |
| `OLLAMA_HOST` | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Ollama model for extraction |
| `OLLAMA_EMBEDDING_MODEL` | Ollama model for semantic search embeddings |
| `LM_STUDIO_BASE_URL` | LM Studio API URL |
| `LM_STUDIO_MODEL` | LM Studio model name |

---

## Output Structure

Each memory is its own file, organized by author and type:

```
.ai-memory/
├── SUMMARY.md                              # Project summary (from `summary` command)
├── conor/                                  # Per-author subdirectory
│   ├── decisions/
│   │   ├── 2026-04-12-oauth-bridge-pattern.md
│   │   └── 2026-04-13-async-job-queue-design.md
│   ├── architecture/
│   │   └── 2026-04-10-payment-module-design.md
│   ├── conventions/
│   │   └── 2026-04-08-coding-conventions.md
│   ├── todos/
│   │   └── 2026-04-12-add-retry-logic.md
│   └── issues/
│       └── 2026-04-11-sqlite-locking-fix.md
├── .index/                                 # Extraction index (auto-managed)
├── .config.json                            # Configuration (commit this)
└── .state.json                             # Extraction state (add to .gitignore)
```

Add `.ai-memory/.state.json` to `.gitignore` — it tracks which conversations have been processed and is machine-specific.

---

## CI Integration

```yaml
# .github/workflows/memory.yml
- name: Extract AI memories
  run: npx ai-memory-cli extract --incremental --json
  env:
    AI_REVIEW_API_KEY: ${{ secrets.AI_REVIEW_API_KEY }}
```

---

## Requirements

- Node.js >= 18
- An API key for any OpenAI-compatible provider, **or** a local LLM (Ollama / LM Studio)

> **Tip:** Node.js 22+ enables richer conversation titles by reading Cursor/Windsurf's database. On Node 18-20, titles are extracted from the first message (still works fine).

## License

MIT — [Conor Liu](https://github.com/hyxnj666-creator)
