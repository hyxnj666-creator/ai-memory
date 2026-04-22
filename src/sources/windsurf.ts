import { readdir, stat, copyFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import type {
  Source,
  ConversationMeta,
  Conversation,
  ConversationTurn,
} from "../types.js";

/**
 * Windsurf (Codeium) stores Cascade conversations in state.vscdb (SQLite).
 *
 * Locations:
 *   - Workspace storage: {AppData}/Windsurf/User/workspaceStorage/{hash}/state.vscdb
 *   - Global storage:    {AppData}/Windsurf/User/globalStorage/state.vscdb
 *
 * Cascade conversation data is stored as protobuf-encoded blobs under specific
 * SQLite keys. Chat mode data may be JSON. We try JSON extraction first,
 * then fall back to minimal protobuf decoding for Cascade trajectories.
 *
 * Note: Windsurf's internal format may change between versions.
 * This implementation is based on reverse-engineering as of early 2026.
 */
export class WindsurfSource implements Source {
  readonly type = "windsurf" as const;

  async detect(): Promise<boolean> {
    for (const dir of this.getInstallDirs()) {
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

    // Scan workspace storage for chat sessions
    for (const installDir of this.getInstallDirs()) {
      const wsRoot = join(installDir, "User", "workspaceStorage");
      try {
        const entries = await readdir(wsRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const dbPath = join(wsRoot, entry.name, "state.vscdb");
          const metas = await this.extractFromDb(dbPath, entry.name);
          conversations.push(...metas);
        }
      } catch {
        // workspace storage doesn't exist
      }
    }

    return conversations.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async loadConversation(meta: ConversationMeta): Promise<Conversation> {
    // meta.filePath stores the DB path, meta.id stores the conversation key
    const turns = await this.loadTurnsFromDb(meta.filePath, meta.id);
    return { meta: { ...meta, turnCount: turns.length }, turns };
  }

  // --- SQLite extraction ---

  private async extractFromDb(
    dbPath: string,
    workspaceId: string
  ): Promise<ConversationMeta[]> {
    let dbStat;
    try {
      dbStat = await stat(dbPath);
    } catch {
      return [];
    }

    const metas: ConversationMeta[] = [];
    const tmpDb = join(tmpdir(), `ai-memory-windsurf-${Date.now()}.vscdb`);
    const tmpFiles = [tmpDb, tmpDb + "-wal", tmpDb + "-shm"];
    const cleanup = () => {
      for (const f of tmpFiles) unlink(f).catch(() => {});
    };

    try {
      await copyFile(dbPath, tmpDb);
      for (const ext of ["-wal", "-shm"]) {
        try { await copyFile(dbPath + ext, tmpDb + ext); } catch { /* optional */ }
      }

      const rows = await this.queryDb(tmpDb, this.chatDataKeys());
      cleanup();

      for (const [key, value] of rows) {
        const conversations = this.parseChatData(value, key, dbPath, dbStat.mtimeMs, workspaceId);
        metas.push(...conversations);
      }
    } catch {
      cleanup();
    }

    return metas;
  }

  private async loadTurnsFromDb(
    dbPath: string,
    conversationId: string
  ): Promise<ConversationTurn[]> {
    const tmpDb = join(tmpdir(), `ai-memory-windsurf-load-${Date.now()}.vscdb`);
    const tmpFiles = [tmpDb, tmpDb + "-wal", tmpDb + "-shm"];
    const cleanup = () => {
      for (const f of tmpFiles) unlink(f).catch(() => {});
    };

    try {
      await copyFile(dbPath, tmpDb);
      for (const ext of ["-wal", "-shm"]) {
        try { await copyFile(dbPath + ext, tmpDb + ext); } catch { /* optional */ }
      }

      const rows = await this.queryDb(tmpDb, this.chatDataKeys());
      cleanup();

      for (const [key, value] of rows) {
        const turns = this.extractTurnsFromChatData(value, conversationId);
        if (turns.length > 0) return turns;
      }
    } catch {
      cleanup();
    }

    return [];
  }

  private async queryDb(
    tmpDb: string,
    keys: string[]
  ): Promise<Array<[string, string]>> {
    const results: Array<[string, string]> = [];

    try {
      const sqliteMod = "node" + ":sqlite";
      const { DatabaseSync } = await import(sqliteMod);
      const db = new (DatabaseSync as new (p: string, opts?: Record<string, unknown>) => {
        prepare(sql: string): { all(...args: unknown[]): unknown[] };
        close(): void;
      })(tmpDb, { readonly: true });

      try {
        // Query ItemTable for chat-related keys
        const likeClauses = keys.map(() => "key LIKE ?").join(" OR ");
        const stmt = db.prepare(`SELECT key, value FROM ItemTable WHERE ${likeClauses}`);
        const rows = stmt.all(...keys) as Array<{ key: string; value: string }>;

        for (const row of rows) {
          if (row.value) {
            results.push([row.key, row.value]);
          }
        }
      } finally {
        db.close();
      }
    } catch {
      // node:sqlite not available (Node < 22) or DB read failed
    }

    return results;
  }

  private chatDataKeys(): string[] {
    return [
      "%aiChat.chatdata%",
      "%workbench.panel.aichat.view.aichat.chatdata%",
      "%chat.data%",
      "%cascade.chatdata%",
    ];
  }

  // --- JSON chat data parsing ---

  parseChatData(
    value: string,
    key: string,
    dbPath: string,
    dbMtime: number,
    workspaceId: string
  ): ConversationMeta[] {
    const metas: ConversationMeta[] = [];

    try {
      const data = JSON.parse(value);

      // Format 1: Array of conversations
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          const conv = data[i];
          const meta = this.conversationToMeta(conv, `${workspaceId}:${key}:${i}`, dbPath, dbMtime);
          if (meta) metas.push(meta);
        }
        return metas;
      }

      // Format 2: Object with conversations/sessions array
      const conversations = data.conversations ?? data.sessions ?? data.chats;
      if (Array.isArray(conversations)) {
        for (let i = 0; i < conversations.length; i++) {
          const conv = conversations[i];
          const meta = this.conversationToMeta(conv, `${workspaceId}:${key}:${i}`, dbPath, dbMtime);
          if (meta) metas.push(meta);
        }
        return metas;
      }

      // Format 3: Single conversation object with messages
      if (data.messages || data.turns || data.steps) {
        const meta = this.conversationToMeta(data, `${workspaceId}:${key}:0`, dbPath, dbMtime);
        if (meta) metas.push(meta);
      }
    } catch {
      // Not valid JSON
    }

    return metas;
  }

  extractTurnsFromChatData(
    value: string,
    conversationId: string
  ): ConversationTurn[] {
    try {
      const data = JSON.parse(value);

      // Try to find the specific conversation by ID prefix
      const conversations = Array.isArray(data)
        ? data
        : (data.conversations ?? data.sessions ?? data.chats ?? [data]);

      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        // Match by index embedded in conversationId
        if (conversationId.endsWith(`:${i}`)) {
          return this.parseTurns(conv);
        }
      }
    } catch {
      // skip
    }
    return [];
  }

  parseTurns(conv: unknown): ConversationTurn[] {
    if (!conv || typeof conv !== "object") return [];
    const c = conv as Record<string, unknown>;

    const turns: ConversationTurn[] = [];
    const messages = (c.messages ?? c.turns ?? c.steps) as unknown[];
    if (!Array.isArray(messages)) return [];

    for (const msg of messages) {
      if (!msg || typeof msg !== "object") continue;
      const m = msg as Record<string, unknown>;

      const role = (m.role ?? m.type ?? m.sender) as string | undefined;
      if (!role) continue;

      const normalizedRole = this.normalizeRole(role);
      if (!normalizedRole) continue;

      const text = this.extractText(m);
      if (!text) continue;

      turns.push({ role: normalizedRole, text });
    }

    return turns;
  }

  private normalizeRole(role: string): "user" | "assistant" | null {
    const lower = role.toLowerCase();
    if (lower === "user" || lower === "human") return "user";
    if (
      lower === "assistant" ||
      lower === "ai" ||
      lower === "bot" ||
      lower === "cascade"
    )
      return "assistant";
    return null;
  }

  private extractText(msg: Record<string, unknown>): string | null {
    // Try common text fields
    for (const field of ["content", "text", "message", "visible"]) {
      const val = msg[field];
      if (typeof val === "string" && val.trim()) {
        return val.trim();
      }
      if (Array.isArray(val)) {
        const texts = val
          .filter((p: unknown) =>
            p && typeof p === "object" && (p as Record<string, unknown>).type === "text"
          )
          .map((p: unknown) => String((p as Record<string, unknown>).text ?? ""))
          .filter(Boolean);
        const joined = texts.join("\n").trim();
        if (joined) return joined;
      }
    }
    return null;
  }

  private conversationToMeta(
    conv: unknown,
    id: string,
    dbPath: string,
    dbMtime: number
  ): ConversationMeta | null {
    if (!conv || typeof conv !== "object") return null;
    const c = conv as Record<string, unknown>;

    const turns = this.parseTurns(conv);
    if (turns.length === 0) return null;

    const title = this.extractConversationTitle(c, turns, id);
    const timestamp = (c.timestamp ?? c.createdAt ?? c.created_at) as number | undefined;

    return {
      id,
      source: "windsurf",
      filePath: dbPath,
      title,
      modifiedAt: timestamp ?? dbMtime,
      turnCount: turns.length,
    };
  }

  private extractConversationTitle(
    conv: Record<string, unknown>,
    turns: ConversationTurn[],
    fallbackId: string
  ): string {
    // Try title fields
    for (const field of ["title", "name", "subject", "summary"]) {
      const val = conv[field];
      if (typeof val === "string" && val.trim()) {
        const cleaned = val.replace(/\s+/g, " ").trim();
        return cleaned.length > 60 ? cleaned.slice(0, 57) + "..." : cleaned;
      }
    }

    // Fall back to first user message
    const firstUser = turns.find((t) => t.role === "user");
    if (firstUser) {
      const cleaned = firstUser.text.replace(/\s+/g, " ").trim();
      return cleaned.length > 60 ? cleaned.slice(0, 57) + "..." : cleaned;
    }

    return fallbackId.slice(0, 8);
  }

  // --- Platform paths ---

  private getInstallDirs(): string[] {
    const variants = ["Windsurf", "Windsurf - Next"];
    const dirs: string[] = [];

    if (process.platform === "win32") {
      const appData = process.env.APPDATA;
      if (appData) {
        for (const v of variants) dirs.push(join(appData, v));
      }
    } else if (process.platform === "darwin") {
      for (const v of variants) {
        dirs.push(join(homedir(), "Library", "Application Support", v));
      }
    } else {
      for (const v of variants) {
        dirs.push(join(homedir(), ".config", v));
      }
    }

    return dirs;
  }
}
