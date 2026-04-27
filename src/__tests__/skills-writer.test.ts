import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildDescription,
  buildSkillContent,
  writeSkills,
  SKILLS_DEFAULT_DIR,
  SKILL_CATALOGUE,
} from "../rules/skills-writer.js";
import type { ExtractedMemory } from "../types.js";

// ---------- Fixtures ----------

const conv1: ExtractedMemory = {
  type: "convention",
  title: "Use kebab-case for filenames",
  date: "2026-04-25",
  context: "module organisation",
  content: "All TypeScript filenames are kebab-case.",
  reasoning: "Matches the rest of the npm ecosystem.",
  sourceId: "s1",
  sourceTitle: "naming discussion",
  sourceType: "cursor",
};

const conv2: ExtractedMemory = {
  type: "convention",
  title: "Relay-style cursor pagination",
  date: "2026-04-26",
  context: "API design",
  content: "Paginated endpoints return `{ edges, pageInfo }`.",
  sourceId: "s2",
  sourceTitle: "pagination thread",
  sourceType: "cursor",
};

const dec1: ExtractedMemory = {
  type: "decision",
  title: "Adopt MCP for runtime delivery",
  date: "2026-04-25",
  context: "delivery mechanism",
  content: "Runtime memory flows through the MCP server, not direct file reads.",
  reasoning: "Editors already speak MCP.",
  alternatives: "Direct stdio CLI; HTTP daemon; library import.",
  sourceId: "s3",
  sourceTitle: "MCP design",
  sourceType: "claude-code",
};

const decResolved: ExtractedMemory = {
  type: "decision",
  title: "Should be excluded — already resolved",
  date: "2026-04-20",
  context: "obsolete",
  content: "This decision was superseded.",
  status: "resolved",
  sourceId: "s4",
  sourceTitle: "obsolete",
  sourceType: "cursor",
};

const arch1: ExtractedMemory = {
  type: "architecture",
  title: "Event-sourced billing audit log",
  date: "2026-04-25",
  context: "billing",
  content: "Billing writes append-only events; aggregates are projections.",
  sourceId: "s5",
  sourceTitle: "billing arch",
  sourceType: "windsurf",
};

const todoMem: ExtractedMemory = {
  type: "todo",
  title: "Never enters skills",
  date: "2026-04-25",
  context: "transient",
  content: "TODOs do not become auto-loaded skills.",
  sourceId: "s6",
  sourceTitle: "todo",
  sourceType: "cursor",
};

const issueMem: ExtractedMemory = {
  type: "issue",
  title: "Also never enters skills",
  date: "2026-04-25",
  context: "transient",
  content: "Issues do not become auto-loaded skills.",
  sourceId: "s7",
  sourceTitle: "issue",
  sourceType: "cursor",
};

// ---------- buildDescription ----------

describe("buildDescription", () => {
  const conventionDescriptor = SKILL_CATALOGUE.find(
    (d) => d.memoryType === "convention"
  )!;

  it("emits prefix + when context when there are no memories", () => {
    const out = buildDescription(conventionDescriptor, [], "en");
    expect(out).toContain("Project coding conventions");
    expect(out).toContain("Load when writing");
    expect(out).not.toContain("Topics");
  });

  it("appends a Topics list with the memory titles when memories present", () => {
    const out = buildDescription(conventionDescriptor, [conv1, conv2], "en");
    expect(out).toContain("Topics:");
    expect(out).toContain("Use kebab-case for filenames");
    expect(out).toContain("Relay-style cursor pagination");
    expect(out.endsWith(".")).toBe(true);
  });

  it("stays within the 300-char cap and elides with … when needed", () => {
    const longMems: ExtractedMemory[] = Array.from({ length: 30 }, (_, i) => ({
      ...conv1,
      title: `Convention number ${i + 1} with a moderately long title`,
    }));
    const out = buildDescription(conventionDescriptor, longMems, "en");
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out.endsWith("….") || out.endsWith("….") || out.includes(", …")).toBe(true);
  });

  it("hard-truncates a single overlong title with an ellipsis when even one won't fit", () => {
    const monsterTitle = "x".repeat(500);
    const longMem: ExtractedMemory = { ...conv1, title: monsterTitle };
    const out = buildDescription(conventionDescriptor, [longMem], "en");
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).toMatch(/x+…\.$/);
  });

  it("renders Chinese prefix + when when language=zh", () => {
    const out = buildDescription(conventionDescriptor, [conv1], "zh");
    expect(out).toContain("从对话历史提取");
    expect(out).toContain("主题:");
  });
});

