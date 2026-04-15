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
});
