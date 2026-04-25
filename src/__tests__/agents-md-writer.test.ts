import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildManagedSection,
  mergeAgentsMd,
  writeAgentsMd,
  MARKER_START,
  MARKER_END,
  AGENTS_MD_DEFAULT_PATH,
} from "../rules/agents-md-writer.js";
import type { ExtractedMemory } from "../types.js";

// ---------- Test fixtures ----------

const conventionMem: ExtractedMemory = {
  type: "convention",
  title: "Use kebab-case for filenames",
  date: "2026-04-25",
  context: "module organisation",
  content: "All TypeScript filenames are kebab-case (e.g. `agents-md-writer.ts`).",
  reasoning: "Matches the rest of the npm ecosystem.",
  sourceId: "src-1",
  sourceTitle: "naming discussion",
  sourceType: "cursor",
};

const decisionMem: ExtractedMemory = {
  type: "decision",
  title: "Adopt MCP for runtime memory delivery",
  date: "2026-04-25",
  context: "memory access pattern",
  content: "Runtime memory access happens via the MCP server, not direct file reads.",
  reasoning: "Editors already speak MCP; native plumbing avoids per-editor SDKs.",
  alternatives: "Direct stdio CLI hand-off; HTTP daemon; library import.",
  sourceId: "src-2",
  sourceTitle: "MCP design",
  sourceType: "claude-code",
};

const todoMem: ExtractedMemory = {
  type: "todo",
  title: "Should not appear in AGENTS.md",
  date: "2026-04-25",
  context: "ignored",
  content: "todos are filtered out at the section builder",
  sourceId: "src-3",
  sourceTitle: "noise",
  sourceType: "cursor",
};

// ---------- buildManagedSection ----------

