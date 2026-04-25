import { unlink, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CliOptions, ExtractedMemory } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { indexMemories } from "../embeddings/indexer.js";
import {
  shingles,
  jaccardSimilarity,
  containmentSimilarity,
  isVagueContent,
} from "../extractor/ai-extractor.js";
import { printBanner, printError, printSuccess, printWarning, ANSI as COL } from "../output/terminal.js";

const SHINGLE_DEDUP_THRESHOLD = 0.55;
const CONTAINMENT_THRESHOLD = 0.75;

export async function runReindex(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;

  const memories = await readAllMemories(outputDir);

  if (memories.length === 0) {
    printWarning("No memories found. Run `ai-memory extract` first.");
    return 0;
  }

  // --dedup mode: quality cleanup pass
  if (opts.dedup) {
    return runDedup(memories, outputDir, opts);
  }

  // Normal reindex (embeddings)
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

interface DedupCandidate {
  memory: ExtractedMemory;
  reason: "vague" | "duplicate" | "subsumed";
  detail?: string;
}

/**
 * Identify and optionally remove low-quality / redundant memories
 * using the v2.2 algorithm stack (vague detection + shingle dedup + containment subsumption).
 */
async function runDedup(
  memories: ExtractedMemory[],
  outputDir: string,
  opts: CliOptions
): Promise<number> {
  const candidates: DedupCandidate[] = [];

  // Pass 1: vague content detection
  for (const m of memories) {
    if (isVagueContent(m.content, m.impact)) {
      candidates.push({ memory: m, reason: "vague" });
    }
  }

  // Pass 2: same-type semantic duplicates / subsumptions
  // Keep the longer/more-specific memory, mark the other for removal
  const byType = new Map<string, ExtractedMemory[]>();
  for (const m of memories) {
    if (!byType.has(m.type)) byType.set(m.type, []);
    byType.get(m.type)!.push(m);
  }

  const vaguePaths = new Set(candidates.map((c) => c.memory.filePath));
  const alreadyMarked = new Set(vaguePaths);

  for (const [, ms] of byType) {
    const shingleCache = ms.map((m) => shingles(m.content));
    for (let i = 0; i < ms.length; i++) {
      if (alreadyMarked.has(ms[i].filePath)) continue;
      for (let j = i + 1; j < ms.length; j++) {
        if (alreadyMarked.has(ms[j].filePath)) continue;

        const a = shingleCache[i];
        const b = shingleCache[j];
        const jac = jaccardSimilarity(a, b);

        const [smaller, larger, smallIdx, largeIdx] = a.size <= b.size
          ? [a, b, i, j]
          : [b, a, j, i];
        const cont = containmentSimilarity(smaller, larger);

        let reason: "duplicate" | "subsumed" | null = null;
        if (jac > SHINGLE_DEDUP_THRESHOLD) reason = "duplicate";
        else if (cont > CONTAINMENT_THRESHOLD) reason = "subsumed";

        if (reason) {
          // Remove the shorter / smaller memory, keep the more detailed one
          const toRemoveIdx = ms[smallIdx].content.length < ms[largeIdx].content.length
            ? smallIdx
            : largeIdx;
          const keepIdx = toRemoveIdx === smallIdx ? largeIdx : smallIdx;
          const toRemove = ms[toRemoveIdx];
          if (!alreadyMarked.has(toRemove.filePath)) {
            candidates.push({
              memory: toRemove,
              reason,
              detail: `kept: "${ms[keepIdx].title}" (${reason === "duplicate" ? `jaccard=${jac.toFixed(2)}` : `containment=${cont.toFixed(2)}`})`,
            });
            alreadyMarked.add(toRemove.filePath);
          }
        }
      }
    }
  }

  if (candidates.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ candidates: 0, total: memories.length }));
    } else {
      printSuccess(`All ${memories.length} memories look clean. No action needed.`);
    }
    return 0;
  }

  const byReason = {
    vague: candidates.filter((c) => c.reason === "vague").length,
    duplicate: candidates.filter((c) => c.reason === "duplicate").length,
    subsumed: candidates.filter((c) => c.reason === "subsumed").length,
  };

  if (opts.json) {
    console.log(JSON.stringify({
      dryRun: !!opts.dryRun,
      total: memories.length,
      candidates: candidates.length,
      byReason,
      items: candidates.map((c) => ({
        title: c.memory.title,
        type: c.memory.type,
        reason: c.reason,
        detail: c.detail,
        filePath: c.memory.filePath,
      })),
    }));
    return 0;
  }

  console.log(`\n  Quality cleanup candidates: ${COL.bold}${candidates.length}${COL.reset} / ${memories.length} (${Math.round(candidates.length / memories.length * 100)}%)`);
  console.log(`    ${byReason.vague} vague, ${byReason.duplicate} duplicate, ${byReason.subsumed} subsumed\n`);

  // Show first 15 as preview
  const preview = candidates.slice(0, 15);
  for (const c of preview) {
    const reasonLabel = c.reason.padEnd(9);
    console.log(`  [${reasonLabel}] ${c.memory.type}/${c.memory.title}`);
    if (c.detail) console.log(`                ${COL.dim}${c.detail}${COL.reset}`);
  }
  if (candidates.length > preview.length) {
    console.log(`  ... and ${candidates.length - preview.length} more`);
  }

  if (opts.dryRun) {
    console.log(`\n  ${COL.dim}(dry-run — no files modified. Re-run without --dry-run to delete.)${COL.reset}\n`);
    return 0;
  }

  // Actually delete files + update .index
  let deleted = 0;
  let failed = 0;
  const affectedSourceIds = new Set<string>();

  for (const c of candidates) {
    if (!c.memory.filePath) continue;
    try {
      await unlink(c.memory.filePath);
      deleted++;
      if (c.memory.sourceId) affectedSourceIds.add(c.memory.sourceId);
    } catch {
      failed++;
    }
  }

  // Update .index manifests to remove references to deleted files
  await cleanupIndexManifests(outputDir, affectedSourceIds);

  console.log();
  if (deleted > 0) {
    printSuccess(`Deleted ${deleted} low-quality memories.`);
  }
  if (failed > 0) {
    printWarning(`${failed} deletions failed (file may not exist).`);
  }
  console.log();

  return 0;
}

