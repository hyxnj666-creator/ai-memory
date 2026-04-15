import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AiMemoryConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export async function loadConfig(outputDir = ".ai-memory"): Promise<AiMemoryConfig> {
  try {
    const raw = await readFile(join(outputDir, ".config.json"), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AiMemoryConfig>;
    // Deep merge top-level keys only
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      sources: { ...DEFAULT_CONFIG.sources, ...parsed.sources },
      extract: { ...DEFAULT_CONFIG.extract, ...parsed.extract },
      output: { ...DEFAULT_CONFIG.output, ...parsed.output },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
