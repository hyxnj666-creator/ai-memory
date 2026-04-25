import { resolve } from "node:path";
import type { CliOptions } from "../types.js";
import { loadConfig } from "../config.js";
import {
  readAllMemories,
  writeConversationMemories,
} from "../store/memory-store.js";
import { resolveAuthor } from "../utils/author.js";
import { loadBundle, planImport, BundleParseError } from "../bundle/bundle.js";
import {
  printBanner,
  printError,
  printSuccess,
  printWarning,
  ANSI as COL,
} from "../output/terminal.js";

export async function runImport(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const inputPath = opts.bundle ?? opts.positionalArgs?.[0];
  if (!inputPath) {
    printError(
      'Missing bundle path. Usage: ai-memory import <path-to-bundle.json> [--overwrite] [--dry-run] [--author <name>]'
    );
    return 1;
  }

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const lang = config.output.language;

  // Load and validate bundle
  let bundle;
  try {
    bundle = await loadBundle(resolve(inputPath));
  } catch (err) {
    if (err instanceof BundleParseError) {
      printError(err.message);
    } else {
      printError(`Failed to load bundle: ${(err as Error).message}`);
    }
    return 1;
  }

  if (!opts.json) {
    console.log(
      `\n  Bundle: ${COL.bold}${bundle.memoryCount}${COL.reset} memories from ${COL.dim}${bundle.exportedBy ?? "unknown"}${COL.reset} (${bundle.producer})`
    );
    if (bundle.scope) console.log(`  Scope:  ${bundle.scope}`);
    console.log();
  }

  // Determine author for import (CLI override > bundle author > local resolveAuthor)
  const localAuthor = await resolveAuthor(config, opts.author);
  // Plan: detect duplicates against memories already on disk for the relevant author
  // (we read ALL authors so cross-author imports also dedup against existing files)
  const existing = await readAllMemories(outputDir);
  const plan = planImport(bundle, existing, opts.author /* explicit only */);

  // Group by sourceId for the writer
  const writeSet = opts.overwrite
    ? [...plan.toWrite, ...plan.duplicates]
    : plan.toWrite;

  // Also: assign author for memories that don't have one (so they land
  // under the right subdirectory rather than at outputDir root)
  for (const m of writeSet) {
    if (!m.author) m.author = localAuthor;
  }

  if (opts.json) {
    console.log(JSON.stringify({
      dryRun: !!opts.dryRun,
      bundleMemoryCount: bundle.memoryCount,
      newCount: plan.toWrite.length,
      duplicateCount: plan.duplicates.length,
      willWrite: writeSet.length,
    }));
    if (opts.dryRun) return 0;
  } else {
    console.log(`  ${COL.bold}${plan.toWrite.length}${COL.reset} new`);
    console.log(`  ${COL.bold}${plan.duplicates.length}${COL.reset} already exist (${opts.overwrite ? "will overwrite" : "skipping"})`);
  }

  if (opts.dryRun) {
    if (!opts.json) {
      console.log(`\n  ${COL.dim}(dry-run — no files written. Re-run without --dry-run to apply.)${COL.reset}\n`);
    }
    return 0;
  }

  if (writeSet.length === 0) {
    if (!opts.json) {
      printWarning("Nothing to write — every memory in the bundle already exists locally. Use --overwrite to replace them.");
    }
    return 0;
  }

  // Group by author so writeConversationMemories writes to the right namespace
  const byAuthor = new Map<string, typeof writeSet>();
  for (const m of writeSet) {
    const a = m.author ?? localAuthor;
    if (!byAuthor.has(a)) byAuthor.set(a, []);
    byAuthor.get(a)!.push(m);
  }

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [author, mems] of byAuthor) {
    const result = await writeConversationMemories(mems, outputDir, lang, {
      author,
      force: opts.overwrite,
    });
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
  }

  if (opts.json) {
    console.log(JSON.stringify({
      dryRun: false,
      created: totalCreated,
      updated: totalUpdated,
      skipped: totalSkipped,
    }));
  } else {
    console.log();
    printSuccess(
      `Imported ${totalCreated} new memories${totalUpdated ? `, updated ${totalUpdated}` : ""}${totalSkipped ? `, skipped ${totalSkipped}` : ""}.`
    );
    console.log(
      `   Run \`ai-memory reindex\` to (re)build embeddings for the imported memories.\n`
    );
  }

  return 0;
}
