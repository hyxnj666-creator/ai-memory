import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexSource } from "../sources/codex.js";

// ---------------------------------------------------------------------------
// v2.5-06 — Codex CLI source unit tests.
//
// The schema is locked in docs/codex-session-snapshot-2026-04-26.md. These
// tests are the executable spec — every line shape we declared we'd extract
// has a positive test, every shape we said we'd drop has a negative test
// pinning that decision, and the file-system walk has at least one test
// per failure mode (missing dir, empty dir, deep nesting, mixed filenames).
// ---------------------------------------------------------------------------

const source = new CodexSource();

// Helper — build a single rollout line with the upstream schema:
//   { timestamp, type, payload }
function rolloutLine(type: string, payload: unknown): string {
  return JSON.stringify({
    timestamp: "2026-04-26T10:30:00.000Z",
    type,
    payload,
  });
}

// Helper — the most common shape: a `response_item` carrying a chat message.
function messageLine(role: "user" | "assistant", text: string): string {
  return rolloutLine("response_item", {
    type: "message",
    role,
    content: [
      {
        type: role === "user" ? "input_text" : "output_text",
        text,
      },
    ],
  });
}

describe("CodexSource.parseJsonlContent — happy paths", () => {
  it("emits a user turn for a response_item / message / role=user line", () => {
    const turns = source.parseJsonlContent(messageLine("user", "fix the auth bug"));
    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual({ role: "user", text: "fix the auth bug" });
  });

  it("emits an assistant turn for a response_item / message / role=assistant line", () => {
    const turns = source.parseJsonlContent(
      messageLine("assistant", "I'll start by reading the auth module.")
    );
    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual({
      role: "assistant",
      text: "I'll start by reading the auth module.",
    });
  });

  it("joins multi-block content (text + image) into the text-only join", () => {
    const line = rolloutLine("response_item", {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "see this screenshot" },
        { type: "input_image", image_url: "data:image/png;base64,..." },
        { type: "input_text", text: "what do you think?" },
      ],
    });
    const turns = source.parseJsonlContent(line);
    expect(turns).toHaveLength(1);
    // Two text blocks newline-joined; the image is dropped.
    expect(turns[0].text).toBe("see this screenshot\nwhat do you think?");
  });

  it("synthesises one assistant turn from a `compacted` line", () => {
    const line = rolloutLine("compacted", {
      message: "Summary of the first 50 turns: refactored auth module.",
      replacement_history: [],
    });
    const turns = source.parseJsonlContent(line);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual({
      role: "assistant",
      text: "Summary of the first 50 turns: refactored auth module.",
    });
  });

  it("preserves turn order across mixed user / assistant / compacted lines", () => {
    const raw = [
      messageLine("user", "first"),
      messageLine("assistant", "second"),
      rolloutLine("compacted", { message: "third (compacted)" }),
      messageLine("user", "fourth"),
    ].join("\n");

    const turns = source.parseJsonlContent(raw);
    expect(turns.map((t) => t.text)).toEqual([
      "first",
      "second",
      "third (compacted)",
      "fourth",
    ]);
  });
});

describe("CodexSource.parseJsonlContent — variants we deliberately drop", () => {
  it("drops session_meta lines (pure metadata, no user-authored text)", () => {
    const line = rolloutLine("session_meta", {
      id: "thread-id-1",
      timestamp: "2026-04-26T10:30:00Z",
      cwd: "/Users/me/project",
      originator: "codex-tui",
      cli_version: "0.42.0",
    });
    expect(source.parseJsonlContent(line)).toEqual([]);
  });

  it("drops turn_context lines (per-turn config, no content)", () => {
    const line = rolloutLine("turn_context", {
      cwd: "/Users/me/project",
      approval_policy: "suggest",
      sandbox_policy: "docker",
      model: "o3",
    });
    expect(source.parseJsonlContent(line)).toEqual([]);
  });

  it("drops event_msg lines (tool-call events — high noise / low signal)", () => {
    const line = rolloutLine("event_msg", {
      type: "exec_command_end",
      call_id: "abc",
      exit_code: 0,
    });
    expect(source.parseJsonlContent(line)).toEqual([]);
  });

  it("drops response_item lines that are NOT the `message` variant", () => {
    const reasoningLine = rolloutLine("response_item", {
      type: "reasoning",
      summary: ["I should think about this carefully"],
    });
    const localShellLine = rolloutLine("response_item", {
      type: "local_shell_call",
      action: { command: "ls" },
    });
    expect(source.parseJsonlContent(reasoningLine)).toEqual([]);
    expect(source.parseJsonlContent(localShellLine)).toEqual([]);
  });

  it("drops `message` lines with non-user/assistant roles (system, developer)", () => {
    const sysLine = rolloutLine("response_item", {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: "system prompt" }],
    });
    const devLine = rolloutLine("response_item", {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: "dev message" }],
    });
    expect(source.parseJsonlContent(sysLine)).toEqual([]);
    expect(source.parseJsonlContent(devLine)).toEqual([]);
  });

  it("drops compacted lines with empty / missing message", () => {
    const empty = rolloutLine("compacted", { message: "" });
    const whitespace = rolloutLine("compacted", { message: "   \n\t" });
    const missing = rolloutLine("compacted", { replacement_history: [] });
    expect(source.parseJsonlContent(empty)).toEqual([]);
    expect(source.parseJsonlContent(whitespace)).toEqual([]);
    expect(source.parseJsonlContent(missing)).toEqual([]);
  });
});

