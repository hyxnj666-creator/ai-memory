import { readFile } from "node:fs/promises";
import {
  BUNDLE_VERSION,
  type BundleMemory,
  type ExtractedMemory,
  type MemoryBundle,
  type MemoryType,
  type SourceType,
} from "../types.js";

declare const __VERSION__: string | undefined;

const PACKAGE_VERSION =
  (typeof __VERSION__ !== "undefined" ? __VERSION__ : null) ?? "0.0.0";

/**
 * In-memory bundle helpers — no I/O coupling so unit tests can exercise
 * the schema, dedup, and remap rules without touching the filesystem.
 */

const VALID_TYPES: MemoryType[] = [
  "decision",
  "architecture",
  "convention",
  "todo",
  "issue",
];

// IMPORTANT: keep this list in lock-step with `SourceType` in src/types.ts.
// When a new source ships, this whitelist MUST be widened in the same PR
// or `bundle import` will reject any bundle exported with that source as
// `sourceType must be one of: …` — silently breaking cross-machine
// portability for users of the new source. v2.5-06 audit pass added "codex"
// after this exact failure mode was caught (Finding A).
const VALID_SOURCE_TYPES: SourceType[] = [
  "cursor",
  "claude-code",
  "windsurf",
  "copilot",
  "codex",
];

// --- Serialization ---

export function memoryToBundleEntry(m: ExtractedMemory): BundleMemory {
  return {
    type: m.type,
    title: m.title,
    date: m.date,
    context: m.context || undefined,
    content: m.content,
    reasoning: m.reasoning,
    alternatives: m.alternatives,
    impact: m.impact,
    sourceId: m.sourceId,
    sourceTitle: m.sourceTitle || undefined,
    sourceType: m.sourceType,
    author: m.author,
    status: m.status === "resolved" ? "resolved" : "active",
  };
}

export function bundleEntryToMemory(b: BundleMemory): ExtractedMemory {
  return {
    type: b.type,
    title: b.title,
    date: b.date,
    context: b.context ?? "",
    content: b.content,
    reasoning: b.reasoning,
    alternatives: b.alternatives,
    impact: b.impact,
    sourceId: b.sourceId,
    sourceTitle: b.sourceTitle ?? "",
    sourceType: b.sourceType,
    author: b.author,
    status: b.status === "resolved" ? "resolved" : "active",
  };
}

export interface BuildBundleOpts {
  exportedBy?: string;
  scope?: string;
}

export function buildBundle(
  memories: ExtractedMemory[],
  opts: BuildBundleOpts = {}
): MemoryBundle {
  return {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    memoryCount: memories.length,
    producer: `ai-memory-cli@${PACKAGE_VERSION}`,
    exportedBy: opts.exportedBy,
    scope: opts.scope,
    memories: memories.map(memoryToBundleEntry),
  };
}

// --- Validation ---

export class BundleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleParseError";
  }
}

