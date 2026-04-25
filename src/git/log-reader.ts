/**
 * Thin wrapper around `git log` for the `recall` command.
 *
 * Design constraints:
 *   - No new runtime dep — uses `node:child_process.execFile`.
 *   - Pure-as-possible: the hot logic (`parseGitLog`) is a pure string→struct
 *     function so tests can hammer it without spawning git.
 *   - Defensive timeouts and bounded buffers — recall is allowed to fall back
 *     to "no history" rather than block the CLI.
 */

import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(_execFile);

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 4 * 1024 * 1024;

const COMMIT_PREFIX = "COMMIT";
const FIELD_SEP = "\t";
// %h short sha, %aI strict ISO 8601, %an author name, %s subject (subject may
// contain anything except newline). We deliberately use %x09 (tab) as our
// field separator because subjects rarely contain tabs and we don't have to
// shell-escape anything.
const FORMAT = `--pretty=format:${COMMIT_PREFIX}%x09%h%x09%aI%x09%an%x09%s`;

// ---------- Types ----------

export type CommitChange =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "other";

export interface CommitInfo {
  /** Short SHA (7+ chars). */
  sha: string;
  /** ISO 8601 author date, e.g. "2026-04-25T10:23:45+08:00". */
  date: string;
  /** Author name from the commit (NOT necessarily the memory's author field). */
  author: string;
  /** Commit subject (first line of message). */
  subject: string;
  /** Status of the file in this commit. */
  change: CommitChange;
  /** When change="renamed" / "copied", the previous path. */
  fromPath?: string;
}

// ---------- Pure parser ----------

/**
 * Parse the raw stdout of:
 *
 *   git log --follow --name-status --pretty=format:COMMIT\t%h\t%aI\t%an\t%s -- <path>
 *
 * Output looks like:
 *
 *   COMMIT\t<sha>\t<iso-date>\t<author>\t<subject>
 *   M\t<path>
 *   COMMIT\t...
 *   R100\t<old-path>\t<new-path>
 *   ...
 *
 * Blank lines and unrecognised status codes are tolerated. Robust to multi-
 * line subjects only insofar as `%s` is single-line by definition; if a
 * future caller switches to `%B` (full message) this parser will break.
 */
export function parseGitLog(stdout: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  let current: CommitInfo | null = null;

  const lines = stdout.split("\n");
  for (const raw of lines) {
    if (!raw) continue;

    if (raw.startsWith(`${COMMIT_PREFIX}${FIELD_SEP}`)) {
      if (current) commits.push(current);
      const parts = raw.split(FIELD_SEP);
      // [COMMIT, sha, date, author, ...subjectParts]
      if (parts.length < 5) {
        current = null;
        continue;
      }
      const [, sha, date, author, ...rest] = parts;
      current = {
        sha,
        date,
        author,
        subject: rest.join(FIELD_SEP),
        change: "other",
      };
      continue;
    }

    if (!current) continue;

    // name-status line. We only care about the FIRST status line we see for
    // a given commit (the path we asked about).
    if (current.change !== "other") continue;

    const parts = raw.split(FIELD_SEP).filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    const code = parts[0];

    if (code === "A") {
      current.change = "added";
    } else if (code === "M") {
      current.change = "modified";
    } else if (code === "D") {
      current.change = "deleted";
    } else if (code.startsWith("R")) {
      current.change = "renamed";
      // R<percent>\t<old>\t<new>
      if (parts.length >= 3) current.fromPath = parts[1];
    } else if (code.startsWith("C")) {
      current.change = "copied";
      if (parts.length >= 3) current.fromPath = parts[1];
    }
  }

  if (current) commits.push(current);
  return commits;
}

// ---------- IO wrappers ----------

/**
 * True iff `cwd` is inside a git working tree. We deliberately use
 * `--is-inside-work-tree` rather than `--git-dir` so a bare repo or a path
 * inside `.git/` itself returns false (we never want to reach into those).
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const r = await execFile(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd, timeout: GIT_TIMEOUT_MS }
    );
    return r.stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Get the rename-following commit history for a single file. Returns an
 * empty array on any failure (path not tracked, git missing, timeout) —
 * recall treats absent history as a soft signal, never a hard error.
 *
 * Newest commit first.
 */
export async function getFileHistory(
  cwd: string,
  filePath: string
): Promise<CommitInfo[]> {
  try {
    const r = await execFile(
      "git",
      ["log", "--follow", "--name-status", FORMAT, "--", filePath],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER }
    );
    return parseGitLog(r.stdout);
  } catch {
    return [];
  }
}

/**
 * True iff git tracks at least one file under `dir` (relative to `cwd`).
 * Used by `recall` to distinguish "we're in a git repo but the user hasn't
 * committed `.ai-memory/` yet" from "we're in a git repo with full lineage".
 */
export async function isPathTracked(
  cwd: string,
  dir: string
): Promise<boolean> {
  try {
    const r = await execFile(
      "git",
      ["ls-files", "--", dir],
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER }
    );
    return r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}
