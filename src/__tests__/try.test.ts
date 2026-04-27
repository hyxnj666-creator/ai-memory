/**
 * Tests for `ai-memory try` (v2.5-02 — no-API-key demo mode).
 *
 * The contract this test suite pins:
 *
 *   1. The bundled scenario locator finds `docs/assets/demo/scenario` from
 *      the dev layout (`src/commands/try.ts`). This is the layout the
 *      tests run against; the built-tarball layout has the same probe in
 *      `findBundledScenario` and is exercised separately via
 *      `npm pack --dry-run` in the release checklist.
 *   2. `bootstrapTryStore` produces a fresh tmp dir with the scenario
 *      contents copied verbatim — including the dotfile `.ai-memory/`
 *      subtree, which is the easy-to-miss bit when packaging via npm.
 *   3. `generateAgentsMdFromStore` produces an AGENTS.md whose body
 *      contains both expected memory titles (the decision + convention)
 *      AND drops the architecture memory (matching the `rules` filter).
 *      The scorer-style "must-contain + must-not-contain" pair pins
 *      both halves of the contract in one shot.
 *   4. `runTry` cleans up the tmp dir by default (no-keep) and returns 0.
 *   5. `runTry({keep: true})` leaves the tmp dir behind so the user can
 *      `cd` into it; the tmp path is reachable from the JSON output.
 *   6. `runTry({json: true})` emits a single valid JSON line with the
 *      shape downstream tooling can rely on (per-type counts, authors
 *      array, full AGENTS.md content).
 *
 * Tests use real fs in `os.tmpdir()` rather than mocking — both because
 * the existing test suite (memory-store.test.ts, agents-md-writer.test.ts,
 * doctor.test.ts) does the same, and because mocking `fs.cp` would
 * defeat the point of locking the dotfile-copy behaviour.
 */

import { describe, it, expect } from "vitest";
import { stat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  findBundledScenario,
  bootstrapTryStore,
  generateAgentsMdFromStore,
  runTry,
} from "../commands/try.js";

// ---------- findBundledScenario ----------

describe("findBundledScenario", () => {
  it("locates the bundled docs/assets/demo/scenario from the dev layout", async () => {
    const scenarioDir = await findBundledScenario();
    expect(scenarioDir).not.toBeNull();
    if (!scenarioDir) return;
    const ai = await stat(join(scenarioDir, ".ai-memory"));
    expect(ai.isDirectory()).toBe(true);
    const cfg = await stat(join(scenarioDir, ".ai-memory", ".config.json"));
    expect(cfg.isFile()).toBe(true);
  });

  it("returns null when neither candidate path exists", async () => {
    // Build a syntactically-valid file URL on whatever host runs the
    // test (Windows needs a drive letter; POSIX doesn't). pathToFileURL
    // handles both shapes, and the chosen path is one that no real fs
    // could ever have a sibling docs/assets/demo/scenario for.
    const { pathToFileURL } = await import("node:url");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const fakeFileUrl = pathToFileURL(
      join(tmpdir(), "ai-memory-test-no-scenario-here", "try.js")
    ).href;
    const result = await findBundledScenario(fakeFileUrl);
    expect(result).toBeNull();
  });

  it("returns null gracefully when given a malformed file URL", async () => {
    // Defensive behaviour: callers (e.g. the runtime executable) should
    // never pass garbage, but if they do, throw-vs-null matters because
    // `runTry` only checks for null and would otherwise propagate an
    // opaque TypeError to the user instead of the friendly missing-
    // scenario message.
    const result = await findBundledScenario("not-a-url-at-all");
    expect(result).toBeNull();
  });
});

// ---------- bootstrapTryStore ----------

