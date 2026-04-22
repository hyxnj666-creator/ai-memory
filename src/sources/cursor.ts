import { readdir, readFile, stat, copyFile, mkdir, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir, tmpdir } from "node:os";
import type {
  Source,
  ConversationMeta,
  Conversation,
  ConversationTurn,
} from "../types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CursorSource implements Source {
  readonly type = "cursor" as const;
  private basePath: string;
  private projectName: string | undefined;

  constructor(projectName?: string) {
    this.projectName = projectName;
    this.basePath = join(homedir(), ".cursor", "projects");
  }

  async detect(): Promise<boolean> {
    try {
      const projectDir = await this.resolveProjectDir();
      if (!projectDir) return false;
      const transcriptsDir = join(projectDir, "agent-transcripts");
      const s = await stat(transcriptsDir);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  async listConversations(): Promise<ConversationMeta[]> {
    const transcriptsDir = await this.getTranscriptsDir();
    if (!transcriptsDir) return [];

    // Load real titles from Cursor's workspace DB (best-effort)
    const titleMap = await this.loadTitleMap();

    const entries = await readdir(transcriptsDir, { withFileTypes: true });
    const conversations: ConversationMeta[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && UUID_RE.test(entry.name)) {
        const meta = await this.readConversationMeta(
          transcriptsDir,
          entry.name,
          titleMap
        );
        if (meta) conversations.push(meta);
      } else if (entry.isFile() && entry.name.endsWith(".txt")) {
        const meta = await this.readLegacyMeta(transcriptsDir, entry.name);
        if (meta) conversations.push(meta);
      }
    }

    return conversations.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  async loadConversation(meta: ConversationMeta): Promise<Conversation> {
    if (meta.filePath.endsWith(".txt")) {
      return this.loadLegacyConversation(meta);
    }
    return this.loadJsonlConversation(meta);
  }

  // --- JSONL format (current) ---

  private async loadJsonlConversation(
    meta: ConversationMeta
  ): Promise<Conversation> {
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

        const textParts = this.extractTextParts(obj.message?.content);
        if (!textParts) continue;

        turns.push({ role, text: textParts });
      } catch {
        // Skip malformed lines
      }
    }

    return turns;
  }

  private extractTextParts(content: unknown): string | null {
    if (!Array.isArray(content)) return null;

    const texts: string[] = [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        texts.push(this.cleanUserQuery(part.text));
      }
    }

    const joined = texts.join("\n").trim();
    return joined || null;
  }

  private cleanUserQuery(text: string): string {
    const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
    if (match) return match[1].trim();
    return text;
  }

  // --- Legacy .txt format ---

  private async loadLegacyConversation(
    meta: ConversationMeta
  ): Promise<Conversation> {
    const raw = await readFile(meta.filePath, "utf-8");
    const turns = this.parseLegacyContent(raw);
    return { meta: { ...meta, turnCount: turns.length }, turns };
  }

  parseLegacyContent(raw: string): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    const blocks = raw.split(/^(user|assistant):\s*$/m);

    let currentRole: "user" | "assistant" | null = null;
    for (const block of blocks) {
      const trimmed = block.trim();
      if (trimmed === "user") {
        currentRole = "user";
      } else if (trimmed === "assistant") {
        currentRole = "assistant";
      } else if (currentRole && trimmed) {
        turns.push({
          role: currentRole,
          text: this.cleanUserQuery(trimmed),
        });
        currentRole = null;
      }
    }

    return turns;
  }

  // --- Metadata helpers ---

  private async readConversationMeta(
    transcriptsDir: string,
    uuid: string,
    titleMap: Map<string, string> = new Map()
  ): Promise<ConversationMeta | null> {
    const jsonlPath = join(transcriptsDir, uuid, `${uuid}.jsonl`);
    try {
      const fileStat = await stat(jsonlPath);
      const raw = await readFile(jsonlPath, "utf-8");
      // Prefer real title from DB; fall back to first user message
      const title = titleMap.get(uuid) ?? this.extractTitle(raw, uuid);
      const turnCount = this.countTurns(raw);

      return {
        id: uuid,
        source: "cursor",
        filePath: jsonlPath,
        title,
        modifiedAt: fileStat.mtimeMs,
        turnCount,
      };
    } catch {
      return null;
    }
  }

  private async readLegacyMeta(
    transcriptsDir: string,
    filename: string
  ): Promise<ConversationMeta | null> {
    const filePath = join(transcriptsDir, filename);
    try {
      const fileStat = await stat(filePath);
      const id = basename(filename, ".txt");
      const raw = await readFile(filePath, "utf-8");
      const title = this.extractLegacyTitle(raw, id);

      return {
        id,
        source: "cursor",
        filePath,
        title,
        modifiedAt: fileStat.mtimeMs,
        turnCount: (raw.match(/^(user|assistant):\s*$/m) || []).length,
      };
    } catch {
      return null;
    }
  }

  private extractTitle(jsonlRaw: string, fallbackId: string): string {
    for (const line of jsonlRaw.split("\n").slice(0, 5)) {
      try {
        const obj = JSON.parse(line.trim());
        if (obj.role === "user") {
          const text = this.extractTextParts(obj.message?.content);
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

  private extractLegacyTitle(raw: string, fallbackId: string): string {
    const match = raw.match(
      /<user_query>\s*([\s\S]*?)\s*<\/user_query>/
    );
    if (match) {
      const text = match[1].replace(/\s+/g, " ").trim();
      return text.length > 60 ? text.slice(0, 57) + "..." : text;
    }
    return fallbackId.slice(0, 8);
  }

  private countTurns(jsonlRaw: string): number {
    let count = 0;
    for (const line of jsonlRaw.split("\n")) {
      if (line.includes('"role"')) count++;
    }
    return count;
  }

  // --- Project directory resolution ---

  private async resolveProjectDir(): Promise<string | null> {
    if (this.projectName) {
      const dir = join(this.basePath, this.projectName);
      try {
        const s = await stat(dir);
        if (s.isDirectory()) return dir;
      } catch {
        // fall through
      }
    }

    try {
      const projects = await readdir(this.basePath, { withFileTypes: true });

      // Collect candidates with transcript dirs
      type Candidate = { dir: string; count: number; mtime: number };
      const candidates: Candidate[] = [];

      for (const p of projects) {
        if (!p.isDirectory()) continue;
        // Skip temp/AppData/numeric-only project directories
        if (this.isTempProject(p.name)) continue;

        const transcriptsDir = join(this.basePath, p.name, "agent-transcripts");
        try {
          const s = await stat(transcriptsDir);
          if (!s.isDirectory()) continue;

          const entries = await readdir(transcriptsDir);
          const count = entries.length;
          if (count === 0) continue;

          candidates.push({
            dir: join(this.basePath, p.name),
            count,
            mtime: s.mtimeMs,
          });
        } catch {
          // no transcripts
        }
      }

      if (candidates.length === 0) return null;

      // Prefer the project matching the current working directory
      const cwd = process.cwd().replace(/\\/g, "-").replace(/:/g, "").toLowerCase();
      const cwdMatch = candidates.find((c) =>
        cwd.endsWith(basename(c.dir).toLowerCase())
      );
      if (cwdMatch) return cwdMatch.dir;

      // Otherwise pick the project with the most conversations
      candidates.sort((a, b) => b.count - a.count || b.mtime - a.mtime);
      return candidates[0].dir;
    } catch {
      // .cursor/projects doesn't exist
    }

    return null;
  }

  private isTempProject(name: string): boolean {
    // Skip numeric-only names (e.g. "1775614169037")
    if (/^\d+$/.test(name)) return true;
    // Skip AppData/Temp paths encoded as project names
    if (name.toLowerCase().includes("appdata")) return true;
    if (name.toLowerCase().includes("temp")) return true;
    if (name.toLowerCase().includes("local-temp")) return true;
    return false;
  }

  private async getTranscriptsDir(): Promise<string | null> {
    const projectDir = await this.resolveProjectDir();
    if (!projectDir) return null;
    return join(projectDir, "agent-transcripts");
  }

  // --- Title map from Cursor's workspace SQLite DB ---

  /**
   * Returns a map of { [composerId/UUID]: title } by reading
   * Cursor's GLOBAL state.vscdb (key "composer.composerHeaders").
   * This file contains titles for ALL workspaces.
   * Uses node:sqlite (Node.js 22+). Silently returns empty map on any error.
   */
  private async loadTitleMap(): Promise<Map<string, string>> {
    const dbPath = this.getGlobalDbPath();
    if (!dbPath) return new Map();

    const ts = Date.now();
    const tmpDb = join(tmpdir(), `ai-memory-global-${ts}.vscdb`);
    const tmpFiles = [tmpDb, tmpDb + "-wal", tmpDb + "-shm"];

    const cleanup = () => {
      for (const f of tmpFiles) unlink(f).catch(() => {});
    };

    try {
      await copyFile(dbPath, tmpDb);
      for (const ext of ["-wal", "-shm"]) {
        try { await copyFile(dbPath + ext, tmpDb + ext); } catch { /* optional */ }
      }

      const sqliteMod = "node" + ":sqlite";
      const { DatabaseSync } = await import(sqliteMod);
      const db = new (DatabaseSync as new (p: string, opts?: Record<string, unknown>) => {
        prepare(sql: string): { get(...args: unknown[]): unknown };
        close(): void;
      })(tmpDb, { readonly: true });

      let row: { value?: string } | undefined;
      try {
        row = db
          .prepare("SELECT value FROM ItemTable WHERE key = ?")
          .get("composer.composerHeaders") as { value?: string } | undefined;
      } finally {
        db.close();
      }

      cleanup();

      if (!row?.value) return new Map();

      const data = JSON.parse(row.value) as {
        allComposers?: Array<{ composerId?: string; name?: string }>;
      };

      const map = new Map<string, string>();
      for (const c of data.allComposers ?? []) {
        if (c.composerId && c.name && c.name.trim()) {
          map.set(c.composerId, c.name.trim());
        }
      }
      return map;
    } catch (err) {
      cleanup();
      process.stderr.write(`[ai-memory] title map load failed: ${err}\n`);
      return new Map();
    }
  }

  private getGlobalDbPath(): string | null {
    if (process.platform === "win32") {
      const appData = process.env.APPDATA;
      return appData
        ? join(appData, "Cursor", "User", "globalStorage", "state.vscdb")
        : null;
    }
    if (process.platform === "darwin") {
      return join(
        homedir(),
        "Library",
        "Application Support",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb"
      );
    }
    return join(
      homedir(),
      ".config",
      "Cursor",
      "User",
      "globalStorage",
      "state.vscdb"
    );
  }
}
