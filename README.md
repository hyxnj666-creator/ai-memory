# ai-memory

Extract structured knowledge from AI editor conversations (Cursor, Claude Code) and save it as git-trackable Markdown files.

Stop losing technical decisions, architecture notes, and TODOs buried in chat history.

```bash
npx ai-memory-cli extract --incremental
```

> **[中文文档](README.zh-CN.md)**

---

## The Problem

Every day you make dozens of decisions in Cursor or Claude Code: "we'll use the OAuth Bridge pattern", "async jobs go through the SSE bridge", "never call `getServerSideProps` in this project". These decisions live in chat history and are completely lost when:

- You switch to another machine
- You start a new conversation
- A teammate joins the project

`ai-memory` reads your local conversation history, uses AI to extract what matters, and saves it as structured Markdown files you can commit to git.

```
Your chat history      ai-memory              Your git repo
(local, unstructured)  (extract + classify)   (structured, searchable)

Cursor transcripts  →  AI extracts          →  .ai-memory/
Claude Code sessions    decisions/todos/        ├── decisions/
                        architecture/           ├── architecture/
                        issues/conventions      ├── todos/
                                                └── ...
```

---

## Quick Start

Set an API key (uses the same env vars as `ai-review-pipeline`):

```bash
export AI_REVIEW_API_KEY=sk-...          # or OPENAI_API_KEY / ANTHROPIC_API_KEY
export AI_REVIEW_BASE_URL=https://...    # optional, for custom endpoints
```

Run against your current project:

```bash
npx ai-memory extract
```

On first run, this auto-detects your Cursor/Claude Code history, processes all conversations, and writes `.ai-memory/` into your current directory. Commit it:

```bash
git add .ai-memory/
git commit -m "chore: add initial ai-memory knowledge base"
```

---

## Commands

### `list` — Browse available conversations

```bash
npx ai-memory list                             # list all conversations with status
npx ai-memory list --source cursor             # filter by source
npx ai-memory list --json                      # JSON output
```

Output shows index, date, turn count, extraction status (`[+]` extracted, `[ ]` pending), and real title from Cursor's DB.

### `extract` — Extract memories from conversation history

```bash
npx ai-memory extract                          # auto-detect all sources
npx ai-memory extract --incremental            # only new/modified conversations
npx ai-memory extract --pick 4                 # process specific conversation by list index
npx ai-memory extract --pick 1,4,7             # process multiple by index
npx ai-memory extract --id b5677be8            # process by conversation ID prefix
npx ai-memory extract --since "3 days ago"     # conversations modified in last 3 days
npx ai-memory extract --since "2 weeks ago"    # also supports weeks
npx ai-memory extract --source cursor          # specify source
npx ai-memory extract --type decision,todo     # only extract specific types
npx ai-memory extract --dry-run                # preview conversations to process (no LLM, no writes)
npx ai-memory extract --verbose                # show LLM request details
npx ai-memory extract --json                   # JSON output for CI
```

### `summary` — Generate a project-level summary

```bash
npx ai-memory summary                          # write/update SUMMARY.md
npx ai-memory summary --output MEMORY.md       # custom output path
npx ai-memory summary --focus "payment module" # focus on a topic
npx ai-memory summary --verbose                # show LLM debug info
```

### `context` — Generate a continuation prompt

For seamlessly resuming work in a new conversation or on another machine:

```bash
npx ai-memory context                          # generate context block (instant, no LLM)
npx ai-memory context --copy                   # generate and copy to clipboard
npx ai-memory context --topic "coupon system"  # focus on a specific topic
npx ai-memory context --recent 7               # only last 7 days of memories
npx ai-memory context --output CONTEXT.md      # write to file
npx ai-memory context --summarize              # use LLM to write a condensed prose summary
```

The default (no `--summarize`) assembles a structured block directly from your memories — instant, free, and lossless. Paste the output at the start of your next Cursor/Claude Code conversation.

### `init` — Initialize config

```bash
npx ai-memory init
```

Auto-detects which editors you use, creates `.ai-memory/.config.json`, and adds `.ai-memory/.state.json` to your `.gitignore`.

---

## What Gets Extracted

| Type | What it captures |
|------|-----------------|
| **decision** | Technical choices: what was chosen, why, what was rejected |
| **architecture** | System design, module boundaries, data flow |
| **convention** | Coding standards, naming rules, workflow conventions |
| **todo** | Explicitly mentioned follow-up tasks |
| **issue** | Bugs encountered and how they were resolved |

