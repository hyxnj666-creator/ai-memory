/**
 * Bootstrap script run *once* by the maintainer after they download
 * `longmemeval_s_cleaned.json`. Generates `selected-questions.json` —
 * the deterministic 50-id manifest that pins the v2.5-08 evaluation.
 *
 * Run with:
 *
 *   tsx bench/longmemeval/select-questions.ts \
 *     --data /path/to/longmemeval_s_cleaned.json \
 *     --out  bench/longmemeval/selected-questions.json
 *
 * If `--out` already exists, the script refuses to overwrite without
 * `--force`. This is paranoia: the manifest is the apples-to-apples
 * pin between releases; clobbering it silently invalidates prior
 * baselines.
 */

import fs from "node:fs";
import path from "node:path";
import { selectQuestions, readDataset, sha256OfFile } from "./loader.js";
import type { SelectedManifest } from "./types.js";
import expectedDist from "./expected-distribution.json" with { type: "json" };

interface CliArgs {
  data: string;
  out: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    data: "",
    out: "bench/longmemeval/selected-questions.json",
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--data") args.data = argv[++i] ?? "";
    else if (a === "--out") args.out = argv[++i] ?? args.out;
    else if (a === "--force") args.force = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: tsx bench/longmemeval/select-questions.ts --data <dataset.json> [--out <out.json>] [--force]",
      );
      process.exit(0);
    }
  }
  if (!args.data) {
    console.error("--data <path-to-longmemeval_s_cleaned.json> is required");
    process.exit(1);
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (fs.existsSync(args.out) && !args.force) {
    console.error(
      `Refusing to overwrite ${args.out}. Re-running this script regenerates the\n` +
        `manifest, which silently invalidates any baseline that referenced the prior\n` +
        `selection. If you really mean it (e.g., upstream re-cleaned the dataset and\n` +
        `we are re-baselining anyway), pass --force.`,
    );
    process.exit(2);
  }

  const samples = readDataset(args.data);
  const sha = sha256OfFile(args.data);
  const distribution = expectedDist.distribution as Record<string, number>;

  const { ids } = selectQuestions(samples, distribution);
  if (ids.length !== expectedDist.total) {
    console.error(
      `selectQuestions returned ${ids.length} ids but expected-distribution.total = ${expectedDist.total}`,
    );
    process.exit(3);
  }

  const manifest: SelectedManifest = {
    source_dataset: path.basename(args.data),
    generated_at: new Date().toISOString(),
    source_sha256: sha,
    distribution,
    question_ids: ids,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Wrote ${args.out}: ${ids.length} ids selected from ${path.basename(args.data)}`);
  console.log(`  source sha256: ${sha}`);
  console.log("  per-type counts:");
  for (const [t, n] of Object.entries(distribution)) {
    console.log(`    ${t}: ${n}`);
  }
}

main();
