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
  search      Search through extracted memories
  rules       Export conventions as Cursor Rules (.mdc)
  resolve     Mark memories as resolved/completed
  summary     Generate a project-level summary
  context     Generate a continuation prompt for new sessions
  init        Initialize config and detect editors
  serve       Start MCP server (for Cursor, Claude Code, etc.)
  reindex     Build/rebuild semantic search embeddings

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
  --force               Overwrite existing memory files if content changed

Summary options:
  --output <file>       Output file path (default: SUMMARY.md)
  --focus <topic>       Focus on a specific topic

Search options:
  search <query>        Search memories (hybrid: semantic + keyword)
  --type <types>        Filter by memory type

Reindex options:
  --force               Rebuild all embeddings from scratch

Rules options:
  --output <path>       Output path (default: .cursor/rules/ai-memory-conventions.mdc)

Resolve options:
  resolve <pattern>     Mark matching memories as resolved (by title keyword or filename)
  resolve --undo <pat>  Mark matching memories back to active

Context options:
  --topic <topic>       Focus context on a specific topic
  --recent <days>       Only include memories from recent N days
  --copy                Copy result to clipboard
  --output <file>       Write context to file instead of stdout
  --summarize           Use LLM to generate a condensed prose summary (slower, costs tokens)
  --include-resolved    Include resolved memories

Serve options:
  --debug               Show debug logs on stderr

Team options:
  --author <name>       Override auto-detected author name
  --all-authors         Include all authors' memories (summary/context)

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
  if (!["extract", "summary", "context", "init", "list", "search", "rules", "resolve", "serve", "reindex"].includes(command)) {
    return { command: "help" };
  }

  const opts: CliOptions = {
    command: command as CliOptions["command"],
  };

  // Collect positional args (non-flag args after command, skipping flag values)
  const FLAGS_WITH_VALUE = new Set([
    "--source", "--since", "--type", "--topic", "--recent",
    "--output", "--focus", "--pick", "--id", "--author",
  ]);

  if (command === "search" || command === "resolve") {
    const positional: string[] = [];
    for (let j = 1; j < argv.length; j++) {
      if (argv[j].startsWith("--")) {
        if (FLAGS_WITH_VALUE.has(argv[j])) j++; // skip the value
        continue;
      }
      positional.push(argv[j]);
    }
    if (command === "search" && positional.length > 0) {
      opts.query = positional.join(" ");
    }
    if (command === "resolve") {
      opts.positionalArgs = positional;
    }
  }

  const hasValue = (v: string | undefined): v is string =>
    v !== undefined && !v.startsWith("--");

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
        if (hasValue(next)) { opts.since = next; i++; }
        break;
      case "--incremental":
        opts.incremental = true;
        break;
      case "--type": {
        if (!hasValue(next)) break;
        const types = next.split(",").filter((t): t is MemoryType =>
          VALID_TYPES.includes(t as MemoryType)
        );
        if (types.length) opts.types = types;
        i++;
        break;
      }
      case "--topic":
        if (hasValue(next)) { opts.topic = next; i++; }
        break;
      case "--recent":
        if (hasValue(next)) { opts.recent = parseInt(next, 10) || undefined; i++; }
        break;
      case "--copy":
        opts.copy = true;
        break;
      case "--summarize":
        opts.summarize = true;
        break;
      case "--output":
        if (hasValue(next)) { opts.output = next; i++; }
        break;
      case "--focus":
        if (hasValue(next)) { opts.focus = next; i++; }
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
        if (hasValue(next)) { opts.pick = next; i++; }
        break;
      case "--id":
        if (hasValue(next)) { opts.pickId = next; i++; }
        break;
      case "--force":
        opts.force = true;
        break;
      case "--author":
        if (hasValue(next)) { opts.author = next; i++; }
        break;
      case "--all-authors":
        opts.allAuthors = true;
        break;
      case "--include-resolved":
        opts.includeResolved = true;
        break;
      case "--undo":
        opts.undo = true;
        break;
      case "--debug":
        opts.debug = true;
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
