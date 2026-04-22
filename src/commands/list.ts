import type { CliOptions, ConversationMeta } from "../types.js";
import { detectSources, createSource, sourceLabel } from "../sources/detector.js";
import { loadState } from "../store/state.js";
import { hasMemoryFile } from "../store/memory-store.js";
import { loadConfig } from "../config.js";
import { printError, ANSI as COL } from "../output/terminal.js";
import { resolveAuthor } from "../utils/author.js";

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

  // Resolve sources (honor sources.*.enabled from config, consistent with extract)
  let conversations: ConversationMeta[] = [];
  const projectName = config.sources?.cursor?.projectName;
  if (opts.source) {
    const source = createSource(opts.source, projectName);
    const ok = await source.detect();
    if (!ok) {
      printError(`Source "${opts.source}" not available on this machine.`);
      return 1;
    }
    conversations = await source.listConversations();
  } else {
    const { available } = await detectSources(projectName);
    const sourcesConfig = config.sources;
    const filtered = available.filter((s) => {
      if (!sourcesConfig) return true;
      if (s.type === "cursor") return sourcesConfig.cursor.enabled !== false;
      if (s.type === "claude-code") return sourcesConfig.claudeCode.enabled !== false;
      if (s.type === "windsurf") return sourcesConfig.windsurf?.enabled !== false;
      if (s.type === "copilot") return sourcesConfig.copilot?.enabled !== false;
      return true;
    });
    for (const s of filtered) {
      conversations.push(...(await s.listConversations()));
    }
  }

  if (conversations.length === 0) {
    console.log("No conversations found.");
    return 0;
  }

  // Sort newest first
  conversations.sort((a, b) => b.modifiedAt - a.modifiedAt);

  const state = await loadState(outputDir);
  const author = await resolveAuthor(config, opts.author);

  // Check memory file existence in parallel (author-aware)
  const hasFile = await Promise.all(
    conversations.map((c) => hasMemoryFile(c, outputDir, author))
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
    const sourceTag = c.source === "cursor" ? "" : `${COL.dim}[${sourceLabel(c.source)}]${COL.reset} `;

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
