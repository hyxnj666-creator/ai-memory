import { writeFile, readFile, mkdir, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CliOptions, AiMemoryConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { detectSources } from "../sources/detector.js";
import { printBanner } from "../output/terminal.js";

const CONFIG_PATH = ".ai-memory/.config.json";
const STATE_GITIGNORE_ENTRY = ".ai-memory/.state.json";
const GITIGNORE_PATH = ".gitignore";

async function safeRead(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function updateGitignore(): Promise<boolean> {
  const existing = await safeRead(GITIGNORE_PATH);
  if (existing?.includes(STATE_GITIGNORE_ENTRY)) return false;

  const entry = `\n# ai-memory extraction state (machine-specific)\n${STATE_GITIGNORE_ENTRY}\n`;
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
      console.log(
        `   [+] ${s.type === "cursor" ? "Cursor" : "Claude Code"} detected`
      );
    }
    for (const t of unavailable) {
      console.log(
        `   [ ] ${t === "cursor" ? "Cursor" : "Claude Code"} not found`
      );
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
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    if (!opts.json) console.log(`\n[+] Config written -> ${CONFIG_PATH}`);
  }

  // 4. Update .gitignore
  const updated = await updateGitignore();
  if (!opts.json) {
    if (updated) {
      console.log(`[+] Added ${STATE_GITIGNORE_ENTRY} to .gitignore`);
    } else {
      console.log(`    .gitignore already contains ${STATE_GITIGNORE_ENTRY}`);
    }
  }

  // 5. Next steps
  if (!opts.json) {
    console.log(`
Next steps:
  1. Set your API key:
     export AI_REVIEW_API_KEY=sk-...

  2. Extract memories from your conversations:
     npx ai-memory extract

  3. Commit your memories:
     git add .ai-memory/ && git commit -m "chore: add ai-memory knowledge base"
`);
  } else {
    console.log(
      JSON.stringify({
        detected: available.map((s) => s.type),
        configPath: CONFIG_PATH,
        gitignoreUpdated: updated,
      })
    );
  }

  return 0;
}
