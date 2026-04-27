/**
 * `ai-memory doctor` — one-shot health check.
 *
 * Designed to be the first command a user runs after `npm install`.
 * Diagnoses: runtime / editor detection / LLM connectivity / memory store /
 * embeddings index / MCP configuration, then prints actionable next steps.
 *
 * Exits 0 only if nothing in `fail` state. `warn` is non-fatal.
 *
 * All check functions are pure (take explicit inputs, return a CheckResult)
 * so they can be unit-tested without touching the real filesystem or network.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { platform, release } from "node:os";
import type { CliOptions, AiMemoryConfig, SourceType } from "../types.js";
import { loadConfig } from "../config.js";
import { detectSources, sourceLabel } from "../sources/detector.js";
import { resolveAiConfig, callLLM } from "../extractor/llm.js";
import { readAllMemories } from "../store/memory-store.js";
import { loadVectorStore } from "../embeddings/vector-store.js";
import { resolveAuthor } from "../utils/author.js";
import { ANSI, printBanner } from "../output/terminal.js";

// ---------- Public types (exported for tests) ----------

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  status: CheckStatus;
  label: string;
  detail?: string;
  fix?: string;
}

export interface CheckSection {
  title: string;
  checks: CheckResult[];
}

export interface DoctorReport {
  sections: CheckSection[];
  summary: {
    ok: number;
    warn: number;
    fail: number;
    skip: number;
    nextStep?: string;
  };
  /** Overall exit code: 0 if no fails, 1 otherwise */
  exitCode: 0 | 1;
}

// ---------- Individual check functions (pure, testable) ----------

export function checkNodeRuntime(version: string = process.version): CheckResult {
  const m = version.match(/^v(\d+)\.(\d+)/);
  if (!m) {
    return { status: "warn", label: `Node.js ${version}`, detail: "could not parse version" };
  }
  const major = parseInt(m[1], 10);
  if (major < 18) {
    return {
      status: "fail",
      label: `Node.js ${version}`,
      detail: "ai-memory requires Node.js >= 18",
      fix: "Upgrade Node.js (recommended: 22+). See https://nodejs.org",
    };
  }
  if (major < 22) {
    return {
      status: "warn",
      label: `Node.js ${version}`,
      detail: "works, but 22+ enables richer conversation titles via node:sqlite",
    };
  }
  return { status: "ok", label: `Node.js ${version}` };
}

export function checkPlatform(): CheckResult {
  return { status: "ok", label: `Platform: ${platform()} ${release()}` };
}

/**
 * Map a conversation file path to the directory the user would recognise
 * when reading `doctor` output, accounting for source-specific layout:
 *
 *   - cursor:      `…/agent-transcripts/<uuid>/<uuid>.jsonl`        — strip 2 segments
 *                  so we land on `…/agent-transcripts/`. Stripping just one
 *                  leaves a noisy `<uuid>/` directory that means nothing to
 *                  the user and prompted a "what is this UUID folder?" report.
 *   - codex:       `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`   — strip 4 segments
 *                  so we land on `~/.codex/sessions/`. The `YYYY/MM/DD/`
 *                  partitioning is an internal index, not a directory the
 *                  user would name themselves; same lesson as the Cursor
 *                  v2.4 fix — show the path the user would recognise.
 *   - claude-code: `<projectDir>/<uuid>.jsonl`                      — strip 1 segment
 *   - copilot:     `<chatDir>/<uuid>.json`                          — strip 1 segment
 *   - windsurf:    `<dir>/state.vscdb`                              — strip 1 segment
 *
 * Returns the original input on no separator (defensive — should not happen
 * because every real source produces an absolute path).
 */
export function conversationDisplayDir(
  filePath: string,
  sourceType: SourceType
): string {
  const stripOne = (p: string) => {
    const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return idx === -1 ? p : p.slice(0, idx);
  };
  let path = stripOne(filePath);
  const stripCount: number =
    sourceType === "cursor" ? 1 : sourceType === "codex" ? 3 : 0;
  for (let i = 0; i < stripCount; i++) {
    path = stripOne(path);
  }
  return path;
}

