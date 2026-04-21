# ai-memory

[![npm version](https://img.shields.io/npm/v/ai-memory-cli.svg)](https://www.npmjs.com/package/ai-memory-cli)
[![CI](https://github.com/conorliu/ai-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/conorliu/ai-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Turn AI chat history into a searchable, git-trackable knowledge base.

```bash
npx ai-memory-cli extract          # auto-discover conversations, extract knowledge
npx ai-memory-cli search "OAuth"   # find any memory instantly
npx ai-memory-cli rules            # generate Cursor Rules from your conventions
npx ai-memory-cli context --copy   # resume any session with full context
```

Extract structured knowledge from AI editor conversations (Cursor, Claude Code) and save it as git-trackable Markdown files. Stop losing decisions, architecture notes, and conventions buried in chat history.

> **[中文文档](README.zh-CN.md)**

---

## Why ai-memory?

Every day you make dozens of decisions in Cursor or Claude Code. These decisions live in chat history and are lost when you switch machines, start a new conversation, or a teammate joins. **ai-memory turns ephemeral conversations into a persistent, searchable knowledge base.**

| What you get | How |
|---|---|
| **Structured knowledge** | AI extracts decisions, architecture, conventions, TODOs, issues |
| **Git-trackable** | Plain Markdown files you commit alongside your code |
| **Token savings** | `context` command compresses thousands of conversation turns into a focused prompt — typically 90%+ token reduction vs. re-reading history |
| **Team-aware** | Per-author subdirectories, no merge conflicts |
| **Cursor Rules export** | Auto-generate `.cursor/rules/` from extracted conventions — no other tool does this |
| **Zero config** | Works out of the box with `npx` |

---

## Quick Start

```bash
# Set up API key (any OpenAI-compatible provider)
export AI_REVIEW_API_KEY=sk-...    # or OPENAI_API_KEY

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

### `rules` — Export conventions as Cursor Rules

Generate a `.mdc` file that Cursor automatically applies to all AI responses:

```bash
npx ai-memory-cli rules                            # generate .cursor/rules/ai-memory-conventions.mdc
npx ai-memory-cli rules --output my-rules.mdc      # custom output path
npx ai-memory-cli rules --all-authors              # include team conventions
```

This is the **conversation-to-rules pipeline** — extract conventions from chat history, auto-generate editor rules. No other tool does this.

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

### `init` — Initialize configuration

```bash
npx ai-memory-cli init                             # detect editors, create config
```

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
| `remember` tool | AI stores decisions/conventions/todos during conversations |
| `recall` tool | AI retrieves relevant memories for the current task |
| `search_memories` tool | Full search with type/author/resolved filtering |
| `project-context` resource | Auto-provides project context when starting a conversation |

Once configured, the AI can automatically remember important decisions and recall them in future sessions — without you running any commands.

### Manual start (for testing)

```bash
npx ai-memory-cli serve           # start MCP server
npx ai-memory-cli serve --debug   # with debug logging
```

---

## Supported Sources

| Source | Data location | Status |
|--------|---------------|--------|
| **Cursor** | `~/.cursor/projects/{name}/agent-transcripts/` | Supported |
| **Claude Code** | `~/.claude/projects/{path}/*.jsonl` | Beta (auto-detected) |
| Windsurf | Storage path not yet public | Planned |

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
    "claudeCode": { "enabled": true }
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
- An API key for any OpenAI-compatible provider

> **Tip:** Node.js 22+ enables richer conversation titles by reading Cursor's database. On Node 18-20, titles are extracted from the first message (still works fine).

## License

MIT — [Conor Liu](https://github.com/conorliu)
