/**
 * CCEB CLI entry. Invoked via `npm run bench:cceb` (live, costs LLM tokens)
 * or `npm run bench:cceb:dry` (no LLM calls — pure pipeline smoke test).
 *
 * Output:
 *   - stdout: human-readable Markdown scorecard
 *   - bench/cceb/out/scorecard.json: machine-readable scorecard
 *   - bench/cceb/out/scorecard.md:   same as stdout
 *
 * The defaults are tuned for "I want to see the latest baseline" — destination
 * paths are stable so a second run overwrites the first.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { loadFixtures } from "./loader.js";
import { runAllFixtures } from "./runner.js";
import { buildScorecard, renderScorecard } from "./scorer.js";

interface Args {
  dryRun: boolean;
  model?: string;
  outDir: string;
  fixturesDir: string;
  filter?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    fixturesDir: "",
    outDir: "",
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
      case "--fixtures":
        args.fixturesDir = argv[++i];
        break;
      case "--filter":
        args.filter = argv[++i];
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
CCEB — Cursor Conversation Extraction Benchmark

Usage:
  bench:cceb [options]

Options:
  --dry-run           Skip LLM calls; validate fixtures + score 0/0/0 (CI smoke).
  --model <id>        Override AI model (forwarded to extractMemories).
  --out-dir <path>    Where to write scorecard.json + scorecard.md (default: bench/cceb/out/).
  --fixtures <path>   Override fixtures directory (default: bench/cceb/fixtures/).
  --filter <substr>   Only run fixtures whose id contains <substr>.
  -h, --help          Show this message.
`);
}

// Mirror the fallback model that `extractor/llm.ts:resolveAiConfig` uses when
// no per-provider model env var is set. Keeping these in sync prevents the
// scorecard from labelling a run "openai (default)" when it actually called
// gpt-4o-mini — a known cosmetic artefact tracked since the v2.4 baseline.
const LLM_DEFAULT_MODEL = "gpt-4o-mini";

function detectModel(): string {
  if (process.env.AI_REVIEW_API_KEY) {
    return process.env.AI_REVIEW_MODEL ?? LLM_DEFAULT_MODEL;
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_MODEL ?? LLM_DEFAULT_MODEL;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_MODEL ?? LLM_DEFAULT_MODEL;
  }
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL) {
    return process.env.OLLAMA_MODEL ?? "llama3.2";
  }
  if (process.env.LM_STUDIO_BASE_URL || process.env.LM_STUDIO_MODEL) {
    return process.env.LM_STUDIO_MODEL ?? "default";
  }
  return "<no AI key detected>";
}

async function readToolVersion(): Promise<string> {
  // Read package.json from the project root (two dirs up from this file).
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, "../../package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { name: string; version: string };
  return `${pkg.name}@${pkg.version}`;
}

async function main(): Promise<number> {
  const here = dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(process.argv.slice(2));
  const fixturesDir = args.fixturesDir
    ? resolve(args.fixturesDir)
    : resolve(here, "fixtures");
  const outDir = args.outDir ? resolve(args.outDir) : resolve(here, "out");

  const allFixtures = await loadFixtures(fixturesDir);
  const fixtures = args.filter
    ? allFixtures.filter((f) => f.id.includes(args.filter!))
    : allFixtures;

  if (fixtures.length === 0) {
    process.stderr.write(`No fixtures matched filter ${JSON.stringify(args.filter)}\n`);
    return 2;
  }

  if (!args.dryRun && detectModel().startsWith("<no AI key")) {
    process.stderr.write(
      "No AI API key found. Set AI_REVIEW_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY,\n" +
        "or pass --dry-run to validate the pipeline without LLM calls.\n"
    );
    return 2;
  }

  const toolVersion = await readToolVersion();
  // Reported model takes the explicit --model override if set, otherwise the
  // env-detected default. Without this the scorecard could mis-label a
  // baseline (e.g. "openai (default)" when the run actually used
  // gpt-4o-mini), which is the kind of error that compounds over time.
  const model = args.dryRun
    ? "<dry-run>"
    : (args.model ?? detectModel());
  const ranAt = new Date().toISOString();
  const start = performance.now();

  process.stderr.write(
    `CCEB: ${fixtures.length} fixture(s), mode=${args.dryRun ? "dry-run" : "live"}, model=${model}\n`
  );

  const results = await runAllFixtures(fixtures, {
    dryRun: args.dryRun,
    model: args.model,
    onProgress: ({ index, total, fixture, score }) => {
      const tag = score.score.error
        ? "ERR"
        : score.score.perfect
          ? "OK "
          : score.score.f1 >= 0.5
            ? "..."
            : "!! ";
      process.stderr.write(
        `  [${index + 1}/${total}] ${tag} ${fixture.id} ` +
          `(tp=${score.score.tp} fp=${score.score.fp} fn=${score.score.fn} f1=${(score.score.f1 * 100).toFixed(0)}%)\n`
      );
    },
  });

  const totalSeconds = (performance.now() - start) / 1000;
  const card = buildScorecard(fixtures, results, {
    ranAt,
    toolVersion,
    model,
    totalSeconds,
    dryRun: args.dryRun,
  });

  const md = renderScorecard(card);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "scorecard.md"), md, "utf-8");
  await writeFile(join(outDir, "scorecard.json"), JSON.stringify(card, null, 2), "utf-8");
  process.stdout.write(md);

  // Exit code: 0 if no errors and overall F1 > 0 (sanity), 1 if all fixtures
  // errored (almost certainly a config / network issue worth surfacing).
  if (card.error_count === card.fixture_count && card.fixture_count > 0) return 1;
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`CCEB failed: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  });
