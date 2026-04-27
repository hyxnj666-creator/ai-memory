/**
 * LongMemEval-50 CLI entry. Run via `npm run bench:longmemeval`.
 *
 * Output:
 *   - stdout: human-readable Markdown report
 *   - bench/longmemeval/out/scorecard.json: machine-readable scorecard
 *   - bench/longmemeval/out/scorecard.md:   same as stdout
 *
 * Maintainer flow (see bench/longmemeval/README.md for the full runbook):
 *   1. Download longmemeval_s_cleaned.json (one-time).
 *   2. Run select-questions.ts (one-time per dataset version).
 *   3. Run this script with OPENAI_API_KEY set.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { loadFromManifest, readManifest } from "./loader.js";
import { runAllSamples } from "./runner.js";
import type {
  LongMemEvalScorecard,
  LongMemEvalType,
  QuestionScore,
} from "./types.js";

interface Args {
  dryRun: boolean;
  model?: string;
  outDir: string;
  dataPath: string;
  manifestPath: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    outDir: "",
    dataPath: process.env.LONGMEMEVAL_DATA ?? "",
    manifestPath: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--model":
        args.model = argv[++i];
        break;
      case "--out-dir":
        args.outDir = argv[++i];
        break;
      case "--data":
        args.dataPath = argv[++i];
        break;
      case "--manifest":
        args.manifestPath = argv[++i];
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        process.stderr.write(`Unknown arg: ${a}\nUse --help for usage.\n`);
        process.exit(2);
    }
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(`
LongMemEval-50 — apples-to-apples shield against runtime memory benchmarks.

Usage:
  bench:longmemeval [options]

Options:
  --dry-run             Skip LLM calls; validate pipeline (CI smoke).
  --model <id>          Override AI model (forwarded to extractMemories).
  --data <path>         Path to longmemeval_s_cleaned.json (or set $LONGMEMEVAL_DATA).
  --manifest <path>     Path to selected-questions.json (default: bench/longmemeval/selected-questions.json).
  --out-dir <path>      Where to write scorecard.json + scorecard.md (default: bench/longmemeval/out/).
  -h, --help            Show this message.

See bench/longmemeval/README.md for the full maintainer runbook + spike doc
links. The headline number is "X / 50 answer-supporting evidence preserved
in extracted memories" (NOT LongMemEval native QA correctness).
`);
}

const LLM_DEFAULT_MODEL = "gpt-4o-mini";

function detectModel(): string {
  if (process.env.AI_REVIEW_API_KEY) return process.env.AI_REVIEW_MODEL ?? LLM_DEFAULT_MODEL;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_MODEL ?? LLM_DEFAULT_MODEL;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_MODEL ?? LLM_DEFAULT_MODEL;
  return "<no AI key detected>";
}

async function readToolVersion(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, "../../package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { name: string; version: string };
  return `${pkg.name}@${pkg.version}`;
}

function aggregateByType(
  scores: QuestionScore[],
): LongMemEvalScorecard["by_type"] {
  const map = new Map<LongMemEvalType, { n: number; full: number; partial: number }>();
  for (const s of scores) {
    if (s.error) continue;
    const t = s.question_type;
    if (!map.has(t)) map.set(t, { n: 0, full: 0, partial: 0 });
    const cell = map.get(t)!;
    cell.n += 1;
    if (s.full_evidence) cell.full += 1;
    if (s.partial_evidence) cell.partial += 1;
  }
  return [...map.entries()].map(([type, cell]) => ({
    type,
    n: cell.n,
    full: cell.full,
    partial: cell.partial,
    rate: cell.n > 0 ? cell.full / cell.n : 0,
  }));
}

function renderMarkdown(card: LongMemEvalScorecard): string {
  const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : "—");
  const lines: string[] = [];
  lines.push(`# LongMemEval-50 scorecard`);
  lines.push("");
  lines.push(`- **Tool version:** \`${card.tool_version}\``);
  lines.push(`- **Model:** \`${card.model}\``);
  lines.push(`- **Dataset:** \`${card.dataset_path}\``);
  lines.push(`- **Ran at:** ${card.ran_at}`);
  lines.push(`- **Total seconds:** ${card.total_seconds.toFixed(1)}`);
  lines.push("");
  lines.push(
    `## Headline: **${card.full_evidence_count} / ${card.question_count}** answer-supporting evidence preserved`,
  );
  lines.push("");
  lines.push(
    `(Plus ${card.partial_evidence_count} partial-evidence questions reported separately. ` +
      `${card.error_count} errored extractions excluded from the headline.)`,
  );
  lines.push("");
  lines.push(
    `> **NOT** LongMemEval native QA-correctness — this is evidence-preservation under our literal-token rubric. See \`docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md\` §4.3.`,
  );
  lines.push("");
  lines.push(`## Per-type breakdown`);
  lines.push("");
  lines.push(`| Type | n | Full | Partial | Full rate |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  for (const row of card.by_type) {
    lines.push(
      `| ${row.type} | ${row.n} | ${row.full} | ${row.partial} | ${pct(row.full, row.n)} |`,
    );
  }
  lines.push("");
  lines.push(`## Per-question detail`);
  lines.push("");
  lines.push(`| question_id | type | turns | extracted | full | partial | matched/total |`);
  lines.push(`|---|---|---:|---:|:-:|:-:|---|`);
  for (const s of card.by_question) {
    const total = s.answer_key_tokens.length;
    const matched = s.matched_tokens.length;
    lines.push(
      `| ${s.question_id} | ${s.question_type} | ${s.session_turn_count} | ${s.extracted_count} | ${s.full_evidence ? "✓" : ""} | ${s.partial_evidence ? "~" : ""} | ${matched}/${total} |`,
    );
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<number> {
  const here = dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = args.manifestPath
    ? resolve(args.manifestPath)
    : resolve(here, "selected-questions.json");
  const outDir = args.outDir ? resolve(args.outDir) : resolve(here, "out");

  if (!args.dryRun && !args.dataPath) {
    process.stderr.write(
      "LongMemEval dataset path required. Set $LONGMEMEVAL_DATA or pass --data.\n" +
        "Download instructions: bench/longmemeval/README.md\n",
    );
    return 2;
  }

  if (!args.dryRun && detectModel().startsWith("<no AI key")) {
    process.stderr.write(
      "No AI API key. Set OPENAI_API_KEY (or AI_REVIEW_API_KEY / ANTHROPIC_API_KEY)\n" +
        "or pass --dry-run to validate the pipeline without LLM calls.\n",
    );
    return 2;
  }

  // In dry-run mode, the dataset / manifest may legitimately not exist
  // yet (e.g. the maintainer is still on download step 1). Bail out
  // cleanly with a 0 exit so CI keeps green.
  let samples;
  if (args.dryRun && !args.dataPath) {
    process.stdout.write(
      "[dry-run] No dataset path provided; nothing to score. Pipeline shape OK.\n",
    );
    return 0;
  }
  try {
    const manifest = readManifest(manifestPath);
    samples = loadFromManifest(args.dataPath, manifest);
  } catch (err) {
    if (args.dryRun) {
      process.stdout.write(`[dry-run] Skipping: ${(err as Error).message}\n`);
      return 0;
    }
    throw err;
  }

  if (samples.length !== 50) {
    process.stderr.write(
      `Expected 50 samples after manifest filter, got ${samples.length}. ` +
        `Manifest may be out of sync with dataset — re-run select-questions.ts.\n`,
    );
    return 3;
  }

  const toolVersion = await readToolVersion();
  const model = args.dryRun
    ? "<dry-run>"
    : args.model ?? detectModel();
  const startedAt = Date.now();
  process.stderr.write(`LongMemEval-50: ${samples.length} samples, model=${model}\n`);

  const scores = await runAllSamples(samples, {
    dryRun: args.dryRun,
    model: args.model,
    onProgress: ({ index, total, sample, score }) => {
      const flag = score.error ? "ERR" : score.full_evidence ? "✓" : score.partial_evidence ? "~" : "·";
      process.stderr.write(
        `  [${index + 1}/${total}] ${flag} ${sample.question_id} (${sample.question_type})\n`,
      );
    },
  });

  const totalSec = (Date.now() - startedAt) / 1000;
  const card: LongMemEvalScorecard = {
    ran_at: new Date(startedAt).toISOString(),
    tool_version: toolVersion,
    model,
    dataset_path: args.dataPath || "<dry-run>",
    question_count: samples.length,
    full_evidence_count: scores.filter((s) => !s.error && s.full_evidence).length,
    partial_evidence_count: scores.filter((s) => !s.error && s.partial_evidence).length,
    error_count: scores.filter((s) => s.error).length,
    by_type: aggregateByType(scores),
    by_question: scores,
    total_seconds: totalSec,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "scorecard.json"), JSON.stringify(card, null, 2));
  const md = renderMarkdown(card);
  await writeFile(resolve(outDir, "scorecard.md"), md);
  process.stdout.write(md);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`bench:longmemeval failed: ${(err as Error).stack ?? err}\n`);
    process.exit(1);
  });