/**
 * Remove references to deleted files from .index/*.json manifests.
 * If a manifest ends up empty, delete it.
 */
async function cleanupIndexManifests(outputDir: string, sourceIds: Set<string>): Promise<void> {
  if (sourceIds.size === 0) return;

  const indexDirs: string[] = [];
  try {
    const entries = await readdir(join(outputDir, ".index"), { withFileTypes: true });
    indexDirs.push(join(outputDir, ".index"));
    for (const e of entries) {
      if (e.isDirectory()) indexDirs.push(join(outputDir, ".index", e.name));
    }
  } catch {
    return;
  }

  for (const dir of indexDirs) {
    for (const sid of sourceIds) {
      const manifestPath = join(dir, `${sid}.json`);
      try {
        const raw = await readFile(manifestPath, "utf-8");
        const entry = JSON.parse(raw) as { files: string[] };
        const stillExisting: string[] = [];
        for (const rel of entry.files ?? []) {
          try {
            const fs = await import("node:fs/promises");
            await fs.access(join(outputDir, rel));
            stillExisting.push(rel);
          } catch { /* file was deleted */ }
        }

        if (stillExisting.length === 0) {
          await unlink(manifestPath);
        } else if (stillExisting.length !== entry.files.length) {
          await writeFile(manifestPath, JSON.stringify({ files: stillExisting }), "utf-8");
        }
      } catch { /* manifest not in this dir, continue */ }
    }
  }
}
