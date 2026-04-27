/**
 * `ai-memory link` — scan recent git commits and link them to memories whose
 * content they likely implement.
 *
 * Scoring: weighted token overlap (Jaccard variant) as decided in
 * docs/memory-commit-linking-spike-2026-04-27.md §3.1.
 *
 *   tokens(M) = 3× title + 2× type + 1× content[:500] (+ 2× must_contain hints TBD)
 *   tokens(C) = 3× subject + 2× paths + 1× body[:500] + 1× author_name
 *
 * Band model (§3.2):
 *   score >= AUTO_THRESHOLD  → write to memory frontmatter as confirmed_by: auto
 *   SUGGEST_THRESHOLD <= score < AUTO_THRESHOLD → print as suggestion, no write
 *   score < SUGGEST_THRESHOLD → ignore
 *
 * Memory frontmatter schema locked in §3.3.
 *
 * Design constraints:
 *   - No new runtime deps.
 *   - Reads & writes memory files only (no index changes).
 *   - Idempotent: re-running `link` on the same corpus adds new links and
 *     skips commits already present in `links.implementations`.
 *   - `--dry-run` never touches disk.
 *   - `--clear-auto` removes every `confirmed_by: auto` link without
 *     disturbing manually-confirmed ones.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CliOptions, ExtractedMemory, ImplementationLink, MemoryLinks } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { getRecentCommits, isGitRepo, type CommitWithPaths } from "../git/log-reader.js";
import { loadConfig } from "../config.js";
import { tokenize } from "../embeddings/hybrid-search.js";
import { c } from "../output/terminal.js";

// ─── Thresholds (tunable via .ai-memory/.config.json in future) ─────────────

const DEFAULT_AUTO_THRESHOLD = 0.70;
const DEFAULT_SUGGEST_THRESHOLD = 0.40;
const DEFAULT_SINCE = "30 days ago";
const DEFAULT_MAX_COMMITS = 200;

// ─── Weighted token set builder ─────────────────────────────────────────────

/**
 * Build a weighted multiset of tokens for a memory.
 * Weights: title×3, type×2, content[:500]×1
 * Returns a Map<token, weight_sum>.
 */
function memoryTokens(m: ExtractedMemory): Map<string, number> {
  const out = new Map<string, number>();
  function addTokens(text: string, weight: number): void {
    for (const t of tokenize(text)) {
      out.set(t, (out.get(t) ?? 0) + weight);
    }
  }
  addTokens(m.title, 3);
  addTokens(m.type, 2);
  addTokens(m.content.slice(0, 500), 1);
  return out;
}

/**
 * Build a weighted multiset of tokens for a commit.
 * Weights: subject×3, paths×2, body[:500]×1, author×1
 */
function commitTokens(c: CommitWithPaths): Map<string, number> {
  const out = new Map<string, number>();
  function addTokens(text: string, weight: number): void {
    for (const t of tokenize(text)) {
      out.set(t, (out.get(t) ?? 0) + weight);
    }
  }
  addTokens(c.subject, 3);
  for (const p of c.paths) {
    // Split path on separators so "src/auth/pkce.ts" → ["src", "auth", "pkce", "ts"]
    addTokens(p.replace(/[/\\._-]/g, " "), 2);
  }
  addTokens(c.body.slice(0, 500), 1);
  addTokens(c.author, 1);
  return out;
}

/**
 * Weighted Jaccard similarity between two token weight maps.
 *   intersection = Σ min(wA, wB) for tokens in both
 *   union        = Σ max(wA, wB) for all tokens
 */
function weightedJaccard(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let inter = 0;
  let union = 0;

  // Sum mins for shared tokens
  for (const [tok, wA] of a) {
    const wB = b.get(tok) ?? 0;
    inter += Math.min(wA, wB);
    union += Math.max(wA, wB);
  }
  // Add remaining tokens from B not in A
  for (const [tok, wB] of b) {
    if (!a.has(tok)) union += wB;
  }

  return union === 0 ? 0 : inter / union;
}

// ─── YAML frontmatter helpers ────────────────────────────────────────────────

/**
 * Parse YAML-style `links:` block from memory file content.
 * We use a minimal hand-rolled parser to avoid adding a YAML dep.
 */
function parseLinks(fileContent: string): MemoryLinks | undefined {
  const linksMatch = fileContent.match(/^<!--links\n([\s\S]*?)\n-->/m);
  if (!linksMatch) return undefined;

  try {
    return JSON.parse(linksMatch[1]) as MemoryLinks;
  } catch {
    return undefined;
  }
}

/**
 * Serialise a MemoryLinks object as a comment block at the TOP of the memory file.
 * Format:  <!--links\n{JSON}\n-->
 * This approach is:
 *   - Invisible in rendered Markdown (HTML comment)
 *   - Trivially parseable without a YAML dep
 *   - Never conflicts with existing heading / blockquote structure
 */
