# ai-memory

[![npm version](https://img.shields.io/npm/v/ai-memory-cli.svg)](https://www.npmjs.com/package/ai-memory-cli)
[![CI](https://github.com/hyxnj666-creator/ai-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/hyxnj666-creator/ai-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Turn AI editor chat history into typed Markdown + `AGENTS.md` rules — local-first, git-trackable, zero `.remember()` calls.

<!--
  Hero GIF slot. Render with:  npm run demo:render
  The rendered GIF lives at docs/assets/demo/demo.gif. Replace this
  comment with:
    ![ai-memory in 30 seconds](docs/assets/demo/demo.gif)
  See docs/assets/demo/RECORDING.md for the full workflow + decision log.
-->

```bash
npx ai-memory-cli extract                     # read your editor's chat history → typed Markdown
npx ai-memory-cli rules --target agents-md    # → AGENTS.md (Cursor / Claude / Windsurf / Copilot all read it)
npx ai-memory-cli recall "OAuth"              # show the full git lineage of any decision
npx ai-memory-cli context --copy              # resume any session with full context
```

Every other "AI memory" tool starts with a `remember()` API and asks you to instrument your code. **`ai-memory` reads your editor's chat history directly** — Cursor, Claude Code, Windsurf, Copilot Chat — and turns it into typed, git-trackable Markdown that every AI editor reads back via `AGENTS.md`. No new API surface to learn, no runtime memory store to keep alive between sessions.

**Local-first by default.** Conversations never leave your machine; the only network call is to whichever LLM provider you've configured for extraction. Or use Ollama / LM Studio for fully offline operation.

> **[中文文档](README.zh-CN.md)**

---

## What only ai-memory does

Four things you won't find together anywhere else. The first three are structural; the fourth is engineering investment nobody else is making.

1. **Zero `.remember()` boilerplate.** We read what you've already written — the Cursor / Claude Code / Windsurf / Copilot Chat transcripts that already live on your disk. No SDK to import, no runtime memory store to keep alive. Compare with mem0 / Letta / Zep / cortexmem, which require `client.add(...)` calls from your application code.

2. **Native `AGENTS.md` output.** `ai-memory rules --target agents-md` writes the cross-tool standard rules file that Cursor, Claude Code, Windsurf, and Copilot all consume. The merge is idempotent: only the section between `<!-- ai-memory:managed-section start --> ... end -->` is touched; any hand-written content in your `AGENTS.md` is preserved byte-for-byte. `AGENTS.md` adoption crossed 60K repos and is now under Linux Foundation stewardship — most projects hand-write theirs from scratch; we generate it from your conversation history.

3. **Plain Markdown in git — no database.** `.ai-memory/` is the source of truth: Markdown files you `git diff`, code-review, branch, and revert. Other tools that advertise "git-trackable" memory ship git-tracked snapshots of their *internal store*; we ship the human-readable file format and let git own everything. Cross-machine sync is `git pull`.

4. **Time-travel recall via git history.** `ai-memory recall <query>` shows the full commit-by-commit lineage of every memory: what the decision said on April 1, what it said on April 15, what changed and who changed it. Every other memory tool returns "the latest" only — superseded versions are silently overwritten. No new runtime dep: `recall` shells out to your existing `git` with a 10-second timeout.

## We measure ourselves

[CCEB v1 — Cursor Conversation Extraction Benchmark](docs/benchmarks/cceb-baseline.md), `gpt-4o-mini`, 9 hand-curated fixtures, 2026-04-25:

| Metric | Score |
|---|---|
| Overall F1 | **56.0%** (precision 43.8%, recall 77.8%) |
| Noise-fixture handling (chit-chat + deferred-decision) | **100%** — no hallucinated memories |
| Wall-clock | 70.5 s |
| Spend | ≈ $0.005 |

The shape — high recall, lower precision dragged down by *over-extraction* (one logical decision sometimes splits into 2–4 candidate memories) — is documented openly with sample misses, sample false positives, and the exact v2.5 prompt-tuning work it points at. We'd rather publish 56% honestly than shop a number that drifts the moment the upstream model updates.

Why a custom benchmark? LongMemEval, LoCoMo, et al. measure runtime *recall* (did the agent remember a fact); we measure *extraction* (did we get the right structured artefact out of the chat). Different layer, different question. See the [category-positioning ADR](docs/decisions/2026-04-25-category-positioning.md).

### Other things it handles

- **Token savings** — `context` compresses thousands of turns into a focused prompt (typically 90%+ reduction vs. pasting raw history).
- **Team-aware** — per-author subdirectories under `.ai-memory/{author}/`, no merge conflicts when two people commit memories from the same project.
- **Cross-device portable** — `export` / `import` round-trip the whole store as a versioned JSON bundle.
- **Zero config** — `npx ai-memory-cli init --with-mcp` and you're done.

---

## Quick Start

```bash
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

### `doctor` — One-shot health check

Run this first. It diagnoses the six most common setup problems and tells you exactly how to fix each one.

```bash
npx ai-memory-cli doctor                 # human-readable report
npx ai-memory-cli doctor --no-llm-check  # skip live API call (offline / CI)
npx ai-memory-cli doctor --json          # structured output for automation / bug reports
```

Checks cover: Node.js version, detected editors (Cursor / Claude Code / Windsurf / Copilot + conversation counts), LLM provider + live connectivity probe, memory store + author resolution, embeddings freshness, and MCP config registration. Exit code is `0` if everything passes, `1` if any check fails.

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
npx ai-memory-cli extract --verbose                 # show LLM request details
npx ai-memory-cli extract --json                    # JSON output (CI friendly)
```

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

### `rules` — Export conventions as Cursor Rules **and** AGENTS.md

Generate editor rules that every AI tool reads natively:

```bash
npx ai-memory-cli rules                            # default: .cursor/rules/ai-memory-conventions.mdc
npx ai-memory-cli rules --target agents-md         # AGENTS.md (Codex / Cursor / Windsurf / Copilot / Amp)
npx ai-memory-cli rules --target both              # write both files at default paths
npx ai-memory-cli rules --output my-rules.mdc      # custom output (single-target only)
npx ai-memory-cli rules --all-authors              # include team conventions
```

`--target agents-md` performs an **idempotent merge**: only the section between
`<!-- ai-memory:managed-section start --> ... end -->` is touched, so any
hand-written content in your `AGENTS.md` is preserved byte-for-byte. Re-running
with no new memories is a no-op (`already-up-to-date`); malformed markers from
a partial edit are reported as a conflict and the file is left untouched.

This is the **conversation-to-rules pipeline** — extract conventions from chat
history, auto-generate the rules files every AI editor reads. No other tool
does this.

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

### `init` — Initialize configuration

```bash
npx ai-memory-cli init                             # detect editors, create config
npx ai-memory-cli init --with-mcp                  # also register ai-memory as MCP server
```

With `--with-mcp`, ai-memory writes / merges `.cursor/mcp.json` and `.windsurf/mcp.json` so your editor picks up the MCP server automatically — no more copy-pasting JSON from this README. Behaviour is **idempotent and safe**: already-registered entries are left alone, and any customisation you've made to `mcpServers["ai-memory"]` is preserved. For Claude Desktop, copy the snippet below to your OS-specific global config path (project-local doesn't apply).

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
