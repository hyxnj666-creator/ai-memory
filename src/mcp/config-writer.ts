/**
 * MCP config-file writer shared by `ai-memory init --with-mcp`.
 *
 * Semantics are intentionally idempotent:
 *   - no file         → create fresh config
 *   - our entry matches already       → no-op (action="already-registered")
 *   - our entry differs               → keep user's version (action="conflict")
 *   - file has other mcpServers       → merge our entry in (action="updated")
 *   - file is invalid JSON            → refuse to overwrite (action="invalid")
 *
 * All `merge*` helpers are pure so tests can run without filesystem access.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// ---------- Constants ----------

export const AI_MEMORY_ENTRY_NAME = "ai-memory";

/** The canonical entry ai-memory writes. Keep in sync with README. */
export const AI_MEMORY_ENTRY: McpServerEntry = {
  command: "npx",
  args: ["ai-memory-cli", "serve"],
};

export interface McpTarget {
  /** Human label, e.g. "Cursor" */
  label: string;
  /** Config path relative to cwd, e.g. ".cursor/mcp.json" */
  configPath: string;
}

/**
 * Project-local MCP targets. We intentionally exclude Claude Desktop:
 * its config lives at OS-specific global paths and we don't want to
 * mutate a user's global editor config without a dedicated flow.
 */
export const PROJECT_MCP_TARGETS: readonly McpTarget[] = [
  { label: "Cursor", configPath: ".cursor/mcp.json" },
  { label: "Windsurf", configPath: ".windsurf/mcp.json" },
];

// ---------- Types ----------

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [k: string]: unknown;
}

export type MergeAction =
  | "created"
  | "updated"
  | "already-registered"
  | "conflict"
  | "invalid";

export interface MergeResult {
  action: MergeAction;
  /** The config that should be written to disk. Undefined when action=invalid or conflict. */
  config?: McpConfig;
  /** Why we refused to write (populated for `conflict` / `invalid`). */
  reason?: string;
}

// ---------- Pure merge logic ----------

function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  if (a.command !== b.command) return false;
  if (a.args.length !== b.args.length) return false;
  for (let i = 0; i < a.args.length; i++) {
    if (a.args[i] !== b.args[i]) return false;
  }
  // env is optional; only compare if either side sets it
  if (a.env || b.env) {
    const aKeys = Object.keys(a.env ?? {}).sort();
    const bKeys = Object.keys(b.env ?? {}).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false;
      if ((a.env ?? {})[aKeys[i]] !== (b.env ?? {})[bKeys[i]]) return false;
    }
  }
  return true;
}

/**
 * Merge our MCP entry into `existing` (may be null = new file).
 * Pure, safe to call from tests.
 */
export function mergeMcpConfig(
  existing: McpConfig | null,
  entryName: string = AI_MEMORY_ENTRY_NAME,
  entry: McpServerEntry = AI_MEMORY_ENTRY
): MergeResult {
  if (existing === null) {
    return {
      action: "created",
      config: { mcpServers: { [entryName]: entry } },
    };
  }

  const servers = { ...(existing.mcpServers ?? {}) };
  const current = servers[entryName];

  if (current && entriesEqual(current, entry)) {
    return { action: "already-registered", config: existing };
  }

  if (current) {
    return {
      action: "conflict",
      reason:
        `existing "${entryName}" entry differs from the canonical one ` +
        `(command="${current.command}" args=${JSON.stringify(current.args)}). ` +
        `Leaving your customisation untouched.`,
    };
  }

  servers[entryName] = entry;
  return {
    action: "updated",
    config: { ...existing, mcpServers: servers },
  };
}

/**
 * Parse file contents. Returns null for empty/missing, or throws
 * a tagged error for invalid JSON so callers can surface it.
 */
export function parseMcpFile(raw: string | null): McpConfig | null {
  if (raw === null || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid JSON: ${msg}`);
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(`invalid JSON: MCP config root must be an object`);
  }
  return parsed as McpConfig;
}

// ---------- Filesystem IO ----------

export interface WriteResult {
  target: McpTarget;
  action: MergeAction;
  /** True when we changed the file on disk. */
  wrote: boolean;
  reason?: string;
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Read (if present), merge, and write the MCP config file for a target.
 * Never destructive: invalid JSON or a conflicting `ai-memory` entry are
 * reported via the returned `action` and `reason` and the file is left
 * unchanged.
 */
export async function writeMcpConfigForTarget(
  target: McpTarget
): Promise<WriteResult> {
  const raw = await safeReadFile(target.configPath);

  let existing: McpConfig | null;
  try {
    existing = parseMcpFile(raw);
  } catch (err) {
    return {
      target,
      action: "invalid",
      wrote: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const result = mergeMcpConfig(existing);

  if (result.action === "already-registered" || result.action === "conflict") {
    return { target, action: result.action, wrote: false, reason: result.reason };
  }

  if (!result.config) {
    // Defensive: merge indicated write but produced no config.
    return {
      target,
      action: "invalid",
      wrote: false,
      reason: "internal: merge produced no config",
    };
  }

  await mkdir(dirname(target.configPath), { recursive: true });
  const nextJson = JSON.stringify(result.config, null, 2) + "\n";

  // Avoid writing when file is byte-identical (preserves mtime in shared workspaces)
  if (raw !== null && raw === nextJson) {
    return { target, action: "already-registered", wrote: false };
  }

  await writeFile(target.configPath, nextJson, "utf-8");
  return { target, action: result.action, wrote: true };
}

/**
 * Write MCP config for every project-local target. Errors in one target
 * do not abort the others — each is reported independently.
 */
export async function writeProjectMcpConfigs(): Promise<WriteResult[]> {
  const results: WriteResult[] = [];
  for (const target of PROJECT_MCP_TARGETS) {
    results.push(await writeMcpConfigForTarget(target));
  }
  return results;
}