describe("CodexSource.parseJsonlContent — defensive parsing", () => {
  it("skips malformed JSON lines without throwing", () => {
    const raw = [
      "this is not json",
      "{ broken: ",
      messageLine("user", "valid line"),
      "}}}}",
    ].join("\n");
    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("valid line");
  });

  it("skips empty / whitespace-only lines", () => {
    const raw = ["", "   ", messageLine("user", "hello"), "\t\n"].join("\n");
    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
  });

  it("skips lines with no `payload` field", () => {
    const noPayload = JSON.stringify({
      timestamp: "2026-04-26T10:30:00Z",
      type: "response_item",
      // payload missing entirely
    });
    expect(source.parseJsonlContent(noPayload)).toEqual([]);
  });

  it("skips message lines whose content array has no text blocks", () => {
    const onlyImage = rolloutLine("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_image", image_url: "data:..." }],
    });
    expect(source.parseJsonlContent(onlyImage)).toEqual([]);
  });

  it("accepts a string-form `content` shortcut as a defensive fallback", () => {
    // Upstream uses Vec<ContentItem>, but if a future version ever
    // ships a string shortcut for plain-text messages, we degrade
    // gracefully rather than dropping the turn. Pinned by the spike
    // doc §"defensive paths".
    const stringForm = rolloutLine("response_item", {
      type: "message",
      role: "user",
      content: "shortcut form",
    });
    const turns = source.parseJsonlContent(stringForm);
    expect(turns).toEqual([{ role: "user", text: "shortcut form" }]);
  });
});

