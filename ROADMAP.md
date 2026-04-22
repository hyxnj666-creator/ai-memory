# Roadmap

> ai-memory's journey from CLI tool to AI-native knowledge layer.

## Vision

Every AI coding session generates valuable decisions, architecture insights, and conventions — then loses them when the conversation ends. ai-memory makes this knowledge **persistent, searchable, and automatically available** to any AI assistant.

## Current: v1.x (Stable)

The CLI foundation is complete and published.

- [x] Multi-source extraction (Cursor, Claude Code)
- [x] 5 memory types: decision, architecture, convention, todo, issue
- [x] Incremental extraction with state tracking
- [x] Team-aware storage (per-author subdirectories)
- [x] Local keyword search with relevance ranking
- [x] Cursor Rules export (`.mdc` auto-generation)
- [x] Memory lifecycle management (resolve/reactivate)
- [x] Context generation with tiered compression
- [x] LLM retry with backoff, timeout protection
- [x] i18n support (zh/en), NO_COLOR, Node >= 18
- [x] CI pipeline, CHANGELOG, 115+ tests

## v2.0 — MCP Server (Next)

**Goal: Make ai-memory invisible.** Instead of running CLI commands, AI editors interact with memories automatically via MCP.

### Phase 1: MCP Server Core ✅
- [x] `ai-memory serve` — start MCP server (stdio transport)
- [x] `remember` tool — AI stores knowledge during conversations
- [x] `recall` tool — AI retrieves relevant memories for current task
- [x] `search_memories` tool — keyword + filter search via MCP
- [x] `project-context` resource — auto-provide project context to AI
- [x] One-line setup: add to Cursor/Claude Code MCP config

### Phase 2: Semantic Search ✅
- [x] Embedding generation via OpenAI-compatible API
- [x] Flat-file vector storage (`.embeddings.json`, zero deps)
- [x] Hybrid retrieval: semantic + keyword + time decay
- [x] Automatic re-indexing on `remember`, manual via `reindex` command

### Phase 3: More Sources + Watch Mode ✅
- [x] Windsurf conversation support (chat mode via SQLite)
- [x] VS Code Copilot Chat support (JSON/JSONL session files)
- [x] `watch` command — auto-extract when conversations change (fs events + polling)
- [x] Local LLM support — Ollama and LM Studio (zero API key needed)

### Phase 4: Dashboard (Optional)
- [ ] Local web UI for browsing and managing memories
- [ ] Knowledge graph visualization
- [ ] Team activity view
- [ ] Export to Obsidian / Notion

## Future Ideas (Unscheduled)

These are ideas we're considering but haven't committed to:

- **Multi-project knowledge sharing** — common conventions across repos
- **Smart context injection** — auto-select relevant memories based on open files and git diff
- **Plugin system** — custom extractors for domain-specific knowledge
- **Cloud sync** — optional encrypted sync for distributed teams
- **IDE extensions** — native VS Code / JetBrains sidebar

## How to Influence the Roadmap

- **Vote on issues** — thumbs-up (👍) on issues you care about
- **Open a discussion** — propose new features in [GitHub Discussions](https://github.com/hyxnj666-creator/ai-memory/discussions)
- **Contribute** — see [CONTRIBUTING.md](CONTRIBUTING.md)

---

*Last updated: 2026-04-22*
