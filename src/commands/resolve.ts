import { readFile, writeFile } from "node:fs/promises";
import type { CliOptions } from "../types.js";
import { readAllMemories } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { resolveAuthor } from "../utils/author.js";
import { printBanner, printError, printWarning } from "../output/terminal.js";

const STATUS_RE = /^>\s*\*\*(?:Status|状态)\*\*:\s*(.+?)\s*$/m;

async function setStatus(filePath: string, status: "resolved" | "active"): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return false;
  }

  const statusLine = `> **Status**: ${status}  `;

  if (STATUS_RE.test(content)) {
    content = content.replace(STATUS_RE, statusLine);
  } else {
    // Insert status line after the last blockquote metadata line (before the ---)
    const hrIndex = content.indexOf("\n---\n");
    if (hrIndex !== -1) {
      content = content.slice(0, hrIndex) + "\n" + statusLine + content.slice(hrIndex);
    } else {
      // Fallback: append after title
      const titleEnd = content.indexOf("\n\n");
      if (titleEnd !== -1) {
        content = content.slice(0, titleEnd) + "\n\n" + statusLine + "\n" + content.slice(titleEnd + 2);
      }
    }
  }

  await writeFile(filePath, content, "utf-8");
  return true;
}

export async function runResolve(opts: CliOptions): Promise<number> {
  if (!opts.json) printBanner();

  const pattern = opts.positionalArgs?.join(" ")?.trim();
  if (!pattern) {
    printError('Usage: ai-memory resolve <title-keyword-or-filename>');
    printError('       ai-memory resolve "OAuth" --undo');
    return 1;
  }

  const config = await loadConfig();
  const outputDir = config.output.dir;
  const author = opts.allAuthors ? undefined : await resolveAuthor(config, opts.author);
  const targetStatus = opts.undo ? "active" : "resolved";

  const memories = await readAllMemories(outputDir, author);
  const patternLower = pattern.toLowerCase();

  const matches = memories.filter((m) => {
    const titleMatch = m.title.toLowerCase().includes(patternLower);
    const fileMatch = m.filePath?.toLowerCase().includes(patternLower);
    return titleMatch || fileMatch;
  });

  if (matches.length === 0) {
    printError(`No memories matching "${pattern}".`);
    return 1;
  }

  let updated = 0;
  for (const m of matches) {
    if (!m.filePath) continue;
    if (m.status === targetStatus) continue;
    const ok = await setStatus(m.filePath, targetStatus);
    if (ok) {
      updated++;
      if (!opts.json) {
        const verb = targetStatus === "resolved" ? "resolved" : "reactivated";
        console.log(`  [${verb}] ${m.title}`);
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ pattern, matched: matches.length, updated, status: targetStatus }));
  } else if (updated === 0) {
    printWarning(`${matches.length} memories matched but all already ${targetStatus}.`);
  } else {
    console.log(`\n[+] ${updated} memor${updated === 1 ? "y" : "ies"} marked as ${targetStatus}.`);
  }

  return 0;
}
