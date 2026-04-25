# Contributing to ai-memory

Thank you for your interest in contributing! This guide will help you get started.

## Quick Start

```bash
git clone https://github.com/hyxnj666-creator/ai-memory.git
cd ai-memory
npm install
npm run build
npm test
```

## Development Workflow

### Scripts

```bash
npm run build          # Build with tsup
npm run typecheck      # TypeScript strict check
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode
npm run dev -- <args>  # Run CLI in dev mode (tsx)
```

### Making Changes

1. **Fork** the repository and create a branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Run `npm run typecheck && npm test` to ensure everything passes
5. Submit a pull request

### Code Style

- TypeScript strict mode — no `any` unless absolutely necessary
- Zero runtime dependencies — only devDependencies
- Functions should be pure where possible (no side effects)
- Use `process.stderr.write()` for warnings/debug, `console.log()` for user-facing output
- Error messages should be actionable — tell the user what to do, not just what went wrong
- No comments that just narrate what the code does; comments should explain *why*

### Testing

- Every new feature needs tests
- Tests live in `src/__tests__/`
- Use `vitest` — no other test frameworks
- Mock file system operations where possible; for IO-required tests use `mkdtemp(tmpdir())` + `chdir` (see `mcp-config-writer.test.ts`, `agents-md-writer.test.ts`, `log-reader.test.ts` for the canonical pattern)
- Current coverage: 431 tests across 25 test files

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add semantic search command
fix: resolve --undo no longer hijacks --force
docs: update architecture diagram
refactor: extract core memory store interface
test: add MCP server integration tests
chore: bump dependencies
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── cli.ts                # Argument parsing + help
├── types.ts              # Shared type definitions
├── config.ts             # Config loader
├── commands/             # CLI command handlers
├── sources/              # Conversation source parsers
├── extractor/            # AI extraction (LLM, prompts, quality filter)
├── store/                # Memory storage + state management
├── output/               # Terminal formatting
└── utils/                # Shared utilities (author resolution)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed architectural overview.

## What to Contribute

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/hyxnj666-creator/ai-memory/labels/good%20first%20issue). These are scoped, well-defined tasks suitable for newcomers.

### High-Impact Areas

- **New conversation sources** — add support for Windsurf, VS Code Copilot, JetBrains AI
- **MCP Server** — the v2 priority (see [RFC-001](docs/rfc/001-mcp-server.md))
- **Extraction quality** — better prompts, smarter deduplication, domain-specific extraction
- **Documentation** — examples, tutorials, translations

### What We're NOT Looking For

- Adding runtime dependencies — we keep the surface minimal (currently 2: `@modelcontextprotocol/sdk` for `serve`, `zod` for bundle import validation). Open a discussion before proposing a third.
- UI frameworks or heavy tooling
- Cloud/SaaS features (this is a local-first tool)
- Changes that break backwards compatibility without discussion

## Reporting Bugs

Use the [bug report template](https://github.com/hyxnj666-creator/ai-memory/issues/new?template=bug_report.yml). Include:

- Node.js version (`node -v`)
- OS and shell
- ai-memory version (`npx ai-memory-cli --version`)
- Steps to reproduce
- Expected vs actual behavior

## Proposing Features

For small features, open an issue. For larger changes (new commands, architectural changes), write an RFC in `docs/rfc/` and submit a PR for discussion before implementing.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