// ---------- buildSkillContent ----------

describe("buildSkillContent", () => {
  const conventionDescriptor = SKILL_CATALOGUE.find(
    (d) => d.memoryType === "convention"
  )!;

  it("produces YAML frontmatter with name and description, then markdown body", () => {
    const out = buildSkillContent(conventionDescriptor, [conv1], "en");
    expect(out).toMatch(/^---\nname: ai-memory-coding-conventions\ndescription: .+\n---\n/);
    expect(out).toContain("# Coding Conventions");
    expect(out).toContain("## Use kebab-case for filenames");
    expect(out).toContain("All TypeScript filenames are kebab-case.");
    expect(out).toContain("Why: Matches the rest of the npm ecosystem.");
  });

  it("renders the human-edit warning callout", () => {
    const out = buildSkillContent(conventionDescriptor, [conv1], "en");
    expect(out).toContain("Auto-generated by ai-memory");
    expect(out).toContain("regenerated on every");
  });

  it("preserves rejected alternatives when present", () => {
    const decisionDescriptor = SKILL_CATALOGUE.find((d) => d.memoryType === "decision")!;
    const out = buildSkillContent(decisionDescriptor, [dec1], "en");
    expect(out).toContain("Rejected: Direct stdio CLI; HTTP daemon; library import.");
  });

  it("is byte-identical for identical inputs (idempotency)", () => {
    const a = buildSkillContent(conventionDescriptor, [conv1, conv2], "en");
    const b = buildSkillContent(conventionDescriptor, [conv1, conv2], "en");
    expect(a).toEqual(b);
  });

  it("normalises CRLF to LF in body content", () => {
    const crlfMem: ExtractedMemory = {
      ...conv1,
      content: "line one\r\nline two\r\nline three",
    };
    const out = buildSkillContent(conventionDescriptor, [crlfMem], "en");
    expect(out).not.toContain("\r");
    expect(out).toContain("line one\nline two\nline three");
  });

  it("normalises CRLF in `reasoning` and `alternatives` too (idempotency parity)", () => {
    // Regression guard for v2.5-04 audit: the original implementation
    // only normalised `content`, leaving CRLF in `reasoning` / `alternatives`
    // intact. That made the byte-identical idempotency check produce
    // spurious diffs on Windows-edited memories.
    const crlfMem: ExtractedMemory = {
      ...conv1,
      content: "main content",
      reasoning: "first reason\r\nsecond reason",
      alternatives: "alt one\r\nalt two",
    };
    const out = buildSkillContent(conventionDescriptor, [crlfMem], "en");
    expect(out).not.toContain("\r");
    expect(out).toContain("Why: first reason\nsecond reason");
    expect(out).toContain("Rejected: alt one\nalt two");
  });

  it("quotes the description when it contains characters YAML treats specially", () => {
    // Force a description with `: ` by using a pathological title.
    const pathological: ExtractedMemory = {
      ...conv1,
      title: "Note: prefer Cursor: over Windsurf:",
    };
    const out = buildSkillContent(conventionDescriptor, [pathological], "en");
    // After the `description: ` field name there should be a quoted scalar
    // (because the value itself contains ": ").
    const descLine = out.split("\n").find((l) => l.startsWith("description:"))!;
    expect(descLine).toMatch(/^description: ".*"$/);
  });
});

// ---------- writeSkills (filesystem IO) ----------

