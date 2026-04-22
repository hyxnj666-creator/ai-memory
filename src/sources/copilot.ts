import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type {
  Source,
  ConversationMeta,
  Conversation,
  ConversationTurn,
} from "../types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * VS Code Copilot Chat stores sessions at:
 *   {AppData}/Code/User/workspaceStorage/{hash}/chatSessions/{UUID}.json
 *   {AppData}/Code - Insiders/User/workspaceStorage/{hash}/chatSessions/{UUID}.json
 *
 * Session format (v3):
 *   { sessionId, creationDate, version, requests: [{ requestId, timestamp, message, response }] }
 *
 * Newer builds use .jsonl (kind:0 = full state snapshot, kind:1 = incremental).
 */
export class CopilotSource implements Source {
  readonly type = "copilot" as const;

  async detect(): Promise<boolean> {
    const dirs = this.getStorageRoots();
    for (const dir of dirs) {
      try {
        const s = await stat(dir);
        if (s.isDirectory()) return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  async listConversations(): Promise<ConversationMeta[]> {
    const conversations: ConversationMeta[] = [];

    for (const storageRoot of this.getStorageRoots()) {
      let workspaces: string[];
      try {
        const entries = await readdir(storageRoot, { withFileTypes: true });
        workspaces = entries
          .filter((e) => e.isDirectory())
          .map((e) => join(storageRoot, e.name));
      } catch {
        continue;
      }

      for (const wsDir of workspaces) {
        const chatDir = join(wsDir, "chatSessions");
        let files: string[];
        try {
          files = await readdir(chatDir);
        } catch {
          continue;
        }

        for (const file of files) {
          const ext = file.endsWith(".json")
            ? ".json"
            : file.endsWith(".jsonl")
              ? ".jsonl"
              : null;
          if (!ext) continue;

          const id = basename(file, ext);
          if (!UUID_RE.test(id)) continue;

          const filePath = join(chatDir, file);
          const meta = await this.readMeta(filePath, id);
          if (meta) conversations.push(meta);
        }
      }
    }

    return conversations.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async loadConversation(meta: ConversationMeta): Promise<Conversation> {
    const raw = await readFile(meta.filePath, "utf-8");
    const session = this.parseSession(raw, meta.filePath);
    const turns = this.sessionToTurns(session);
    return { meta: { ...meta, turnCount: turns.length }, turns };
  }

  // --- Parsing ---

  parseSession(raw: string, filePath = ""): CopilotSession | null {
    if (filePath.endsWith(".jsonl")) {
      return this.parseJsonlSession(raw);
    }
    return this.parseJsonSession(raw);
  }

  private parseJsonSession(raw: string): CopilotSession | null {
    try {
      const obj = JSON.parse(raw);
      if (this.isValidSession(obj)) return obj;
    } catch {
      // skip
    }
    return null;
  }

  private parseJsonlSession(raw: string): CopilotSession | null {
    let latest: CopilotSession | null = null;
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        // kind:0 = full session snapshot (take the last one)
        if (obj.kind === 0 && obj.v && this.isValidSession(obj.v)) {
          latest = obj.v;
        }
        // Fallback: top-level session object without kind wrapper
        if (obj.kind === undefined && this.isValidSession(obj)) {
          latest = obj;
        }
      } catch {
        // skip
      }
    }
    return latest;
  }

  sessionToTurns(session: CopilotSession | null): ConversationTurn[] {
    if (!session) return [];

    const turns: ConversationTurn[] = [];
    for (const req of session.requests) {
      const userText = req.message?.text?.trim();
      if (!userText) continue;
      // Skip slash commands
      if (userText.startsWith("/")) continue;

      turns.push({ role: "user", text: userText });

      const responseText = this.extractResponseText(req.response);
      if (responseText) {
        turns.push({ role: "assistant", text: responseText });
      }
    }
    return turns;
  }

  private extractResponseText(response: unknown): string | null {
    if (!response) return null;

    // Format 1: response is an array of parts [{ kind: "markdownContent", value: { value: "..." } }]
    if (Array.isArray(response)) {
      const texts: string[] = [];
      for (const part of response) {
        if (part?.kind === "markdownContent" && part?.value?.value) {
          texts.push(String(part.value.value));
        } else if (part?.kind === "markdownContent" && typeof part?.value === "string") {
          texts.push(part.value);
        }
      }
      if (texts.length > 0) return texts.join("\n").trim() || null;
    }

    // Format 2: response is an object with { value: "..." } or { result: { value: "..." } }
    if (typeof response === "object" && response !== null) {
      const r = response as Record<string, unknown>;
      if (typeof r.value === "string") return r.value.trim() || null;
      if (r.result && typeof (r.result as Record<string, unknown>).value === "string") {
        return ((r.result as Record<string, unknown>).value as string).trim() || null;
      }
    }

    return null;
  }

  // --- Metadata ---

  private async readMeta(
    filePath: string,
    id: string
  ): Promise<ConversationMeta | null> {
    try {
      const fileStat = await stat(filePath);
      const raw = await readFile(filePath, "utf-8");
      const session = this.parseSession(raw, filePath);
      if (!session) return null;

      const turnCount = session.requests.length * 2;
      const title = this.extractTitle(session, id);

      return {
        id,
        source: "copilot",
        filePath,
        title,
        modifiedAt: fileStat.mtimeMs,
        turnCount,
      };
    } catch {
      return null;
    }
  }

  private extractTitle(session: CopilotSession, fallbackId: string): string {
    for (const req of session.requests.slice(0, 3)) {
      const text = req.message?.text?.trim();
      if (text && !text.startsWith("/")) {
        const cleaned = text.replace(/\s+/g, " ").trim();
        return cleaned.length > 60 ? cleaned.slice(0, 57) + "..." : cleaned;
      }
    }
    return fallbackId.slice(0, 8);
  }

  private isValidSession(obj: unknown): obj is CopilotSession {
    if (!obj || typeof obj !== "object") return false;
    const s = obj as Record<string, unknown>;
    return (
      typeof s.sessionId === "string" &&
      typeof s.creationDate === "number" &&
      Array.isArray(s.requests)
    );
  }

  // --- Platform paths ---

  private getStorageRoots(): string[] {
    const roots: string[] = [];
    const editions = ["Code", "Code - Insiders"];

    if (process.platform === "win32") {
      const appData = process.env.APPDATA;
      if (appData) {
        for (const ed of editions) {
          roots.push(join(appData, ed, "User", "workspaceStorage"));
        }
      }
    } else if (process.platform === "darwin") {
      for (const ed of editions) {
        roots.push(
          join(homedir(), "Library", "Application Support", ed, "User", "workspaceStorage")
        );
      }
    } else {
      for (const ed of editions) {
        roots.push(join(homedir(), ".config", ed, "User", "workspaceStorage"));
      }
    }

    return roots;
  }
}

// --- Internal types ---

interface CopilotSession {
  sessionId: string;
  creationDate: number;
  version: number;
  requests: CopilotRequest[];
}

interface CopilotRequest {
  requestId: string;
  timestamp: number;
  modelId?: string;
  message: { text: string; attachments?: unknown[] };
  agent?: { id: string; name?: string };
  response?: unknown;
}