Only concrete, actionable information is extracted. Routine code generation and small talk are ignored.

### Example output

Each memory is saved as its own Markdown file (e.g. `.ai-memory/decisions/2026-03-25-oauth-bridge-webview.md`):

```markdown
# OAuth Bridge Pattern for WebView

> **Date**: 2026-03-25
> **Source**: cursor:fa49d306
> **Conversation**: HF OAuth Integration

---

**Context**: hf-app needs to complete Google/Facebook OAuth inside an embedded WebView

**Content**: Use OAuth Bridge pattern — static/oauth-bridge.html receives the redirect callback and forwards it to the App via postMessage

**Reasoning**: Embedded WebViews cannot receive OAuth redirects directly; bridge page acts as intermediary

**Alternatives**: Deep Link (inconsistent behavior on Android/iOS), Custom URL Scheme (not supported by all browsers)

**Impact**: hf-app login page, oauth-web, backend OAuth callback route
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
# 1. See what conversations are available
npx ai-memory list

# 2. Extract everything (takes a few minutes on first run)
npx ai-memory extract

# 3. Commit the knowledge base
git add .ai-memory/
git commit -m "chore: add ai-memory knowledge base"
```

### Daily use (incremental)

```bash
# After a productive coding session
npx ai-memory extract --incremental

# Commit new memories
git add .ai-memory/ && git commit -m "chore: update memories"
```

### Starting a new conversation

```bash
# Generate a context block and copy to clipboard
npx ai-memory context --copy

# Focus on what you're about to work on
npx ai-memory context --topic "payment module" --copy

# Or write to a file and attach it
npx ai-memory context --output CONTEXT.md
```

Paste the copied prompt at the start of your new Cursor/Claude Code session. The output looks like:

```markdown
## Project Context

### Key Decisions (follow without re-discussion)
- **Use OAuth Bridge pattern**: WebView cannot receive redirect directly...

### Conventions (always follow)
- **Never call getServerSideProps in this project**: ...

### Active TODOs
- [ ] Add retry logic to payment webhook handler
```

The AI will immediately understand your project's decisions, conventions, and current state — no need to re-explain.

### Processing a specific conversation

```bash
# First, find the index of the conversation you want
npx ai-memory list

# Then extract just that one
npx ai-memory extract --pick 3

# Or match by ID prefix (shown in list output)
npx ai-memory extract --id b5677be8
```

---

## Cross-Device Workflow

```
Work machine                                   Home machine
────────────                                   ────────────
Cursor / Claude Code dev work
        │
npx ai-memory extract --incremental
        │
git add .ai-memory/
git commit && git push
                                               git pull
                                                    │
                                               npx ai-memory context --topic "today's work"
                                                    │
                                               Paste context → new conversation
                                                    │
                                               Seamlessly resume
```

---

## Configuration

`ai-memory` works with zero config. To customize, run `npx ai-memory init` or create `.ai-memory/.config.json` manually:

```jsonc
{
  "sources": {
    "cursor": { "enabled": true },
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
  "model": ""                    // leave empty for auto-selection
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `AI_REVIEW_API_KEY` | API key (preferred, shared with ai-review-pipeline) |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `AI_REVIEW_BASE_URL` | Custom API base URL |
| `AI_REVIEW_MODEL` | Model to use (default: `gpt-4o-mini`) |

---

## Output Structure

Each memory is its own file in a type-specific directory:

```
.ai-memory/
├── SUMMARY.md                              # Project summary (from `summary` command)
├── decisions/
│   ├── 2026-04-12-oauth-bridge-pattern.md
│   └── 2026-04-13-async-job-queue-design.md
├── architecture/
│   └── 2026-04-10-payment-module-design.md
├── conventions/
│   └── 2026-04-08-coding-conventions.md
├── todos/
│   └── 2026-04-12-add-retry-logic.md
├── issues/
│   └── 2026-04-11-sqlite-locking-fix.md
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
  run: npx ai-memory extract --incremental --json
  env:
    AI_REVIEW_API_KEY: ${{ secrets.AI_REVIEW_API_KEY }}
```

---

## Requirements

- Node.js >= 22 (required for built-in `node:sqlite` support)
- An API key for any OpenAI-compatible provider

## License

MIT — [Conor Liu](https://github.com/conorliu)
