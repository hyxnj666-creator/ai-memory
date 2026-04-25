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
  recall      Surface a memory's git lineage (who changed it, when, why)
  rules       Export conventions as Cursor Rules (.mdc)
  resolve     Mark memories as resolved/completed
  summary     Generate a project-level summary
  context     Generate a continuation prompt for new sessions
  init        Initialize config and detect editors
  serve       Start MCP server (for Cursor, Claude Code, etc.)
  reindex     Build/rebuild semantic search embeddings
  watch       Watch for conversation changes and auto-extract
  dashboard   Open local web UI for browsing memories
  export      Export memories as a portable JSON bundle (cross-device transfer)
  import      Import memories from a JSON bundle into the local store
  doctor      Run a one-shot health check (runtime, editors, LLM, store, MCP)

List options:
  --source <type>       Filter by source: cursor, claude-code, windsurf, copilot

Extract options:
  --source <type>       Source type: cursor, claude-code, windsurf, copilot
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
  --source-id <id>      Only summarize one conversation (ID prefix)
  --convo <query>       Only summarize conversations matching a title substring
  --list-sources        List conversations with memory counts (no LLM call)
  --all-matching        With --convo: include all matching conversations (default: most recent only)

Search options:
  search <query>        Search memories (hybrid: semantic + keyword)
  --type <types>        Filter by memory type

Recall options:
  recall <query>        Show how matching memories evolved over git history
  --type <types>        Filter by memory type
  --include-resolved    Include resolved memories
  --all-authors         Search across all authors

Reindex options:
  --force               Rebuild all embeddings from scratch
  --dedup               Detect & remove vague/duplicate memories using v2.2 algorithm
  --dry-run             With --dedup: preview what would be deleted without changes

Rules options:
  --target <name>       Output target: "cursor-rules" (default), "agents-md", or "both"
  --output <path>       Output path. Defaults:
                          cursor-rules → .cursor/rules/ai-memory-conventions.mdc
                          agents-md    → AGENTS.md
                        Ignored when --target both (uses both defaults).

Resolve options:
  resolve <pattern>     Mark matching memories as resolved (by title keyword or filename)
  resolve --undo <pat>  Mark matching memories back to active

Init options:
  --with-mcp            Also write .cursor/mcp.json + .windsurf/mcp.json so
                        ai-memory is registered as an MCP server automatically

Context options:
  --topic <topic>       Focus context on a specific topic
  --recent <days>       Only include memories from recent N days
  --convo <query>       Only include memories from conversations whose title matches <query>
  --source-id <id>      Only include memories from a specific conversation (ID prefix)
  --list-sources        List all conversations that produced memories (no context output)
  --all-matching        With --convo: include all matching conversations (default: most recent only)
  --copy                Copy result to clipboard
  --output <file>       Write context to file instead of stdout
  --summarize           Use LLM to generate a condensed prose summary (slower, costs tokens)
  --include-resolved    Include resolved memories

Serve options:
  --debug               Show debug logs on stderr

Watch options:
  --type <types>        Comma-separated memory types to extract
  --author <name>       Override author name

Dashboard options:
  --port <number>       Server port (default: 3141)

Export options:
  --output <path>       Bundle file path (default: stdout)
  --source-id <id>      Export only one conversation (ID prefix)
  --convo <query>       Export only conversations matching a title substring
  --all-matching        With --convo: include all matching conversations (default: most recent only)
  --type <types>        Comma-separated memory types to include
  --include-resolved    Include resolved memories
  --all-authors         Include all authors' memories

Import options:
  import <path>         Read bundle from <path> (or use --file <path>)
  --file <path>         Alternative way to specify the bundle file
  --overwrite           Replace existing memories with bundle content (default: skip)
  --dry-run             Preview what would be imported without writing files
  --author <name>       Override author for memories that don't have one in the bundle

Doctor options:
  --no-llm-check        Skip the live LLM connectivity test (offline / CI)
  --json                Emit full structured report as JSON (machine-readable)

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
  if (!["extract", "summary", "context", "init", "list", "search", "recall", "rules", "resolve", "serve", "reindex", "watch", "dashboard", "export", "import", "doctor"].includes(command)) {
    return { command: "help" };
  }

  const opts: CliOptions = {
    command: command as CliOptions["command"],
  };

  // Collect positional args (non-flag args after command, skipping flag values)
  const FLAGS_WITH_VALUE = new Set([
    "--source", "--since", "--type", "--topic", "--recent",
    "--output", "--focus", "--pick", "--id", "--author",
    "--convo", "--source-id", "--port", "--file", "--target",
  ]);

  if (command === "search" || command === "recall" || command === "resolve" || command === "import") {
    const positional: string[] = [];
    for (let j = 1; j < argv.length; j++) {
      if (argv[j].startsWith("--")) {
        if (FLAGS_WITH_VALUE.has(argv[j])) j++; // skip the value
        continue;
      }
      positional.push(argv[j]);
    }
    if ((command === "search" || command === "recall") && positional.length > 0) {
      opts.query = positional.join(" ");
    }
    if (command === "resolve") {
      opts.positionalArgs = positional;
    }
    if (command === "import") {
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
        if (next === "cursor" || next === "claude-code" || next === "windsurf" || next === "copilot") {
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
      case "--port":
        if (hasValue(next)) { opts.port = parseInt(next, 10) || undefined; i++; }
        break;
      case "--dedup":
        opts.dedup = true;
        break;
      case "--source-id":
        if (hasValue(next)) { opts.sourceId = next; i++; }
        break;
      case "--convo":
        if (hasValue(next)) { opts.convo = next; i++; }
        break;
      case "--list-sources":
        opts.listSources = true;
        break;
      case "--all-matching":
        opts.allMatching = true;
        break;
      case "--file":
        if (hasValue(next)) { opts.bundle = next; i++; }
        break;
      case "--overwrite":
        opts.overwrite = true;
        break;
      case "--no-llm-check":
        opts.noLlmCheck = true;
        break;
      case "--with-mcp":
        opts.withMcp = true;
        break;
      case "--target":
        if (next === "cursor-rules" || next === "agents-md" || next === "both") {
          opts.target = next;
          i++;
        }
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