describe("writeSkills", () => {
  let tmp: string;
  let outDir: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ai-memory-skills-test-"));
    outDir = join(tmp, ".claude", "skills");
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writes one SKILL.md per memory type that has memories, skips the rest", async () => {
    const memories = [conv1, dec1]; // no architecture
    const result = await writeSkills(memories, { language: "en", outputDir: outDir });

    expect(result.skills).toHaveLength(2);
    const names = result.skills.map((s) => s.name).sort();
    expect(names).toEqual([
      "ai-memory-coding-conventions",
      "ai-memory-decision-log",
    ]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].name).toBe("ai-memory-system-architecture");

    for (const s of result.skills) {
      const content = await readFile(s.path, "utf-8");
      expect(content).toMatch(/^---\nname: /);
      expect(s.action).toBe("created");
      expect(s.wrote).toBe(true);
    }
  });

  it("excludes resolved decisions (status: resolved) from the decision-log skill", async () => {
    const result = await writeSkills([dec1, decResolved], {
      language: "en",
      outputDir: outDir,
    });
    const decisionSkill = result.skills.find((s) => s.name === "ai-memory-decision-log");
    expect(decisionSkill).toBeDefined();
    expect(decisionSkill!.memories).toBe(1); // only dec1 — decResolved excluded

    const content = await readFile(decisionSkill!.path, "utf-8");
    expect(content).toContain("Adopt MCP for runtime delivery");
    expect(content).not.toContain("already resolved");
  });

  it("never produces todo or issue skills (transient types are excluded by design)", async () => {
    const result = await writeSkills([conv1, todoMem, issueMem], {
      language: "en",
      outputDir: outDir,
    });
    const names = result.skills.map((s) => s.name);
    expect(names).not.toContain("ai-memory-todo");
    expect(names).not.toContain("ai-memory-issue");
    // Only convention had source memories → 1 skill, 2 skipped (decision + architecture).
    expect(result.skills).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
  });

  it("returns 'already-up-to-date' on second run with the same inputs (idempotency)", async () => {
    const memories = [conv1, dec1, arch1];
    const first = await writeSkills(memories, { language: "en", outputDir: outDir });
    expect(first.skills.every((s) => s.action === "created")).toBe(true);

    const second = await writeSkills(memories, { language: "en", outputDir: outDir });
    expect(second.skills.every((s) => s.action === "already-up-to-date")).toBe(true);
    expect(second.skills.every((s) => !s.wrote)).toBe(true);
  });

  it("returns 'updated' when an existing skill body changes", async () => {
    await writeSkills([conv1], { language: "en", outputDir: outDir });

    const conv1Modified: ExtractedMemory = {
      ...conv1,
      content: "All TypeScript filenames are kebab-case (UPDATED).",
    };
    const second = await writeSkills([conv1Modified], {
      language: "en",
      outputDir: outDir,
    });
    expect(second.skills).toHaveLength(1);
    expect(second.skills[0].action).toBe("updated");
    expect(second.skills[0].wrote).toBe(true);
  });

  it("does not touch unrelated `.claude/skills/*` directories outside the ai-memory- namespace", async () => {
    // Pre-populate an unrelated user-authored skill we must not overwrite.
    const userSkillPath = join(outDir, "user-custom-skill", "SKILL.md");
    await mkdir(join(outDir, "user-custom-skill"), { recursive: true });
    await writeFile(
      userSkillPath,
      "---\nname: user-custom-skill\ndescription: User-authored — must survive.\n---\nDo not touch.\n",
      "utf-8"
    );

    await writeSkills([conv1, dec1, arch1], {
      language: "en",
      outputDir: outDir,
    });

    const stillThere = await readFile(userSkillPath, "utf-8");
    expect(stillThere).toContain("User-authored — must survive.");
    expect(stillThere).toContain("Do not touch.");
  });

  it("creates the output directory tree if it does not exist", async () => {
    const deepOut = join(tmp, "deeply", "nested", "skills");
    const result = await writeSkills([conv1], {
      language: "en",
      outputDir: deepOut,
    });
    expect(result.skills).toHaveLength(1);
    const s = await stat(result.skills[0].path);
    expect(s.isFile()).toBe(true);
  });

  it("totals reflect the underlying source memories regardless of which skills were written", async () => {
    const result = await writeSkills(
      [conv1, conv2, dec1, decResolved, arch1, todoMem],
      { language: "en", outputDir: outDir }
    );
    expect(result.totals.convention).toBe(2);
    expect(result.totals.decision).toBe(1); // resolved excluded
    expect(result.totals.architecture).toBe(1);
  });
});

// ---------- Constants / catalogue invariants ----------

describe("SKILL_CATALOGUE invariants", () => {
  it("has exactly 3 entries (convention, decision, architecture)", () => {
    expect(SKILL_CATALOGUE).toHaveLength(3);
    const types = SKILL_CATALOGUE.map((d) => d.memoryType).sort();
    expect(types).toEqual(["architecture", "convention", "decision"]);
  });

  it("every catalogued name is prefixed with `ai-memory-` (ownership signal)", () => {
    for (const d of SKILL_CATALOGUE) {
      expect(d.name.startsWith("ai-memory-")).toBe(true);
    }
  });

  it("every catalogued name is valid kebab-case (lowercase letters / digits / hyphens)", () => {
    for (const d of SKILL_CATALOGUE) {
      expect(d.name).toMatch(/^[a-z0-9-]+$/);
      expect(d.name.length).toBeLessThanOrEqual(64);
    }
  });

  it("default output directory matches the Anthropic spec discovery path", () => {
    expect(SKILLS_DEFAULT_DIR).toBe(".claude/skills");
  });
});
