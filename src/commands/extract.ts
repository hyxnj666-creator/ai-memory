import type {
  CliOptions,
  Source,
  ConversationMeta,
  ExtractedMemory,
  ExtractionState,
} from "../types.js";
import { getConversationState } from "../types.js";
import { detectSources, createSource } from "../sources/detector.js";
import { extractMemories } from "../extractor/ai-extractor.js";
import { writeMemories, hasMemoryFile } from "../store/memory-store.js";
import { loadState, saveState, markProcessed } from "../store/state.js";
import { loadConfig } from "../config.js";
import {
  printBanner,
  printDetecting,
  printSourceFound,
  printSourceNotFound,
  printExtracting,
  printSummary,
  printNoConversations,
  printError,
} from "../output/terminal.js";

const CONCURRENCY = 5;

export async function runExtract(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const minTurns = config.extract.minConversationLength;
  const ignoreList = new Set(config.extract.ignoreConversations ?? []);
  // Types: CLI --type overrides config, config overrides default
  const effectiveTypes = opts.types ?? (config.extract.types.length > 0 ? config.extract.types : undefined);

  // 1. Resolve sources (honor sources.*.enabled from config)
  const sources = await resolveSources(opts, config.sources);
  if (sources.length === 0) {
    printError("No AI editor conversations found on this machine.");
    return 1;
  }

  // 2. List conversations
  let allConversations: ConversationMeta[] = [];
  for (const source of sources) {
    const convos = await source.listConversations();
    allConversations.push(...convos);
  }

  // 3. Sort newest-first (consistent with `list` numbering), then filter
  allConversations.sort((a, b) => b.modifiedAt - a.modifiedAt);
  const state = await loadState();
  allConversations = await filterConversations(
    allConversations,
    opts,
    state,
    outputDir,
    ignoreList
  );

  if (allConversations.length === 0) {
    if (!opts.json) printNoConversations();
    return 0;
  }

  // dry-run: just list what would be processed — no LLM, no state changes
  if (opts.dryRun) {
    if (opts.json) {
      console.log(JSON.stringify({ dryRun: true, conversations: allConversations.map((c) => c.title) }));
    } else {
      console.log(`\n[dry-run] ${allConversations.length} conversations would be processed:\n`);
      allConversations.forEach((c, i) => {
        const date = new Date(c.modifiedAt).toISOString().slice(0, 10);
        console.log(`  ${i + 1}. "${c.title}" (${date}, ${c.turnCount} turns)`);
      });
    }
    return 0;
  }

  if (!opts.json) printExtracting(allConversations.length);
  const breakdown: Record<string, number> = {};
  let totalMemories = 0;
  const total = allConversations.length;

  // 4. Process in parallel batches of CONCURRENCY
  for (let i = 0; i < allConversations.length; i += CONCURRENCY) {
    const batch = allConversations.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (meta) => {
        const source = sources.find((s) => s.type === meta.source)!;
        const idx = allConversations.indexOf(meta) + 1;
        const prevState = getConversationState(state, meta.id);
        const fromTurn = opts.incremental && prevState ? prevState.turnCount : 0;

        // Load conversation
        let conversation;
        try {
          conversation = await source.loadConversation(meta);
        } catch (err) {
          if (!opts.json) console.log(`   [${idx}/${total}] "${meta.title.slice(0, 48)}" — load error: ${err}`);
          return;
        }

        const newTurnCount = conversation.turns.length;

        // Skip if not enough turns (use config threshold)
        if (newTurnCount < minTurns) {
          if (!opts.json) console.log(`   [${idx}/${total}] "${meta.title.slice(0, 48)}" — skipped (too short)`);
          markProcessed(state, meta.id, newTurnCount);
          await saveState(state);
          return;
        }

        // Skip if no new turns since last extraction
        if (opts.incremental && prevState && newTurnCount <= prevState.turnCount) {
          if (!opts.json) console.log(`   [${idx}/${total}] "${meta.title.slice(0, 48)}" — no new turns, skipped`);
          return;
        }

        const dateStr = new Date(meta.modifiedAt).toISOString().slice(0, 10);
        const incrementalNote = fromTurn > 0 ? ` (+${newTurnCount - fromTurn} new turns)` : "";
        if (!opts.json) {
          console.log(`   [${idx}/${total}] "${meta.title.slice(0, 45)}" (${dateStr})${incrementalNote} — extracting...`);
        }

        // Extract memories (pass effective types and config model)
        const extractOpts = { ...opts, types: effectiveTypes };
        let memories: ExtractedMemory[];
        try {
          memories = await extractMemories(conversation, extractOpts, fromTurn, config.model || undefined);
        } catch (err) {
          if (!opts.json) console.log(`   [${idx}/${total}] "${meta.title.slice(0, 45)}" — error: ${err}`);
          return;
        }

        // Write files (with configured language)
        if (memories.length > 0) {
          await writeMemories(memories, outputDir, config.output.language);
        }

        // Save state immediately after each conversation (mutex-serialised)
        markProcessed(state, meta.id, newTurnCount);
        await saveState(state);

        // Accumulate stats
        for (const m of memories) {
          breakdown[m.type] = (breakdown[m.type] || 0) + 1;
        }
        totalMemories += memories.length;

        if (!opts.json) {
          if (memories.length === 0) {
            console.log(`   [${idx}/${total}] "${meta.title.slice(0, 45)}" — no knowledge found`);
          } else {
            const parts = Object.entries(
              memories.reduce<Record<string, number>>((acc, m) => {
                acc[m.type] = (acc[m.type] || 0) + 1;
                return acc;
              }, {})
            ).map(([k, v]) => `${v} ${k}`).join(", ");
            console.log(`   [${idx}/${total}] "${meta.title.slice(0, 45)}" — [+] ${parts}`);
          }
        }
      })
    );
  }

  if (totalMemories === 0) {
    if (!opts.json) printNoConversations();
    return 0;
  }

  if (opts.json) {
    console.log(JSON.stringify({ total: totalMemories, breakdown }));
  } else {
    printSummary(totalMemories, outputDir, breakdown);
  }

  return 0;
}

