# AI Agent Instructions

> This file is for AI coding assistants (Cursor, Claude Code, Codex, GitHub Copilot) working on the ai-memory codebase.

## Project Overview

ai-memory is a CLI tool + MCP server that extracts structured knowledge from AI editor conversations and saves it as git-trackable Markdown files. It has zero runtime dependencies and targets Node.js >= 18.

## Architecture

```
src/
├── index.ts              # CLI entry, dispatches to commands
├── cli.ts                # Argument parser (manual, no library)
├── types.ts              # ALL shared types live here
├── config.ts             # Loads .ai-memory/.config.json
├── commands/             # One file per CLI command
│   ├── extract.ts        # Orchestrates extraction pipeline
│   ├── list.ts           # Lists conversations with status
│   ├── search.ts         # Keyword search across memories
│   ├── rules.ts          # Exports Cursor Rules (.mdc)
│   ├── resolve.ts        # Marks memories resolved/active
│   ├── summary.ts        # LLM-generated project summary
│   ├── context.ts        # Generates continuation prompt
│   └── init.ts           # Project initialization
├── sources/              # Conversation parsers (one per editor)
│   ├── cursor.ts         # Reads ~/.cursor/projects/*/agent-transcripts/
│   ├── claude-code.ts    # Reads ~/.claude/projects/*/*.jsonl
│   ├── windsurf.ts       # Reads Windsurf state.vscdb (SQLite)
│   ├── copilot.ts        # Reads VS Code chatSessions/*.json
│   └── detector.ts       # Auto-detects available sources
├── extractor/
│   ├── ai-extractor.ts   # Chunking, LLM calls, dedup, quality filter
│   ├── llm.ts            # OpenAI-compatible API client with retry
│   └── prompts.ts        # All LLM prompts + direct context builder
├── store/
│   ├── memory-store.ts   # Read/write Markdown memory files
│   └── state.ts          # Tracks which conversations were processed
├── output/
│   └── terminal.ts       # ANSI colors (respects NO_COLOR), formatting
└── utils/
    └── author.ts         # Author resolution: CLI > config > git > OS
```

## Key Conventions

- **Zero runtime dependencies** — never add `dependencies` to package.json. Everything is a devDependency or uses Node built-ins.
- **TypeScript strict** — `noEmit` with `strict: true`. No `any` types.
- **ESM only** — `"type": "module"` in package.json. Use `.js` extensions in imports.
- **Error output** — use `process.stderr.write()` for warnings/debug. Use `console.log()` only for user-facing output. Use `printError()` / `printWarning()` from `terminal.ts`.
- **i18n** — memory files and context output support `zh` and `en` via config. New user-facing strings should support both.
- **Team mode** — memories are stored in `.ai-memory/{author}/{type}/`. Always pass `author` through the pipeline.
- **Tests** — vitest, in `src/__tests__/`. Mock file system, never touch real files.

## Important Rules

1. **Never add runtime dependencies.** Use Node built-ins (`node:fs`, `node:path`, `node:os`, `node:child_process`). The global `fetch` API is used for HTTP.
2. **Never break the CLI interface.** Existing flags and commands must remain backwards compatible.
3. **All new features need tests.** Run `npm run typecheck && npm test` before submitting.
4. **Memory file format is stable.** The Markdown format in `.ai-memory/` is a public API — changes require migration logic.
5. **LLM prompts are critical.** Changes to `prompts.ts` affect extraction quality for all users. Test with real conversations before changing.
6. **State file (.state.json) is machine-specific.** Never commit it. It lives in the output directory and is gitignored.

## Common Tasks

### Adding a new CLI command
1. Create `src/commands/my-command.ts` with `export async function runMyCommand(opts: CliOptions): Promise<number>`
2. Add to `CliOptions.command` union type in `types.ts`
3. Add to `parseArgs()` in `cli.ts` (command recognition + flags)
4. Add to the switch in `src/index.ts`
5. Add help text in `cli.ts` HELP constant
6. Add tests in `src/__tests__/cli.test.ts`

### Adding a new conversation source
1. Create `src/sources/my-editor.ts` implementing the `Source` interface
2. Add to `detector.ts` detection logic (import, add to `candidates[]` and `createSource`)
3. Add to `SourceType` union in `types.ts`
4. Add config field in `AiMemoryConfig.sources` and `DEFAULT_CONFIG`
5. Add source filter in `extract.ts` `resolveSources()` and `list.ts`
6. Add `sourceLabel()` entry in `detector.ts`
7. Add tests in `src/__tests__/`
8. Update README.md Supported Sources table

### Adding a new memory type
1. Add to `MemoryType` union in `types.ts`
2. Update `VALID_TYPES` in `cli.ts`
3. Update extraction prompt in `prompts.ts`
4. Update `typeOrder` and `typeLabels` in `prompts.ts` (buildDirectContext)
