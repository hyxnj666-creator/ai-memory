/**
 * `ai-memory recall <query>` — git-history-aware retrieval that surfaces *how
 * a memory evolved over time*, not just the latest snapshot.
 *
 * Other "memory" tools return a single flattened "current truth" — every
 * superseded version is silently overwritten. Because `.ai-memory/` is a
 * pile of plain Markdown files in a git repo, we have free access to the
 * full lineage: who changed which decision, when, and what the previous
 * version said. `recall` exposes that.
 *
 * Soft-failure design: if `cwd` isn't a git repo, or `.ai-memory/` isn't
 * tracked yet, we still return the matching memories — just without history.
 * The CLI prints a hint in that case so the user knows what they're missing.
 */

import type { CliOptions, ExtractedMemory } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { resolveAuthor } from "../utils/author.js";
import { printBanner, printError, ANSI as COL } from "../output/terminal.js";
import {
  getFileHistory,
  isGitRepo,
  isPathTracked,
  type CommitInfo,
} from "../git/log-reader.js";

// ---------- Types ----------

export interface RecallEntry {
  memory: ExtractedMemory;
  /** Git commits touching this file (newest first). Empty when no git history. */
  history: CommitInfo[];
}

export interface RecallReport {
  query: string;
  /** Whether `cwd` is a git working tree. */
  gitAvailable: boolean;
  /** Whether at least one file under `outputDir` is tracked. False = first run, no commits yet. */
  storeTracked: boolean;
  /** Number of memories matched. */
  matched: number;
  entries: RecallEntry[];
  /** Hint emitted in non-JSON mode when history is unavailable. */
  reason?: string;
}

// ---------- Pure: matching ----------

/**
 * Substring match on title / content / reasoning. We deliberately use plain
 * keyword matching (not hybrid semantic search) because `recall` is about
 * lineage of facts the user can already articulate; semantic similarity
 * would dilute the timeline with tangentially-related memories.
 */
export function filterMemoriesForRecall(
  memories: ExtractedMemory[],
  query: string,
  opts: { types?: string[]; includeResolved?: boolean } = {}
): ExtractedMemory[] {
  const lc = query.toLowerCase();
  return memories.filter((m) => {
    if (opts.types && opts.types.length > 0 && !opts.types.includes(m.type)) {
      return false;
    }
    if (m.status === "resolved" && !opts.includeResolved) return false;
    return (
      m.title.toLowerCase().includes(lc) ||
      m.content.toLowerCase().includes(lc) ||
      (m.reasoning ?? "").toLowerCase().includes(lc) ||
      (m.alternatives ?? "").toLowerCase().includes(lc)
    );
  });
}

// ---------- Pure: rendering helpers ----------

function statusBadge(m: ExtractedMemory): string {
  if (m.status === "resolved") return `${COL.dim}[~] RESOLVED${COL.reset}`;
  return `${COL.green}[+] CURRENT${COL.reset} `;
}

function changeArrow(c: CommitChange): string {
  switch (c) {
    case "added":
      return "+";
    case "modified":
      return "~";
    case "deleted":
      return "-";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return " ";
  }
}

type CommitChange = CommitInfo["change"];

// ---------- Pure: ranking ----------

function entrySortKey(e: RecallEntry): string {
  // Prefer last-touched-in-git for ranking; fall back to memory.date.
  return e.history[0]?.date ?? e.memory.date ?? "";
}

// ---------- Command entry ----------

