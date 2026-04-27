/**
 * `ai-memory try` — no-API-key demo mode.
 *
 * Closes the npm-page → `npx ai-memory init` → "needs OPENAI_API_KEY" →
 * bounce funnel by giving first-time users a runnable end-to-end output
 * with zero credentials.
 *
 * Behaviour (locked by ADR 2026-04-26-post-v2.4-strategy.md, §v2.5-02):
 *   1. Locate the bundled `docs/assets/demo/scenario/` (3 hand-curated
 *      memories: 1 decision + 1 architecture + 1 convention across 2
 *      authors — see `docs/assets/demo/scenario/.ai-memory/`).
 *   2. Copy it into a fresh tmp dir under `os.tmpdir()`.
 *   3. Read all memories from the tmp store, filter to convention +
 *      decision (matching the `rules` command), generate AGENTS.md.
 *   4. Print the generated AGENTS.md to stdout, plus a "this is what
 *      `extract` + `rules` would produce against your real chat history"
 *      footer and explicit next-step commands.
 *   5. Clean up the tmp dir unless `--keep` is set.
 *
 * Deliberately does NOT reuse `runRules`:
 *   `runRules` reads cwd via `loadConfig()` and `config.output.dir`. We
 *   would have to `process.chdir()` into the tmp dir, which is brittle in
 *   async flows and leaks process state. Reusing the lower-level building
 *   blocks (`readAllMemories` + `writeAgentsMd`) keeps `try` a pure
 *   function over a passed-in directory.
 *
 * Deliberately does NOT touch the user's working directory:
 *   The point of `try` is "see what ai-memory does" without commitment.
 *   Writing AGENTS.md into the user's cwd would be an undeclared side
 *   effect. Everything happens in the tmp dir, which we delete.
 */

import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliOptions, ExtractedMemory } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import {
  AGENTS_MD_DEFAULT_PATH,
  writeAgentsMd,
} from "../rules/agents-md-writer.js";
import { c, printBanner, printError } from "../output/terminal.js";

// ---------- Scenario locator ----------

/**
 * Two installation layouts to support:
 *
 *   built (npm-installed):  node_modules/ai-memory-cli/dist/index.js
 *                           node_modules/ai-memory-cli/docs/assets/demo/scenario/
 *                           → relative ../docs/assets/demo/scenario from this file
 *
 *   dev (tsx src/...):       <project>/src/commands/try.ts
 *                           <project>/docs/assets/demo/scenario/
 *                           → relative ../../docs/assets/demo/scenario from this file
 *
 * We probe both candidates from `import.meta.url`. First one whose
 * `.ai-memory/` subdir actually exists wins.
 */
const SCENARIO_RELATIVE_PATHS = [
  // Built — single bundled `dist/index.js` lives one segment deeper than `src/commands/try.ts`.
  ["..", "docs", "assets", "demo", "scenario"],
  // Dev — `src/commands/try.ts` two segments deep under the package root.
  ["..", "..", "docs", "assets", "demo", "scenario"],
] as const;

export async function findBundledScenario(
  fromFileUrl: string = import.meta.url
): Promise<string | null> {
  // Defensive: any malformed file URL (cross-platform tests, callers
  // passing through arbitrary strings) should return null rather than
  // throw — the function's contract is "find it or report not found".
  let here: string;
  try {
    here = dirname(fileURLToPath(fromFileUrl));
  } catch {
    return null;
  }
  for (const segments of SCENARIO_RELATIVE_PATHS) {
    const candidate = join(here, ...segments);
    const marker = join(candidate, ".ai-memory");
    try {
      const s = await stat(marker);
      if (s.isDirectory()) return candidate;
    } catch {
      // try next layout
    }
  }
  return null;
}

// ---------- Pipeline pieces ----------

/**
 * Copies the bundled scenario into a fresh tmp dir.
 * Returns the absolute tmp path. Caller is responsible for cleanup.
 */
export async function bootstrapTryStore(scenarioDir: string): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), "ai-memory-try-"));
  await cp(scenarioDir, tmp, { recursive: true });
  return tmp;
}

/**
 * Reads memories from the tmp store, filters to the same set the `rules`
 * command would emit (convention + decision, status != resolved), writes
 * AGENTS.md into the same tmp dir, and returns the generated content
 * along with per-type counts.
 */
