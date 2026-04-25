# AI Agent Instructions

> This file is for AI coding assistants (Cursor, Claude Code, Codex, GitHub Copilot) working on the ai-memory codebase. Read this first before touching code.

## Project Overview

ai-memory is a CLI tool + MCP server that extracts structured knowledge from AI editor conversations and saves it as **git-trackable Markdown files**. Targets Node.js >= 18.

- **npm package name:** `ai-memory-cli` (DO NOT rename — see [docs/decisions/2026-04-24-naming.md](docs/decisions/2026-04-24-naming.md))
- **Binary name:** `ai-memory`
- **GitHub owner:** `hyxnj666-creator`
- **Current version:** 2.4.0 (see CHANGELOG.md)
- **Next version focus:** see [ROADMAP.md](ROADMAP.md) — v2.5 will target the over-extraction precision drag surfaced by the CCEB v1 baseline, plus CCEB v1.1 fixture growth + a LongMemEval 50-query subset adapter
- **Runtime deps:** `@modelcontextprotocol/sdk` (for `serve`) and `zod` (for bundle import validation). NO other runtime deps.

## Architecture

```
src/
├── index.ts              # CLI entry, sets emitWarning filter, dispatches to commands
├── cli.ts                # Argument parser (manual, no library)
├── types.ts              # ALL shared types live here
├── config.ts             # Loads .ai-memory/.config.json
├── public.ts             # Library entry (exports for programmatic use)
├── commands/             # One file per CLI command (14 commands)
│   ├── extract.ts        # Orchestrates extraction pipeline
│   ├── list.ts           # Lists conversations with status
│   ├── search.ts         # Keyword + hybrid search
│   ├── recall.ts         # Git-history time-travel retrieval (v2.4) — uses git/log-reader
│   ├── rules.ts          # Exports rules: Cursor .mdc and/or AGENTS.md (--target, v2.4)
│   ├── resolve.ts        # Marks memories resolved/active
│   ├── summary.ts        # LLM-generated project summary (supports --source-id / --convo)
│   ├── context.ts        # Generates continuation prompt (supports --source-id / --convo)
│   ├── init.ts           # Project initialization
│   ├── reindex.ts        # Rebuild embeddings; --dedup retroactive cleanup (v2.2)
│   ├── watch.ts          # Auto-extract on conversation changes
│   ├── dashboard.ts      # Launch local web UI
│   ├── export.ts         # Portable JSON bundle (v2.3)
│   ├── import.ts         # Import portable JSON bundle (v2.3)
│   └── doctor.ts         # Health check (runtime/editors/LLM/store/embeddings/MCP, v2.4)
├── sources/              # Conversation parsers (one per editor)
│   ├── cursor.ts         # ~/.cursor/projects/*/agent-transcripts/
│   ├── claude-code.ts    # ~/.claude/projects/*/*.jsonl
│   ├── windsurf.ts       # Windsurf state.vscdb (SQLite via node:sqlite, Node 22+)
│   ├── copilot.ts        # VS Code chatSessions/*.json
│   └── detector.ts       # Auto-detects available sources
├── extractor/
│   ├── ai-extractor.ts   # Chunking, LLM calls, dedup, quality filter
│   ├── llm.ts            # OpenAI-compatible API client with retry + concurrency
│   └── prompts.ts        # All LLM prompts + buildDirectContext
├── embeddings/           # Semantic search (v2.0 phase 2)
│   ├── embed.ts          # Embedding API client
│   ├── vector-store.ts   # Flat-file .embeddings.json
│   ├── indexer.ts        # Auto-index on `remember`
│   └── hybrid-search.ts  # Semantic + keyword + time decay
├── mcp/                  # MCP server (v2.0 phase 1) + config writer (v2.4)
│   ├── server.ts         # stdio transport, handler wiring
│   ├── tools.ts          # remember / recall / search_memories tools
│   ├── resources.ts      # project-context resource
│   └── config-writer.ts  # idempotent merge into .cursor/mcp.json + .windsurf/mcp.json (init --with-mcp)
├── rules/                # Multi-target rules export (v2.4)
│   └── agents-md-writer.ts  # Pure idempotent merge into AGENTS.md (managed-section markers)
├── git/                  # Thin wrappers around the user's `git` binary (v2.4)
│   └── log-reader.ts     # parseGitLog (pure) + isGitRepo / getFileHistory / isPathTracked (execFile)
├── dashboard/            # Local web UI (v2.1)
│   ├── server.ts         # node:http API (/api/stats, /api/memories, /api/conversations, /api/quality, /api/graph)
│   └── html.ts           # Embedded SPA (Tailwind + D3.js)
├── bundle/               # Portable export/import (v2.3)
│   └── bundle.ts         # Versioned JSON schema v1 + Zod validation
├── store/
│   ├── memory-store.ts   # Read/write Markdown memory files
│   └── state.ts          # Tracks which conversations were processed
├── output/
│   └── terminal.ts       # ANSI colors (respects NO_COLOR), formatting
└── utils/
    └── author.ts         # Author resolution: CLI > config > git > OS

bench/
└── cceb/                 # Cursor Conversation Extraction Benchmark (v2.4)
    ├── types.ts          # Pure types: Fixture / ExpectedMemory / Scorecard
    ├── scorer.ts         # Pure scoring (greedy keyword match → P/R/F1) + Markdown render
    ├── loader.ts         # Read + validate fixtures/*.json (hand-rolled, no Zod)
    ├── runner.ts         # Glue: fixture → real extractMemories() → scoreFixture
    ├── run.ts            # CLI entry (`tsx bench/cceb/run.ts [--dry-run] [--filter ...]`)
    ├── fixtures/         # 9 hand-curated annotated conversations (5 types + CJK + 2 noise)
    └── README.md         # Methodology + how to author fixtures

docs/assets/demo/        # Hero GIF source of truth (v2.4) — vhs-rendered, deterministic
├── demo.tape            # 5-frame ≈30s vhs cassette (rendered by `npm run demo:render`)
├── scenario/            # Hand-curated .ai-memory/ store the cassette runs against
│   └── .ai-memory/      # 1 decision + 1 convention + 1 architecture, 2 authors, English-pinned
├── RECORDING.md         # Install matrix (macOS / Linux / Windows / Docker) + pre-commit checklist
└── demo.gif             # Rendered output — committed by maintainer, not CI
```