async function resolveSources(
  opts: CliOptions,
  sourcesConfig?: { cursor: { enabled: boolean }; claudeCode: { enabled: boolean } }
): Promise<Source[]> {
  if (opts.source) {
    const source = createSource(opts.source);
    const ok = await source.detect();
    if (!ok) {
      printError(`Source "${opts.source}" not available on this machine.`);
      return [];
    }
    return [source];
  }

  if (!opts.json) printDetecting();
  const { available, unavailable } = await detectSources();

  // Filter by sources.*.enabled from config
  const filtered = available.filter((s) => {
    if (!sourcesConfig) return true;
    if (s.type === "cursor") return sourcesConfig.cursor.enabled !== false;
    if (s.type === "claude-code") return sourcesConfig.claudeCode.enabled !== false;
    return true;
  });

  if (!opts.json) {
    for (const s of filtered) {
      const convos = await s.listConversations();
      printSourceFound(s.type === "cursor" ? "Cursor" : "Claude Code", convos.length);
    }
    for (const t of unavailable) {
      printSourceNotFound(t === "cursor" ? "Cursor" : "Claude Code");
    }
  }

  return filtered;
}

async function filterConversations(
  conversations: ConversationMeta[],
  opts: CliOptions,
  state: ExtractionState,
  outputDir: string,
  ignoreList: Set<string>
): Promise<ConversationMeta[]> {
  let filtered = conversations;

  // Remove explicitly ignored conversations
  if (ignoreList.size > 0) {
    filtered = filtered.filter((c) => !ignoreList.has(c.id) && !ignoreList.has(c.title));
  }

  // --pick 3  or  --pick 1,4,7  (1-based, relative to sorted list)
  if (opts.pick) {
    const indices = new Set(opts.pick.split(",").map((s) => parseInt(s.trim(), 10) - 1));
    filtered = filtered.filter((_, i) => indices.has(i));
  }

  // --id b5677be8  (prefix match)
  if (opts.pickId) {
    const prefix = opts.pickId.toLowerCase();
    filtered = filtered.filter((c) => c.id.toLowerCase().startsWith(prefix));
  }

  // --since
  if (opts.since) {
    const sinceTs = parseSince(opts.since);
    if (sinceTs) filtered = filtered.filter((c) => c.modifiedAt >= sinceTs);
  }

  // --incremental
  if (opts.incremental) {
    const results = await Promise.all(
      filtered.map(async (c) => {
        const prev = getConversationState(state, c.id);
        if (!prev) return true;
        if (c.modifiedAt > prev.processedAt) return true;
        const fileExists = await hasMemoryFile(c, outputDir);
        return !fileExists;
      })
    );
    filtered = filtered.filter((_, i) => results[i]);
  }

  return filtered;
}

function parseSince(since: string): number | null {
  // Support: "3 days ago", "2h ago", "1 week ago"
  const match = since.match(/^(\d+)\s*(day|days|d|week|weeks|w|hour|hours|h)\s*ago$/i);
  if (match) {
    const n = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    let ms: number;
    if (unit.startsWith("h")) ms = n * 60 * 60 * 1000;
    else if (unit.startsWith("w")) ms = n * 7 * 24 * 60 * 60 * 1000;
    else ms = n * 24 * 60 * 60 * 1000;
    return Date.now() - ms;
  }
  const ts = Date.parse(since);
  return isNaN(ts) ? null : ts;
}