export async function runRecall(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const query = opts.query?.trim();
  if (!query) {
    printError(
      "Usage: ai-memory recall <query> [--type decision] [--include-resolved] [--all-authors]"
    );
    return 1;
  }

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const author = opts.allAuthors
    ? undefined
    : await resolveAuthor(config, opts.author);

  const memories = await readAllMemories(outputDir, author);
  const matched = filterMemoriesForRecall(memories, query, {
    types: opts.types,
    includeResolved: opts.includeResolved,
  });

  const cwd = process.cwd();
  const gitAvailable = await isGitRepo(cwd);
  const storeTracked = gitAvailable
    ? await isPathTracked(cwd, outputDir)
    : false;

  const entries: RecallEntry[] = [];
  for (const m of matched) {
    if (!m.filePath) continue;
    const history =
      gitAvailable && storeTracked ? await getFileHistory(cwd, m.filePath) : [];
    entries.push({ memory: m, history });
  }

  entries.sort((a, b) => entrySortKey(b).localeCompare(entrySortKey(a)));

  let reason: string | undefined;
  if (!gitAvailable) {
    reason = `cwd is not inside a git working tree — recall is showing the latest snapshot only. Initialise git and commit \`${outputDir}/\` to unlock history.`;
  } else if (!storeTracked) {
    reason = `\`${outputDir}/\` exists but isn't tracked by git yet. Run \`git add ${outputDir}\` and commit to unlock history.`;
  }

  const report: RecallReport = {
    query,
    gitAvailable,
    storeTracked,
    matched: entries.length,
    entries,
    reason,
  };

  if (opts.json) {
    console.log(JSON.stringify(report));
    return 0;
  }

  if (entries.length === 0) {
    console.log(`\nNo memories matching "${query}".`);
    if (reason) process.stderr.write(`[hint] ${reason}\n`);
    return 0;
  }

  if (reason) process.stderr.write(`[hint] ${reason}\n`);

  const totalCommits = entries.reduce((sum, e) => sum + e.history.length, 0);
  const commitTag =
    gitAvailable && storeTracked && totalCommits > 0
      ? `, ${totalCommits} commit${totalCommits === 1 ? "" : "s"} of lineage`
      : gitAvailable && storeTracked
        ? " (no commits touching these files yet)"
        : "";
  console.log(
    `\n${COL.bold}Recall:${COL.reset} "${query}" — ${entries.length} memor${entries.length === 1 ? "y" : "ies"}${commitTag}\n`
  );

  for (const e of entries) {
    const m = e.memory;
    const author = m.author ? `${COL.dim}@${m.author}${COL.reset}` : "";
    console.log(
      `${statusBadge(m)} ${COL.bold}${m.title}${COL.reset}  ${author} ${COL.dim}(${m.date})${COL.reset}`
    );
    if (m.filePath) {
      console.log(`    ${COL.dim}${m.filePath}${COL.reset}`);
    }
    if (e.history.length > 0) {
      console.log(
        `    ${COL.dim}History (${e.history.length} commit${e.history.length === 1 ? "" : "s"}):${COL.reset}`
      );
      const HEAD_LIMIT = 10;
      const visible = e.history.slice(0, HEAD_LIMIT);
      for (const c of visible) {
        const day = c.date.slice(0, 10);
        const arrow = changeArrow(c.change);
        const renamed =
          c.change === "renamed" && c.fromPath
            ? `  ${COL.dim}(was ${c.fromPath})${COL.reset}`
            : "";
        console.log(
          `      ${COL.cyan}${c.sha}${COL.reset}  ${day}  ${COL.dim}${c.author.padEnd(14)}${COL.reset} ${arrow} ${c.subject}${renamed}`
        );
      }
      if (e.history.length > HEAD_LIMIT) {
        console.log(
          `      ${COL.dim}... ${e.history.length - HEAD_LIMIT} earlier commit${e.history.length - HEAD_LIMIT === 1 ? "" : "s"} omitted${COL.reset}`
        );
      }
      console.log(
        `    ${COL.dim}> git log --follow ${m.filePath ?? "<file>"}${COL.reset}  ${COL.dim}for full diffs${COL.reset}`
      );
    } else if (gitAvailable && storeTracked) {
      console.log(
        `    ${COL.dim}History: file not yet committed.${COL.reset}`
      );
    }
    console.log();
  }

  return 0;
}
