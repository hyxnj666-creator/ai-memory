import { describe, it, expect } from "vitest";
import { parseArgs } from "../cli.js";
import {
  checkNodeRuntime,
  checkPlatform,
  conversationDisplayDir,
  summarizeEditors,
  summarizeLlm,
  summarizeStore,
  summarizeEmbeddings,
  summarizeMcp,
  buildLlmFixHint,
  type CheckResult,
} from "../commands/doctor.js";

// --- CLI wiring ---

describe("doctor CLI parsing", () => {
  it("parses 'doctor' as a valid command", () => {
    expect(parseArgs(["doctor"])).toMatchObject({ command: "doctor" });
  });

  it("parses --no-llm-check flag", () => {
    const opts = parseArgs(["doctor", "--no-llm-check"]);
    expect(opts.command).toBe("doctor");
    expect(opts.noLlmCheck).toBe(true);
  });

  it("parses --json flag for doctor", () => {
    const opts = parseArgs(["doctor", "--json"]);
    expect(opts.command).toBe("doctor");
    expect(opts.json).toBe(true);
  });
});

// --- Runtime checks ---

describe("checkNodeRuntime", () => {
  it("passes on Node 22.x", () => {
    expect(checkNodeRuntime("v22.12.0")).toMatchObject({ status: "ok" });
  });

  it("passes on Node 24", () => {
    expect(checkNodeRuntime("v24.0.1")).toMatchObject({ status: "ok" });
  });

  it("warns on Node 18 (supported but less ideal)", () => {
    const r = checkNodeRuntime("v18.20.0");
    expect(r.status).toBe("warn");
    expect(r.detail).toMatch(/sqlite/i);
  });

  it("warns on Node 20", () => {
    expect(checkNodeRuntime("v20.11.1")).toMatchObject({ status: "warn" });
  });

  it("fails on Node 16", () => {
    const r = checkNodeRuntime("v16.20.0");
    expect(r.status).toBe("fail");
    expect(r.fix).toMatch(/upgrade/i);
  });

  it("handles unparseable version gracefully", () => {
    expect(checkNodeRuntime("weird")).toMatchObject({ status: "warn" });
  });
});

describe("checkPlatform", () => {
  it("returns ok with platform info", () => {
    const r = checkPlatform();
    expect(r.status).toBe("ok");
    expect(r.label).toMatch(/platform/i);
  });
});

// --- Editor summary ---

