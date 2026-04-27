import { watch } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AiMemoryConfig,
  CliOptions,
  ConversationMeta,
  Source,
  SourceType,
} from "../types.js";
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

/**
 * Sources whose on-disk layout supports `fs.watch`-based incremental
 * updates (i.e. file additions / writes can be observed via filesystem
 * events, not just by polling). All three are JSONL-file-per-conversation
 * (or directory of such files) — Cursor / Claude Code / Codex CLI.
 *
 * SQLite-backed sources (Windsurf) and JSON-blob sources (Copilot) are
 * deliberately excluded — fs.watch on a vacuumed/rewritten SQLite file
 * fires unhelpfully, and Copilot writes whole-file replaces that the 30s
 * polling fallback already catches. Adding a 6th source? Decide whether
 * it's JSONL-file-per-conversation; if yes, add it here.
 *
 * v2.5-06 audit pass — Finding B regression: this used to be an inline
 * `cursor || claude-code` check, which silently downgraded Codex to
 * polling-only after the v2.5-06 ship. Now exported + tested.
 */
export function supportsFsWatch(sourceType: SourceType): boolean {
  return (
    sourceType === "cursor" ||
    sourceType === "claude-code" ||
    sourceType === "codex"
  );
}

/**
 * Whether a detected source is enabled by the user's config. Default is
 * always-on per source — config keys are treated as "explicit opt-out"
 * not "opt-in". Missing keys (e.g. an old config predating v2.5-06)
 * therefore implicitly enable codex, which is the right default for
 * user upgrades.
 *
 * v2.5-06 audit pass — Finding C regression: this used to be an inline
 * if/else ladder with a `return true` fallthrough, which is
 * indistinguishable from "I forgot to add this source". Promoting it to
 * a named function with an exhaustive switch makes the omission a
 * compile error next time.
 */
export function isSourceEnabledInConfig(
  sourceType: SourceType,
  config: AiMemoryConfig
): boolean {
  const sc = config.sources;
  switch (sourceType) {
    case "cursor":
      return sc.cursor.enabled !== false;
    case "claude-code":
      return sc.claudeCode.enabled !== false;
    case "windsurf":
      return sc.windsurf?.enabled !== false;
    case "copilot":
      return sc.copilot?.enabled !== false;
    case "codex":
      return sc.codex?.enabled !== false;
    default: {
      // Exhaustiveness check — TS compile error if SourceType grows.
      const _exhaustive: never = sourceType;
      void _exhaustive;
      return true;
    }
  }
}

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

  const filtered = available.filter((s) =>
    isSourceEnabledInConfig(s.type, config)
  );

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
        config.model || undefined,
        outputDir,
        config.redact
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

  // Also try fs.watch for file-based sources. See `supportsFsWatch` above
  // for the source-by-source rationale and the "adding a 6th source"
  // checklist.
  const abortControllers: AbortController[] = [];
  for (const source of filtered) {
    if (supportsFsWatch(source.type)) {
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