export async function generateAgentsMdFromStore(
  storeRoot: string,
  language: "en" | "zh" = "en"
): Promise<{
  agentsMdPath: string;
  content: string;
  conventions: number;
  decisions: number;
  architecture: number;
  totalMemories: number;
  authors: string[];
}> {
  const memoryDir = join(storeRoot, ".ai-memory");
  const all = await readAllMemories(memoryDir, undefined);

  const filtered = all.filter(
    (m: ExtractedMemory) =>
      (m.type === "convention" || m.type === "decision") &&
      m.status !== "resolved"
  );

  const outputPath = join(storeRoot, AGENTS_MD_DEFAULT_PATH);
  await writeAgentsMd(filtered, { language, outputPath });
  const content = await readFile(outputPath, "utf-8");

  const authors = [
    ...new Set(all.map((m) => m.author).filter((a): a is string => !!a)),
  ].sort();

  return {
    agentsMdPath: outputPath,
    content,
    conventions: filtered.filter((m) => m.type === "convention").length,
    decisions: filtered.filter((m) => m.type === "decision").length,
    architecture: all.filter((m) => m.type === "architecture").length,
    totalMemories: all.length,
    authors,
  };
}

// ---------- Output formatting ----------

const RULE = "─".repeat(70);

function fmtFlatPath(p: string): string {
  // The user typically copies tmp paths into a shell. Render them with
  // platform-appropriate separators (Node already does this), but quote
  // when the path contains spaces (Windows %TEMP% commonly does on
  // multi-word usernames).
  return /\s/.test(p) ? `"${p}"` : p;
}

function printHumanOutput(args: {
  tmpDir: string;
  result: Awaited<ReturnType<typeof generateAgentsMdFromStore>>;
  keep: boolean;
}): void {
  const { tmpDir, result, keep } = args;

  console.log(
    `[try] Bootstrapping a ${c.bold(String(result.totalMemories))}-memory demo store in ${c.dim(fmtFlatPath(tmpDir))}`
  );
  console.log(
    `      ${c.dim(
      `${result.decisions} decision · ${result.conventions} convention · ${result.architecture} architecture (across ${result.authors.length} authors: ${result.authors.join(", ")})`
    )}`
  );

  console.log("");
  console.log(
    `[try] Generated ${c.bold("AGENTS.md")} ${c.dim("(read by Codex / Cursor / Windsurf / Copilot / Amp at session start)")}`
  );
  console.log(c.dim(RULE));
  console.log(result.content.trimEnd());
  console.log(c.dim(RULE));

  console.log("");
  console.log(
    `${c.green("[+]")} ${c.bold("No API key was needed")} — this output came entirely from the bundled demo scenario.`
  );
  console.log(
    `    To get the same output from your real editor chat history:`
  );
  console.log("");
  console.log(`      ${c.cyan("export OPENAI_API_KEY=sk-...")}`);
  console.log(`      ${c.cyan("npx ai-memory-cli init --with-mcp")}`);
  console.log(`      ${c.cyan("npx ai-memory-cli extract")}`);
  console.log(`      ${c.cyan("npx ai-memory-cli rules --target agents-md")}`);

  console.log("");
  if (keep) {
    console.log(
      `[~] Kept tmp dir at ${c.bold(fmtFlatPath(tmpDir))}. Delete it manually when you're done.`
    );
  } else {
    console.log(
      `[~] Tmp dir cleaned up. ${c.dim("Use `ai-memory try --keep` to inspect the bundled scenario in place.")}`
    );
  }
}

// ---------- Entry point ----------

export async function runTry(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const scenarioDir = await findBundledScenario();
  if (!scenarioDir) {
    const msg =
      "ai-memory try: bundled demo scenario not found. " +
      "If you installed via npm, the package may be missing the " +
      "docs/assets/demo/scenario/ files — try reinstalling " +
      "`npm install -g ai-memory-cli@latest`.";
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: "scenario_not_found" }));
    } else {
      printError(msg);
    }
    return 1;
  }

  let tmpDir: string | null = null;
  try {
    tmpDir = await bootstrapTryStore(scenarioDir);
    const result = await generateAgentsMdFromStore(tmpDir, "en");

    const keep = opts.keep === true;

    if (opts.json) {
      console.log(
        JSON.stringify({
          ok: true,
          scenarioDir,
          tmpDir,
          kept: keep,
          conventions: result.conventions,
          decisions: result.decisions,
          architecture: result.architecture,
          totalMemories: result.totalMemories,
          authors: result.authors,
          // Path separator is informational; consumers should treat it
          // as opaque since OS conventions differ.
          agentsMdPath: result.agentsMdPath.split(sep).join("/"),
          agentsMdContent: result.content,
        })
      );
    } else {
      printHumanOutput({ tmpDir, result, keep });
    }

    if (!keep) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }

    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, error: msg }));
    } else {
      printError(`ai-memory try failed: ${msg}`);
    }
    // Best-effort cleanup on error path even without --keep, since a
    // half-written tmp dir is just garbage.
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    return 1;
  }
}
