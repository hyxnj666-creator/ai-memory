import { watch } from "node:fs/promises";
import { dirname } from "node:path";
import type { CliOptions, ConversationMeta, Source } from "../types.js";
import { getConversationState } from "../types.js";
import { detectSources, sourceLabel } from "../sources/detector.js";
import { extractMemories } from "../extractor/ai-extractor.js";
import { writeMemories } from "../store/memory-store.js";
import { loadState, saveState, markProcessed } from "../store/state.js";
import { loadConfig } from "../config.js";
import { resolveAuthor } from "../utils/author.js";
import { ANSI, c, printError } from "../output/terminal.js";

const DEBOUNCE_MS = 5_000;
const SCAN_INTERVAL_MS = 60_000;

export async function runWatch(opts: CliOptions): Promise<number> {
  const config = await loadConfig();
  const outputDir = config.output.dir;
  const minTurns = config.extract.minConversationLength;
  const author = await resolveAuthor(config, opts.author);
  const effectiveTypes = opts.types ?? (config.extract.types.length > 0 ? config.extract.types : undefined);

  console.log(
    `\n${c.bold("ai-memory watch")} ${c.dim("— auto-extract on conversation changes")}\n`
  );
  console.log(`   Author: ${author}`);
  console.log(`   Output: ${outputDir}/`);
  console.log(`   Min turns: ${minTurns}`);
  console.log("");

  const projectName = config.sources?.cursor?.projectName;
  const { available } = await detectSources(projectName);

  const filtered = available.filter((s) => {
    const sc = config.sources;
    if (s.type === "cursor") return sc.cursor.enabled !== false;
    if (s.type === "claude-code") return sc.claudeCode.enabled !== false;
    if (s.type === "windsurf") return sc.windsurf?.enabled !== false;
    if (s.type === "copilot") return sc.copilot?.enabled !== false;
    return true;
  });

  if (filtered.length === 0) {
    printError("No AI editor sources detected.");
    return 1;
  }

  for (const s of filtered) {
    console.log(`   ${ANSI.green}[+]${ANSI.reset} Watching: ${sourceLabel(s.type)}`);
  }
  console.log(`\n${c.dim("Press Ctrl+C to stop.\n")}`);

  const knownState = new Map<string, number>();
  let processing = false;
  let initialized = false;

  const processConversation = async (
    source: Source,
    meta: ConversationMeta
  ): Promise<void> => {
    const state = await loadState(outputDir);
    const prevState = getConversationState(state, meta.id);
    const fromTurn = prevState ? prevState.turnCount : 0;

    let conversation;
    try {
      conversation = await source.loadConversation(meta);
    } catch (err) {
      process.stderr.write(`[watch] Load error for "${meta.title.slice(0, 40)}": ${err}\n`);
      return;
    }

    if (conversation.turns.length < minTurns) return;

    if (prevState && conversation.turns.length <= prevState.turnCount) return;

    const ts = new Date().toLocaleTimeString();
    const newTurns = conversation.turns.length - fromTurn;
    console.log(
      `${c.dim(ts)} ${c.cyan(`[${sourceLabel(meta.source)}]`)} "${meta.title.slice(0, 45)}" (+${newTurns} turns) — extracting...`
    );

    try {
      const result = await extractMemories(
        conversation,
        { ...opts, types: effectiveTypes },
        fromTurn,
        config.model || undefined
      );

      for (const m of result.memories) m.author = author;

      if (result.memories.length > 0) {
        await writeMemories(result.memories, outputDir, config.output.language, { force: false, author });

        const parts = Object.entries(
          result.memories.reduce<Record<string, number>>((acc, m) => {
            acc[m.type] = (acc[m.type] || 0) + 1;
            return acc;
          }, {})
        ).map(([k, v]) => `${v} ${k}`).join(", ");

        console.log(
          `${c.dim(ts)} ${ANSI.green}[+]${ANSI.reset} ${parts}`
        );
      } else {
        console.log(`${c.dim(ts)} ${c.dim("no new knowledge")}`);
      }

      markProcessed(state, meta.id, conversation.turns.length);
      await saveState(state, outputDir);
    } catch (err) {
      process.stderr.write(`[watch] Extract error: ${err}\n`);
    }
  };

  const scanSources = async (): Promise<void> => {
    if (processing) return;
    processing = true;

    try {
      for (const source of filtered) {
        let conversations: ConversationMeta[];
        try {
          conversations = await source.listConversations();
        } catch {
          continue;
        }

        for (const meta of conversations) {
          const prevMtime = knownState.get(meta.id);

          if (!initialized) {
            knownState.set(meta.id, meta.modifiedAt);
            continue;
          }

          if (prevMtime !== undefined && meta.modifiedAt <= prevMtime) continue;

          knownState.set(meta.id, meta.modifiedAt);

          if (prevMtime !== undefined) {
            await processConversation(source, meta);
          }
        }
      }
    } finally {
      processing = false;
    }
  };

  await scanSources();
  initialized = true;
  console.log(`${c.dim("Initial scan complete — watching for changes...")}\n`);

  // Periodic polling (works for all sources including SQLite-based ones)
  const interval = setInterval(scanSources, SCAN_INTERVAL_MS);

  // Also try fs.watch for file-based sources (Cursor, Claude Code)
  const abortControllers: AbortController[] = [];
  for (const source of filtered) {
    if (source.type === "cursor" || source.type === "claude-code") {
      const ac = new AbortController();
      abortControllers.push(ac);
      watchFileSource(source, ac.signal, scanSources, DEBOUNCE_MS).catch(() => {});
    }
  }

  // Keep running until Ctrl+C
  await new Promise<void>((resolve) => {
    const cleanup = () => {
      clearInterval(interval);
      for (const ac of abortControllers) ac.abort();
      console.log(`\n${c.dim("Watch stopped.")}`);
      resolve();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });

  return 0;
}

async function watchFileSource(
  source: Source,
  signal: AbortSignal,
  onChangeCallback: () => Promise<void>,
  debounceMs: number
): Promise<void> {
  const conversations = await source.listConversations();
  if (conversations.length === 0) return;

  // Watch the directory containing conversation files
  const dirs = new Set<string>();
  for (const c of conversations) {
    dirs.add(dirname(c.filePath));
  }

  for (const dir of dirs) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const watcher = watch(dir, { signal, recursive: true });
      for await (const _event of watcher) {
        if (signal.aborted) break;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          onChangeCallback().catch(() => {});
        }, debounceMs);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).name === "AbortError") return;
    }
  }
}
