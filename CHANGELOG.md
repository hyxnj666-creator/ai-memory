# Changelog

## [2.0.0] - 2026-04-21

### Added — MCP Server
- **MCP Server** — ai-memory can now run as an MCP (Model Context Protocol) server, enabling AI editors like Cursor and Claude Code to directly access your project's knowledge base
- **`remember` tool** — AI can store decisions, conventions, architecture notes, todos, and issues during conversations (auto-indexes embeddings)
- **`recall` tool** — AI can retrieve relevant memories using hybrid semantic + keyword search
- **`search_memories` tool** — Full search with type, author, and resolved status filtering via MCP
- **`project-context` resource** — Automatically provides project context to AI when starting a conversation
- **`serve` command** — New CLI command to start the MCP server (`npx ai-memory-cli serve`)
- **`--debug` flag** — Debug logging for MCP server (outputs to stderr)

### Added — Semantic Search
- **Hybrid search engine** — combines semantic similarity (embeddings), keyword matching, and time decay (recency) into a single ranked result set
- **Embedding API client** — uses the same OpenAI-compatible API already configured for extraction, calls `/embeddings` endpoint with batch support
- **Flat-file vector store** — embeddings stored as `.ai-memory/.embeddings.json` (local-only, gitignored), zero external dependencies
- **`reindex` command** — build or rebuild semantic search embeddings (`npx ai-memory-cli reindex`)
- **Auto-indexing** — `remember` tool automatically indexes new memories for instant semantic retrieval
- **24 new unit tests** for vector store, cosine similarity, hybrid search, and keyword search

### Changed
- MCP `recall` and `search_memories` now use hybrid search (semantic + keyword + recency) instead of keyword-only
- Added `@modelcontextprotocol/sdk` and `zod` as runtime dependencies
- Externalized MCP SDK and zod from the bundle (loaded from node_modules at runtime)
- Updated README (EN & ZH) with MCP Server setup and semantic search instructions

## [1.4.1] - 2026-04-17

### Added
- **Node.js >= 18 support**: lowered minimum from Node 22 to Node 18, significantly expanding compatibility (Node 22+ still recommended for richer conversation titles via SQLite)
- **NO_COLOR support**: respects the `NO_COLOR` environment variable and non-TTY stdout for clean CI output
- **LLM retry with backoff**: network errors, timeouts, and 429 rate limits now automatically retry up to 2 times with increasing delays
- **LLM request timeout**: 2-minute timeout per API call prevents indefinite hangs
- **Tiered context compression**: when `context` output exceeds ~8k tokens, recent memories keep full detail while older ones are condensed to a one-line index — zero information lost
- **Chunk progress indicator**: large conversations (>5 chunks) now display extraction progress percentage
- README badges (npm version, CI status, license)

### Changed
- README tagline changed from "60-second" time claim to accurate value proposition
- DEVELOPMENT.md completely rewritten (fixed encoding corruption)
- CI matrix expanded to test Node 18, 20, and 22
- Build target lowered from `node22` to `node18`

### Fixed
- `resolve --undo` now uses a dedicated `undo` flag instead of hijacking `--force`
- LLM timeout/network errors now show human-readable messages instead of raw error objects

## [1.4.0] - 2026-04-17

### Added
- **`search` command**: keyword search across all memories with relevance ranking, type/author filtering, and highlighted results
- **`rules` command**: export conventions and decisions as Cursor Rules (`.mdc`), auto-applied to AI responses
- **`resolve` command**: mark memories as resolved/active to keep the knowledge base fresh; `--undo` to reactivate
- **`--include-resolved` flag** for `summary`, `context`, and `search` commands
- **Extraction quality filtering**: content < 30 chars discarded, title-content duplicates removed, quality stats printed after extraction
- Stronger LLM prompt: minimum content length, fewer low-quality extractions

### Changed
- README rewritten with "60-second wow" opening and token savings narrative
- Both READMEs updated with full documentation for all new commands

### Fixed
- `summary --focus` now correctly chains with `--include-resolved` filtering
- `rules` frontmatter no longer outputs empty `globs:` line

## [1.3.1] - 2026-04-15

### Fixed
- `list` command now passes author to `hasMemoryFile` for correct `[+]` status in team mode
- `config.sources.cursor.projectName` now correctly passed to CursorSource
- State file (`.state.json`) now follows `output.dir` config instead of hardcoded path
- Better error messages: distinguish API errors from "no extractable knowledge"
- More precise empty filter message in `extract`
- CLI flags (`--since`, `--author`) no longer silently consume `undefined` when placed at end of command
- Corrupt `.config.json` now prints a warning instead of silently falling back
- Unknown memory types from LLM now print a warning and are skipped

## [1.3.0] - 2026-04-14

### Added
- **Team mode**: per-author subdirectories (`.ai-memory/{author}/{type}/`)
- Author auto-detection: `--author` CLI flag > `config.author` > `git config user.name` > OS username
- `--author` and `--all-authors` flags for all commands
- Author metadata in memory files (`> **Author**: name`)
- Backwards compatibility: legacy flat directories still read correctly

## [1.2.0] - 2026-04-12

### Added
- `--force` flag for extract: overwrite existing memory files if content changed
- Fuzzy deduplication: title normalization and content fingerprinting
- Anthropic API key misconfiguration warning

### Changed
- Improved extraction prompt with good/bad examples
- Better error handling for LLM failures

## [1.1.0] - 2026-04-08

### Added
- `context --summarize` for LLM-powered condensed summaries
- `--copy` flag for clipboard support (cross-platform)
- `--pick` and `--id` for targeted extraction
- `--since` for time-based filtering
- `--dry-run` for previewing extraction

## [1.0.0] - 2026-04-01

### Added
- Initial release
- 5 extraction types: decision, architecture, convention, todo, issue
- Multi-source support: Cursor + Claude Code
- `extract`, `list`, `summary`, `context`, `init` commands
- Incremental extraction with state tracking
- i18n support (zh/en) for memory file labels
- OpenAI-compatible API support with multiple key/model env vars