export interface EditorDetectionItem {
  type: string;
  label: string;
  detected: boolean;
  conversationCount?: number;
  path?: string;
}

export function summarizeEditors(items: EditorDetectionItem[]): CheckResult[] {
  if (items.every((i) => !i.detected)) {
    return [
      {
        status: "warn",
        label: "No AI editors detected on this machine",
        detail: "ai-memory needs at least one editor's conversation data to extract memories",
        fix: "Install Cursor / Claude Code / Windsurf / VS Code Copilot and have at least one conversation, then re-run doctor.",
      },
    ];
  }
  return items.map((i) => {
    if (!i.detected) {
      return { status: "skip", label: `${i.label}: not installed` };
    }
    const count = i.conversationCount ?? 0;
    if (count === 0) {
      return {
        status: "warn",
        label: `${i.label}: installed but no conversations found`,
        detail: i.path,
      };
    }
    return {
      status: "ok",
      label: `${i.label}: ${count} conversations`,
      detail: i.path,
    };
  });
}

export interface LlmProbeResult {
  configured: boolean;
  provider?: string;
  model?: string;
  baseUrl?: string;
  probeOk?: boolean;
  probeError?: string;
  probeSkipped?: boolean;
}

export function summarizeLlm(r: LlmProbeResult): CheckResult[] {
  if (!r.configured) {
    return [
      {
        status: "fail",
        label: "No LLM provider configured",
        detail: "extraction and summary require an LLM API",
        fix:
          "Set ONE of:\n" +
          "        export AI_REVIEW_API_KEY=sk-...      (preferred)\n" +
          "        export OPENAI_API_KEY=sk-...\n" +
          "        export OLLAMA_HOST=http://localhost:11434   (local, no key needed)\n" +
          "        export LM_STUDIO_BASE_URL=http://localhost:1234/v1",
      },
    ];
  }
  const results: CheckResult[] = [
    {
      status: "ok",
      label: `Provider: ${r.provider ?? "unknown"}`,
      detail: `model=${r.model ?? "?"} base=${r.baseUrl ?? "?"}`,
    },
  ];
  if (r.probeSkipped) {
    results.push({
      status: "skip",
      label: "Live connectivity test skipped (--no-llm-check)",
    });
  } else if (r.probeOk) {
    results.push({ status: "ok", label: "Live connectivity test passed" });
  } else {
    results.push({
      status: "fail",
      label: "Live connectivity test failed",
      detail: r.probeError,
      fix: buildLlmFixHint(r),
    });
  }
  return results;
}

/**
 * Exported so tests can assert that local-LLM failures produce the
 * "service not running" hint instead of the cloud "check your API key" hint.
 */
export function buildLlmFixHint(r: LlmProbeResult): string {
  const isLocal =
    (r.provider ?? "").toLowerCase().includes("local") ||
    (r.baseUrl ?? "").includes("localhost") ||
    (r.baseUrl ?? "").includes("127.0.0.1");
  if (isLocal) {
    return (
      `Make sure your local LLM service is running and reachable at ${r.baseUrl}.\n` +
      `        Ollama: \`ollama serve\` (default port 11434)\n` +
      `        LM Studio: open the app, load a model, start the server on port 1234.`
    );
  }
  return "Verify your API key is valid and the base URL is reachable from this machine.";
}

export interface StoreStats {
  outputDir: string;
  author: string;
  memoryCount: number;
  typeBreakdown: Record<string, number>;
  configExists: boolean;
}