function renderLinksBlock(links: MemoryLinks): string {
  return `<!--links\n${JSON.stringify(links, null, 2)}\n-->`;
}

/**
 * Replace (or insert) the links comment block in file content.
 */
function updateLinksInContent(content: string, links: MemoryLinks): string {
  const block = renderLinksBlock(links);
  if (/^<!--links\n[\s\S]*?\n-->/m.test(content)) {
    return content.replace(/^<!--links\n[\s\S]*?\n-->/m, block);
  }
  // Insert at top (before the # heading)
  return block + "\n" + content;
}

/**
 * Remove all `confirmed_by: "auto"` links from a MemoryLinks object.
 * Returns null if the resulting implementations list is empty (caller should
 * remove the block entirely).
 */
function clearAutoLinks(links: MemoryLinks): MemoryLinks | null {
  const kept = links.implementations.filter((l) => l.confirmed_by !== "auto");
  if (kept.length === 0) return null;
  return { ...links, implementations: kept };
}

// ─── Public command ──────────────────────────────────────────────────────────

export async function runLink(opts: CliOptions): Promise<number> {
  const cwd = resolve(".");
  const config = await loadConfig();
  const outputDir = config.output.dir;

  // 1. Validate we're in a git repo
  const inGit = await isGitRepo(cwd);
  if (!inGit) {
    process.stderr.write("[link] Not inside a git repository — cannot scan commits.\n");
    return 1;
  }

  // 2. --clear-auto mode: remove all auto-links from every memory file
  if (opts.clearAuto) {
    return runClearAuto(outputDir, opts);
  }

  const since = opts.linkSince ?? opts.since ?? DEFAULT_SINCE;
  const maxCommits = opts.maxCommits ?? DEFAULT_MAX_COMMITS;
  const autoThreshold = opts.autoThreshold ?? DEFAULT_AUTO_THRESHOLD;
  const suggestThreshold = DEFAULT_SUGGEST_THRESHOLD;
  const dryRun = opts.dryRun ?? false;
  const verbose = opts.verbose ?? false;

  if (!opts.json) {
    console.log(c.dim(`[link] Scanning commits since ${since} (max ${maxCommits})…`));
  }

  // 3. Load memories + recent commits
  const memories = await readAllMemories(outputDir);
  const activeMemories = memories.filter(
    (m) => m.status !== "resolved" && m.filePath
  );

  if (activeMemories.length === 0) {
    if (!opts.json) console.log("[link] No active memories found.");
    return 0;
  }

  const commits = await getRecentCommits(cwd, since, maxCommits);
  if (commits.length === 0) {
    if (!opts.json) console.log("[link] No commits found in the specified range.");
    return 0;
  }

  if (!opts.json) {
    console.log(c.dim(`[link] ${activeMemories.length} memories × ${commits.length} commits to score`));
  }

  // 4. Build token sets (cache per-memory and per-commit — O(N+M) not O(N×M))
  const memTokens = new Map<string, Map<string, number>>();
  for (const m of activeMemories) {
    memTokens.set(m.filePath!, memoryTokens(m));
  }
  const comTokens = commits.map((commit) => ({ commit, tokens: commitTokens(commit) }));

  // 5. For each memory, find candidate commits above suggestThreshold
  const autoLinks: Array<{ memory: ExtractedMemory; link: ImplementationLink }> = [];
  const suggestions: Array<{ memory: ExtractedMemory; commit: CommitWithPaths; score: number }> = [];

  for (const m of activeMemories) {
    const mTok = memTokens.get(m.filePath!)!;

    // Load existing links to skip already-linked commits
    const existingContent = await readFile(m.filePath!, "utf-8").catch(() => "");
    const existingLinks = parseLinks(existingContent);
    const linkedShas = new Set(existingLinks?.implementations.map((l) => l.sha) ?? []);

    for (const { commit, tokens: cTok } of comTokens) {
      if (linkedShas.has(commit.fullSha)) continue; // already linked

      const score = weightedJaccard(mTok, cTok);
      if (score < suggestThreshold) continue;

      if (score >= autoThreshold) {
        const link: ImplementationLink = {
          sha: commit.fullSha,
          short: commit.sha,
          paths: commit.paths.filter((p) => {
            // Only include paths that contributed matching tokens
            const pathTok = new Set(tokenize(p.replace(/[/\\._-]/g, " ")));
            return [...pathTok].some((t) => mTok.has(t));
          }),
          subject: commit.subject,
          author: commit.author,
          date: commit.date,
          method: "jaccard",
          score: Math.round(score * 1000) / 1000,
          confirmed_by: "auto",
          first_linked: new Date().toISOString(),
        };
        // If no path matched tokens, still include all changed paths (broad coverage)
        if (link.paths.length === 0) link.paths = commit.paths.slice(0, 5);
        autoLinks.push({ memory: m, link });
      } else {
        suggestions.push({ memory: m, commit, score });
      }
    }
  }

  // 6. Write auto-links to disk (unless --dry-run)
  let written = 0;
  const autoByFile = new Map<string, ImplementationLink[]>();
  for (const { memory, link } of autoLinks) {
    const list = autoByFile.get(memory.filePath!) ?? [];
    list.push(link);
    autoByFile.set(memory.filePath!, list);
  }

  if (!dryRun) {
    for (const [filePath, newLinks] of autoByFile) {
      const raw = await readFile(filePath, "utf-8").catch(() => "");
      const existing = parseLinks(raw);
      const merged: MemoryLinks = {
        implementations: [
          ...(existing?.implementations ?? []),
          ...newLinks,
        ],
      };
      const updated = updateLinksInContent(raw, merged);
      await writeFile(filePath, updated, "utf-8");
      written++;
    }
  }

  // 7. Output
  if (opts.json) {
    console.log(JSON.stringify({
      autoLinked: autoLinks.length,
      filesUpdated: written,
      suggestions: suggestions.length,
      dryRun,
      details: {
        autoLinks: autoLinks.map(({ memory, link }) => ({
          memoryTitle: memory.title,
          memoryFile: memory.filePath,
          sha: link.short,
          subject: link.subject,
          score: link.score,
        })),
        suggestions: suggestions.map(({ memory, commit, score }) => ({
          memoryTitle: memory.title,
          sha: commit.sha,
          subject: commit.subject,
          score: Math.round(score * 1000) / 1000,
        })),
      },
    }));
    return 0;
  }

  // Human-readable output
  console.log("");
  if (autoLinks.length > 0) {
    const verb = dryRun ? "Would auto-link" : "Auto-linked";
    console.log(c.green(`${verb} ${autoLinks.length} commit(s) to ${autoByFile.size} memory file(s):`));
    for (const { memory, link } of autoLinks) {
      console.log(
        `  ${c.dim(`[${link.short}]`)} ${link.subject.slice(0, 55)} ` +
        `${c.dim("→")} ${memory.title.slice(0, 40)} ${c.dim(`(score ${link.score})`)}`
      );
    }
    if (dryRun) {
      console.log("\n" + c.dim("[dry-run] No files were modified."));
    } else {
      console.log("\n" + c.dim(`[link] Updated ${written} file(s). Remove auto-links with: ai-memory link --clear-auto`));
    }
  } else {
    console.log(c.dim(`[link] No commits scored above auto-link threshold (${autoThreshold}).`));
  }

  if (suggestions.length > 0 && verbose) {
    console.log("\n" + c.dim(`Suggestions (${suggestThreshold}–${autoThreshold}, confirm manually):`));
    for (const { memory, commit, score } of suggestions.slice(0, 10)) {
      console.log(
        `  ${c.dim(`[${commit.sha}]`)} ${commit.subject.slice(0, 55)} ` +
        `${c.dim("→?")} ${memory.title.slice(0, 40)} ${c.dim(`(score ${Math.round(score * 1000) / 1000})`)}`
      );
    }
    if (suggestions.length > 10) {
      console.log("  " + c.dim(`… and ${suggestions.length - 10} more`));
    }
  } else if (suggestions.length > 0) {
    console.log(c.dim(`[link] ${suggestions.length} suggestion(s) below auto-threshold — run with --verbose to inspect.`));
  }

  return 0;
}

async function runClearAuto(outputDir: string, opts: CliOptions): Promise<number> {
  const memories = await readAllMemories(outputDir);
  let cleared = 0;

  for (const m of memories) {
    if (!m.filePath) continue;
    const raw = await readFile(m.filePath, "utf-8").catch(() => "");
    const existing = parseLinks(raw);
    if (!existing) continue;

    const updated = clearAutoLinks(existing);
    let newContent: string;
    if (updated === null) {
      // Remove the block entirely
      newContent = raw.replace(/^<!--links\n[\s\S]*?\n-->\n?/m, "");
    } else {
      newContent = updateLinksInContent(raw, updated);
    }

    if (!opts.dryRun) {
      await writeFile(m.filePath, newContent, "utf-8");
    }
    cleared++;
  }

  if (opts.json) {
    console.log(JSON.stringify({ cleared, dryRun: opts.dryRun ?? false }));
  } else {
    const verb = opts.dryRun ? "Would clear" : "Cleared";
    console.log(`${verb} auto-links from ${cleared} memory file(s).`);
  }
  return 0;
}