describe("summarizeEditors", () => {
  it("emits single warn when no editor detected", () => {
    const r = summarizeEditors([
      { type: "cursor", label: "Cursor", detected: false },
      { type: "claude-code", label: "Claude Code", detected: false },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("warn");
    expect(r[0].fix).toMatch(/install/i);
  });

  it("reports ok when editor has conversations", () => {
    const r = summarizeEditors([
      { type: "cursor", label: "Cursor", detected: true, conversationCount: 42 },
    ]);
    expect(r[0]).toMatchObject({ status: "ok" });
    expect(r[0].label).toContain("42");
  });

  it("warns when editor detected but zero conversations", () => {
    const r = summarizeEditors([
      { type: "cursor", label: "Cursor", detected: true, conversationCount: 0 },
    ]);
    expect(r[0].status).toBe("warn");
  });

  it("skips uninstalled editors when others are present", () => {
    const r = summarizeEditors([
      { type: "cursor", label: "Cursor", detected: true, conversationCount: 3 },
      { type: "claude-code", label: "Claude Code", detected: false },
    ]);
    expect(r.find((x) => x.label.includes("Claude Code"))?.status).toBe("skip");
  });
});

// --- Editor display path (regression for cursor's extra UUID directory) ---

describe("conversationDisplayDir", () => {
  it("strips the trailing <uuid>/<uuid>.jsonl off cursor paths so doctor shows agent-transcripts/, not the noisy UUID subdir", () => {
    const p = "/home/u/.config/Cursor/User/workspaceStorage/abc/agent-transcripts/0123-uuid-aaaa/0123-uuid-aaaa.jsonl";
    expect(conversationDisplayDir(p, "cursor")).toBe(
      "/home/u/.config/Cursor/User/workspaceStorage/abc/agent-transcripts"
    );
  });

  it("works on Windows backslash separators", () => {
    const p = "C:\\Users\\u\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\abc\\agent-transcripts\\0123-uuid\\0123-uuid.jsonl";
    expect(conversationDisplayDir(p, "cursor")).toBe(
      "C:\\Users\\u\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\abc\\agent-transcripts"
    );
  });

  it("strips one segment for claude-code (project dir layout: <projectDir>/<uuid>.jsonl)", () => {
    expect(
      conversationDisplayDir("/home/u/.claude/projects/proj-abc/0123-uuid.jsonl", "claude-code")
    ).toBe("/home/u/.claude/projects/proj-abc");
  });

  it("strips one segment for copilot (chat dir layout: <chatDir>/<uuid>.json)", () => {
    expect(
      conversationDisplayDir("/home/u/Library/Application Support/Code/User/globalStorage/copilot/0123-uuid.json", "copilot")
    ).toBe("/home/u/Library/Application Support/Code/User/globalStorage/copilot");
  });

  it("strips one segment for windsurf (DB-file layout: <dir>/state.vscdb)", () => {
    expect(
      conversationDisplayDir("/home/u/.codeium/windsurf/state.vscdb", "windsurf")
    ).toBe("/home/u/.codeium/windsurf");
  });

  it("returns the input unchanged when there is no separator (defensive — should not happen for real source-emitted paths, all of which are absolute)", () => {
    expect(conversationDisplayDir("nofile", "cursor")).toBe("nofile");
    expect(conversationDisplayDir("nofile", "claude-code")).toBe("nofile");
  });
});

// --- LLM summary ---

describe("summarizeLlm", () => {
  it("fails when no provider configured", () => {
    const r = summarizeLlm({ configured: false });
    expect(r[0].status).toBe("fail");
    expect(r[0].fix).toMatch(/AI_REVIEW_API_KEY|OPENAI_API_KEY/);
  });

  it("shows ok provider + ok probe on successful probe", () => {
    const r = summarizeLlm({
      configured: true,
      provider: "OpenAI",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      probeOk: true,
    });
    expect(r).toHaveLength(2);
    expect(r[0].status).toBe("ok");
    expect(r[1].status).toBe("ok");
  });

  it("shows fail when probe fails", () => {
    const r = summarizeLlm({
      configured: true,
      provider: "OpenAI",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      probeOk: false,
      probeError: "401 Unauthorized",
    });
    const probe = r.find((x) => /connectivity/i.test(x.label));
    expect(probe?.status).toBe("fail");
    expect(probe?.detail).toContain("401");
    expect(probe?.fix).toMatch(/api key/i);
  });

  it("uses local-LLM fix hint when Ollama probe fails", () => {
    const r = summarizeLlm({
      configured: true,
      provider: "Ollama (local)",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      probeOk: false,
      probeError: "fetch failed",
    });
    const probe = r.find((x) => /connectivity/i.test(x.label));
    expect(probe?.status).toBe("fail");
    expect(probe?.fix).toMatch(/ollama serve/i);
    expect(probe?.fix).not.toMatch(/api key/i);
  });

  it("buildLlmFixHint returns cloud hint for api.openai.com", () => {
    const hint = buildLlmFixHint({
      configured: true,
      provider: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(hint).toMatch(/api key/i);
  });

  it("buildLlmFixHint returns local hint for 127.0.0.1 base", () => {
    const hint = buildLlmFixHint({
      configured: true,
      provider: "OpenAI-compatible",
      baseUrl: "http://127.0.0.1:8080/v1",
    });
    expect(hint).toMatch(/local LLM|ollama|lm studio/i);
  });

  it("marks probe as skipped when --no-llm-check", () => {
    const r = summarizeLlm({
      configured: true,
      provider: "Ollama (local)",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      probeSkipped: true,
    });
    const probe = r.find((x) => /connectivity|skipped/i.test(x.label));
    expect(probe?.status).toBe("skip");
  });
});

// --- Store summary ---

describe("summarizeStore", () => {
  const base = {
    outputDir: ".ai-memory",
    author: "alice",
    memoryCount: 10,
    typeBreakdown: { decision: 4, convention: 3, todo: 3 },
    configExists: true,
  };

  it("shows breakdown when memories exist", () => {
    const r = summarizeStore(base);
    const mem = r.find((x) => /memories on disk/i.test(x.label));
    expect(mem?.status).toBe("ok");
    expect(mem?.label).toContain("10");
  });

  it("warns on unknown author", () => {
    const r = summarizeStore({ ...base, author: "unknown" });
    expect(r.some((x) => x.status === "warn" && /unknown/i.test(x.label))).toBe(true);
  });

  it("warns when no memories extracted yet", () => {
    const r = summarizeStore({ ...base, memoryCount: 0, typeBreakdown: {} });
    const mem = r.find((x) => /no memories/i.test(x.label));
    expect(mem?.status).toBe("warn");
    expect(mem?.fix).toMatch(/extract/i);
  });

  it("reports missing config as informational detail", () => {
    const r = summarizeStore({ ...base, configExists: false });
    const dir = r.find((x) => /output directory/i.test(x.label));
    expect(dir?.detail).toMatch(/no config/i);
  });
});

// --- Embeddings summary ---

describe("summarizeEmbeddings", () => {
  it("skips when no memories exist", () => {
    const r = summarizeEmbeddings({ exists: false, entryCount: 0, memoryCount: 0 });
    expect(r[0].status).toBe("skip");
  });

  it("warns when index is missing", () => {
    const r = summarizeEmbeddings({ exists: false, entryCount: 0, memoryCount: 5 });
    expect(r[0].status).toBe("warn");
    expect(r[0].fix).toMatch(/reindex/i);
  });

  it("warns when index is stale (fewer entries than memories)", () => {
    const r = summarizeEmbeddings({
      exists: true,
      entryCount: 3,
      memoryCount: 5,
      model: "text-embedding-3-small",
    });
    expect(r[0].status).toBe("warn");
    expect(r[0].label).toContain("3/5");
  });

  it("reports ok when index is fresh", () => {
    const r = summarizeEmbeddings({
      exists: true,
      entryCount: 5,
      memoryCount: 5,
      model: "text-embedding-3-small",
    });
    expect(r[0].status).toBe("ok");
    expect(r[0].detail).toContain("text-embedding-3-small");
  });
});

// --- MCP summary ---

describe("summarizeMcp", () => {
  it("skips when no MCP config files exist", () => {
    const r = summarizeMcp([
      { label: "Cursor", configPath: ".cursor/mcp.json", present: false, registered: false },
      { label: "Windsurf", configPath: ".windsurf/mcp.json", present: false, registered: false },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("skip");
  });

  it("reports ok when ai-memory is registered", () => {
    const r = summarizeMcp([
      { label: "Cursor", configPath: ".cursor/mcp.json", present: true, registered: true },
    ]);
    expect(r[0].status).toBe("ok");
  });

  it("warns when config exists but ai-memory is not registered", () => {
    const r = summarizeMcp([
      { label: "Cursor", configPath: ".cursor/mcp.json", present: true, registered: false },
    ]);
    expect(r[0].status).toBe("warn");
    expect(r[0].fix).toMatch(/with-mcp|README/i);
  });

  it("reports a mix correctly", () => {
    const r = summarizeMcp([
      { label: "Cursor", configPath: ".cursor/mcp.json", present: true, registered: true },
      { label: "Windsurf", configPath: ".windsurf/mcp.json", present: true, registered: false },
    ]);
    expect(r).toHaveLength(2);
    expect(r.find((x: CheckResult) => x.label.includes("Cursor"))?.status).toBe("ok");
    expect(r.find((x: CheckResult) => x.label.includes("Windsurf"))?.status).toBe("warn");
  });
});
