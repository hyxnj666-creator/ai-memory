import { access, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
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

// --- i18n labels ---

type Language = "zh" | "en";

const LABELS: Record<Language, Record<string, string>> = {
  zh: {
    date: "日期",
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
    `> **${L.source}**: ${m.sourceType}:${m.sourceId.slice(0, 8)}  `,
    `> **${L.conversation}**: ${m.sourceTitle}`,
    "",
    "---",
    "",
  ];

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
  /** Relative paths under outputDir of the files written for this conversation */
  files: string[];
}

// --- Per-type directory writer ---

/**
 * Write each memory to its own file under `.ai-memory/{type}/`.
 * Writes a rich `.index/{sourceId}.json` manifest so hasMemoryFile()
 * can verify the actual files still exist (not just the marker).
 */
export async function writeConversationMemories(
  memories: ExtractedMemory[],
  outputDir: string,
  lang: Language = "zh"
): Promise<void> {
  if (memories.length === 0) return;

  await Promise.all([
    ...TYPES.map((t) => mkdir(join(outputDir, TYPE_DIR[t]), { recursive: true })),
    mkdir(join(outputDir, ".index"), { recursive: true }),
  ]);

  // Track which files were written per sourceId
  const writtenFiles = new Map<string, string[]>();

  await Promise.all(
    memories.map(async (m) => {
      const typeDir = TYPE_DIR[m.type as MemoryType];
      if (!typeDir) return; // skip invalid types from model

      const dir = join(outputDir, typeDir);
      const filename = memoryFilename(m.date, m.title);
      const filePath = join(dir, filename);
      const relPath = `${typeDir}/${filename}`;

      // Skip if already exists (idempotent reruns)
      const exists = await safeRead(filePath);
      if (!exists) {
        await writeFile(filePath, renderMemoryFile(m, lang), "utf-8");
      }

      // Track regardless (even pre-existing counts as "present")
      const list = writtenFiles.get(m.sourceId) ?? [];
      list.push(relPath);
      writtenFiles.set(m.sourceId, list);
    })
  );

  // Write rich index manifest per sourceId
  await Promise.all(
    [...writtenFiles.entries()].map(([id, files]) => {
      const entry: IndexEntry = { files: [...new Set(files)] };
      return writeFile(
        join(outputDir, ".index", `${id}.json`),
        JSON.stringify(entry),
        "utf-8"
      );
    })
  );
}

export const writeMemories = writeConversationMemories;

/**
 * Check whether memories for a conversation still exist on disk.
 * Reads the index manifest and verifies at least one listed file is present.
 * Falls back to checking old-style empty marker for backwards compatibility.
 */
export async function hasMemoryFile(
  meta: ConversationMeta,
  outputDir: string
): Promise<boolean> {
  // Try new JSON manifest
  const manifestPath = join(outputDir, ".index", `${meta.id}.json`);
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const entry = JSON.parse(raw) as IndexEntry;
    if (!entry.files?.length) return false;
    // Verify at least one listed file still exists
    for (const rel of entry.files) {
      try {
        await access(join(outputDir, rel));
        return true;
      } catch { /* continue */ }
    }
    return false; // all listed files are gone
  } catch { /* fall through */ }

  // Backwards-compat: old empty marker file (no .json extension)
  try {
    await access(join(outputDir, ".index", meta.id));
    return true;
  } catch {
    return false;
  }
}

// --- Read all memories ---

/**
 * Read all memories from the per-type directories.
 * Supports both zh and en label variants (auto-detected per file).
 */
export async function readAllMemories(
  outputDir: string
): Promise<ExtractedMemory[]> {
  const memories: ExtractedMemory[] = [];

  await Promise.all(
    TYPES.map(async (type) => {
      const dir = join(outputDir, TYPE_DIR[type]);
      let files: string[];
      try {
        files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
      } catch {
        return;
      }

      for (const file of files) {
        const content = await readFile(join(dir, file), "utf-8").catch(() => "");
        if (!content) continue;

        const m = parseMemoryFile(content, type, file);
        if (m) memories.push(m);
      }
    })
  );

  return memories;
}

// --- Parser that handles both zh and en labels ---

function parseMemoryFile(
  content: string,
  type: MemoryType,
  filename: string
): ExtractedMemory | null {
  const titleMatch = content.match(/^# (.+)$/m);

  // Build a combined label pattern covering both zh and en
  const allLabels = Object.values(LABELS).flatMap((l) => Object.values(l));
  const dateRe = buildLabelRe(LABELS.zh.date, LABELS.en.date);
  const sourceRe = buildLabelRe(LABELS.zh.source, LABELS.en.source);
  const convRe = buildLabelRe(LABELS.zh.conversation, LABELS.en.conversation);
  const contextRe = buildLabelRe(LABELS.zh.context, LABELS.en.context);
  const contentRe = buildLabelRe(LABELS.zh.content, LABELS.en.content);
  const reasoningRe = buildLabelRe(LABELS.zh.reasoning, LABELS.en.reasoning);
  const altRe = buildLabelRe(LABELS.zh.alternatives, LABELS.en.alternatives);
  const impactRe = buildLabelRe(LABELS.zh.impact, LABELS.en.impact);

  // Build the "next bold field" boundary list for greedy match cutoff
  const anyField = allLabels.map(escapeRe).join("|");

  function extract(labelRe: RegExp): string {
    // Match the field value, stopping before the next **Field**: or end of string
    const m = content.match(
      new RegExp(
        `\\*\\*(?:${labelRe.source})\\*\\*:\\s*([\\s\\S]+?)(?=\\n\\n\\*\\*(?:${anyField})\\*\\*:|\\s*$)`
      )
    );
    return m?.[1]?.trim() ?? "";
  }

  const dateMatch = content.match(new RegExp(`>\\s*\\*\\*(?:${dateRe.source})\\*\\*:\\s*(\\d{4}-\\d{2}-\\d{2})`));
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
