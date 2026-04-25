import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CliOptions } from "../types.js";
import { loadConfig } from "../config.js";
import { readAllMemories } from "../store/memory-store.js";
import { resolveAuthor } from "../utils/author.js";
import { buildBundle } from "../bundle/bundle.js";
import { scopeBySource } from "./context.js";
import { printBanner, printError, printSuccess, printWarning } from "../output/terminal.js";

export async function runExport(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;

  const author = opts.allAuthors ? undefined : await resolveAuthor(config, opts.author);
  let memories = await readAllMemories(outputDir, author);

  if (memories.length === 0) {
    printError('No memories found. Run "ai-memory extract" first.');
    return 1;
  }

  if (!opts.includeResolved) {
    memories = memories.filter((m) => m.status !== "resolved");
  }

  // Apply --source-id / --convo filters (same UX as `context`)
  if (opts.sourceId || opts.convo) {
    try {
      const scope = scopeBySource(memories, opts.sourceId, opts.convo, !!opts.allMatching);
      memories = scope.memories;
      if (!opts.json && scope.ambiguityWarning) {
        printWarning(scope.ambiguityWarning);
      }
    } catch (err) {
      printError(`${(err as Error).message} Run "ai-memory context --list-sources" to see available conversations.`);
      return 1;
    }
  }

  // Optional --type filter (reuse extract's flag)
  if (opts.types && opts.types.length > 0) {
    const allowed = new Set(opts.types);
    memories = memories.filter((m) => allowed.has(m.type));
  }

  if (memories.length === 0) {
    printError("No memories matched the given filters.");
    return 1;
  }

  // Compose human-readable scope string
  const scopeParts: string[] = [];
  if (opts.sourceId) scopeParts.push(`sourceId=${opts.sourceId}`);
  if (opts.convo) scopeParts.push(`convo="${opts.convo}"`);
  if (opts.types && opts.types.length > 0) scopeParts.push(`types=${opts.types.join(",")}`);
  if (opts.allAuthors) scopeParts.push("allAuthors");
  if (opts.includeResolved) scopeParts.push("includeResolved");

  const bundle = buildBundle(memories, {
    exportedBy: author ?? "all-authors",
    scope: scopeParts.length ? scopeParts.join(" ") : undefined,
  });
  const json = JSON.stringify(bundle, null, 2);

  // Write to file or stdout
  const outputPath = opts.bundle ?? opts.output;

  if (!outputPath) {
    // Default: print JSON to stdout (pipe-friendly)
    process.stdout.write(json + "\n");
    if (!opts.json) {
      // separate human summary on stderr to keep stdout clean for piping
      process.stderr.write(
        `\nExported ${bundle.memoryCount} memories (~${humanSize(json.length)})\n`
      );
    }
    return 0;
  }

  const absPath = resolve(outputPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, json, "utf-8");

  if (opts.json) {
    console.log(JSON.stringify({
      output: absPath,
      memoryCount: bundle.memoryCount,
      bytes: json.length,
      scope: bundle.scope,
    }));
  } else {
    printSuccess(
      `Exported ${bundle.memoryCount} memories -> ${absPath} (${humanSize(json.length)})`
    );
    if (bundle.scope) {
      console.log(`   Scope: ${bundle.scope}`);
    }
    console.log(`\nNext: \`ai-memory import ${outputPath}\` on another machine.\n`);
  }
  return 0;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
