import { access, mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ConversationMeta, ExtractedMemory, MemoryType } from "../types.js";

// --- Constants ---

const TYPES: MemoryType[] = [
  "decision",
  "architecture",
  "convention",
  "todo",
  "issue",
];

const TYPE_DIR: Record<MemoryType, string> = {
  decision: "decisions",
  architecture: "architecture",
  convention: "conventions",
  todo: "todos",
  issue: "issues",
};

const TYPE_DIRS_SET = new Set(Object.values(TYPE_DIR));

// --- i18n labels ---

type Language = "zh" | "en";

const LABELS: Record<Language, Record<string, string>> = {
  zh: {
    date: "日期",
    author: "作者",
    status: "状态",
    source: "来源",
    conversation: "对话",
    context: "上下文",
    content: "内容",
    reasoning: "理由",
    alternatives: "排除方案",
    impact: "影响",
  },
  en: {
    date: "Date",
    author: "Author",
    status: "Status",
    source: "Source",
    conversation: "Conversation",
    context: "Context",
    content: "Content",
    reasoning: "Reasoning",
    alternatives: "Alternatives",
    impact: "Impact",
  },
};

// --- Slug helpers ---

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, "");
}

function memoryFilename(date: string, title: string): string {
  const slug = slugify(title) || "untitled";
  return `${date}-${slug}.md`;
}

// --- Single memory file renderer ---

function renderMemoryFile(m: ExtractedMemory, lang: Language = "zh"): string {
  const L = LABELS[lang];
  const lines: string[] = [
    `# ${m.title}`,
    "",
    `> **${L.date}**: ${m.date}  `,
  ];

  if (m.author) {
    lines.push(`> **${L.author}**: ${m.author}  `);
  }

  lines.push(
    `> **${L.source}**: ${m.sourceType}:${m.sourceId.slice(0, 8)}  `,
    `> **${L.conversation}**: ${m.sourceTitle}`,
    "",
    "---",
    "",
  );

  if (m.context) lines.push(`**${L.context}**: ${m.context}`, "");
  lines.push(`**${L.content}**: ${m.content}`);
  if (m.reasoning) lines.push("", `**${L.reasoning}**: ${m.reasoning}`);
  if (m.alternatives) lines.push("", `**${L.alternatives}**: ${m.alternatives}`);
  if (m.impact) lines.push("", `**${L.impact}**: ${m.impact}`);
  lines.push("");

  return lines.join("\n");
}

// --- Index file format ---

interface IndexEntry {
  files: string[];
}

// --- Author-aware base dir ---

function authorBase(outputDir: string, author?: string): string {
  return author ? join(outputDir, author) : outputDir;
}

function indexBase(outputDir: string, author?: string): string {
  return author
    ? join(outputDir, ".index", author)
    : join(outputDir, ".index");
}

// --- Per-type directory writer ---

export interface WriteOptions {
  force?: boolean;
  author?: string;
}

export interface WriteResult {
  created: number;
  updated: number;
  skipped: number;
}

export async function writeConversationMemories(
  memories: ExtractedMemory[],
  outputDir: string,
  lang: Language = "zh",
  options: WriteOptions = {}
): Promise<WriteResult> {
  const result: WriteResult = { created: 0, updated: 0, skipped: 0 };
  if (memories.length === 0) return result;

  const base = authorBase(outputDir, options.author);
  const idxBase = indexBase(outputDir, options.author);

  await Promise.all([
    ...TYPES.map((t) => mkdir(join(base, TYPE_DIR[t]), { recursive: true })),
    mkdir(idxBase, { recursive: true }),
  ]);

  const writtenFiles = new Map<string, string[]>();

  await Promise.all(
    memories.map(async (m) => {
      const typeDir = TYPE_DIR[m.type as MemoryType];
      if (!typeDir) return;

      const dir = join(base, typeDir);
      const filename = memoryFilename(m.date, m.title);
      const filePath = join(dir, filename);
      const relPath = options.author
        ? `${options.author}/${typeDir}/${filename}`
        : `${typeDir}/${filename}`;
      const newContent = renderMemoryFile(m, lang);

      const existing = await safeRead(filePath);
      if (existing === null) {
        await writeFile(filePath, newContent, "utf-8");
        result.created++;
      } else if (options.force && existing !== newContent) {
        await writeFile(filePath, newContent, "utf-8");
        result.updated++;
      } else {
        result.skipped++;
      }

      const list = writtenFiles.get(m.sourceId) ?? [];
      list.push(relPath);
      writtenFiles.set(m.sourceId, list);
    })
  );

  await Promise.all(
    [...writtenFiles.entries()].map(([id, files]) => {
      const entry: IndexEntry = { files: [...new Set(files)] };
      return writeFile(
        join(idxBase, `${id}.json`),
        JSON.stringify(entry),
        "utf-8"
      );
    })
  );

  return result;
}

export const writeMemories = writeConversationMemories;

/**
 * Check whether memories for a conversation still exist on disk.
 * Searches both author-namespaced and legacy flat index paths.
 */
export async function hasMemoryFile(
  meta: ConversationMeta,
  outputDir: string,
  author?: string
): Promise<boolean> {
  const searchPaths = author
    ? [join(outputDir, ".index", author, `${meta.id}.json`)]
    : [];
  // Always also check legacy flat path
  searchPaths.push(join(outputDir, ".index", `${meta.id}.json`));

  for (const manifestPath of searchPaths) {
    try {
      const raw = await readFile(manifestPath, "utf-8");
      const entry = JSON.parse(raw) as IndexEntry;
      if (!entry.files?.length) continue;
      for (const rel of entry.files) {
        try {
          await access(join(outputDir, rel));
          return true;
        } catch { /* continue */ }
      }
    } catch { /* try next */ }
  }

  // Backwards-compat: old empty marker file
  try {
    await access(join(outputDir, ".index", meta.id));
    return true;
  } catch {
    return false;
  }
}

