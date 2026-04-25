# Development Guide

> Quick setup + commands. For the canonical project structure, conventions, and
> architectural patterns, read [AGENTS.md](AGENTS.md) — that file is what AI
> agents (and humans) should consult before changing code.

## Prerequisites

- Node.js >= 18 (22+ recommended for richer Windsurf conversation titles via `node:sqlite`; 24+ if you want `fetch()` to honour `HTTPS_PROXY` automatically via `NODE_USE_ENV_PROXY=1`)
- npm

## Setup

```bash
git clone https://github.com/hyxnj666-creator/ai-memory.git
cd ai-memory
npm install
```

## Scripts

```bash
npm run build              # Build with tsup → dist/
npm run typecheck          # TypeScript strict check (noEmit)
npm test                   # Run all tests (vitest, 431 tests across 25 files)
npm run test:watch         # Watch mode
npm run dev -- <args>      # Run CLI in dev mode (tsx, no build)
npm run bench:cceb:dry     # CCEB pipeline smoke (no LLM, ~1s)
npm run bench:cceb         # CCEB live run (needs an LLM key + provider config)
npm run demo:render        # Render hero GIF via vhs (macOS/Linux/WSL/Docker only)
```

## Testing

```bash
npm test                              # all tests
npx vitest run src/__tests__/cli      # single file
npx vitest --watch                    # watch mode
```

Test fixtures and patterns are documented under "Tests" in
[AGENTS.md](AGENTS.md) — including the canonical IO-test pattern
(`mkdtemp(tmpdir())` + `chdir`, see `mcp-config-writer.test.ts`,
`agents-md-writer.test.ts`, `log-reader.test.ts`).

## Project structure & conventions

Single source of truth: **[AGENTS.md](AGENTS.md)**. It documents:

- Full `src/`, `bench/`, and `docs/assets/demo/` tree (kept in sync per release)
- ESM / TypeScript-strict / minimal-runtime-deps invariants
- Canonical patterns (file-merge, external-process, doctor, hero GIF generation)
- "Critical rules — do not break" (CLI surface, memory file format, bundle schema, state file)
- Where to look for context (ROADMAP, CHANGELOG, ADRs, RFCs)

Decisions made along the way live under [`docs/decisions/`](docs/decisions/) (ADRs, newest-first).

## Benchmarks

The Cursor Conversation Extraction Benchmark (CCEB) lives at `bench/cceb/`.
Read `bench/cceb/README.md` for methodology and fixture-authoring rules. The
latest published baseline is in [`docs/benchmarks/cceb-baseline.md`](docs/benchmarks/cceb-baseline.md).

## Publishing

See [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). The `prepublishOnly` script
in `package.json` will re-run `typecheck → test → build` automatically before
`npm publish`, so you can't ship a stale `dist/` by accident.
