# Architecture

> System architecture for ai-memory contributors.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interfaces                          │
│                                                                 │
│   CLI (src/index.ts)              MCP Server (v2, planned)      │
│   ├── extract                     ├── remember tool             │
│   ├── list                        ├── recall tool               │
│   ├── search                      ├── search tool               │
│   ├── rules                       └── project-context resource  │
│   ├── resolve                                                   │
│   ├── summary                                                   │
│   ├── context                                                   │
│   └── init                                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                        Core Layer                               │
│                                                                 │
│   Extractor              Store              Sources             │
│   ├── ai-extractor.ts    ├── memory-store   ├── cursor.ts       │
│   ├── llm.ts             └── state.ts       ├── claude-code.ts  │
│   └── prompts.ts                            └── detector.ts     │
│                                                                 │
│   Config (config.ts)     Types (types.ts)   Utils (author.ts)   │
└─────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     Storage Layer                               │
│                                                                 │
│   .ai-memory/                                                   │
│   ├── {author}/{type}/*.md      Memory files (Markdown)         │
│   ├── .index/{author}/*.json    Extraction index                │
│   ├── .config.json              Project configuration           │
│   ├── .state.json               Processing state (gitignored)   │
│   └── SUMMARY.md                Generated summary               │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Extract Pipeline

```
1. Source Detection
   detector.ts → finds Cursor/Claude Code conversation files

2. Conversation Loading
   cursor.ts / claude-code.ts → parses JSONL into Conversation objects

3. Filtering
   extract.ts → applies --pick, --since, --incremental, ignore list, min turns

4. AI Extraction (per conversation)
   ai-extractor.ts:
     a. Convert conversation to text (strip tool calls, clean user_query tags)
     b. Split into chunks (~5k tokens each, with 2k overlap)
     c. Build extraction prompt per chunk (prompts.ts)
     d. Call LLM in parallel (llm.ts — concurrency=6, 2min timeout, auto-retry)
     e. Parse JSON response into ExtractedMemory[]
     f. Deduplicate across chunks (fuzzy title + content fingerprint)
     g. Quality filter (min 30 chars content, title≠content check)

5. Storage
   memory-store.ts → write Markdown files to .ai-memory/{author}/{type}/
   state.ts → update .state.json with processed conversation IDs
```

### Context Generation

```
1. Load memories from .ai-memory/ (readAllMemories)
2. Filter: exclude resolved, apply --recent, --topic
3. Two modes:
   a. Default (instant, free): buildDirectContext() assembles structured Markdown
      - If too large: tiered compression (recent=full detail, older=one-line index)
   b. --summarize (LLM): buildContextPrompt() → callLLM() → prose summary
4. Output to stdout, file, or clipboard
```

## Key Design Decisions

### Zero Runtime Dependencies

All functionality uses Node.js built-ins:
- `node:fs/promises` — file operations
- `node:path`, `node:os` — paths and platform detection
- `node:child_process` — git user.name, clipboard
- Global `fetch` — LLM API calls (Node 18+)
- `node:sqlite` — Cursor title map (Node 22+, optional with fallback)

This keeps `npx` execution fast and eliminates supply chain risk.

### Chunked Extraction

Conversations can be 100k+ characters. We split at conversation turn boundaries into ~5k token chunks with 2k overlap to preserve context. Each chunk is processed independently, then results are deduplicated.

Constants: `CHUNK_SIZE = 20_000` chars, `CHUNK_OVERLAP = 2_000` chars.

### Team-Aware Storage

Memories are stored in per-author subdirectories to prevent merge conflicts in team git repos:

```
.ai-memory/
├── alice/decisions/2026-04-15-oauth.md
├── bob/decisions/2026-04-16-payment.md
```

Author resolution priority: `--author` CLI > `config.author` > `git config user.name` > OS username.

### Memory File Format

Each memory is a standalone Markdown file with metadata in blockquotes:

```markdown
## [Decision] OAuth Bridge Pattern

> **Date**: 2026-04-15
> **Source**: cursor:fa49d306 (HF OAuth Integration)
> **Author**: alice
> **Status**: active

### Context
WebView cannot receive OAuth redirect directly...

### Decision
Use Bridge page pattern...

---
### Reasoning
Deep Link behavior inconsistent across platforms...
```

This format is:
- Human-readable (opens nicely in any editor)
- Git-friendly (meaningful diffs)
- Machine-parseable (regex-based, see `parseMemoryFile`)

### Concurrency Model

- LLM calls: semaphore with `MAX_CONCURRENT = 6` slots
- Conversation processing: batch of `CONCURRENCY = 5` conversations in parallel
- State saves: serialized (one conversation at a time writes to .state.json)

### Error Recovery

- LLM failures: auto-retry up to 2 times with backoff (3s, 6s) for timeouts, network errors, 429
- Individual conversation errors don't abort the batch — error count is tracked and reported
- Malformed .config.json: warning + fallback to defaults
- Missing API key: clear error message with env var names

## File-by-File Reference

| File | Purpose | Key exports |
|------|---------|-------------|
| `types.ts` | All shared interfaces and types | `ExtractedMemory`, `CliOptions`, `Source`, `AiMemoryConfig` |
| `cli.ts` | Argument parser + help text | `parseArgs()`, `printHelp()` |
| `config.ts` | Config loading | `loadConfig()` |
| `extractor/llm.ts` | LLM API client | `resolveAiConfig()`, `callLLM()` |
| `extractor/ai-extractor.ts` | Extraction pipeline | `extractMemories()` |
| `extractor/prompts.ts` | All LLM prompts + direct builder | `buildExtractionPrompt()`, `buildDirectContext()` |
| `store/memory-store.ts` | Memory CRUD | `writeMemories()`, `readAllMemories()`, `hasMemoryFile()` |
| `store/state.ts` | Processing state | `loadState()`, `saveState()`, `markProcessed()` |
| `sources/cursor.ts` | Cursor parser | `CursorSource` class |
| `sources/claude-code.ts` | Claude Code parser | `ClaudeCodeSource` class |
| `utils/author.ts` | Author resolution | `resolveAuthor()` |
| `output/terminal.ts` | Terminal formatting | `ANSI`, `c`, `printBanner()`, `printError()` |
