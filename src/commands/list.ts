import type { CliOptions, ConversationMeta } from "../types.js";
import { detectSources, createSource } from "../sources/detector.js";
import { loadState } from "../store/state.js";
import { hasMemoryFile } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { printError } from "../output/terminal.js";

const COL = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

/** Truncate string to at most `maxCols` display columns (CJK chars = 2 cols). */
function truncateToWidth(str: string, maxCols: number): string {
  let cols = 0;
  let i = 0;
  for (; i < str.length; i++) {
    const cp = str.codePointAt(i) ?? 0;
    const w = cp > 0x2E7F ? 2 : 1; // CJK and wide chars
    if (cols + w > maxCols) break;
    cols += w;
    if (cp > 0xFFFF) i++; // surrogate pair
  }
  return str.slice(0, i);
}

export async function runList(opts: CliOptions): Promise<number> {
  const config = await loadConfig();
  const outputDir = config.output.dir;

  // Resolve sources
  let conversations: ConversationMeta[] = [];
  if (opts.source) {
    const source = createSource(opts.source);
    const ok = await source.detect();
    if (!ok) {
      printError(`Source "${opts.source}" not available on this machine.`);
      return 1;
    }
    conversations = await source.listConversations();
  } else {
    const { available } = await detectSources();
    for (const s of available) {
      conversations.push(...(await s.listConversations()));
    }
  }

  if (conversations.length === 0) {
    console.log("No conversations found.");
    return 0;
  }

  // Sort newest first
  conversations.sort((a, b) => b.modifiedAt - a.modifiedAt);

  const state = await loadState();

  // Check memory file existence in parallel
  const hasFile = await Promise.all(
    conversations.map((c) => hasMemoryFile(c, outputDir))
  );

  if (opts.json) {
    console.log(
      JSON.stringify(
        conversations.map((c, i) => ({
          index: i + 1,
          id: c.id,
          title: c.title,
          source: c.source,
          date: new Date(c.modifiedAt).toISOString().slice(0, 10),
          turns: c.turnCount,
          extracted: hasFile[i],
        }))
      )
    );
    return 0;
  }

  const total = conversations.length;
  const done = hasFile.filter(Boolean).length;

  console.log(
    `\n${COL.bold}Conversations: ${total}${COL.reset}  ${COL.dim}(${done} extracted)${COL.reset}\n`
  );

  // Header
  const idxW = String(total).length;
  console.log(
    `${COL.dim}${"#".padStart(idxW)}  ${"Date".padEnd(10)}  ${"Turns".padStart(5)}  St   Title${COL.reset}`
  );
  console.log(COL.dim + "-".repeat(80) + COL.reset);

  for (let i = 0; i < conversations.length; i++) {
    const c = conversations[i];
    const idx = String(i + 1).padStart(idxW);
    const date = new Date(c.modifiedAt).toISOString().slice(0, 10);
    const turns = String(c.turnCount).padStart(5);
    const status = hasFile[i]
      ? `${COL.green}[+]${COL.reset}`
      : state.processedConversations[c.id]
      ? `${COL.yellow}[~]${COL.reset}`
      : `${COL.dim}[ ]${COL.reset}`;
    const title = truncateToWidth(c.title, 55);
    const sourceTag = c.source === "cursor" ? "" : `${COL.dim}[${c.source}]${COL.reset} `;

    console.log(`${COL.cyan}${idx}${COL.reset}  ${date}  ${turns}  ${status}  ${sourceTag}${title}`);
  }

  console.log(
    `\n${COL.dim}[+] extracted  [~] processed/no file  [ ] pending${COL.reset}`
  );
  console.log(
    `${COL.dim}Run: ai-memory extract --pick <index> --source cursor${COL.reset}\n`
  );

  return 0;
}
