import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  parseGitLog,
  isGitRepo,
  getFileHistory,
  isPathTracked,
} from "../git/log-reader.js";

// ---------- parseGitLog: pure ----------

describe("parseGitLog", () => {
  it("returns [] for empty input", () => {
    expect(parseGitLog("")).toEqual([]);
  });

  it("parses a single commit with a single modified file", () => {
    const stdout = [
      "COMMIT\tabc1234\t2026-04-25T10:00:00+08:00\tconor\tUpdate OAuth decision",
      "M\t.ai-memory/conor/decisions/oauth.md",
    ].join("\n");
    const r = parseGitLog(stdout);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      sha: "abc1234",
      date: "2026-04-25T10:00:00+08:00",
      author: "conor",
      subject: "Update OAuth decision",
      change: "modified",
    });
  });

  it("parses multiple commits, newest first", () => {
    const stdout = [
      "COMMIT\taaa1111\t2026-04-25T10:00:00+08:00\tconor\tUpdate",
      "M\tdecisions/oauth.md",
      "COMMIT\tbbb2222\t2026-04-20T09:00:00+08:00\talice\tAdd",
      "A\tdecisions/oauth.md",
    ].join("\n");
    const r = parseGitLog(stdout);
    expect(r).toHaveLength(2);
    expect(r[0].sha).toBe("aaa1111");
    expect(r[0].change).toBe("modified");
    expect(r[1].sha).toBe("bbb2222");
    expect(r[1].change).toBe("added");
    expect(r[1].author).toBe("alice");
  });

  it("parses delete and rename status codes", () => {
    const stdout = [
      "COMMIT\tccc3333\t2026-04-21T09:00:00Z\tbob\tRemove obsolete",
      "D\tdecisions/old.md",
      "COMMIT\tddd4444\t2026-04-15T09:00:00Z\tbob\tRename file",
      "R100\tdecisions/old.md\tdecisions/new.md",
    ].join("\n");
    const r = parseGitLog(stdout);
    expect(r[0].change).toBe("deleted");
    expect(r[1].change).toBe("renamed");
    expect(r[1].fromPath).toBe("decisions/old.md");
  });

  it("preserves tabs that are part of the commit subject", () => {
    // Subject contains a literal tab — split should rejoin.
    const stdout =
      "COMMIT\teee5555\t2026-04-21T09:00:00Z\tbob\tFix\tweird subject\nM\tfile.md";
    const r = parseGitLog(stdout);
    expect(r).toHaveLength(1);
    expect(r[0].subject).toBe("Fix\tweird subject");
  });

  it("ignores blank and unknown lines without dropping commits", () => {
    const stdout = [
      "",
      "COMMIT\tfff6666\t2026-04-21T09:00:00Z\tbob\tStuff",
      "",
      "M\tfile.md",
      "",
      "COMMIT\t9997777\t2026-04-20T09:00:00Z\tbob\tEarlier",
      "A\tfile.md",
      "",
    ].join("\n");
    const r = parseGitLog(stdout);
    expect(r).toHaveLength(2);
  });

  it("only takes the first status line per commit", () => {
    // Defence against future --stat or extra metadata.
    const stdout = [
      "COMMIT\thhh7777\t2026-04-21T09:00:00Z\tbob\tStuff",
      "M\tfile.md",
      "M\tother-file.md",
    ].join("\n");
    const r = parseGitLog(stdout);
    expect(r).toHaveLength(1);
    expect(r[0].change).toBe("modified");
  });

  it("falls back to 'other' when no recognised status code appears", () => {
    const stdout = [
      "COMMIT\tiii8888\t2026-04-21T09:00:00Z\tbob\tEmpty",
    ].join("\n");
    const r = parseGitLog(stdout);
    expect(r).toHaveLength(1);
    expect(r[0].change).toBe("other");
  });
});

// ---------- IO wrappers: real git ----------

let gitAvailable = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore", timeout: 3000 });
} catch {
  gitAvailable = false;
}
const itGit = gitAvailable ? it : it.skip;

function gitInit(cwd: string): void {
  // Use a fixed identity so the tests are deterministic on any machine.
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd });
}

function gitCommit(cwd: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd });
  execFileSync(
    "git",
    ["commit", "-q", "--allow-empty", "-m", message],
    { cwd }
  );
}

describe("log-reader: real git", () => {
  let work: string;

  beforeAll(() => {
    if (!gitAvailable) {
      // eslint-disable-next-line no-console
      console.warn("git not on PATH — skipping real-git tests");
    }
  });

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), "ai-memory-log-reader-"));
  });

  afterEach(async () => {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  });

  itGit("isGitRepo returns false outside a repo", async () => {
    expect(await isGitRepo(work)).toBe(false);
  });

  itGit("isGitRepo returns true after git init", async () => {
    gitInit(work);
    expect(await isGitRepo(work)).toBe(true);
  });

  itGit("isPathTracked is false until a file under the path is committed", async () => {
    gitInit(work);
    await mkdir(join(work, ".ai-memory"), { recursive: true });
    expect(await isPathTracked(work, ".ai-memory")).toBe(false);

    await writeFile(join(work, ".ai-memory", "x.md"), "hello", "utf-8");
    gitCommit(work, "init memory store");
    expect(await isPathTracked(work, ".ai-memory")).toBe(true);
  });

  itGit("getFileHistory returns commits newest first with status codes", async () => {
    gitInit(work);
    const file = ".ai-memory/decisions/oauth.md";
    await mkdir(join(work, ".ai-memory", "decisions"), { recursive: true });
    await writeFile(join(work, file), "v1\n", "utf-8");
    gitCommit(work, "Add OAuth decision");

    await writeFile(join(work, file), "v1\nv2\n", "utf-8");
    gitCommit(work, "Refine OAuth decision");

    const history = await getFileHistory(work, file);
    expect(history).toHaveLength(2);
    expect(history[0].subject).toBe("Refine OAuth decision");
    expect(history[0].change).toBe("modified");
    expect(history[1].subject).toBe("Add OAuth decision");
    expect(history[1].change).toBe("added");
    // ISO date sanity check
    expect(history[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(history[0].author).toBe("Test User");
  });

  itGit("getFileHistory follows renames", async () => {
    gitInit(work);
    const oldPath = ".ai-memory/decisions/old.md";
    const newPath = ".ai-memory/decisions/new.md";
    await mkdir(join(work, ".ai-memory", "decisions"), { recursive: true });
    await writeFile(join(work, oldPath), "decision body that has enough words to defeat similarity threshold tweaks if any\n", "utf-8");
    gitCommit(work, "Add original decision");

    // Use git mv so rename is detected unambiguously
    execFileSync("git", ["mv", oldPath, newPath], { cwd: work });
    gitCommit(work, "Rename old to new");

    const history = await getFileHistory(work, newPath);
    expect(history.length).toBeGreaterThanOrEqual(2);
    // Most recent is the rename
    expect(history[0].subject).toBe("Rename old to new");
    expect(["renamed", "added", "modified"]).toContain(history[0].change);
  });

  itGit("getFileHistory returns [] for an untracked file", async () => {
    gitInit(work);
    const r = await getFileHistory(work, ".ai-memory/nope.md");
    expect(r).toEqual([]);
  });

  itGit("getFileHistory returns [] when cwd is not a git repo", async () => {
    const r = await getFileHistory(work, "anything.md");
    expect(r).toEqual([]);
  });
});
