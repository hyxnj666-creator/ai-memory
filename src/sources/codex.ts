import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  Source,
  ConversationMeta,
  Conversation,
  ConversationTurn,
} from "../types.js";

/**
 * OpenAI Codex CLI source (v2.5-06).
 *
 * Schema reference: docs/codex-session-snapshot-2026-04-26.md
 *
 * Sessions live at:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 *   (Windows native: %USERPROFILE%\.codex\sessions\…)
 *
 * Each line is a `RolloutLineRef` from upstream `codex-rs`:
 *
 *   { "timestamp": "...Z",
 *     "type": "session_meta" | "response_item" | "compacted"
 *           | "turn_context" | "event_msg",
 *     "payload": { ... } }
 *
 * For knowledge extraction we only emit turns from:
 *   - type=response_item, payload.type=message,
 *     payload.role ∈ {"user","assistant"}, with text content blocks.
 *   - type=compacted (synthesised assistant turn from payload.message).
 *
 * Everything else (turn_context / session_meta / event_msg /
 * non-message response_items) is silently dropped — same defensive
 * "skip unrecognised lines" policy as `claude-code.ts`. See the spike
 * doc for the full re-spike trigger list.
 */
export class CodexSource implements Source {
  readonly type = "codex" as const;
  private basePath: string;

  constructor() {
    this.basePath = join(homedir(), ".codex", "sessions");
  }

  async detect(): Promise<boolean> {
    try {
      const s = await stat(this.basePath);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  async listConversations(): Promise<ConversationMeta[]> {
    const files = await this.collectRolloutFiles(this.basePath);
    const conversations: ConversationMeta[] = [];

    for (const filePath of files) {
      const meta = await this.readMeta(filePath);
      if (meta) conversations.push(meta);
    }

    return conversations.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async loadConversation(meta: ConversationMeta): Promise<Conversation> {
    const raw = await readFile(meta.filePath, "utf-8");
    const turns = this.parseJsonlContent(raw);
    return { meta: { ...meta, turnCount: turns.length }, turns };
  }

  /**
   * Recursively walk `~/.codex/sessions/YYYY/MM/DD/` collecting any
   * file matching `rollout-*.jsonl`. We don't enforce the exact
   * 3-level structure — if Codex one day flattens or deepens it, we
   * still find the files (defense-in-depth against the path layout
   * shifting). The expected layout is documented in the spike doc.
   */
  private async collectRolloutFiles(dir: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const out: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await this.collectRolloutFiles(full)));
      } else if (
        entry.isFile() &&
        entry.name.startsWith("rollout-") &&
        entry.name.endsWith(".jsonl")
      ) {
        out.push(full);
      }
    }
    return out;
  }

  parseJsonlContent(raw: string): ConversationTurn[] {
    const turns: ConversationTurn[] = [];

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      const turn = this.lineToTurn(obj);
      if (turn) turns.push(turn);
    }

    return turns;
  }

  private lineToTurn(
    obj: Record<string, unknown>
  ): ConversationTurn | null {
    const type = obj.type;
    const payload = obj.payload as Record<string, unknown> | undefined;
    if (typeof type !== "string" || !payload) return null;

    if (type === "response_item") {
      // Only the `message` variant carries user/assistant text we care
      // about. Reasoning / LocalShellCall / etc. are deliberately
      // dropped — see spike doc §"Variants we deliberately drop".
      if (payload.type !== "message") return null;
      const role = payload.role;
      if (role !== "user" && role !== "assistant") return null;

      const text = this.joinContentBlocks(payload.content);
      if (!text) return null;
      return { role, text };
    }

    if (type === "compacted") {
      // Conversation-summarisation event — synthesise one assistant
      // turn from the summary message. The original turns being
      // summarised live in `replacement_history` but we don't emit
      // them; the summary is what "survived" compaction.
      const message = payload.message;
      if (typeof message !== "string" || !message.trim()) return null;
      return { role: "assistant", text: message.trim() };
    }

    return null;
  }

  /**
   * Join the text from `ContentItem[]` blocks into a single string.
   * Handles `input_text` / `output_text` (we don't distinguish — both
   * are user-visible text). `input_image` and any other block type is
   * silently skipped.
   */
  private joinContentBlocks(content: unknown): string | null {
    if (!Array.isArray(content)) {
      // Some defensive paths in case upstream ever ships a string-form
      // shortcut for plain-text messages — accept it gracefully.
      if (typeof content === "string") return content.trim() || null;
      return null;
    }

    const texts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const block = part as Record<string, unknown>;
      const blockType = block.type;
      if (
        (blockType === "input_text" || blockType === "output_text") &&
        typeof block.text === "string" &&
        block.text.trim()
      ) {
        texts.push(block.text.trim());
      }
    }
    const joined = texts.join("\n").trim();
    return joined || null;
  }

  private async readMeta(filePath: string): Promise<ConversationMeta | null> {
    try {
      const fileStat = await stat(filePath);
      const raw = await readFile(filePath, "utf-8");
      const turns = this.parseJsonlContent(raw);
      const id = this.deriveId(filePath);
      const title = this.extractTitle(raw, id);

      return {
        id,
        source: "codex",
        filePath,
        title,
        modifiedAt: fileStat.mtimeMs,
        turnCount: turns.length,
      };
    } catch {
      return null;
    }
  }

  private deriveId(filePath: string): string {
    const base = filePath.split(/[/\\]/).pop() ?? "";
    return base.replace(/\.jsonl$/, "");
  }

  private extractTitle(raw: string, fallbackId: string): string {
    for (const line of raw.split("\n").slice(0, 10)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        const turn = this.lineToTurn(obj);
        if (turn?.role === "user" && turn.text) {
          const cleaned = turn.text.replace(/\s+/g, " ").trim();
          return cleaned.length > 60 ? cleaned.slice(0, 57) + "..." : cleaned;
        }
      } catch {
        // skip
      }
    }
    // Falls back to a short prefix of the rollout id (which begins
    // with a timestamp, so it's at least diagnostic).
    return fallbackId.slice(0, 24);
  }
}
