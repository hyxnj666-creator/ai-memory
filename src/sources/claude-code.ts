import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  Source,
  ConversationMeta,
  Conversation,
  ConversationTurn,
} from "../types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claude Code stores sessions at:
 *   ~/.claude/projects/{path-with-dashes}/{uuid}.jsonl
 *
 * Each line is a JSONL event with role "user" | "assistant".
 * Assistant messages may contain tool_use / tool_result blocks — we extract
 * only text blocks for knowledge extraction.
 */
export class ClaudeCodeSource implements Source {
  readonly type = "claude-code" as const;
  private basePath: string;

  constructor() {
    this.basePath = join(homedir(), ".claude", "projects");
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
    const conversations: ConversationMeta[] = [];

    let projectDirs: string[];
    try {
      const entries = await readdir(this.basePath, { withFileTypes: true });
      // Claude Code encodes the project path as a dir name with path separators
      // replaced by "-" (e.g. /home/user/myproject → -home-user-myproject).
      // Filter to only dirs that match the current working directory.
      const cwdEncoded = process.cwd().replace(/[/\\:]/g, "-").toLowerCase();
      const cwdBasename = process.cwd().split(/[/\\]/).pop()?.toLowerCase() ?? "";

      projectDirs = entries
        .filter((e) => {
          if (!e.isDirectory()) return false;
          const name = e.name.toLowerCase();
          // Match if dir name ends with or contains the cwd path encoding
          return name.endsWith(cwdEncoded) || name.includes(`-${cwdBasename}`);
        })
        .map((e) => join(this.basePath, e.name));

      // If no cwd-specific dirs found, fall back to all dirs (avoids empty results)
      if (projectDirs.length === 0) {
        projectDirs = entries
          .filter((e) => e.isDirectory())
          .map((e) => join(this.basePath, e.name));
      }
    } catch {
      return [];
    }

    for (const projectDir of projectDirs) {
      const files = await readdir(projectDir).catch(() => []);
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const id = file.replace(".jsonl", "");
        if (!UUID_RE.test(id)) continue;

        const filePath = join(projectDir, file);
        const meta = await this.readMeta(filePath, id);
        if (meta) conversations.push(meta);
      }
    }

    return conversations.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async loadConversation(meta: ConversationMeta): Promise<Conversation> {
    const raw = await readFile(meta.filePath, "utf-8");
    const turns = this.parseJsonlContent(raw);
    return { meta: { ...meta, turnCount: turns.length }, turns };
  }

  parseJsonlContent(raw: string): ConversationTurn[] {
    const turns: ConversationTurn[] = [];

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const obj = JSON.parse(trimmed);
        const role = obj.role as "user" | "assistant";
        if (role !== "user" && role !== "assistant") continue;

        const text = this.extractText(obj);
        if (!text) continue;

        turns.push({ role, text });
      } catch {
        // Skip malformed lines
      }
    }

    return turns;
  }

  private extractText(obj: Record<string, unknown>): string | null {
    // Claude Code format: message may be in obj.message or obj directly
    const content =
      (obj.message as Record<string, unknown>)?.content ?? obj.content;

    if (typeof content === "string") {
      return content.trim() || null;
    }

    if (Array.isArray(content)) {
      const texts: string[] = [];
      for (const part of content) {
        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string" &&
          part.text.trim()
        ) {
          texts.push((part.text as string).trim());
        }
      }
      const joined = texts.join("\n").trim();
      return joined || null;
    }

    return null;
  }

  private async readMeta(
    filePath: string,
    id: string
  ): Promise<ConversationMeta | null> {
    try {
      const fileStat = await stat(filePath);
      const raw = await readFile(filePath, "utf-8");
      const turns = this.parseJsonlContent(raw);
      const title = this.extractTitle(raw, id);

      return {
        id,
        source: "claude-code",
        filePath,
        title,
        modifiedAt: fileStat.mtimeMs,
        turnCount: turns.length,
      };
    } catch {
      return null;
    }
  }

  private extractTitle(raw: string, fallbackId: string): string {
    for (const line of raw.split("\n").slice(0, 5)) {
      try {
        const obj = JSON.parse(line.trim());
        if (obj.role === "user") {
          const text = this.extractText(obj);
          if (text) {
            const cleaned = text.replace(/\s+/g, " ").trim();
            return cleaned.length > 60
              ? cleaned.slice(0, 57) + "..."
              : cleaned;
          }
        }
      } catch {
        // skip
      }
    }
    return fallbackId.slice(0, 8);
  }
}
