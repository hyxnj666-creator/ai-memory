# RFC-001: MCP Server

> Status: **Draft** | Author: Conor Liu | Created: 2026-04-21

## Summary

Add an MCP (Model Context Protocol) server mode to ai-memory, enabling AI editors to interact with the knowledge base automatically — without users running CLI commands.

## Motivation

v1 requires manual CLI execution: users must remember to run `extract`, `search`, `context`. This creates friction and means knowledge is only captured when the user takes action.

With MCP, the AI assistant itself can:
- **Remember** knowledge during a conversation (push model)
- **Recall** relevant knowledge when starting a task (pull model)
- **Search** the knowledge base when answering questions

This transforms ai-memory from "a tool you run" to "a capability your AI has."

## Design

### Transport

Use **stdio transport** (stdin/stdout JSON-RPC). This is the standard for local MCP servers in Cursor and Claude Code. No HTTP server, no port conflicts, no security surface.

### Entry Point

```bash
npx ai-memory-cli serve          # start MCP server
npx ai-memory-cli serve --debug  # with debug logging to stderr
```

Or configured in Cursor's MCP settings:

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

### Tools

#### `remember`

AI calls this to store knowledge it encounters during a conversation.

```typescript
{
  name: "remember",
  description: "Store a piece of project knowledge (decision, convention, architecture note, todo, or issue) for future reference.",
  inputSchema: {
    type: "object",
    properties: {
      type: { enum: ["decision", "architecture", "convention", "todo", "issue"] },
      title: { type: "string", description: "Short descriptive title" },
      content: { type: "string", description: "Detailed content (min 30 chars)" },
      context: { type: "string", description: "What problem or goal led to this" },
      reasoning: { type: "string", description: "Why this approach (decisions only)" },
      alternatives: { type: "string", description: "What was rejected (decisions only)" },
      impact: { type: "string", description: "Affected files/modules/APIs" }
    },
    required: ["type", "title", "content"]
  }
}
```

Implementation: creates an `ExtractedMemory` object, calls `writeMemories()` from `memory-store.ts`. Author is resolved from config/git (same as CLI).

#### `recall`

AI calls this to get relevant context for the current task.

```typescript
{
  name: "recall",
  description: "Retrieve project memories relevant to a topic. Returns structured knowledge about decisions, conventions, and architecture.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for" },
      type: { enum: ["decision", "architecture", "convention", "todo", "issue"] },
      limit: { type: "number", default: 10 }
    },
    required: ["query"]
  }
}
```

Implementation: reuses the search scoring logic from `search.ts`. Returns formatted memory objects.

#### `search`

Lower-level search tool with more control.

```typescript
{
  name: "search_memories",
  description: "Search through extracted project memories by keyword.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      type: { type: "string", description: "Comma-separated types to filter" },
      author: { type: "string" },
      includeResolved: { type: "boolean", default: false }
    },
    required: ["query"]
  }
}
```

### Resources

#### `project-context`

Automatically provides project context to the AI assistant.

```typescript
{
  uri: "memory://project-context",
  name: "Project Knowledge Base",
  description: "Extracted decisions, conventions, architecture notes, and TODOs from this project's AI conversation history.",
  mimeType: "text/markdown"
}
```

Implementation: calls `buildDirectContext()` with tiered compression. The AI editor reads this resource when starting a conversation, giving it instant project awareness.

### Architecture

```
src/
├── mcp/
│   ├── server.ts         # MCP server setup (stdio transport)
│   ├── tools.ts          # Tool handlers (remember, recall, search)
│   └── resources.ts      # Resource providers (project-context)
```

The MCP layer is thin — it translates MCP protocol calls into existing core function calls. No business logic in the MCP layer.

### Dependencies

We'll need the `@modelcontextprotocol/sdk` package. This is the **only** new runtime dependency, and it's the official MCP SDK from Anthropic. It handles JSON-RPC framing, schema validation, and transport.

This breaks the "zero dependencies" rule, but MCP is a protocol requirement. Options:
1. Add `@modelcontextprotocol/sdk` as a dependency
2. Create a separate `ai-memory-mcp` package with the SDK dependency, keeping the CLI zero-dep

**Recommendation**: Option 1. The SDK is small (~50KB) and is the standard way to implement MCP. Users who only use CLI won't notice the size difference.

## Rollout Plan

1. Implement core tools: `remember`, `recall`, `search_memories`
2. Implement `project-context` resource
3. Add `serve` command to CLI
4. Write MCP setup guide for Cursor and Claude Code
5. Test with real workflows
6. Publish as v2.0.0

## Open Questions

- Should `remember` require confirmation from the user, or should the AI store autonomously?
- Should we add a `list_memories` tool for browsing?
- Should the MCP server auto-run `extract` on startup to sync latest conversations?
- How to handle concurrent access (CLI and MCP writing simultaneously)?

## References

- [MCP Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Cursor MCP Documentation](https://docs.cursor.com/context/model-context-protocol)
