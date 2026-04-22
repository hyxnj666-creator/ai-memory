/**
 * Retroactive quality diagnostic — apply new algorithms to existing memories
 * to quantify the value of the v2.2 algorithm upgrades.
 *
 * Run: npx tsx scripts/diagnose-quality.ts <memories-dir>
 */

import { readAllMemories } from "../src/store/memory-store.js";
import {
  isVagueContent,
  specificityScore,
  shingles,
  jaccardSimilarity,
  containmentSimilarity,
} from "../src/extractor/ai-extractor.js";

const SHINGLE_DEDUP_THRESHOLD = 0.55;
const CONTAINMENT_THRESHOLD = 0.75;

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: npx tsx scripts/diagnose-quality.ts <memories-dir>");
    process.exit(1);
  }

  console.log(`\n=== Quality Diagnostic: ${dir} ===\n`);
  const memories = await readAllMemories(dir);
  console.log(`Total memories: ${memories.length}`);

  // Group by type
  const byType = new Map<string, typeof memories>();
  for (const m of memories) {
    if (!byType.has(m.type)) byType.set(m.type, []);
    byType.get(m.type)!.push(m);
  }

  console.log("\nBy type:");
  for (const [type, ms] of byType) {
    console.log(`  ${type}: ${ms.length}`);
  }

  // --- Vague content analysis ---
  console.log("\n--- Vague Content Analysis ---");
  const vague: typeof memories = [];
  const specDistribution = new Map<number, number>();
  for (const m of memories) {
    if (isVagueContent(m.content, m.impact)) vague.push(m);
    const spec = specificityScore(m.content);
    specDistribution.set(spec, (specDistribution.get(spec) ?? 0) + 1);
  }
  console.log(`Would be filtered as vague: ${vague.length} / ${memories.length} (${(vague.length / memories.length * 100).toFixed(1)}%)`);

  console.log("\nSpecificity score distribution (higher = more technical detail):");
  const sortedSpec = [...specDistribution.entries()].sort((a, b) => a[0] - b[0]);
  for (const [score, count] of sortedSpec) {
    const bar = "█".repeat(Math.round(count / memories.length * 50));
    console.log(`  score=${score}: ${count.toString().padStart(4)} ${bar}`);
  }

  if (vague.length > 0) {
    console.log("\nSample vague memories (first 5):");
    for (const m of vague.slice(0, 5)) {
      console.log(`  [${m.type}] ${m.title}`);
      console.log(`    content: ${m.content.slice(0, 120)}...`);
    }
  }

  // --- Duplicate analysis (within type) ---
  console.log("\n--- Duplicate Analysis (shingle Jaccard > 0.55) ---");
  let totalDups = 0;
  let totalSubsumed = 0;
  const dupPairs: Array<{ a: string; b: string; type: string; j: number; c: number }> = [];

  for (const [type, ms] of byType) {
    const shingleCache = ms.map((m) => shingles(m.content));
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const jac = jaccardSimilarity(shingleCache[i], shingleCache[j]);
        const [small, large] = shingleCache[i].size <= shingleCache[j].size
          ? [shingleCache[i], shingleCache[j]]
          : [shingleCache[j], shingleCache[i]];
        const cont = containmentSimilarity(small, large);

        if (jac > SHINGLE_DEDUP_THRESHOLD) {
          totalDups++;
          if (dupPairs.length < 10) {
            dupPairs.push({ a: ms[i].title, b: ms[j].title, type, j: jac, c: cont });
          }
        } else if (cont > CONTAINMENT_THRESHOLD) {
          totalSubsumed++;
          if (dupPairs.length < 10) {
            dupPairs.push({ a: ms[i].title, b: ms[j].title, type, j: jac, c: cont });
          }
        }
      }
    }
  }

  console.log(`Jaccard duplicate pairs: ${totalDups}`);
  console.log(`Containment-subsumed pairs: ${totalSubsumed}`);
  console.log(`Total redundant pairs: ${totalDups + totalSubsumed}`);

  if (dupPairs.length > 0) {
    console.log("\nSample duplicate pairs:");
    for (const p of dupPairs.slice(0, 10)) {
      console.log(`  [${p.type}] jaccard=${p.j.toFixed(2)} contain=${p.c.toFixed(2)}`);
      console.log(`    A: ${p.a}`);
      console.log(`    B: ${p.b}`);
    }
  }

  // --- Summary ---
  console.log("\n=== SUMMARY ===");
  const vagueRate = (vague.length / memories.length * 100).toFixed(1);
  const dupRate = ((totalDups + totalSubsumed) / memories.length * 100).toFixed(1);
  console.log(`Vague rate: ${vagueRate}% (${vague.length}/${memories.length})`);
  console.log(`Redundancy rate: ${dupRate}% of pairwise`);
  console.log(`These are memories the v2.2 algorithm would have blocked or merged.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
