/**
 * CCEB runner: glue between fixtures and the real `extractMemories` pipeline.
 *
 * Keeps two side-effects out of the `runFixture` core:
 *   - filesystem (handled by the loader)
 *   - LLM key resolution (done once at startup in `run.ts`)
 *
 * Errors are converted to a `score.error` string and the fixture continues
 * to the next one. The aggregate scorecard counts errored fixtures
 * separately so a single LLM hiccup doesn't poison the whole run.
 */

import type { CliOptions, Conversation, ExtractedMemory } from "../../src/types.js";
import { extractMemories } from "../../src/extractor/ai-extractor.js";
import { scoreFixture, type FixtureScoreResult } from "./scorer.js";
import type { Fixture } from "./types.js";

export interface RunOptions {
  /** When true, skip the LLM call entirely and treat every fixture as if
   *  the extractor returned []. Used for CI smoke tests. */
  dryRun: boolean;
  /** Optional model override (passed through to extractMemories). */
  model?: string;
  /** Optional progress callback for CLI rendering. */
  onProgress?: (info: { index: number; total: number; fixture: Fixture; score: FixtureScoreResult }) => void;
}

/**
 * Build the `Conversation` shape that `extractMemories` expects from a
 * CCEB fixture. We synthesise plausible but unique source ids so the
 * extractor's own dedup-by-source logic doesn't accidentally drop a memory
 * across multiple fixtures in the same run.
 */
function fixtureToConversation(fixture: Fixture): Conversation {
  // Use a deterministic but unique id derived from the fixture id so that
  // the extractor's `sourceId` field carries something traceable.
  const stableId = `cceb-${fixture.id.replace(/[^a-z0-9]/gi, "-")}`;
  return {
    meta: {
      id: stableId,
      source: "cursor",
      filePath: `<cceb>/${fixture.id}`,
      title: fixture.conversation.title,
      modifiedAt: Date.UTC(2026, 3, 25, 0, 0, 0), // 2026-04-25 fixed for determinism
      turnCount: fixture.conversation.turns.length,
    },
    turns: fixture.conversation.turns,
  };
}

async function runFixtureExtraction(
  fixture: Fixture,
  opts: RunOptions
): Promise<{ memories: ExtractedMemory[]; latencyMs: number; error?: string }> {
  if (opts.dryRun) return { memories: [], latencyMs: 0 };

  const cliOpts: CliOptions = {
    command: "extract",
    types: ["decision", "architecture", "convention", "todo", "issue"],
    verbose: false,
  };
  const conversation = fixtureToConversation(fixture);

  const start = performance.now();
  try {
    const result = await extractMemories(conversation, cliOpts, 0, opts.model);
    return {
      memories: result.memories,
      latencyMs: performance.now() - start,
    };
  } catch (err) {
    return {
      memories: [],
      latencyMs: performance.now() - start,
      error: (err as Error).message ?? String(err),
    };
  }
}

/**
 * Run the entire fixture suite sequentially. Sequential (not parallel) to
 * stay polite to rate-limited LLM endpoints and to make latency numbers
 * meaningful.
 */
export async function runAllFixtures(
  fixtures: Fixture[],
  opts: RunOptions
): Promise<FixtureScoreResult[]> {
  const results: FixtureScoreResult[] = [];
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const { memories, latencyMs, error } = await runFixtureExtraction(fixture, opts);
    const result = scoreFixture(fixture, memories, { latencyMs, error });
    results.push(result);
    opts.onProgress?.({ index: i, total: fixtures.length, fixture, score: result });
  }
  return results;
}
