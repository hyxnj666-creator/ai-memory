const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";

export const c = {
  bold: (s: string) => `${BOLD}${s}${RESET}`,
  dim: (s: string) => `${DIM}${s}${RESET}`,
  green: (s: string) => `${GREEN}${s}${RESET}`,
  yellow: (s: string) => `${YELLOW}${s}${RESET}`,
  blue: (s: string) => `${BLUE}${s}${RESET}`,
  cyan: (s: string) => `${CYAN}${s}${RESET}`,
  red: (s: string) => `${RED}${s}${RESET}`,
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
  console.log(`\n[~] No new conversations to process.`);
  console.log(
    `   ${c.dim("Use --since or remove --incremental to reprocess.")}`
  );
}
