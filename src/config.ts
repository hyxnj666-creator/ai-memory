import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AiMemoryConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export async function loadConfig(outputDir = ".ai-memory"): Promise<AiMemoryConfig> {
  const configPath = join(outputDir, ".config.json");
  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    // No config file — use defaults silently (normal for first run)
    return { ...DEFAULT_CONFIG };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AiMemoryConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      sources: {
        ...DEFAULT_CONFIG.sources,
        ...parsed.sources,
      },
      extract: { ...DEFAULT_CONFIG.extract, ...parsed.extract },
      output: { ...DEFAULT_CONFIG.output, ...parsed.output },
    };
  } catch {
    process.stderr.write(`[warn] Config file ${configPath} is invalid JSON — using defaults.\n`);
    return { ...DEFAULT_CONFIG };
  }
}