## Key Conventions

- **Minimal runtime dependencies** — only `@modelcontextprotocol/sdk` and `zod`. Before adding any more, open a discussion. Prefer Node built-ins (`node:fs`, `node:path`, `node:os`, `node:http`, `node:sqlite`). The global `fetch` API is used for HTTP clients.
- **TypeScript strict** — `noEmit` with `strict: true`. No `any` types except at clear boundaries (node:sqlite dynamic import, JSON parsing).
- **ESM only** — `"type": "module"` in package.json. Use `.js` extensions in imports.
- **Error output** — use `process.stderr.write()` for warnings/debug. Use `console.log()` only for user-facing output. Use `printError()` / `printWarning()` from `output/terminal.ts`.
- **i18n** — memory files and context output support `zh` and `en` via config. New user-facing strings should support both.
- **Team mode** — memories are stored in `.ai-memory/{author}/{type}/`. Always pass `author` through the pipeline.
- **Tests** — vitest, in `src/__tests__/` (and `bench/cceb/__tests__/` for the benchmark scorer). Mock file system where possible; use `mkdtemp(tmpdir())` + `chdir` for tests that must exercise real IO (see `mcp-config-writer.test.ts`, `agents-md-writer.test.ts`, `log-reader.test.ts`). 431 tests across 25 files; keep passing.
- **Benchmarks** — CCEB lives at `bench/cceb/` (see `bench/cceb/README.md`). The scorer is **pure and unit-tested** — every rule for "what counts as a match" is encoded in `scoreFixture` with corresponding tests; do NOT replicate that logic anywhere else in the codebase. Adding a fixture is a JSON file under `bench/cceb/fixtures/`; the loader's validation errors point you at the offending field. Always run `npm run bench:cceb:dry` after editing fixtures or scorer (no LLM tokens, ~1s). The live `npm run bench:cceb` requires an LLM key and writes to `bench/cceb/out/` (gitignored); the published baseline at `docs/benchmarks/cceb-baseline.md` is updated by humans, not automation.
- **Doctor pattern** — `src/commands/doctor.ts` splits each section into a pure `summarize*()` function that takes plain data and returns `CheckResult[]`, plus an async `probe*()` that does the IO. Copy this split for any new health-check-like command so tests stay pure.
- **File-merge pattern** — when a command rewrites a user-owned file (e.g. `init --with-mcp` → `.cursor/mcp.json`, `rules --target agents-md` → `AGENTS.md`), put the merge logic in a *pure* `merge*()` function that returns a `MergeResult` discriminated union (`created` / `updated` / `appended` / `already-up-to-date` / `conflict`), and put the IO in a thin wrapper. See `src/mcp/config-writer.ts` and `src/rules/agents-md-writer.ts` for the canonical pattern. Idempotency, conflict detection, and "preserve hand-written content" all become testable with no filesystem.
- **External-process pattern** — when a command shells out (`git`, `clip`, `xdg-open`, etc.), keep the parser pure and isolate `execFile` / `execSync` in a thin IO wrapper. Always set a bounded `timeout` and `maxBuffer`, and **return an empty/null value on failure rather than throwing** — the caller can decide whether absence is an error. See `src/git/log-reader.ts` (`parseGitLog` is pure, `getFileHistory` returns `[]` on any failure) for the canonical shape.
- **Hero GIF is generated, not recorded** — the README's hero GIF lives at `docs/assets/demo/demo.gif` and is produced by `vhs` from the checked-in `docs/assets/demo/demo.tape` (5 frames, ≈30s) running against `docs/assets/demo/scenario/`. Never replace it with a screen-capture; doing so breaks reproducibility. To change the demo: edit `demo.tape` and/or the staged memory files under `scenario/`, then run `npm run demo:render`. Pre-commit checklist lives in [`docs/assets/demo/RECORDING.md`](docs/assets/demo/RECORDING.md). Decisions: `extract` is **narrated**, not run live (would need an LLM key in render env); `recall` is **intentionally absent** from the hero (per user direction 2026-04-25 — "extract→reuse is the practical value"). The memory file parser was patched to handle CRLF input as part of this work — relevant if you stage memories on Windows or via `git config core.autocrlf=true`.
- **No `console.warn` for experimental Node APIs** — `src/index.ts` installs a filter that suppresses `ExperimentalWarning` for `node:sqlite` (Node 22+). Keep the filter narrow — never suppress generic warnings.

