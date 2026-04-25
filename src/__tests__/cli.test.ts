import { describe, it, expect } from "vitest";
import { parseArgs } from "../cli.js";

describe("parseArgs", () => {
  it("returns help when no args", () => {
    expect(parseArgs([])).toMatchObject({ command: "help" });
  });

  it("returns help for --help", () => {
    expect(parseArgs(["--help"])).toMatchObject({ command: "help" });
    expect(parseArgs(["-h"])).toMatchObject({ command: "help" });
  });

  it("returns version for --version", () => {
    expect(parseArgs(["--version"])).toMatchObject({ command: "version" });
    expect(parseArgs(["-v"])).toMatchObject({ command: "version" });
  });

  it("parses extract command", () => {
    expect(parseArgs(["extract"])).toMatchObject({ command: "extract" });
  });

  it("parses summary command", () => {
    expect(parseArgs(["summary"])).toMatchObject({ command: "summary" });
  });

  it("parses context command", () => {
    expect(parseArgs(["context"])).toMatchObject({ command: "context" });
  });

  it("parses init command", () => {
    expect(parseArgs(["init"])).toMatchObject({ command: "init" });
  });

  it("parses init --with-mcp", () => {
    const opts = parseArgs(["init", "--with-mcp"]);
    expect(opts.command).toBe("init");
    expect(opts.withMcp).toBe(true);
  });

  it("returns help for unknown command", () => {
    expect(parseArgs(["unknown"])).toMatchObject({ command: "help" });
  });

  it("parses --source cursor", () => {
    const opts = parseArgs(["extract", "--source", "cursor"]);
    expect(opts.source).toBe("cursor");
  });

  it("parses --source claude-code", () => {
    const opts = parseArgs(["extract", "--source", "claude-code"]);
    expect(opts.source).toBe("claude-code");
  });

  it("parses --source windsurf", () => {
    const opts = parseArgs(["extract", "--source", "windsurf"]);
    expect(opts.source).toBe("windsurf");
  });

  it("parses --source copilot", () => {
    const opts = parseArgs(["extract", "--source", "copilot"]);
    expect(opts.source).toBe("copilot");
  });

  it("parses watch command", () => {
    expect(parseArgs(["watch"])).toMatchObject({ command: "watch" });
  });

  it("parses --incremental flag", () => {
    const opts = parseArgs(["extract", "--incremental"]);
    expect(opts.incremental).toBe(true);
  });

  it("parses --dry-run flag", () => {
    const opts = parseArgs(["extract", "--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  it("parses --json flag", () => {
    const opts = parseArgs(["extract", "--json"]);
    expect(opts.json).toBe(true);
  });

  it("parses --type with single value", () => {
    const opts = parseArgs(["extract", "--type", "decision"]);
    expect(opts.types).toEqual(["decision"]);
  });

  it("parses --type with multiple values", () => {
    const opts = parseArgs(["extract", "--type", "decision,todo,issue"]);
    expect(opts.types).toEqual(["decision", "todo", "issue"]);
  });

  it("ignores invalid --type values", () => {
    const opts = parseArgs(["extract", "--type", "decision,invalid,todo"]);
    expect(opts.types).toEqual(["decision", "todo"]);
  });

  it("parses --since", () => {
    const opts = parseArgs(["extract", "--since", "3 days ago"]);
    expect(opts.since).toBe("3 days ago");
  });

  it("parses --topic", () => {
    const opts = parseArgs(["context", "--topic", "payment module"]);
    expect(opts.topic).toBe("payment module");
  });

  it("parses --recent", () => {
    const opts = parseArgs(["context", "--recent", "7"]);
    expect(opts.recent).toBe(7);
  });

  it("parses --copy flag", () => {
    const opts = parseArgs(["context", "--copy"]);
    expect(opts.copy).toBe(true);
  });

  it("parses --output", () => {
    const opts = parseArgs(["summary", "--output", "MEMORY.md"]);
    expect(opts.output).toBe("MEMORY.md");
  });

  it("parses --focus", () => {
    const opts = parseArgs(["summary", "--focus", "coupon system"]);
    expect(opts.focus).toBe("coupon system");
  });

  it("parses combined extract flags", () => {
    const opts = parseArgs([
      "extract",
      "--incremental",
      "--source",
      "cursor",
      "--type",
      "decision,todo",
      "--json",
    ]);
    expect(opts).toMatchObject({
      command: "extract",
      incremental: true,
      source: "cursor",
      types: ["decision", "todo"],
      json: true,
    });
  });

  // --- search command ---

  it("parses search command with query", () => {
    const opts = parseArgs(["search", "OAuth"]);
    expect(opts.command).toBe("search");
    expect(opts.query).toBe("OAuth");
  });

  it("parses search with multi-word query", () => {
    const opts = parseArgs(["search", "payment", "module"]);
    expect(opts.query).toBe("payment module");
  });

  it("parses search with --type filter", () => {
    const opts = parseArgs(["search", "auth", "--type", "decision"]);
    expect(opts.command).toBe("search");
    expect(opts.query).toBe("auth");
    expect(opts.types).toEqual(["decision"]);
  });

  it("parses search with --include-resolved", () => {
    const opts = parseArgs(["search", "API", "--include-resolved"]);
    expect(opts.includeResolved).toBe(true);
  });

  it("parses search with --json", () => {
    const opts = parseArgs(["search", "config", "--json"]);
    expect(opts.json).toBe(true);
    expect(opts.query).toBe("config");
  });

  // --- rules command ---

  it("parses rules command", () => {
    expect(parseArgs(["rules"])).toMatchObject({ command: "rules" });
  });

  it("parses rules with --output", () => {
    const opts = parseArgs(["rules", "--output", "my-rules.mdc"]);
    expect(opts.command).toBe("rules");
    expect(opts.output).toBe("my-rules.mdc");
  });

  it("parses rules with --all-authors", () => {
    const opts = parseArgs(["rules", "--all-authors"]);
    expect(opts.allAuthors).toBe(true);
  });

  it("parses rules with --target agents-md", () => {
    const opts = parseArgs(["rules", "--target", "agents-md"]);
    expect(opts.command).toBe("rules");
    expect(opts.target).toBe("agents-md");
  });

  it("parses rules with --target both and --output ignored at runtime", () => {
    const opts = parseArgs(["rules", "--target", "both", "--output", "x.md"]);
    expect(opts.target).toBe("both");
    // CLI still parses --output; the rules command itself ignores it for "both"
    expect(opts.output).toBe("x.md");
  });

  it("ignores invalid --target values (leaves opts.target undefined)", () => {
    const opts = parseArgs(["rules", "--target", "nonsense"]);
    expect(opts.command).toBe("rules");
    expect(opts.target).toBeUndefined();
  });

  // --- resolve command ---

  it("parses resolve command with pattern", () => {
    const opts = parseArgs(["resolve", "OAuth"]);
    expect(opts.command).toBe("resolve");
    expect(opts.positionalArgs).toEqual(["OAuth"]);
  });

  it("parses resolve with multi-word pattern", () => {
    const opts = parseArgs(["resolve", "payment", "module"]);
    expect(opts.positionalArgs).toEqual(["payment", "module"]);
  });

  it("parses resolve with --undo", () => {
    const opts = parseArgs(["resolve", "OAuth", "--undo"]);
    expect(opts.command).toBe("resolve");
    expect(opts.positionalArgs).toEqual(["OAuth"]);
    expect(opts.undo).toBe(true);
  });

  it("parses resolve with --author", () => {
    const opts = parseArgs(["resolve", "auth", "--author", "alice"]);
    expect(opts.positionalArgs).toEqual(["auth"]);
    expect(opts.author).toBe("alice");
  });

  // --- dashboard command ---

  it("parses dashboard command", () => {
    const opts = parseArgs(["dashboard"]);
    expect(opts.command).toBe("dashboard");
  });

  it("parses dashboard with --port", () => {
    const opts = parseArgs(["dashboard", "--port", "8080"]);
    expect(opts.command).toBe("dashboard");
    expect(opts.port).toBe(8080);
  });

  // --- context conversation-scoped flags ---

  it("parses context --source-id", () => {
    const opts = parseArgs(["context", "--source-id", "b5677be8"]);
    expect(opts.command).toBe("context");
    expect(opts.sourceId).toBe("b5677be8");
  });

  it("parses context --convo with quoted title", () => {
    const opts = parseArgs(["context", "--convo", "resume tool"]);
    expect(opts.command).toBe("context");
    expect(opts.convo).toBe("resume tool");
  });

  it("parses context --list-sources", () => {
    const opts = parseArgs(["context", "--list-sources"]);
    expect(opts.command).toBe("context");
    expect(opts.listSources).toBe(true);
  });

  it("parses context --all-matching", () => {
    const opts = parseArgs(["context", "--convo", "db", "--all-matching"]);
    expect(opts.convo).toBe("db");
    expect(opts.allMatching).toBe(true);
  });

  it("parses context --source-id combined with --copy", () => {
    const opts = parseArgs(["context", "--source-id", "ab12", "--copy"]);
    expect(opts.sourceId).toBe("ab12");
    expect(opts.copy).toBe(true);
  });

  // --- reindex --dedup ---

  it("parses reindex --dedup --dry-run", () => {
    const opts = parseArgs(["reindex", "--dedup", "--dry-run"]);
    expect(opts.command).toBe("reindex");
    expect(opts.dedup).toBe(true);
    expect(opts.dryRun).toBe(true);
  });

  // --- export / import commands ---

  it("parses export command with --output", () => {
    const opts = parseArgs(["export", "--output", "mem.json"]);
    expect(opts.command).toBe("export");
    expect(opts.output).toBe("mem.json");
  });

  it("parses export with --source-id filter", () => {
    const opts = parseArgs(["export", "--source-id", "b5677be8", "--output", "convo.json"]);
    expect(opts.command).toBe("export");
    expect(opts.sourceId).toBe("b5677be8");
    expect(opts.output).toBe("convo.json");
  });

  it("parses export with --convo and --all-authors", () => {
    const opts = parseArgs(["export", "--convo", "resume tool", "--all-authors"]);
    expect(opts.convo).toBe("resume tool");
    expect(opts.allAuthors).toBe(true);
  });

  it("parses import command with positional bundle path", () => {
    const opts = parseArgs(["import", "mem.json"]);
    expect(opts.command).toBe("import");
    expect(opts.positionalArgs).toEqual(["mem.json"]);
  });

  it("parses import with --file and --overwrite", () => {
    const opts = parseArgs(["import", "--file", "mem.json", "--overwrite"]);
    expect(opts.command).toBe("import");
    expect(opts.bundle).toBe("mem.json");
    expect(opts.overwrite).toBe(true);
  });

  it("parses import with --dry-run and --author remap", () => {
    const opts = parseArgs(["import", "bundle.json", "--dry-run", "--author", "alice"]);
    expect(opts.command).toBe("import");
    expect(opts.positionalArgs).toEqual(["bundle.json"]);
    expect(opts.dryRun).toBe(true);
    expect(opts.author).toBe("alice");
  });

  // --- summary scope flags ---

  it("parses summary --source-id", () => {
    const opts = parseArgs(["summary", "--source-id", "b5677be8"]);
    expect(opts.command).toBe("summary");
    expect(opts.sourceId).toBe("b5677be8");
  });

  it("parses summary --convo and --list-sources", () => {
    const opts = parseArgs(["summary", "--list-sources"]);
    expect(opts.command).toBe("summary");
    expect(opts.listSources).toBe(true);
  });
});