describe("buildManagedSection", () => {
  it("includes start and end markers", () => {
    const section = buildManagedSection([conventionMem], "en");
    expect(section.startsWith(MARKER_START)).toBe(true);
    expect(section.endsWith(MARKER_END)).toBe(true);
  });

  it("renders conventions and decisions in separate H2 sections", () => {
    const section = buildManagedSection([conventionMem, decisionMem], "en");
    expect(section).toMatch(/## Project conventions/);
    expect(section).toMatch(/## Technical decisions/);
    expect(section).toMatch(/Use kebab-case for filenames/);
    expect(section).toMatch(/Adopt MCP for runtime memory delivery/);
  });

  it("only renders convention/decision types — todos/issues are ignored", () => {
    const section = buildManagedSection(
      [conventionMem, decisionMem, todoMem],
      "en"
    );
    expect(section).not.toMatch(/Should not appear in AGENTS\.md/);
  });

  it("renders zh-CN headings when language=zh", () => {
    const section = buildManagedSection([conventionMem, decisionMem], "zh");
    expect(section).toMatch(/项目约定/);
    expect(section).toMatch(/技术决策/);
    expect(section).toMatch(/原因:/);
    expect(section).toMatch(/已排除方案:/);
  });

  it("includes a placeholder comment when there are no conventions or decisions", () => {
    const section = buildManagedSection([], "en");
    expect(section).toMatch(/has not extracted any conventions or decisions/);
  });

  it("is deterministic: same inputs produce byte-identical output", () => {
    const a = buildManagedSection([conventionMem, decisionMem], "en");
    const b = buildManagedSection([conventionMem, decisionMem], "en");
    expect(a).toBe(b);
  });

  it("renders Why and Rejected for decisions with reasoning + alternatives", () => {
    const section = buildManagedSection([decisionMem], "en");
    expect(section).toMatch(/Why: Editors already speak MCP/);
    expect(section).toMatch(/Rejected: Direct stdio CLI/);
  });
});

// ---------- mergeAgentsMd: pure ----------

describe("mergeAgentsMd", () => {
  const sampleSection = buildManagedSection([conventionMem], "en");

  it("creates a file with header + section when existing is null", () => {
    const r = mergeAgentsMd(null, sampleSection, "en");
    expect(r.action).toBe("created");
    expect(r.nextContent).toBeDefined();
    expect(r.nextContent).toMatch(/^# AGENTS\.md/);
    expect(r.nextContent).toContain(sampleSection);
  });

  it("creates with zh header when language=zh", () => {
    const r = mergeAgentsMd(null, sampleSection, "zh");
    expect(r.action).toBe("created");
    expect(r.nextContent).toMatch(/AI 编程助手/);
  });

  it("appends section to a hand-written file with no markers (preserving user content)", () => {
    const handWritten = "# My project\n\nSome rules I wrote myself.\n";
    const r = mergeAgentsMd(handWritten, sampleSection, "en");
    expect(r.action).toBe("appended");
    expect(r.nextContent).toMatch(/^# My project/);
    expect(r.nextContent).toMatch(/Some rules I wrote myself\./);
    expect(r.nextContent).toContain(sampleSection);
  });

  it("replaces ONLY the managed section, leaving surrounding content intact", () => {
    const initial = mergeAgentsMd(
      "# Hand-written\n\nKeep me.",
      sampleSection,
      "en"
    );
    expect(initial.action).toBe("appended");
    const file = initial.nextContent!;

    const newerSection = buildManagedSection(
      [conventionMem, decisionMem],
      "en"
    );
    const r = mergeAgentsMd(file, newerSection, "en");
    expect(r.action).toBe("updated");
    expect(r.nextContent).toMatch(/^# Hand-written/);
    expect(r.nextContent).toMatch(/Keep me\./);
    expect(r.nextContent).toContain(newerSection);
    expect(r.nextContent).not.toContain(
      "Use kebab-case for filenames\n\nMatches the rest of the npm ecosystem."
    );
  });

  it("is idempotent: re-merging the same section returns already-up-to-date", () => {
    const created = mergeAgentsMd(null, sampleSection, "en").nextContent!;
    const r = mergeAgentsMd(created, sampleSection, "en");
    expect(r.action).toBe("already-up-to-date");
    expect(r.nextContent).toBeUndefined();
  });

  it("returns conflict when only the start marker is present", () => {
    const broken = `# Project\n${MARKER_START}\nstuff but no end\n`;
    const r = mergeAgentsMd(broken, sampleSection, "en");
    expect(r.action).toBe("conflict");
    expect(r.reason).toMatch(/unbalanced markers/);
  });

  it("returns conflict when only the end marker is present", () => {
    const broken = `# Project\n${MARKER_END}\n`;
    const r = mergeAgentsMd(broken, sampleSection, "en");
    expect(r.action).toBe("conflict");
    expect(r.reason).toMatch(/unbalanced markers/);
  });

  it("returns conflict on duplicate start markers", () => {
    const broken =
      `# P\n${MARKER_START}\nA\n${MARKER_START}\nB\n${MARKER_END}\n`;
    const r = mergeAgentsMd(broken, sampleSection, "en");
    expect(r.action).toBe("conflict");
    expect(r.reason).toMatch(/2 start markers/);
  });

  it("returns conflict on duplicate end markers", () => {
    const broken =
      `# P\n${MARKER_START}\nA\n${MARKER_END}\nB\n${MARKER_END}\n`;
    const r = mergeAgentsMd(broken, sampleSection, "en");
    expect(r.action).toBe("conflict");
    expect(r.reason).toMatch(/2 end markers/);
  });

  it("returns conflict when end marker appears before start marker", () => {
    const broken = `# P\n${MARKER_END}\nstuff\n${MARKER_START}\n`;
    const r = mergeAgentsMd(broken, sampleSection, "en");
    expect(r.action).toBe("conflict");
    // With one start + one end but inverted, locator reports inversion message
    expect(r.reason).toMatch(/end marker appears before start marker/);
  });

  it("does NOT mistake the literal marker text inside a fenced code block for a real marker", () => {
    // Realistic case: a user's hand-written AGENTS.md teaches readers about
    // ai-memory and quotes the marker text inside a ``` fence. With line-
    // anchored detection this is correctly treated as "missing" (so the real
    // section is appended), not a malformed conflict.
    const tutorial = [
      "# AGENTS.md",
      "",
      "## How ai-memory writes its section",
      "",
      "```markdown",
      `Once you run \`ai-memory rules --target agents-md\`, look for these lines:`,
      `  ${MARKER_START}`,
      `  ...generated content...`,
      `  ${MARKER_END}`,
      "```",
      "",
      "Hand-written rule: prefer descriptive PR titles.",
      "",
    ].join("\n");

    const r = mergeAgentsMd(tutorial, sampleSection, "en");
    expect(r.action).toBe("appended");
    expect(r.nextContent).toContain("How ai-memory writes its section");
    expect(r.nextContent).toContain("Hand-written rule: prefer descriptive PR titles.");
    // Tutorial fence still intact AND a real managed section appended.
    expect(r.nextContent).toContain(sampleSection);
  });

  it("recognises a marker line that has trailing whitespace", () => {
    const tweaked =
      `# H\n${MARKER_START}   \nold body\n${MARKER_END}\t\n`;
    const r = mergeAgentsMd(tweaked, sampleSection, "en");
    expect(r.action).toBe("updated");
    expect(r.nextContent).toMatch(/^# H/);
    // Old body inside the section is gone
    expect(r.nextContent).not.toMatch(/old body/);
    expect(r.nextContent).toContain(sampleSection);
  });

  it("does NOT recognise a marker that is not on its own line", () => {
    // Marker token is in the middle of a sentence — should not be detected.
    const inline =
      `# H\n\nsee inline ${MARKER_START} stuff ${MARKER_END} here\n`;
    const r = mergeAgentsMd(inline, sampleSection, "en");
    expect(r.action).toBe("appended");
    expect(r.nextContent).toContain("see inline");
  });
});

// ---------- writeAgentsMd: filesystem IO ----------

describe("writeAgentsMd", () => {
  let workDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "ai-memory-agentsmd-"));
    originalCwd = process.cwd();
    process.chdir(workDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workDir, { recursive: true, force: true });
  });

  it("creates AGENTS.md when missing", async () => {
    const r = await writeAgentsMd([conventionMem, decisionMem], {
      language: "en",
    });
    expect(r.action).toBe("created");
    expect(r.wrote).toBe(true);
    expect(r.outputPath).toBe(AGENTS_MD_DEFAULT_PATH);
    expect(r.conventions).toBe(1);
    expect(r.decisions).toBe(1);

    const onDisk = await readFile(AGENTS_MD_DEFAULT_PATH, "utf-8");
    expect(onDisk).toMatch(/^# AGENTS\.md/);
    expect(onDisk).toContain(MARKER_START);
    expect(onDisk).toContain(MARKER_END);
    expect(onDisk).toMatch(/Use kebab-case for filenames/);
  });

  it("running twice in a row is byte-identical (no second write)", async () => {
    await writeAgentsMd([conventionMem], { language: "en" });
    const before = await readFile(AGENTS_MD_DEFAULT_PATH, "utf-8");

    const r2 = await writeAgentsMd([conventionMem], { language: "en" });
    expect(r2.action).toBe("already-up-to-date");
    expect(r2.wrote).toBe(false);

    const after = await readFile(AGENTS_MD_DEFAULT_PATH, "utf-8");
    expect(after).toBe(before);
  });

  it("preserves a user's hand-written AGENTS.md when appending", async () => {
    const userContent =
      "# AGENTS.md\n\n## Local rules\n\nNever push to main on Friday.\n";
    await writeFile(AGENTS_MD_DEFAULT_PATH, userContent, "utf-8");

    const r = await writeAgentsMd([conventionMem], { language: "en" });
    expect(r.action).toBe("appended");
    expect(r.wrote).toBe(true);

    const onDisk = await readFile(AGENTS_MD_DEFAULT_PATH, "utf-8");
    expect(onDisk).toContain("Never push to main on Friday.");
    expect(onDisk).toContain(MARKER_START);
    expect(onDisk).toContain("Use kebab-case for filenames");
  });

  it("replaces ONLY the managed section on subsequent runs", async () => {
    await writeFile(
      AGENTS_MD_DEFAULT_PATH,
      "# AGENTS.md\n\n## Manual rule\n\nLine the user wrote.\n",
      "utf-8"
    );
    await writeAgentsMd([conventionMem], { language: "en" });

    // Now extraction surfaces a brand-new convention; re-run.
    const newer: ExtractedMemory = {
      ...conventionMem,
      title: "Use 2-space indents in TypeScript",
      content: "All `.ts` files use 2-space indents.",
      reasoning: "Matches Prettier defaults.",
    };
    const r = await writeAgentsMd([newer], { language: "en" });
    expect(r.action).toBe("updated");
    expect(r.wrote).toBe(true);

    const onDisk = await readFile(AGENTS_MD_DEFAULT_PATH, "utf-8");
    expect(onDisk).toContain("Line the user wrote.");
    expect(onDisk).toContain("Use 2-space indents in TypeScript");
    // Old convention must be gone (it was inside the managed section)
    expect(onDisk).not.toMatch(/Use kebab-case for filenames/);
  });

  it("refuses to write when AGENTS.md has malformed markers", async () => {
    const broken = `# AGENTS.md\n\n${MARKER_START}\nhalf-written and truncated\n`;
    await writeFile(AGENTS_MD_DEFAULT_PATH, broken, "utf-8");

    const r = await writeAgentsMd([conventionMem], { language: "en" });
    expect(r.action).toBe("conflict");
    expect(r.wrote).toBe(false);
    expect(r.reason).toMatch(/markers/i);

    // File on disk untouched
    const onDisk = await readFile(AGENTS_MD_DEFAULT_PATH, "utf-8");
    expect(onDisk).toBe(broken);
  });

  it("honours a custom outputPath", async () => {
    const custom = "AGENTS.custom.md";
    const r = await writeAgentsMd([conventionMem], {
      language: "en",
      outputPath: custom,
    });
    expect(r.action).toBe("created");
    expect(r.outputPath).toBe(custom);
    const onDisk = await readFile(custom, "utf-8");
    expect(onDisk).toContain("Use kebab-case for filenames");
  });
});
