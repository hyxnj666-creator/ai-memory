import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  mergeMcpConfig,
  parseMcpFile,
  writeMcpConfigForTarget,
  AI_MEMORY_ENTRY,
  AI_MEMORY_ENTRY_NAME,
  PROJECT_MCP_TARGETS,
  type McpConfig,
} from "../mcp/config-writer.js";

// ---------- Pure merge logic ----------

describe("parseMcpFile", () => {
  it("returns null for null/empty input", () => {
    expect(parseMcpFile(null)).toBeNull();
    expect(parseMcpFile("")).toBeNull();
    expect(parseMcpFile("   \n  ")).toBeNull();
  });

  it("parses valid JSON object", () => {
    expect(parseMcpFile(`{"mcpServers":{}}`)).toEqual({ mcpServers: {} });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseMcpFile("{ not json")).toThrow(/invalid JSON/i);
  });

  it("throws on non-object root (array, string, number)", () => {
    expect(() => parseMcpFile("[]")).toThrow();
    expect(() => parseMcpFile("42")).toThrow();
    expect(() => parseMcpFile("null")).toThrow();
  });
});

describe("mergeMcpConfig", () => {
  it("creates a new config when existing is null", () => {
    const r = mergeMcpConfig(null);
    expect(r.action).toBe("created");
    expect(r.config?.mcpServers?.[AI_MEMORY_ENTRY_NAME]).toEqual(AI_MEMORY_ENTRY);
  });

  it("reports already-registered when entry is byte-identical", () => {
    const existing: McpConfig = {
      mcpServers: { [AI_MEMORY_ENTRY_NAME]: { ...AI_MEMORY_ENTRY } },
    };
    const r = mergeMcpConfig(existing);
    expect(r.action).toBe("already-registered");
    expect(r.config).toEqual(existing);
  });

  it("adds ai-memory alongside an existing different server", () => {
    const existing: McpConfig = {
      mcpServers: {
        "other-tool": { command: "node", args: ["other.js"] },
      },
    };
    const r = mergeMcpConfig(existing);
    expect(r.action).toBe("updated");
    expect(r.config?.mcpServers?.["other-tool"]).toEqual({
      command: "node",
      args: ["other.js"],
    });
    expect(r.config?.mcpServers?.[AI_MEMORY_ENTRY_NAME]).toEqual(AI_MEMORY_ENTRY);
  });

  it("reports conflict (and refuses to write) when user customised ai-memory", () => {
    const existing: McpConfig = {
      mcpServers: {
        [AI_MEMORY_ENTRY_NAME]: {
          command: "bun",
          args: ["run", "custom-server.ts"],
        },
      },
    };
    const r = mergeMcpConfig(existing);
    expect(r.action).toBe("conflict");
    expect(r.config).toBeUndefined();
    expect(r.reason).toMatch(/differs/i);
  });

  it("handles config without a mcpServers field", () => {
    const existing: McpConfig = { someOtherRootKey: 123 };
    const r = mergeMcpConfig(existing);
    expect(r.action).toBe("updated");
    expect(r.config?.someOtherRootKey).toBe(123);
    expect(r.config?.mcpServers?.[AI_MEMORY_ENTRY_NAME]).toEqual(AI_MEMORY_ENTRY);
  });

  it("treats differing env as a conflict", () => {
    const existing: McpConfig = {
      mcpServers: {
        [AI_MEMORY_ENTRY_NAME]: {
          ...AI_MEMORY_ENTRY,
          env: { AI_REVIEW_API_KEY: "sk-user-override" },
        },
      },
    };
    const r = mergeMcpConfig(existing);
    expect(r.action).toBe("conflict");
  });

  it("is idempotent: second merge is a no-op", () => {
    const first = mergeMcpConfig(null);
    const second = mergeMcpConfig(first.config ?? null);
    expect(second.action).toBe("already-registered");
  });
});

// ---------- Filesystem integration ----------

describe("writeMcpConfigForTarget", () => {
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ai-memory-mcp-"));
    originalCwd = process.cwd();
    process.chdir(workDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workDir, { recursive: true, force: true });
  });

  const cursorTarget = PROJECT_MCP_TARGETS[0]; // Cursor

  it("creates a fresh config when no file exists", async () => {
    const r = await writeMcpConfigForTarget(cursorTarget);
    expect(r.action).toBe("created");
    expect(r.wrote).toBe(true);

    const onDisk = JSON.parse(
      await readFile(cursorTarget.configPath, "utf-8")
    ) as McpConfig;
    expect(onDisk.mcpServers?.[AI_MEMORY_ENTRY_NAME]).toEqual(AI_MEMORY_ENTRY);
  });

  it("running twice is a no-op the second time", async () => {
    const first = await writeMcpConfigForTarget(cursorTarget);
    expect(first.wrote).toBe(true);

    const second = await writeMcpConfigForTarget(cursorTarget);
    expect(second.action).toBe("already-registered");
    expect(second.wrote).toBe(false);
  });

  it("merges alongside user's existing other-tool entry", async () => {
    await mkdir(".cursor", { recursive: true });
    await writeFile(
      cursorTarget.configPath,
      JSON.stringify({
        mcpServers: {
          "other-tool": { command: "node", args: ["other.js"] },
        },
      }),
      "utf-8"
    );

    const r = await writeMcpConfigForTarget(cursorTarget);
    expect(r.action).toBe("updated");
    expect(r.wrote).toBe(true);

    const onDisk = JSON.parse(
      await readFile(cursorTarget.configPath, "utf-8")
    ) as McpConfig;
    expect(onDisk.mcpServers?.["other-tool"]).toEqual({
      command: "node",
      args: ["other.js"],
    });
    expect(onDisk.mcpServers?.[AI_MEMORY_ENTRY_NAME]).toEqual(AI_MEMORY_ENTRY);
  });

  it("refuses to overwrite an invalid-JSON file", async () => {
    await mkdir(".cursor", { recursive: true });
    await writeFile(cursorTarget.configPath, "{ not valid json", "utf-8");

    const r = await writeMcpConfigForTarget(cursorTarget);
    expect(r.action).toBe("invalid");
    expect(r.wrote).toBe(false);
    expect(r.reason).toMatch(/invalid JSON/i);

    const onDisk = await readFile(cursorTarget.configPath, "utf-8");
    expect(onDisk).toBe("{ not valid json");
  });

  it("preserves a user's customised ai-memory entry (conflict)", async () => {
    await mkdir(".cursor", { recursive: true });
    const userCustomised = {
      mcpServers: {
        [AI_MEMORY_ENTRY_NAME]: {
          command: "bun",
          args: ["run", "custom.ts"],
        },
      },
    };
    await writeFile(
      cursorTarget.configPath,
      JSON.stringify(userCustomised, null, 2),
      "utf-8"
    );

    const r = await writeMcpConfigForTarget(cursorTarget);
    expect(r.action).toBe("conflict");
    expect(r.wrote).toBe(false);

    const onDisk = JSON.parse(
      await readFile(cursorTarget.configPath, "utf-8")
    ) as McpConfig;
    expect(onDisk.mcpServers?.[AI_MEMORY_ENTRY_NAME]).toEqual({
      command: "bun",
      args: ["run", "custom.ts"],
    });
  });

  it("creates parent directory when missing", async () => {
    // No .cursor/ dir on disk yet; mkdir is recursive
    const r = await writeMcpConfigForTarget(cursorTarget);
    expect(r.action).toBe("created");
    const onDisk = await readFile(cursorTarget.configPath, "utf-8");
    expect(onDisk).toContain(AI_MEMORY_ENTRY_NAME);
  });
});
