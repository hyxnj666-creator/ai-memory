const colorEnabled =
  !process.env.NO_COLOR &&
  process.stdout.isTTY !== false;

const esc = (code: string) => (colorEnabled ? code : "");

export const ANSI = {
  reset: esc("\x1b[0m"),
  bold: esc("\x1b[1m"),
  dim: esc("\x1b[2m"),
  green: esc("\x1b[32m"),
  yellow: esc("\x1b[33m"),
  blue: esc("\x1b[34m"),
  cyan: esc("\x1b[36m"),
  red: esc("\x1b[31m"),
  magenta: esc("\x1b[35m"),
} as const;

export const c = {
  bold: (s: string) => `${ANSI.bold}${s}${ANSI.reset}`,
  dim: (s: string) => `${ANSI.dim}${s}${ANSI.reset}`,
  green: (s: string) => `${ANSI.green}${s}${ANSI.reset}`,
  yellow: (s: string) => `${ANSI.yellow}${s}${ANSI.reset}`,
  blue: (s: string) => `${ANSI.blue}${s}${ANSI.reset}`,
  cyan: (s: string) => `${ANSI.cyan}${s}${ANSI.reset}`,
  red: (s: string) => `${ANSI.red}${s}${ANSI.reset}`,
};

export function printBanner(): void {
  console.log(
    `\n${c.bold("ai-memory")} ${c.dim("-- AI conversation knowledge extractor")}\n`
  );
}

export function printDetecting(): void {
  console.log("Detecting AI editors...");
}

export function printSourceFound(
  source: string,
  count: number,
  detail?: string
): void {
  const suffix = detail ? ` (${detail})` : "";
  console.log(
    `   [+] ${source}: ${c.bold(String(count))} conversations found${suffix}`
  );
}

export function printSourceNotFound(source: string): void {
  console.log(`   [ ] ${source}: not detected`);
}

export function printExtracting(count: number): void {
  console.log(
    `\nExtracting from ${c.bold(String(count))} conversations...\n`
  );
}

export function printConversationResult(
  source: string,
  title: string,
  date: string,
  counts: Record<string, number>
): void {
  const parts = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`);

  console.log(`   [${source}] "${title}" (${date})`);
  if (parts.length > 0) {
    console.log(`      -> ${parts.join(", ")}`);
  } else {
    console.log(`      -> ${c.dim("no extractable knowledge")}`);
  }
}

export function printSummary(
  total: number,
  outputDir: string,
  breakdown: Record<string, number>
): void {
  const parts = Object.entries(breakdown)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");

  console.log(
    `\n[+] Extracted ${c.bold(String(total))} memories -> ${outputDir}/`
  );
  if (parts) {
    console.log(`   ${parts}`);
  }
}

export function printError(msg: string): void {
  console.error(`\n[!] ${msg}`);
}

export function printWarning(msg: string): void {
  console.log(`[!] ${msg}`);
}

export function printNoConversations(): void {
  console.log(`\n[~] No conversations matched your filters.`);
  console.log(
    `   ${c.dim("Try adjusting --pick, --since, or remove --incremental to reprocess.")}`
  );
}

export function printNoMemoriesExtracted(processed: number): void {
  console.log(
    `\n[~] Processed ${c.bold(String(processed))} conversation${processed === 1 ? "" : "s"} but no extractable knowledge found.`
  );
  console.log(
    `   ${c.dim("Conversations may be too short or contain only routine code generation.")}`
  );
}
