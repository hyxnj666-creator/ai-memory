# Cursor pagination is mandatory for all paged GraphQL endpoints

> **Date**: 2026-04-23  
> **Author**: alice  
> **Source**: cursor:1f8d4a07  
> **Conversation**: GraphQL pagination strategy for the public API

---

**Context**: Three new paged endpoints land next sprint. Some teams want offset/limit because it is simpler. Offset/limit breaks under concurrent inserts/edits/deletes — pages either skip rows or repeat them.

**Content**: Every paged GraphQL endpoint MUST use Relay-style cursor pagination (`edges` / `node` / `cursor` + `pageInfo.hasNextPage`). Choose `first` + `after` as the canonical pair; reject `last` + `before` unless explicitly justified per endpoint. CI lint rule will enforce on new schema.

**Reasoning**: Cursor pagination is stable across mutations and aligns with the Apollo/Relay tooling already in use. Migration of existing offset endpoints exposes both shapes for one minor version so consumers can switch over without breakage.

**Alternatives**: Offset/limit (rejected, see Context). Page-token-only (rejected — no cursor opacity guarantee, leaks server state). Custom cursor scheme (rejected — no benefit over Relay spec).