// --- Read all memories ---

/**
 * Read all memories. If `author` is specified, only reads that author's
 * subdirectory. Otherwise reads ALL author subdirectories plus any
 * legacy flat type directories (backwards compat).
 */
export async function readAllMemories(
  outputDir: string,
  author?: string
): Promise<ExtractedMemory[]> {
  const memories: ExtractedMemory[] = [];

  if (author) {
    await readMemoriesFromBase(join(outputDir, author), author, memories);
    return memories;
  }

  // Scan outputDir for author subdirectories + legacy flat structure
  let entries: string[];
  try {
    entries = await readdir(outputDir);
  } catch {
    return memories;
  }

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const entryPath = join(outputDir, entry);
    const s = await stat(entryPath).catch(() => null);
    if (!s?.isDirectory()) continue;

    if (TYPE_DIRS_SET.has(entry)) {
      // Legacy flat structure: decisions/, todos/, etc. at top level
      await readMemoriesFromTypeDir(outputDir, entry, "", memories);
    } else {
      // Author subdirectory
      await readMemoriesFromBase(entryPath, entry, memories);
    }
  }

  return memories;
}

async function readMemoriesFromBase(
  base: string,
  authorName: string,
  memories: ExtractedMemory[]
): Promise<void> {
  await Promise.all(
    TYPES.map((type) => readMemoriesFromTypeDir(base, TYPE_DIR[type], authorName, memories))
  );
}

async function readMemoriesFromTypeDir(
  base: string,
  typeDirName: string,
  authorName: string,
  memories: ExtractedMemory[]
): Promise<void> {
  const type = Object.entries(TYPE_DIR).find(([, v]) => v === typeDirName)?.[0] as MemoryType | undefined;
  if (!type) return;

  const dir = join(base, typeDirName);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return;
  }

  for (const file of files) {
    const fullPath = join(dir, file);
    const content = await readFile(fullPath, "utf-8").catch(() => "");
    if (!content) continue;
    const m = parseMemoryFile(content, type, file);
    if (m) {
      m.filePath = fullPath;
      if (!m.author && authorName) m.author = authorName;
      memories.push(m);
    }
  }
}

// --- Parser that handles both zh and en labels ---

function parseMemoryFile(
  content: string,
  type: MemoryType,
  filename: string
): ExtractedMemory | null {
  const titleMatch = content.match(/^# (.+)$/m);

  const allLabels = Object.values(LABELS).flatMap((l) => Object.values(l));
  const dateRe = buildLabelRe(LABELS.zh.date, LABELS.en.date);
  const authorRe = buildLabelRe(LABELS.zh.author, LABELS.en.author);
  const statusRe = buildLabelRe(LABELS.zh.status, LABELS.en.status);
  const sourceRe = buildLabelRe(LABELS.zh.source, LABELS.en.source);
  const convRe = buildLabelRe(LABELS.zh.conversation, LABELS.en.conversation);
  const contextRe = buildLabelRe(LABELS.zh.context, LABELS.en.context);
  const contentRe = buildLabelRe(LABELS.zh.content, LABELS.en.content);
  const reasoningRe = buildLabelRe(LABELS.zh.reasoning, LABELS.en.reasoning);
  const altRe = buildLabelRe(LABELS.zh.alternatives, LABELS.en.alternatives);
  const impactRe = buildLabelRe(LABELS.zh.impact, LABELS.en.impact);

  const anyField = allLabels.map(escapeRe).join("|");

  function extract(labelRe: RegExp): string {
    const m = content.match(
      new RegExp(
        `\\*\\*(?:${labelRe.source})\\*\\*:\\s*([\\s\\S]+?)(?=\\n\\n\\*\\*(?:${anyField})\\*\\*:|\\s*$)`
      )
    );
    return m?.[1]?.trim() ?? "";
  }

  const dateMatch = content.match(new RegExp(`>\\s*\\*\\*(?:${dateRe.source})\\*\\*:\\s*(\\d{4}-\\d{2}-\\d{2})`));
  const authorMatch = content.match(new RegExp(`>\\s*\\*\\*(?:${authorRe.source})\\*\\*:\\s*(.+?)\\s*$`, "m"));
  const statusMatch = content.match(new RegExp(`>\\s*\\*\\*(?:${statusRe.source})\\*\\*:\\s*(\\w+)`, "m"));
  const sourceMatch = content.match(new RegExp(`>\\s*\\*\\*(?:${sourceRe.source})\\*\\*:\\s*(\\w[\\w-]*):(\\w+)`));
  const convMatch = content.match(new RegExp(`>\\s*\\*\\*(?:${convRe.source})\\*\\*:\\s*(.+)$`, "m"));

  return {
    type,
    title: titleMatch?.[1] ?? filename.replace(".md", ""),
    date: dateMatch?.[1] ?? "",
    context: extract(contextRe),
    content: extract(contentRe),
    reasoning: extract(reasoningRe) || undefined,
    alternatives: extract(altRe) || undefined,
    impact: extract(impactRe) || undefined,
    sourceType: (sourceMatch?.[1] ?? "cursor") as ExtractedMemory["sourceType"],
    sourceId: sourceMatch?.[2] ?? "",
    sourceTitle: convMatch?.[1]?.trim() ?? "",
    author: authorMatch?.[1]?.trim() || undefined,
    status: statusMatch?.[1] === "resolved" ? "resolved" : "active",
  };
}

function buildLabelRe(...labels: string[]): RegExp {
  return new RegExp(labels.map(escapeRe).join("|"));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Helpers ---

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}
