import type { CliOptions } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { indexMemories } from "../embeddings/indexer.js";
import { printBanner, printError, printSuccess, printWarning, ANSI as COL } from "../output/terminal.js";

export async function runReindex(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;

  const memories = await readAllMemories(outputDir);

  if (memories.length === 0) {
    printWarning("No memories found. Run `ai-memory extract` first.");
    return 0;
  }

  if (!opts.json) {
    console.log(`\n  Found ${COL.bold}${memories.length}${COL.reset} memories to index...\n`);
  }

  try {
    const result = await indexMemories(memories, outputDir, {
      force: opts.force,
      verbose: opts.verbose ?? !opts.json,
    });

    if (opts.json) {
      console.log(JSON.stringify(result));
    } else {
      if (result.indexed > 0) {
        printSuccess(`Indexed ${result.indexed} memories (total: ${result.total})`);
      } else {
        console.log(`  All ${result.total} memories already indexed.`);
      }
      if (result.pruned > 0) {
        console.log(`  Pruned ${result.pruned} stale embeddings.`);
      }
      console.log();
    }

    return 0;
  } catch (err) {
    printError(`Reindex failed: ${err}`);
    return 1;
  }
}
