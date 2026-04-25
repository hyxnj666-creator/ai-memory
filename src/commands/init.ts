import { writeFile, readFile, mkdir, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CliOptions, AiMemoryConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { detectSources, sourceLabel } from "../sources/detector.js";
import { printBanner } from "../output/terminal.js";
import { resolveAuthor } from "../utils/author.js";
import {
  writeProjectMcpConfigs,
  type WriteResult,
} from "../mcp/config-writer.js";

const CONFIG_PATH = ".ai-memory/.config.json";
const GITIGNORE_ENTRIES = [".ai-memory/.state.json", ".ai-memory/.embeddings.json"];
const GITIGNORE_PATH = ".gitignore";

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function updateGitignore(): Promise<boolean> {
  const existing = await safeRead(GITIGNORE_PATH) ?? "";
  const missing = GITIGNORE_ENTRIES.filter((e) => !existing.includes(e));
  if (missing.length === 0) return false;

  const entry = `\n# ai-memory local state (machine-specific)\n${missing.join("\n")}\n`;
  await appendFile(GITIGNORE_PATH, entry, "utf-8");
  return true;
}

function buildConfig(detectedProject?: string): AiMemoryConfig {
  const config = { ...DEFAULT_CONFIG };
  if (detectedProject) {
    config.sources.cursor.projectName = detectedProject;
  }
  return config;
}

function getProjectName(): string | undefined {
  const cwd = resolve(".");
  const parts = cwd.split(/[\\/]/);
  return parts[parts.length - 1] || undefined;
}

export async function runInit(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  // 1. Detect sources
  if (!opts.json) console.log("Detecting AI editors...");
  const { available, unavailable } = await detectSources();

  if (!opts.json) {
    for (const s of available) {
      console.log(`   [+] ${sourceLabel(s.type)} detected`);
    }
    for (const t of unavailable) {
      console.log(`   [ ] ${sourceLabel(t)} not found`);
    }
  }

  if (available.length === 0) {
    if (!opts.json) {
      console.log(
        "\n[!] No AI editors detected. Config will be created with defaults."
      );
    }
  }

  // 2. Create .ai-memory directory
  await mkdir(".ai-memory", { recursive: true });

  // 3. Write config (don't overwrite if exists)
  const existingConfig = await safeRead(CONFIG_PATH);
  if (existingConfig) {
    if (!opts.json) {
      console.log(`\n[!] Config already exists at ${CONFIG_PATH} — skipping.`);
    }
  } else {
    const config = buildConfig(getProjectName());
    if (available.length === 0) {
      config.sources.cursor.enabled = false;
      config.sources.claudeCode.enabled = false;
    }
    // Auto-detect author from git / OS
    const detectedAuthor = await resolveAuthor(config);
    config.author = detectedAuthor;
    if (!opts.json) console.log(`\n[+] Author detected: ${detectedAuthor}`);

    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    if (!opts.json) console.log(`[+] Config written -> ${CONFIG_PATH}`);
  }

  // 4. Update .gitignore
  const updated = await updateGitignore();
  if (!opts.json) {
    if (updated) {
      console.log(`[+] Added .state.json and .embeddings.json to .gitignore`);
    } else {
      console.log(`    .gitignore already up to date`);
    }
  }

  // 5. MCP configs (opt-in via --with-mcp)
  let mcpResults: WriteResult[] | undefined;
  if (opts.withMcp) {
    mcpResults = await writeProjectMcpConfigs();
    if (!opts.json) {
      console.log(`\nMCP configuration:`);
      for (const r of mcpResults) {
        console.log(`   ${formatMcpStatus(r)}`);
      }
      console.log(
        `   [i] For Claude Desktop (global), copy the JSON snippet from README.md "MCP Server"`
      );
      console.log(
        `       to your OS-specific path (e.g. ~/Library/Application Support/Claude/claude_desktop_config.json).`
      );
    }
  }

  // 6. Next steps
  if (!opts.json) {
    console.log(`
Next steps:
  1. Set your API key:
     export AI_REVIEW_API_KEY=sk-...

  2. Verify your setup:
     npx ai-memory-cli doctor

  3. Extract memories from your conversations:
     npx ai-memory-cli extract

  4. Commit your memories:
     git add .ai-memory/ && git commit -m "chore: add ai-memory knowledge base"
`);
  } else {
    console.log(
      JSON.stringify({
        detected: available.map((s) => s.type),
        configPath: CONFIG_PATH,
        gitignoreUpdated: updated,
        mcp: mcpResults?.map((r) => ({
          label: r.target.label,
          path: r.target.configPath,
          action: r.action,
          wrote: r.wrote,
          reason: r.reason,
        })),
      })
    );
  }

  return 0;
}

function formatMcpStatus(r: WriteResult): string {
  const path = r.target.configPath;
  switch (r.action) {
    case "created":
      return `[+] ${r.target.label} (${path}): created`;
    case "updated":
      return `[+] ${r.target.label} (${path}): added ai-memory entry`;
    case "already-registered":
      return `    ${r.target.label} (${path}): ai-memory already registered`;
    case "conflict":
      return `[!] ${r.target.label} (${path}): skipped — ${r.reason ?? "existing entry differs"}`;
    case "invalid":
      return `[!] ${r.target.label} (${path}): skipped — ${r.reason ?? "invalid JSON"}`;
  }
}
