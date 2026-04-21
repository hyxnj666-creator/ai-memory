# Development Guide

## Prerequisites

- Node.js >= 22
- npm

## Setup

```bash
git clone https://github.com/conorliu/ai-memory.git
cd ai-memory
npm install
```

## Scripts

```bash
npm run build          # Build with tsup
npm run typecheck      # TypeScript strict check
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode
npm run dev -- <args>  # Run CLI in dev mode (tsx)
```

## Project Structure

```
src/
??? index.ts                  # CLI entry point
??? cli.ts                    # Argument parsing + help text
??? types.ts                  # Shared type definitions
??? config.ts                 # .config.json loader
??? commands/
?   ??? extract.ts            # Extract memories from conversations
?   ??? list.ts               # List available conversations
?   ??? search.ts             # Search through memories
?   ??? rules.ts              # Export Cursor Rules (.mdc)
?   ??? resolve.ts            # Mark memories as resolved/active
?   ??? summary.ts            # Generate project summary
?   ??? context.ts            # Generate continuation prompt
?   ??? init.ts               # Initialize config
??? sources/
?   ??? cursor.ts             # Cursor transcript parser
?   ??? claude-code.ts        # Claude Code session parser
?   ??? detector.ts           # Auto-detect available sources
??? extractor/
?   ??? ai-extractor.ts       # AI extraction core (chunking, quality filter)
?   ??? llm.ts                # LLM API client (concurrency, retry, timeout)
?   ??? prompts.ts            # Extraction/summary/context prompts
??? store/
?   ??? memory-store.ts       # Memory file read/write (Markdown)
?   ??? state.ts              # Incremental extraction state
??? output/
?   ??? terminal.ts           # Terminal colors and formatting
??? utils/
    ??? author.ts             # Author resolution (CLI > config > git > OS)
```

## Architecture

```
Conversation Sources          Extractor                    Storage
(Cursor, Claude Code)         (LLM + post-processing)      (Markdown files)

  Source.listConversations()    splitIntoChunks()            writeConversationMemories()
  Source.loadConversation()     callLLM() per chunk          readAllMemories()
                                deduplicateMemories()
                                qualityFilter()
```

## Key Design Decisions

- **Zero runtime dependencies** ? only devDependencies
- **Multi-source architecture** ? Source interface abstraction for easy new editors
- **Chunked extraction** ? conversations split at turn boundaries, ~5k tokens/chunk
- **Quality filtering** ? short content + title-content similarity check
- **Team-aware storage** ? per-author subdirectories, no merge conflicts
- **i18n labels** ? memory files support zh/en metadata labels

## Testing

```bash
npm test                              # all tests
npx vitest run src/__tests__/cli      # specific file
npx vitest --watch                    # watch mode
```

Tests cover: CLI parsing, source parsers, memory store, state management, LLM config, prompts, deduplication, author resolution.

## Publishing

See [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
