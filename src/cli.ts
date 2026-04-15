import type { CliOptions, MemoryType } from "./types.js";

declare const __VERSION__: string | undefined;

const VALID_TYPES: MemoryType[] = [
  "decision",
  "architecture",
  "convention",
  "todo",
  "issue",
];

const HELP = `
ai-memory — Extract structured knowledge from AI editor conversations

Usage:
  ai-memory <command> [options]

Commands:
  list        List all available conversations
  extract     Extract memories from conversation history
  summary     Generate a project-level summary
  context     Generate a continuation prompt for new sessions
  init        Initialize config and detect editors

List options:
  --source <type>       Filter by source: cursor, claude-code

Extract options:
  --source <type>       Source type: cursor, claude-code
  --pick <index>        Process only conversation(s) by list index, e.g. --pick 3 or --pick 1,4,7
  --id <prefix>         Process only conversation matching this ID prefix
  --since <time>        Only process conversations after this time
  --incremental         Only process new conversations since last run
  --type <types>        Comma-separated memory types to extract
  --dry-run             Preview extraction without writing files

Summary options:
  --output <file>       Output file path (default: SUMMARY.md)
  --focus <topic>       Focus on a specific topic

Context options:
  --topic <topic>       Focus context on a specific topic
  --recent <days>       Only include memories from recent N days
  --copy                Copy result to clipboard
  --output <file>       Write context to file instead of stdout
  --summarize           Use LLM to generate a condensed prose summary (slower, costs tokens)

Global options:
  --json                Output as JSON
  --verbose             Show detailed progress
  --help, -h            Show this help
  --version, -v         Show version
`.trim();

export function parseArgs(argv: string[]): CliOptions {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { command: "help" };
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    return { command: "version" };
  }

  const command = argv[0];
  if (!["extract", "summary", "context", "init", "list"].includes(command)) {
    return { command: "help" };
  }

  const opts: CliOptions = {
    command: command as CliOptions["command"],
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--source":
        if (next === "cursor" || next === "claude-code") {
          opts.source = next;
          i++;
        }
        break;
      case "--since":
        opts.since = next;
        i++;
        break;
      case "--incremental":
        opts.incremental = true;
        break;
      case "--type": {
        const types = next?.split(",").filter((t): t is MemoryType =>
          VALID_TYPES.includes(t as MemoryType)
        );
        if (types?.length) opts.types = types;
        i++;
        break;
      }
      case "--topic":
        opts.topic = next;
        i++;
        break;
      case "--recent":
        opts.recent = parseInt(next, 10) || undefined;
        i++;
        break;
      case "--copy":
        opts.copy = true;
        break;
      case "--summarize":
        opts.summarize = true;
        break;
      case "--output":
        opts.output = next;
        i++;
        break;
      case "--focus":
        opts.focus = next;
        i++;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--verbose":
        opts.verbose = true;
        break;
      case "--pick":
        opts.pick = next;
        i++;
        break;
      case "--id":
        opts.pickId = next;
        i++;
        break;
    }
  }

  return opts;
}

export function printHelp(): void {
  console.log(HELP);
}

export function printVersion(): void {
  // Version is injected at build time via tsup define, fallback to package.json
  const version =
    (typeof __VERSION__ !== "undefined" ? __VERSION__ : null) ?? "0.1.0";
  console.log(`ai-memory v${version}`);
}
