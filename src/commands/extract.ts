import type {
  CliOptions,
  Source,
  ConversationMeta,
  ExtractedMemory,
  ExtractionState,
} from "../types.js";
import { getConversationState } from "../types.js";
import { detectSources, createSource, sourceLabel } from "../sources/detector.js";
import { extractMemories, type QualityStats } from "../extractor/ai-extractor.js";
import { writeMemories, hasMemoryFile, type WriteResult } from "../store/memory-store.js";
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
  printNoMemoriesExtracted,
  printError,
  printWarning,
} from "../output/terminal.js";
import { resolveAuthor } from "../utils/author.js";

const CONCURRENCY = 5;

export async function runExtract(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const minTurns = config.extract.minConversationLength;
  const ignoreList = new Set(config.extract.ignoreConversations ?? []);
  // Types: CLI --type overrides config, config overrides default
  const effectiveTypes = opts.types ?? (config.extract.types.length > 0 ? config.extract.types : undefined);

  // 0. Resolve author
  const author = await resolveAuthor(config, opts.author);
  if (!opts.json) console.log(`Extracting as: ${author}\n`);

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
  const state = await loadState(outputDir);
  allConversations = await filterConversations(
    allConversations,
    opts,
    state,
    outputDir,
    ignoreList,
    author
  );

  if (allConversations.length === 0) {
    if (!opts.json) {
      if (opts.pick || opts.pickId || opts.since || opts.incremental) {
        printNoConversations();
      } else {
        printError("No AI editor conversations found on this machine.");
      }
    }
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
  let errorCount = 0;
  let totalQuality: QualityStats = { total: 0, kept: 0, filteredShort: 0, filteredDuplicate: 0 };
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
          errorCount++;
          return;
        }

        const newTurnCount = conversation.turns.length;

        // Skip if not enough turns (use config threshold)
        if (newTurnCount < minTurns) {
          if (!opts.json) console.log(`   [${idx}/${total}] "${meta.title.slice(0, 48)}" — skipped (too short)`);
          markProcessed(state, meta.id, newTurnCount);
          await saveState(state, outputDir);
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

        const extractOpts = { ...opts, types: effectiveTypes };
        let memories: ExtractedMemory[];
        try {
          const result = await extractMemories(conversation, extractOpts, fromTurn, config.model || undefined);
          memories = result.memories;
          totalQuality.total += result.qualityStats.total;
          totalQuality.kept += result.qualityStats.kept;
          totalQuality.filteredShort += result.qualityStats.filteredShort;
          totalQuality.filteredDuplicate += result.qualityStats.filteredDuplicate;
        } catch (err) {
          if (!opts.json) console.log(`   [${idx}/${total}] "${meta.title.slice(0, 45)}" — error: ${err}`);
          errorCount++;
          return;
        }

        // Attach author to each memory
        for (const m of memories) m.author = author;

        // Write files (with configured language, author subdirectory)
        if (memories.length > 0) {
          await writeMemories(memories, outputDir, config.output.language, { force: opts.force, author });
        }

        // Save state immediately after each conversation (mutex-serialised)
        markProcessed(state, meta.id, newTurnCount);
        await saveState(state, outputDir);

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
    if (!opts.json) {
      if (errorCount > 0 && errorCount >= total) {
        printError(`All ${errorCount} conversation(s) failed. Check your API key and network.`);
      } else if (errorCount > 0) {
        printWarning(`${errorCount} conversation(s) failed, remaining had no extractable knowledge.`);
      } else {
        printNoMemoriesExtracted(total);
      }
    }
    return errorCount > 0 ? 1 : 0;
  }

  const qualityDropped = totalQuality.filteredShort + totalQuality.filteredDuplicate;
  if (opts.json) {
    console.log(JSON.stringify({ total: totalMemories, breakdown, qualityFiltered: qualityDropped }));
  } else {
    printSummary(totalMemories, outputDir, breakdown);
    if (qualityDropped > 0) {
      console.log(`   (${qualityDropped} low-quality filtered: ${totalQuality.filteredShort} too short, ${totalQuality.filteredDuplicate} title≈content)`);
    }
  }

  return 0;
}

async function resolveSources(
  opts: CliOptions,
  sourcesConfig?: {
    cursor: { enabled: boolean; projectName?: string };
    claudeCode: { enabled: boolean };
    windsurf?: { enabled: boolean };
    copilot?: { enabled: boolean };
  }
): Promise<Source[]> {
  const projectName = sourcesConfig?.cursor?.projectName;
  if (opts.source) {
    const source = createSource(opts.source, projectName);
    const ok = await source.detect();
    if (!ok) {
      printError(`Source "${opts.source}" not available on this machine.`);
      return [];
    }
    return [source];
  }

  if (!opts.json) printDetecting();
  const { available, unavailable } = await detectSources(projectName);

  const filtered = available.filter((s) => {
    if (!sourcesConfig) return true;
    if (s.type === "cursor") return sourcesConfig.cursor.enabled !== false;
    if (s.type === "claude-code") return sourcesConfig.claudeCode.enabled !== false;
    if (s.type === "windsurf") return sourcesConfig.windsurf?.enabled !== false;
    if (s.type === "copilot") return sourcesConfig.copilot?.enabled !== false;
    return true;
  });

  if (!opts.json) {
    for (const s of filtered) {
      const convos = await s.listConversations();
      printSourceFound(sourceLabel(s.type), convos.length);
    }
    for (const t of unavailable) {
      printSourceNotFound(sourceLabel(t));
    }
  }

  return filtered;
}

async function filterConversations(
  conversations: ConversationMeta[],
  opts: CliOptions,
  state: ExtractionState,
  outputDir: string,
  ignoreList: Set<string>,
  author?: string
): Promise<ConversationMeta[]> {
  let filtered = conversations;

  // Remove explicitly ignored conversations
  if (ignoreList.size > 0) {
    filtered = filtered.filter((c) => !ignoreList.has(c.id) && !ignoreList.has(c.title));
  }

  // --pick 3  or  --pick 1,4,7  (1-based, relative to sorted list)
  if (opts.pick) {
    const raw = opts.pick.split(",").map((s) => s.trim());
    const parsed = raw.map((s) => parseInt(s, 10));
    const invalid = raw.filter((s, i) => isNaN(parsed[i]) || parsed[i] < 1);
    if (invalid.length > 0) {
      printWarning(`Invalid --pick value: ${invalid.join(", ")}. Expected positive integers (1-based).`);
      return [];
    }
    const outOfRange = parsed.filter((n) => n > filtered.length);
    if (outOfRange.length > 0) {
      printWarning(`--pick index ${outOfRange.join(", ")} out of range (max: ${filtered.length}). Run "ai-memory list" to see available conversations.`);
    }
    const indices = new Set(parsed.map((n) => n - 1));
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
    if (sinceTs === null) {
      printWarning(`Cannot parse --since "${opts.since}". Expected: "3 days ago", "2 weeks ago", or ISO date.`);
      return [];
    }
    filtered = filtered.filter((c) => c.modifiedAt >= sinceTs);
  }

  // --incremental
  if (opts.incremental) {
    const results = await Promise.all(
      filtered.map(async (c) => {
        const prev = getConversationState(state, c.id);
        if (!prev) return true;
        if (c.modifiedAt > prev.processedAt) return true;
        const fileExists = await hasMemoryFile(c, outputDir, author ?? undefined);
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