## Critical Rules (Do Not Break)

1. **Never break the CLI interface.** Existing flags and commands must remain backwards compatible. Follow semver.
2. **Memory file format is stable.** The Markdown format in `.ai-memory/` is a public API — changes require migration logic.
3. **Bundle schema is versioned.** `version: 1` is the contract; breaking changes need `version: 2` and parse logic for both.
4. **State file (`.state.json`) is machine-specific.** Never commit it. It lives in the output directory and is gitignored.
5. **All new features need tests.** Run `npm run typecheck && npm test` before committing.
6. **LLM prompts are critical.** Changes to `extractor/prompts.ts` affect extraction quality for all users. Test with real conversations before changing.
7. **Never rename the npm package.** See [docs/decisions/2026-04-24-naming.md](docs/decisions/2026-04-24-naming.md) for why.

## Common Tasks

### Adding a new CLI command
1. Create `src/commands/my-command.ts` with `export async function runMyCommand(opts: CliOptions): Promise<number>`
2. Add to `CliOptions.command` union type in `types.ts`
3. Add to `parseArgs()` in `cli.ts` (command recognition + flags)
4. Add to the switch in `src/index.ts`
5. Add help text in `cli.ts` HELP constant
6. Add tests in `src/__tests__/cli.test.ts`

### Adding a new conversation source
1. Create `src/sources/my-editor.ts` implementing the `Source` interface from `sources/base.ts`
2. Add to `detector.ts` detection logic (import, add to `candidates[]` and `createSource`)
3. Add to `SourceType` union in `types.ts`
4. Add config field in `AiMemoryConfig.sources` and `DEFAULT_CONFIG`
5. Add source filter in `commands/extract.ts` `resolveSources()` and `commands/list.ts`
6. Add `sourceLabel()` entry in `detector.ts`
7. Add tests in `src/__tests__/`
8. Update README.md Supported Sources table

### Adding a new memory type
1. Add to `MemoryType` union in `types.ts`
2. Update `VALID_TYPES` in `cli.ts`
3. Update extraction prompt in `extractor/prompts.ts`
4. Update `typeOrder` and `typeLabels` in `extractor/prompts.ts` (buildDirectContext)
5. Add default type label in `store/memory-store.ts`

### Adding a new MCP tool
1. Define in `src/mcp/tools.ts` with Zod input schema
2. Wire handler in `src/mcp/server.ts`
3. Add integration test
4. Document in README.md MCP table

## Where to Look for Context

| Question | Doc |
|---|---|
| What's done / what's next? | [ROADMAP.md](ROADMAP.md) |
| What changed in each release? | [CHANGELOG.md](CHANGELOG.md) |
| Why we kept the name `ai-memory-cli`? | [docs/decisions/2026-04-24-naming.md](docs/decisions/2026-04-24-naming.md) |
| What category are we (and aren't we)? Why "chat-history extracting pipeline" not "runtime memory middleware"? | [docs/decisions/2026-04-25-category-positioning.md](docs/decisions/2026-04-25-category-positioning.md) |
| How we stack vs competitors (April 2026, 3-bucket map)? | [docs/competitive-landscape.md](docs/competitive-landscape.md) |
| How we're planning to launch? | [docs/launch-plan.md](docs/launch-plan.md) |
| How the code is layered? | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| How to release? | [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) |
| How to develop locally? | [DEVELOPMENT.md](DEVELOPMENT.md) |
| MCP server design RFC? | [docs/rfc/001-mcp-server.md](docs/rfc/001-mcp-server.md) |

## Session Continuity

If you are an AI continuing a session where previous decisions were made:
1. Read `docs/decisions/` entries newest-first to understand *why* the code is shaped as it is.
2. Read `ROADMAP.md` to see what v2.4 is scoped for.
3. Read `docs/launch-plan.md` if the work is launch-related.
4. When you make a material decision (renaming a public thing, changing core algo behavior, setting priorities), **write a new ADR in `docs/decisions/`** so the next session inherits it.
