/**
 * verify-agents-md.ts — fixture-drift guard for v2.5-07.
 *
 * The v2.5-07 evaluation pins the literal AGENTS.md text the agent saw
 * during a controlled run (`bench/agents-md-eval/controlled-repo/AGENTS.md`).
 * Future writer changes (column wrapping, section reordering, new "Why"
 * line, retitled sections) would silently invalidate prior scores by
 * changing the rule text the next replication-attempt sees.
 *
 * This script regenerates AGENTS.md from the bundled v2.5-02 demo
 * scenario via the same code path the npm package ships (the `try`
 * command's `generateAgentsMdFromStore` helper, called against the
 * same scenario dir), then diffs the result against the frozen fixture.
 * Any meaningful drift exits non-zero and tells the caller to:
 *
 *   - re-run the v2.5-07 evaluation against the new writer output, OR
 *   - restore the writer's previous behaviour, OR
 *   - update the frozen fixture and acknowledge prior scores are stale
 *     (re-spike per docs/agents-md-eval-spike-2026-04-27.md §6).
 *
 * Run: `npx tsx bench/agents-md-eval/scripts/verify-agents-md.ts`
 */

import { readFile, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findBundledScenario,
  generateAgentsMdFromStore,
} from "../../../src/commands/try.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FROZEN_PATH = resolve(HERE, "..", "controlled-repo", "AGENTS.md");

/**
 * Normalize so trivial run-to-run differences don't fail the check.
 * We keep this conservative — anything that could plausibly affect how
 * an agent reads / weights the rule text stays in.
 */
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+$/g, "")
    .trim();
}

async function main(): Promise<number> {
  const scenarioDir = await findBundledScenario();
  if (!scenarioDir) {
    console.error(
      "[verify-agents-md] could not locate bundled demo scenario; run from repo root with src/ present."
    );
    return 2;
  }

  const tmp = await mkdtemp(join(tmpdir(), "ai-memory-eval-verify-"));
  try {
    await cp(scenarioDir, tmp, { recursive: true });
    const result = await generateAgentsMdFromStore(tmp, "en");

    const generated = normalize(result.content);
    const frozen = normalize(await readFile(FROZEN_PATH, "utf-8"));

    if (generated === frozen) {
      console.log(
        `[verify-agents-md] OK — frozen fixture matches v2.5-02 writer output (${generated.length} chars).`
      );
      return 0;
    }

    console.error("[verify-agents-md] DRIFT DETECTED");
    console.error(
      "  Frozen fixture: bench/agents-md-eval/controlled-repo/AGENTS.md"
    );
    console.error("  Generator:      src/rules/agents-md-writer.ts (via try)");
    console.error("");
    console.error(
      "  The v2.5-02 AGENTS.md writer no longer produces the bytes pinned in"
    );
    console.error(
      "  the v2.5-07 controlled-repo. Per the v2.5-07 spike doc §6, you must:"
    );
    console.error("");
    console.error(
      "    1. Re-run the v2.5-07 eval against the new writer output, OR"
    );
    console.error("    2. Restore the previous writer behaviour, OR");
    console.error(
      "    3. Update the frozen fixture AND mark prior published scores stale."
    );
    console.error("");
    console.error("  Diff (frozen → generated):");

    // Cheap line-by-line diff — good enough for a CI signal. Full diff
    // is one PR-tool invocation away if the maintainer needs it.
    const a = frozen.split("\n");
    const b = generated.split("\n");
    const max = Math.max(a.length, b.length);
    let printed = 0;
    for (let i = 0; i < max && printed < 30; i++) {
      if (a[i] !== b[i]) {
        if (a[i] !== undefined) console.error(`    - ${a[i]}`);
        if (b[i] !== undefined) console.error(`    + ${b[i]}`);
        printed++;
      }
    }
    if (printed === 30) console.error("    … (more lines elided)");

    return 1;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[verify-agents-md] unexpected error:", err);
    process.exit(2);
  }
);