describe("bootstrapTryStore", () => {
  it("copies the scenario into a fresh tmp dir, including dotfiles", async () => {
    const scenarioDir = await findBundledScenario();
    expect(scenarioDir).not.toBeNull();
    if (!scenarioDir) return;

    const tmp = await bootstrapTryStore(scenarioDir);
    try {
      const entries = await readdir(tmp, { withFileTypes: true });
      const names = entries.map((e) => e.name);
      // The whole scenario lives under .ai-memory/; without proper
      // dotfile handling in npm `files` packing this would be missing.
      expect(names).toContain(".ai-memory");

      const config = await readFile(
        join(tmp, ".ai-memory", ".config.json"),
        "utf-8"
      );
      const parsed = JSON.parse(config);
      expect(parsed.output.dir).toBe(".ai-memory");
      expect(parsed.output.language).toBe("en");

      // Two author subdirs — proves multi-author copy works
      const aiDir = await readdir(join(tmp, ".ai-memory"), {
        withFileTypes: true,
      });
      const authorDirs = aiDir
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      expect(authorDirs).toEqual(["alice", "conor"]);
    } finally {
      // Tests don't rely on `runTry` for cleanup, so do it manually.
      const { rm } = await import("node:fs/promises");
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ---------- generateAgentsMdFromStore ----------

describe("generateAgentsMdFromStore", () => {
  it("produces AGENTS.md with the decision + convention, drops architecture", async () => {
    const scenarioDir = await findBundledScenario();
    expect(scenarioDir).not.toBeNull();
    if (!scenarioDir) return;

    const tmp = await bootstrapTryStore(scenarioDir);
    try {
      const result = await generateAgentsMdFromStore(tmp, "en");
      expect(result.totalMemories).toBe(3);
      expect(result.decisions).toBe(1);
      expect(result.conventions).toBe(1);
      expect(result.architecture).toBe(1);
      expect(result.authors).toEqual(["alice", "conor"]);

      // Title-membership assertions — pin the rules-filter contract
      // (decision + convention only, no architecture in AGENTS.md).
      expect(result.content).toContain(
        "OAuth 2.0 authorization code flow with PKCE"
      );
      expect(result.content).toContain(
        "Cursor pagination is mandatory for all paged GraphQL endpoints"
      );
      expect(result.content).not.toContain("Event sourcing for the billing");

      // Output-format anchor — confirms we routed through the real
      // agents-md-writer (markers present) rather than rolling our own.
      expect(result.content).toContain("ai-memory:managed-section start");
      expect(result.content).toContain("ai-memory:managed-section end");
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ---------- runTry ----------

describe("runTry", () => {
  it("returns 0 and cleans up the tmp dir by default", async () => {
    // Capture stdout so the test output stays clean
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));

    let code: number;
    try {
      code = await runTry({ command: "try", json: true });
    } finally {
      console.log = originalLog;
    }

    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]) as {
      ok: boolean;
      tmpDir: string;
      kept: boolean;
      conventions: number;
      decisions: number;
      architecture: number;
      totalMemories: number;
      authors: string[];
      agentsMdPath: string;
      agentsMdContent: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.kept).toBe(false);
    expect(payload.totalMemories).toBe(3);
    expect(payload.decisions).toBe(1);
    expect(payload.conventions).toBe(1);
    expect(payload.architecture).toBe(1);
    expect(payload.authors).toEqual(["alice", "conor"]);
    expect(payload.agentsMdContent).toContain("PKCE");
    expect(payload.agentsMdContent).toContain("cursor pagination");

    // The tmp dir from a non-keep run must be gone afterwards
    let stillThere = true;
    try {
      await stat(payload.tmpDir);
    } catch {
      stillThere = false;
    }
    expect(stillThere).toBe(false);
  });

  it("keeps the tmp dir when --keep is set", async () => {
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));

    let code: number;
    try {
      code = await runTry({ command: "try", json: true, keep: true });
    } finally {
      console.log = originalLog;
    }

    expect(code).toBe(0);
    const payload = JSON.parse(lines[0]) as {
      ok: boolean;
      tmpDir: string;
      kept: boolean;
    };
    expect(payload.kept).toBe(true);
    const dir = await stat(payload.tmpDir);
    expect(dir.isDirectory()).toBe(true);
    // Manual cleanup — the test's job, not the command's, when --keep wins.
    const { rm } = await import("node:fs/promises");
    await rm(payload.tmpDir, { recursive: true, force: true });
  });

  it("re-runs are independent (each invocation gets a fresh tmp dir)", async () => {
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));

    try {
      await runTry({ command: "try", json: true });
      await runTry({ command: "try", json: true });
    } finally {
      console.log = originalLog;
    }

    const a = JSON.parse(lines[0]) as { tmpDir: string };
    const b = JSON.parse(lines[1]) as { tmpDir: string };
    expect(a.tmpDir).not.toBe(b.tmpDir);
  });
});
