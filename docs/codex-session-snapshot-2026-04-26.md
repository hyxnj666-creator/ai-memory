# Codex CLI session-file schema snapshot — 2026-04-26

This is the **dated spike-first** doc for v2.5-06 (OpenAI Codex CLI as the
5th editor source). Follows the same pattern as
[`skills-schema-snapshot-2026-04-26.md`](skills-schema-snapshot-2026-04-26.md)
and [`redaction-policy-2026-04-26.md`](redaction-policy-2026-04-26.md): the
schema is locked here before any code lands in `src/sources/codex.ts`, and
when the upstream spec moves we re-spike (don't silently chase a moving target).

## Why a dated snapshot

OpenAI's `codex` CLI ships under `openai/codex` on GitHub and has been
moving fast — the rollout-line schema added a `RolloutLine` JSON-schema
generator in PR #14434, and `RolloutItem` gained `Compact` and
`TurnContext` variants in commit 674e3d3 (#3444). When the on-disk shape
changes from under us, our adapter has two failure modes:

1. **Loud failure** — JSON parse throws, the conversation is dropped.
   Fine; the user gets a clear error and we add a fixture.
2. **Silent failure** — the file parses but no `user`/`assistant` turns
   come out, so `doctor` shows `Codex CLI — N conversations` but
   `extract` finds zero memories. This is the failure mode this snapshot
   protects against — we lock a re-spike trigger so we notice when the
   upstream "Message" variant changes shape.

## Locked facts (sources cited inline)

### File path

| Platform | Location |
|---|---|
| macOS, Linux, WSL | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Windows native | `%USERPROFILE%\.codex\sessions\YYYY\MM\DD\rollout-*.jsonl` |
| Override | `$CODEX_HOME/sessions/...` (env-var override, all platforms) |

Source: [`Where OpenAI Codex CLI Stores Configuration Files` (Inventive HQ KB, January 2026)](https://inventivehq.com/knowledge-base/openai/where-configuration-files-are-stored)

Filename pattern: `rollout-YYYY-MM-DDTHH-MM-SS-{id}.jsonl`. Example:
`rollout-2025-01-22T10-30-00-abc123.jsonl`. The trailing `{id}` is opaque
(implementation detail of `codex_rollout::RolloutRecorder` — we don't
parse it; we treat the whole filename minus the `.jsonl` extension as the
conversation `id`).

**Difference from the original ROADMAP assumption**: the ROADMAP entry
("Conversation files live in `~/.codex/sessions/`") implied a flat
directory. The actual layout has **three levels of date partitioning
(YYYY/MM/DD)** that our adapter must walk. This is the kind of detail
the spike-first doc catches before code ships against the wrong
assumption.

### Per-line schema

Every line in a `rollout-*.jsonl` is a single `RolloutLineRef` (defined
in [`codex-rs/rollout/src/recorder.rs`](https://raw.githubusercontent.com/openai/codex/main/codex-rs/rollout/src/recorder.rs) lines 1734–1740):

```rust
#[derive(serde::Serialize)]
struct RolloutLineRef<'a> {
    timestamp: String,
    #[serde(flatten)]
    item: &'a RolloutItem,
}
```

The `flatten` is load-bearing — it means the JSON has `timestamp` AND the
fields of `RolloutItem` at the top level (no nesting under `item`).

`RolloutItem` is a tagged union (defined in [`codex-rs/protocol/src/protocol.rs`](https://raw.githubusercontent.com/openai/codex/main/codex-rs/protocol/src/protocol.rs) lines 2827–2835):

```rust
#[derive(Serialize, Deserialize, Debug, Clone, JsonSchema, TS)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum RolloutItem {
    SessionMeta(SessionMetaLine),
    ResponseItem(ResponseItem),
    Compacted(CompactedItem),
    TurnContext(TurnContextItem),
    EventMsg(EventMsg),
}
```

So each line is shaped:

```jsonc
{
  "timestamp": "2026-01-22T10:30:00.123Z",
  "type":    "session_meta" | "response_item" | "compacted" | "turn_context" | "event_msg",
  "payload": { /* variant-specific */ }
}
```

`type` is **snake_case** (Rust's `rename_all = "snake_case"`). `payload`
holds the variant body.

### `response_item` payload (the variant we extract from)

`ResponseItem` is *itself* a tagged union (defined in [`codex-rs/protocol/src/models.rs`](https://raw.githubusercontent.com/openai/codex/main/codex-rs/protocol/src/models.rs) lines 684–703):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResponseItem {
    Message {
        id: Option<String>,
        role: String,                 // "user" | "assistant" | "system" | "developer"
        content: Vec<ContentItem>,
        end_turn: Option<bool>,
        phase: Option<MessagePhase>,
    },
    Reasoning { /* ... */ },
    LocalShellCall { /* ... */ },
    /* ... more variants we don't care about ... */
}
```

So a user message line looks roughly like (truncated for brevity, real
keys verified against upstream source):

```jsonc
{
  "timestamp": "2026-01-22T10:30:00.123Z",
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "user",
    "content": [{ "type": "input_text", "text": "fix the auth bug" }]
  }
}
```

And an assistant message:

```jsonc
{
  "timestamp": "2026-01-22T10:30:01.456Z",
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "assistant",
    "content": [{ "type": "output_text", "text": "I'll start by reading…" }]
  }
}
```

`ContentItem` (defined at [`models.rs` line 642](https://raw.githubusercontent.com/openai/codex/main/codex-rs/protocol/src/models.rs)):

```rust
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentItem {
    InputText { text: String },
    InputImage { image_url: String, detail: Option<ImageDetail> },
    OutputText { text: String },
}
```

→ `type: "input_text"` for user-side text, `type: "output_text"` for
assistant-side text, and `type: "input_image"` for image attachments
(our adapter ignores image content blocks, like Claude Code does).

### `compacted` payload (also extract-relevant)

When the conversation is auto-compacted (Codex truncates older turns into
a single summary message), the resulting summary lands as a `Compacted`
rollout item:

```jsonc
{
  "timestamp": "...",
  "type": "compacted",
  "payload": {
    "message": "Summary of the first 50 turns: …",
    "replacement_history": [ /* the original ResponseItems being summarised */ ]
  }
}
```

We treat this as one synthetic `assistant` turn with `text =
payload.message`. Reasoning: the LLM produced this summary on the user's
behalf, and any decision the user agreed to during the compacted span is
expressed in this summary (or lost — but at least we capture the
summary, which is more useful than nothing).

### Variants we deliberately drop

| Variant | Reason |
|---|---|
| `session_meta` | Pure metadata (cwd, model, timestamp) — useful for `cwd`-based filtering, not for memory text. |
| `turn_context` | Per-turn config snapshot (approval_policy, sandbox_policy, model, etc.) — no user-authored content. |
| `event_msg` | Tool-call events (exec start/end, file reads, etc.). High noise / low signal for *knowledge extraction*. Cursor and Claude Code adapters drop equivalent events. |
| `response_item` non-`message` variants | `Reasoning` / `LocalShellCall` / etc. The user never sees Reasoning text in the TUI by default; treating it as user-authored knowledge would distort extraction. |

This matches the policy in `claude-code.ts:extractText` which also
filters Claude's `tool_use` / `tool_result` blocks out of the text we
hand to the extractor.

## Adapter design

### `src/sources/codex.ts` — class `CodexSource implements Source`

Same shape as `ClaudeCodeSource`, with three differences:

1. **`detect()`** — checks for `~/.codex/sessions/` (or `$CODEX_HOME/sessions/`).
2. **`listConversations()`** — recursive walk of `YYYY/MM/DD/`, glob
   `rollout-*.jsonl`. Project-cwd filter is **not** applied because the
   `cwd` info is per-line (in `session_meta`) not per-directory; we'd
   have to parse the first line of every file to filter by cwd, which
   defeats the cheap-list optimization. Instead we list all files in the
   user's `~/.codex/sessions/` and let the existing run-time
   project-name filtering at the `extract` level do the job — same way
   Cursor's adapter behaves.
3. **`parseJsonlContent()`** — only emit a turn for lines where:
   - `type === "response_item"` AND `payload.type === "message"` AND
     `role ∈ {"user", "assistant"}` AND text content is non-empty.
   - **OR** `type === "compacted"` (synthesises one assistant turn from
     `payload.message`).
   - Any other shape is **silently skipped** — same defensive policy as
     Claude Code (malformed lines don't throw).

### Conversation `id`

Use the filename minus `.jsonl` extension. Example:
`rollout-2025-01-22T10-30-00-abc123` → that string is the id. This is
stable across re-runs (Codex never rewrites a rollout file in place;
either appends or creates a new one).

### Title extraction

First non-empty user message in the first 5 lines, truncated at 60
chars. Same as Claude Code; falls back to first 8 chars of id.

## Re-spike triggers

Update or supersede this doc when **any** of these happen:

1. **`RolloutItem` enum gains a new variant** that contains user/assistant
   text. (We'd silently lose the new content type.)
2. **`type` discriminator field renames or restructures** (e.g. drops
   `rename_all = "snake_case"` or moves to a different tag name). Detection:
   our adapter would suddenly find 0 conversations / 0 turns.
3. **Filename pattern changes** away from `rollout-*.jsonl` (e.g. moves to
   `session-*.jsonl` or a SQLite-backed format). Detection: `detect()`
   would still pass (sessions/ dir exists) but `listConversations()`
   would return empty.
4. **Path moves** away from `~/.codex/sessions/YYYY/MM/DD/` (e.g. removes
   date partitioning, or moves under a different home subdirectory).
5. **OpenAI ships a competing schema** (e.g. AGENTS.md emission becomes
   first-class in the rollout file rather than a separate file).

## Known unknowns flagged honestly

The following details could not be fully verified from public sources:

1. **No real `rollout-*.jsonl` sample available.** Without `codex` CLI
   actually running on a development machine I can't byte-verify the
   on-disk shape against the schema above. Mitigation: defensive
   parsing (fail-soft, skip unrecognised lines) + the re-spike trigger
   list. Future: add an integration test against a checked-in fixture
   in `src/__tests__/fixtures/codex-rollout-*.jsonl` once we capture a
   real sample (anonymised).
2. **Compacted-history field name stability.** `replacement_history` is
   present in main as of 2026-04-26 — we don't depend on it (we only
   read `payload.message`).
3. **Cross-platform `homedir()` behaviour for `$CODEX_HOME`.** Node's
   `os.homedir()` returns `%USERPROFILE%` on Windows native, which is
   correct; but if `$CODEX_HOME` is set, we should respect it. v0
   adapter ignores `$CODEX_HOME` — deferred to a follow-up if anyone
   reports it.

## Implementation contract

`src/sources/codex.ts` will export:

```typescript
import type { Source, ConversationMeta, Conversation, ConversationTurn } from "../types.js";

export class CodexSource implements Source {
  readonly type = "codex" as const;
  detect(): Promise<boolean>;
  listConversations(): Promise<ConversationMeta[]>;
  loadConversation(meta: ConversationMeta): Promise<Conversation>;
}
```

`src/types.ts` `SourceType` widens to:

```typescript
export type SourceType = "cursor" | "claude-code" | "windsurf" | "copilot" | "codex";
```

`src/sources/detector.ts` registers `CodexSource` last (consistent
ordering: cursor → claude-code → windsurf → copilot → codex). UI label:
`"Codex CLI"`.

## Test plan

10–15 unit tests in `src/__tests__/codex-source.test.ts`:

1. `detect()` returns `false` when `~/.codex/sessions/` doesn't exist.
2. `detect()` returns `true` when it does.
3. `listConversations()` recursively walks `YYYY/MM/DD/` directories.
4. `listConversations()` filters out non-`rollout-*.jsonl` files.
5. `listConversations()` returns `modifiedAt`-sorted descending.
6. `parseJsonlContent()` emits a user turn for a `response_item` /
   `message` / role=`user` line.
7. Same for assistant.
8. `parseJsonlContent()` joins multi-block content (`input_text` +
   `input_image`) into the text-only join.
9. `parseJsonlContent()` synthesises an assistant turn from a
   `compacted` line.
10. `parseJsonlContent()` drops `session_meta` / `turn_context` /
    `event_msg` / non-`message` `response_item` lines.
11. `parseJsonlContent()` skips malformed JSON without throwing.
12. `parseJsonlContent()` skips `message` lines with non-user/assistant
    roles (e.g. `developer`, `system`).
13. Title extraction: first user message, truncated at 60 chars,
    falls back to id when no user message exists.
14. Empty `~/.codex/sessions/` directory returns `[]` (not throws).