describe("CodexSource — file-system layer", () => {
  let tmpRoot: string;
  let sessionsDir: string;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "ai-memory-codex-test-"));
    sessionsDir = join(tmpRoot, "sessions");
    // Build the canonical 3-level YYYY/MM/DD layout.
    const dayDir = join(sessionsDir, "2026", "04", "26");
    await mkdir(dayDir, { recursive: true });

    // Two valid rollouts on the same day.
    await writeFile(
      join(dayDir, "rollout-2026-04-26T10-00-00-aaa.jsonl"),
      [
        rolloutLine("session_meta", {
          id: "aaa",
          timestamp: "2026-04-26T10:00:00Z",
          cwd: "/proj",
          originator: "codex-tui",
          cli_version: "0.42.0",
        }),
        messageLine("user", "first conversation, first user message"),
        messageLine("assistant", "first conversation, first assistant reply"),
      ].join("\n"),
      "utf-8"
    );
    await writeFile(
      join(dayDir, "rollout-2026-04-26T11-00-00-bbb.jsonl"),
      [messageLine("user", "second conversation message")].join("\n"),
      "utf-8"
    );

    // A different day's directory (testing recursion across YYYY/MM/DD).
    const otherDay = join(sessionsDir, "2026", "04", "25");
    await mkdir(otherDay, { recursive: true });
    await writeFile(
      join(otherDay, "rollout-2026-04-25T09-00-00-ccc.jsonl"),
      [messageLine("user", "from yesterday")].join("\n"),
      "utf-8"
    );

    // Files we should ignore: not matching the rollout-*.jsonl pattern.
    await writeFile(join(dayDir, "history.jsonl"), "{}\n", "utf-8");
    await writeFile(
      join(dayDir, "rollout-2026-04-26T12-00-00-ddd.txt"),
      "wrong extension",
      "utf-8"
    );
  });

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("detect() returns false when ~/.codex/sessions/ doesn't exist", async () => {
    // Construct a source pointing at a path we know doesn't exist.
    const orphan = new CodexSource();
    // @ts-expect-error — touch the private field for the test's sake.
    orphan.basePath = join(tmpRoot, "definitely-does-not-exist");
    expect(await orphan.detect()).toBe(false);
  });

  it("detect() returns true when sessions/ directory exists", async () => {
    const live = new CodexSource();
    // @ts-expect-error — point at our test fixture root.
    live.basePath = sessionsDir;
    expect(await live.detect()).toBe(true);
  });

  it("listConversations() recursively walks YYYY/MM/DD directories and only collects rollout-*.jsonl", async () => {
    const live = new CodexSource();
    // @ts-expect-error
    live.basePath = sessionsDir;

    const conversations = await live.listConversations();
    // Three rollouts across two days. The non-rollout history.jsonl and
    // the .txt-extension file MUST be filtered out.
    expect(conversations).toHaveLength(3);
    expect(conversations.every((c) => c.source === "codex")).toBe(true);
    expect(conversations.every((c) => c.filePath.endsWith(".jsonl"))).toBe(
      true
    );
    expect(conversations.every((c) => c.id.startsWith("rollout-"))).toBe(true);
  });

  it("listConversations() returns results sorted by modifiedAt descending", async () => {
    const live = new CodexSource();
    // @ts-expect-error
    live.basePath = sessionsDir;
    const conversations = await live.listConversations();
    for (let i = 1; i < conversations.length; i++) {
      expect(conversations[i - 1].modifiedAt).toBeGreaterThanOrEqual(
        conversations[i].modifiedAt
      );
    }
  });

  it("listConversations() returns [] for an empty sessions directory (no throw)", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "ai-memory-codex-empty-"));
    const emptySessions = join(emptyRoot, "sessions");
    await mkdir(emptySessions, { recursive: true });
    try {
      const live = new CodexSource();
      // @ts-expect-error
      live.basePath = emptySessions;
      const conversations = await live.listConversations();
      expect(conversations).toEqual([]);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("loadConversation() returns the parsed turns with a corrected turnCount", async () => {
    const live = new CodexSource();
    // @ts-expect-error
    live.basePath = sessionsDir;
    const conversations = await live.listConversations();
    const aaa = conversations.find((c) => c.id.endsWith("-aaa"));
    expect(aaa).toBeDefined();

    const conv = await live.loadConversation(aaa!);
    // Two real turns (the session_meta line is dropped per spike doc).
    expect(conv.turns).toHaveLength(2);
    expect(conv.turns[0]).toEqual({
      role: "user",
      text: "first conversation, first user message",
    });
    expect(conv.turns[1]).toEqual({
      role: "assistant",
      text: "first conversation, first assistant reply",
    });
    expect(conv.meta.turnCount).toBe(2);
  });

  it("title extraction takes the first user message and truncates at 60 chars", async () => {
    const live = new CodexSource();
    // @ts-expect-error
    live.basePath = sessionsDir;
    const conversations = await live.listConversations();
    const aaa = conversations.find((c) => c.id.endsWith("-aaa"));
    expect(aaa?.title).toBe("first conversation, first user message");

    const ccc = conversations.find((c) => c.id.endsWith("-ccc"));
    expect(ccc?.title).toBe("from yesterday");
  });

  it("title extraction falls back to a short prefix of the rollout id when no user line exists", async () => {
    const noUserRoot = await mkdtemp(
      join(tmpdir(), "ai-memory-codex-nouser-")
    );
    const noUserDay = join(noUserRoot, "sessions", "2026", "04", "26");
    await mkdir(noUserDay, { recursive: true });
    await writeFile(
      join(noUserDay, "rollout-2026-04-26T15-00-00-nouser.jsonl"),
      [messageLine("assistant", "I started without a user prompt.")].join("\n"),
      "utf-8"
    );
    try {
      const live = new CodexSource();
      // @ts-expect-error
      live.basePath = join(noUserRoot, "sessions");
      const conversations = await live.listConversations();
      expect(conversations).toHaveLength(1);
      // Falls back to the first 24 chars of the rollout id.
      expect(conversations[0].title).toBe("rollout-2026-04-26T15-00");
    } finally {
      await rm(noUserRoot, { recursive: true, force: true });
    }
  });
});