export function parseBundle(json: string): MemoryBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new BundleParseError(`Invalid JSON: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new BundleParseError("Bundle must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    throw new BundleParseError("Bundle missing 'version' (number)");
  }
  if (obj.version !== BUNDLE_VERSION) {
    throw new BundleParseError(
      `Unsupported bundle version ${obj.version} (this CLI supports v${BUNDLE_VERSION}). Upgrade ai-memory-cli or re-export with the matching version.`
    );
  }

  if (!Array.isArray(obj.memories)) {
    throw new BundleParseError("Bundle missing 'memories' (array)");
  }

  const memories: BundleMemory[] = [];
  for (let i = 0; i < obj.memories.length; i++) {
    const raw = obj.memories[i] as Record<string, unknown>;
    const where = `memories[${i}]`;

    if (!raw || typeof raw !== "object") {
      throw new BundleParseError(`${where}: not an object`);
    }
    if (typeof raw.type !== "string" || !VALID_TYPES.includes(raw.type as MemoryType)) {
      throw new BundleParseError(`${where}.type must be one of: ${VALID_TYPES.join(", ")}`);
    }
    if (typeof raw.title !== "string" || raw.title.length === 0) {
      throw new BundleParseError(`${where}.title must be a non-empty string`);
    }
    if (typeof raw.content !== "string" || raw.content.length === 0) {
      throw new BundleParseError(`${where}.content must be a non-empty string`);
    }
    if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
      throw new BundleParseError(`${where}.date must be YYYY-MM-DD`);
    }
    if (typeof raw.sourceId !== "string" || raw.sourceId.length === 0) {
      throw new BundleParseError(`${where}.sourceId must be a non-empty string`);
    }
    if (typeof raw.sourceType !== "string" || !VALID_SOURCE_TYPES.includes(raw.sourceType as SourceType)) {
      throw new BundleParseError(
        `${where}.sourceType must be one of: ${VALID_SOURCE_TYPES.join(", ")}`
      );
    }

    memories.push({
      type: raw.type as MemoryType,
      title: raw.title,
      date: raw.date,
      context: typeof raw.context === "string" ? raw.context : undefined,
      content: raw.content,
      reasoning: typeof raw.reasoning === "string" ? raw.reasoning : undefined,
      alternatives: typeof raw.alternatives === "string" ? raw.alternatives : undefined,
      impact: typeof raw.impact === "string" ? raw.impact : undefined,
      sourceId: raw.sourceId,
      sourceTitle: typeof raw.sourceTitle === "string" ? raw.sourceTitle : undefined,
      sourceType: raw.sourceType as SourceType,
      author: typeof raw.author === "string" ? raw.author : undefined,
      status: raw.status === "resolved" ? "resolved" : "active",
    });
  }

  return {
    version: BUNDLE_VERSION,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : "",
    memoryCount: typeof obj.memoryCount === "number" ? obj.memoryCount : memories.length,
    producer: typeof obj.producer === "string" ? obj.producer : "unknown",
    exportedBy: typeof obj.exportedBy === "string" ? obj.exportedBy : undefined,
    scope: typeof obj.scope === "string" ? obj.scope : undefined,
    memories,
  };
}

export async function loadBundle(filePath: string): Promise<MemoryBundle> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    throw new BundleParseError(`Cannot read bundle "${filePath}": ${(err as Error).message}`);
  }
  return parseBundle(raw);
}

// --- Import-time helpers ---

export interface ImportPlan {
  toWrite: ExtractedMemory[];
  /** Memory entries that already exist on disk (skipped unless --overwrite) */
  duplicates: ExtractedMemory[];
}

/**
 * Decide which bundle memories should land on disk vs. skipped.
 * Two memories are considered duplicates when they share the same
 * (author, type, date, title) tuple — which maps 1:1 to the on-disk filename.
 */
export function planImport(
  bundle: MemoryBundle,
  existing: ExtractedMemory[],
  authorOverride?: string
): ImportPlan {
  const existingKeys = new Set(existing.map(memoryKey));
  const toWrite: ExtractedMemory[] = [];
  const duplicates: ExtractedMemory[] = [];

  for (const entry of bundle.memories) {
    const memory = bundleEntryToMemory(entry);
    if (authorOverride) memory.author = authorOverride;
    if (existingKeys.has(memoryKey(memory))) {
      duplicates.push(memory);
    } else {
      toWrite.push(memory);
    }
  }

  return { toWrite, duplicates };
}

function memoryKey(m: ExtractedMemory): string {
  // Same logic the on-disk writer uses: author + type + filename slug + date
  // Title slug isn't recomputed here (we'd need slugify); using lowercase title
  // is good enough for collision detection because slugify is roughly bijective
  // on Latin/CJK alphanum.
  return [
    m.author ?? "",
    m.type,
    m.date,
    m.title.toLowerCase().trim(),
  ].join("\u0000");
}