export function summarizeStore(s: StoreStats): CheckResult[] {
  const results: CheckResult[] = [];
  results.push({
    status: "ok",
    label: `Output directory: ${s.outputDir}/`,
    detail: s.configExists ? "config present" : "no config file yet (defaults will be used)",
  });
  if (!s.author || s.author === "unknown") {
    results.push({
      status: "warn",
      label: "Author is 'unknown' — memories will not be team-scoped",
      fix:
        "Set one of:\n" +
        "        git config user.name 'Your Name'\n" +
        "        ai-memory init   (then edit .ai-memory/.config.json)\n" +
        "        or pass --author <name> on every command",
    });
  } else {
    results.push({ status: "ok", label: `Author: ${s.author}` });
  }
  if (s.memoryCount === 0) {
    results.push({
      status: "warn",
      label: "No memories extracted yet",
      fix: "Run: ai-memory extract --incremental",
    });
  } else {
    const parts = Object.entries(s.typeBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`)
      .join(", ");
    results.push({
      status: "ok",
      label: `${s.memoryCount} memories on disk`,
      detail: parts,
    });
  }
  return results;
}

export interface EmbeddingsStats {
  exists: boolean;
  entryCount: number;
  memoryCount: number;
  model?: string;
}

export function summarizeEmbeddings(e: EmbeddingsStats): CheckResult[] {
  if (e.memoryCount === 0) {
    return [
      {
        status: "skip",
        label: "Embeddings: nothing to index yet",
      },
    ];
  }
  if (!e.exists) {
    return [
      {
        status: "warn",
        label: "Embeddings index not built",
        detail: `${e.memoryCount} memories on disk, 0 indexed`,
        fix: "Run: ai-memory reindex",
      },
    ];
  }
  if (e.entryCount < e.memoryCount) {
    return [
      {
        status: "warn",
        label: `Embeddings stale: ${e.entryCount}/${e.memoryCount} indexed`,
        fix: "Run: ai-memory reindex",
      },
    ];
  }
  return [
    {
      status: "ok",
      label: `Embeddings: ${e.entryCount} indexed`,
      detail: e.model ? `model=${e.model}` : undefined,
    },
  ];
}

export interface McpCheckItem {
  label: string;
  configPath: string;
  present: boolean;
  registered: boolean;
}

export function summarizeMcp(items: McpCheckItem[]): CheckResult[] {
  const results: CheckResult[] = [];
  let anyPresent = false;
  for (const item of items) {
    if (!item.present) continue;
    anyPresent = true;
    if (item.registered) {
      results.push({
        status: "ok",
        label: `${item.label}: ai-memory registered`,
        detail: item.configPath,
      });
    } else {
      results.push({
        status: "warn",
        label: `${item.label}: ai-memory NOT registered`,
        detail: item.configPath,
        fix:
          `Add the MCP entry manually, or run: ai-memory init --with-mcp (v2.4+)\n` +
          `        See README.md "MCP Server" section for the JSON snippet.`,
      });
    }
  }
  if (!anyPresent) {
    results.push({
      status: "skip",
      label: "No MCP config files found (optional — you can still use the CLI)",
    });
  }
  return results;
}

// ---------- Runtime probes (side-effecting, one per section) ----------

async function probeEditors(
  config: AiMemoryConfig
): Promise<EditorDetectionItem[]> {
  const projectName = config.sources?.cursor?.projectName;
  const { available, unavailable } = await detectSources(projectName);

  const items: EditorDetectionItem[] = [];
  for (const source of available) {
    let count = 0;
    let path: string | undefined;
    try {
      const convos = await source.listConversations();
      count = convos.length;
      path = convos[0]?.filePath
        ? conversationDisplayDir(convos[0].filePath, source.type)
        : undefined;
    } catch {
      // ignore: source is detected but listing failed
    }
    items.push({
      type: source.type,
      label: sourceLabel(source.type),
      detected: true,
      conversationCount: count,
      path,
    });
  }
  for (const type of unavailable) {
    items.push({
      type,
      label: sourceLabel(type),
      detected: false,
    });
  }
  return items;
}

async function probeLlm(
  modelOverride: string | undefined,
  runProbe: boolean
): Promise<LlmProbeResult> {
  const llm = resolveAiConfig(modelOverride);
  if (!llm) return { configured: false };

  const provider = inferProvider(llm.baseUrl);
  const base: LlmProbeResult = {
    configured: true,
    provider,
    model: llm.model,
    baseUrl: llm.baseUrl,
  };
  if (!runProbe) return { ...base, probeSkipped: true };

  try {
    // Tiny prompt → ~1-2 output tokens. Cost is effectively $0.
    await callLLM("Reply with: ok", llm, false);
    return { ...base, probeOk: true };
  } catch (err) {
    return {
      ...base,
      probeOk: false,
      probeError: err instanceof Error ? err.message : String(err),
    };
  }
}

function inferProvider(baseUrl: string): string {
  const u = baseUrl.toLowerCase();
  if (u.includes("localhost:11434") || u.includes("ollama")) return "Ollama (local)";
  if (u.includes("localhost:1234") || u.includes("lm-studio")) return "LM Studio (local)";
  if (u.includes("openai.com")) return "OpenAI";
  if (u.includes("anthropic")) return "Anthropic (via proxy)";
  if (u.includes("deepseek")) return "DeepSeek";
  return "OpenAI-compatible";
}

async function probeStore(
  outputDir: string,
  author: string
): Promise<StoreStats> {
  const configPath = join(outputDir, ".config.json");
  const configExists = await readFile(configPath, "utf-8")
    .then(() => true)
    .catch(() => false);
  const memories = await readAllMemories(outputDir, author).catch(() => []);
  const typeBreakdown: Record<string, number> = {};
  for (const m of memories) {
    typeBreakdown[m.type] = (typeBreakdown[m.type] ?? 0) + 1;
  }
  return {
    outputDir,
    author,
    memoryCount: memories.length,
    typeBreakdown,
    configExists,
  };
}

async function probeEmbeddings(
  outputDir: string,
  memoryCount: number
): Promise<EmbeddingsStats> {
  const store = await loadVectorStore(outputDir);
  const entryCount = Object.keys(store.entries).length;
  return {
    exists: entryCount > 0,
    entryCount,
    memoryCount,
    model: store.model || undefined,
  };
}

async function probeMcp(): Promise<McpCheckItem[]> {
  const items: McpCheckItem[] = [];

  const targets = [
    { label: "Cursor (.cursor/mcp.json)", path: ".cursor/mcp.json" },
    { label: "Windsurf (.windsurf/mcp.json)", path: ".windsurf/mcp.json" },
  ];

  for (const t of targets) {
    try {
      const raw = await readFile(t.path, "utf-8");
      const registered = /["']ai-memory["']\s*:/i.test(raw);
      items.push({
        label: t.label,
        configPath: t.path,
        present: true,
        registered,
      });
    } catch {
      items.push({
        label: t.label,
        configPath: t.path,
        present: false,
        registered: false,
      });
    }
  }

  return items;
}

// ---------- Orchestrator ----------

export interface RunDoctorDeps {
  /** Override LLM probe behaviour (for tests / CI) */
  runLlmProbe?: boolean;
}

export async function buildDoctorReport(
  opts: CliOptions,
  deps: RunDoctorDeps = {}
): Promise<DoctorReport> {
  const noLlmCheck = opts.noLlmCheck === true;
  const runLlmProbe = deps.runLlmProbe ?? !noLlmCheck;

  const config = await loadConfig();
  const author = await resolveAuthor(config, opts.author);

  const sections: CheckSection[] = [];

  // Runtime
  sections.push({
    title: "Runtime",
    checks: [checkNodeRuntime(), checkPlatform()],
  });

  // Editors
  const editorItems = await probeEditors(config);
  sections.push({
    title: "Editors detected",
    checks: summarizeEditors(editorItems),
  });

  // LLM
  const llmProbe = await probeLlm(config.model, runLlmProbe);
  sections.push({
    title: "LLM connectivity",
    checks: summarizeLlm(llmProbe),
  });

  // Memory store
  const store = await probeStore(config.output.dir, author);
  sections.push({
    title: "Memory store",
    checks: summarizeStore(store),
  });

  // Embeddings
  const emb = await probeEmbeddings(config.output.dir, store.memoryCount);
  sections.push({
    title: "Embeddings index",
    checks: summarizeEmbeddings(emb),
  });

  // MCP
  const mcpItems = await probeMcp();
  sections.push({
    title: "MCP integration",
    checks: summarizeMcp(mcpItems),
  });

  // Aggregate
  let ok = 0;
  let warn = 0;
  let fail = 0;
  let skip = 0;
  for (const s of sections) {
    for (const c of s.checks) {
      if (c.status === "ok") ok++;
      else if (c.status === "warn") warn++;
      else if (c.status === "fail") fail++;
      else skip++;
    }
  }

  const nextStep = pickNextStep({ sections, store, llmConfigured: llmProbe.configured });

  return {
    sections,
    summary: { ok, warn, fail, skip, nextStep },
    exitCode: fail > 0 ? 1 : 0,
  };
}

function pickNextStep(ctx: {
  sections: CheckSection[];
  store: StoreStats;
  llmConfigured: boolean;
}): string {
  if (!ctx.llmConfigured) {
    // Two paths from here: (a) zero-friction demo to see what ai-memory
    // produces against a curated store (no key required), or (b) the
    // real path of setting a key + re-running doctor. We list (a) first
    // because the most common reason for landing here is "I just ran
    // doctor before deciding whether to invest in setup" — `try` is the
    // 30-second answer.
    return "Run `ai-memory try` for a no-API-key demo, or set an API key (see `LLM connectivity` fix above) and re-run `ai-memory doctor`.";
  }
  if (ctx.store.memoryCount === 0) {
    return "Run `ai-memory extract` to extract memories from your conversations.";
  }
  const hasWarnOrFail = ctx.sections.some((s) =>
    s.checks.some((c) => c.status === "warn" || c.status === "fail")
  );
  if (hasWarnOrFail) {
    return "Address the [!] items above, then re-run `ai-memory doctor`.";
  }
  return "Everything looks good. Run `ai-memory extract --incremental` to stay up to date.";
}

// ---------- Printer ----------

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "ok":
      return `${ANSI.green}[+]${ANSI.reset}`;
    case "warn":
      return `${ANSI.yellow}[!]${ANSI.reset}`;
    case "fail":
      return `${ANSI.red}[x]${ANSI.reset}`;
    case "skip":
      return `${ANSI.dim}[ ]${ANSI.reset}`;
  }
}

export function printReport(report: DoctorReport): void {
  for (const section of report.sections) {
    console.log(`\n${ANSI.bold}${section.title}${ANSI.reset}`);
    for (const check of section.checks) {
      console.log(`  ${statusIcon(check.status)} ${check.label}`);
      if (check.detail) {
        console.log(`      ${ANSI.dim}${check.detail}${ANSI.reset}`);
      }
      if (check.fix) {
        const lines = check.fix.split("\n");
        for (const line of lines) {
          console.log(`      ${ANSI.cyan}${line}${ANSI.reset}`);
        }
      }
    }
  }

  const { ok, warn, fail, skip, nextStep } = report.summary;
  console.log(`\n${ANSI.bold}Summary${ANSI.reset}`);
  console.log(
    `  ${ANSI.green}${ok} ok${ANSI.reset}` +
      `  ${ANSI.yellow}${warn} warn${ANSI.reset}` +
      `  ${ANSI.red}${fail} fail${ANSI.reset}` +
      `  ${ANSI.dim}${skip} skip${ANSI.reset}`
  );
  if (nextStep) {
    console.log(`\n  ${ANSI.cyan}Next:${ANSI.reset} ${nextStep}\n`);
  }
}

// ---------- CLI entry ----------

export async function runDoctor(opts: CliOptions): Promise<number> {
  if (!opts.json) {
    printBanner();
    console.log(`${ANSI.dim}Health check — verifies your environment is ready.${ANSI.reset}`);
  }

  const report = await buildDoctorReport(opts);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  return report.exitCode;
}
