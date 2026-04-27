/**
 * Anthropic Skills writer for `ai-memory rules --target skills` (v2.5-04).
 *
 * Anthropic Skills sit alongside `AGENTS.md` as a complementary
 * cross-tool agent-instruction layer:
 *   - AGENTS.md is always-on, single project-level file (one big context blob).
 *   - Skills are dynamically loaded by description matching, one directory
 *     per capability. The frontmatter `description` stays in context;
 *     the body only loads when Claude decides the skill is relevant.
 *
 * Skills are currently consumed by Claude Code; future client adoption
 * (Cursor / Windsurf) is uncertain but the marginal generation cost is
 * tiny — see docs/skills-schema-snapshot-2026-04-26.md for the spec we
 * targeted, the discrepancies we resolved, and the deferred questions.
 *
 * Memory → Skills mapping (v0): three skills, one per long-lived memory
 * type (convention / decision / architecture). Transient types (todo /
 * issue) are excluded — encoding a half-resolved TODO as an auto-loaded
 * skill risks teaching Claude to "follow" something that is already done.
 *
 * Idempotency contract (matches cursor-rules, NOT agents-md):
 *   - We fully overwrite `.claude/skills/ai-memory-*\/SKILL.md` each run.
 *   - We never touch `.claude/skills/<other-name>/` — anything not
 *     prefixed `ai-memory-` is left alone.
 *   - Hand-edits inside `ai-memory-*\/SKILL.md` are NOT preserved on
 *     regeneration; users who want to extend a generated skill should
 *     copy the directory to a new (non-`ai-memory-`) name and edit there.
 *
 * The writer is structured as: pure renderers (`buildSkillContent` etc.)
 * + a thin IO wrapper (`writeSkills`). Tests pin the rendering rules and
 * the per-type filtering; the IO wrapper is exercised by the rules
 * command tests.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtractedMemory, MemoryType } from "../types.js";

// ---------- Constants ----------

export const SKILLS_DEFAULT_DIR = ".claude/skills";

/**
 * Skills we own. The `ai-memory-` prefix on the directory + skill name is
 * the ownership signal: anything inside `.claude/skills/ai-memory-*\/` is
 * regenerated on every run; anything outside is left alone (including
 * user-authored `.claude/skills/coding-conventions/` that happens to have
 * a similar name without the prefix).
 *
 * Description-length budget: Anthropic's documented truncation point is
 * 1,536 chars combined description + when_to_use. We target ≤ 300 chars
 * per description so we have generous headroom for `when_to_use` overflow
 * and for users hand-extending the description if they ever want to.
 */
interface SkillDescriptor {
  /** Directory name under `.claude/skills/` (also used as the `name:` field). */
  name: string;
  /** Memory type this skill collects. */
  memoryType: MemoryType;
  /** Title for the SKILL.md body's `# heading`. */
  bodyHeading: { en: string; zh: string };
  /** Description prefix (the "what") — concrete topic words get appended from memory titles. */
  descriptionPrefix: { en: string; zh: string };
  /** Description suffix (the "when") — gives Claude trigger-context hints. */
  whenContext: { en: string; zh: string };
}

const SKILL_CATALOGUE: readonly SkillDescriptor[] = [
  {
    name: "ai-memory-coding-conventions",
    memoryType: "convention",
    bodyHeading: {
      en: "Coding Conventions",
      zh: "代码约定",
    },
    descriptionPrefix: {
      en: "Project coding conventions extracted from chat history.",
      zh: "从对话历史提取的项目代码约定。",
    },
    whenContext: {
      en: "Load when writing new code, naming things, designing APIs, or reviewing PRs.",
      zh: "在编写新代码、命名变量、设计 API 接口或评审 PR 时加载。",
    },
  },
  {
    name: "ai-memory-decision-log",
    memoryType: "decision",
    bodyHeading: {
      en: "Technical Decision Log",
      zh: "技术决策记录",
    },
    descriptionPrefix: {
      en: "Technical decisions made for this project, with reasoning and rejected alternatives.",
      zh: "本项目的技术决策记录，包含原因和已排除方案。",
    },
    whenContext: {
      en: "Load when proposing architectural changes, evaluating alternatives, or asked why a choice was made.",
      zh: "在提出架构变更、评估技术方案或被问及历史决策原因时加载。",
    },
  },
  {
    name: "ai-memory-system-architecture",
    memoryType: "architecture",
    bodyHeading: {
      en: "System Architecture",
      zh: "系统架构",
    },
    descriptionPrefix: {
      en: "System architecture facts: components, data flow, integration boundaries.",
      zh: "系统架构事实：组件划分、数据流、集成边界。",
    },
    whenContext: {
      en: "Load when implementing cross-component features, debugging integration issues, or onboarding to the codebase.",
      zh: "在实现跨组件特性、排查集成问题或熟悉代码库时加载。",
    },
  },
] as const;

/** Cap on description length — well below the 1,536 char combined cap so `when_to_use` has room. */
const DESCRIPTION_CAP = 300;

// ---------- Types ----------

export type SkillAction = "created" | "updated" | "already-up-to-date";

export interface SkillResult {
  /** Skill name (also the directory name and slash-command). */
  name: string;
  /** Absolute or cwd-relative path of the SKILL.md file. */
  path: string;
  action: SkillAction;
  wrote: boolean;
  /** Number of memories that ended up in the skill body. */
  memories: number;
}

export interface WriteSkillsOptions {
  language: "zh" | "en";
  /** Output directory — defaults to `.claude/skills`. */
  outputDir?: string;
}

export interface WriteSkillsResult {
  /** Per-skill outcomes for the catalogued (non-empty) skills. */
  skills: SkillResult[];
  /** Skills whose memory type had zero candidates (skipped, not written). */
  skipped: { name: string; memoryType: MemoryType }[];
  /** Aggregate counts (across all skills written). */
  totals: {
    convention: number;
    decision: number;
    architecture: number;
  };
}

// ---------- Pure renderers ----------

/**
 * Pick at most N memory titles to embed in the description so Claude has
 * keyword signal for auto-trigger. We deliberately keep this short
 * (DESCRIPTION_CAP = 300) and elide with "…" rather than truncate
 * mid-word.
 */
export function buildDescription(
  descriptor: SkillDescriptor,
  memories: ExtractedMemory[],
  language: "zh" | "en"
): string {
  const prefix = descriptor.descriptionPrefix[language];
  const when = descriptor.whenContext[language];
  const titles = memories
    .map((m) => m.title.trim())
    .filter((t) => t.length > 0);

  const lead = `${prefix} ${when}`;
  if (titles.length === 0) return lead.slice(0, DESCRIPTION_CAP);

  const topicsLabel = language === "zh" ? "主题" : "Topics";
  let body = `${lead} ${topicsLabel}: `;
  const parts: string[] = [];
  for (const title of titles) {
    const candidate = parts.length === 0 ? title : `${parts.join(", ")}, ${title}`;
    if ((body + candidate + ".").length > DESCRIPTION_CAP) {
      // Stop adding titles when adding the next one would overflow.
      // If we have ≥ 1 title in `parts` we mark elision; if `parts` is
      // empty (the very first title is too long) we hard-truncate that
      // title alone with an ellipsis so the description still has a topic.
      if (parts.length === 0) {
        // Budget the room for the truncated title text. The final body
        // becomes `body + truncated + "…" + "."` so we have to subtract
        // both the ellipsis and the trailing period from the cap.
        const room = DESCRIPTION_CAP - body.length - 2;
        if (room > 0) parts.push(title.slice(0, room).trimEnd() + "…");
      } else {
        parts.push("…");
      }
      break;
    }
    parts.push(title);
  }
  body += parts.join(", ") + ".";
  return body;
}

/**
 * Render one entry inside a skill body. Mirrors the AGENTS.md renderer's
 * shape so the two outputs feel consistent to the reader.
 */
function renderEntry(m: ExtractedMemory, language: "zh" | "en"): string {
  // All free-text fields go through the same CRLF→LF normaliser. Mixed
  // line endings inside `reasoning` / `alternatives` would otherwise be
  // invisible to the byte-identical idempotency check (every regenerated
  // SKILL.md would diff against the existing file even when the source
  // memories haven't changed semantically).
  const normalise = (s: string): string => s.replace(/\r\n/g, "\n").trim();

  const lines: string[] = [];
  lines.push(`## ${m.title.trim()}`);
  lines.push("");
  lines.push(normalise(m.content));
  if (m.reasoning) {
    lines.push("");
    lines.push(`${language === "zh" ? "原因" : "Why"}: ${normalise(m.reasoning)}`);
  }
  if (m.alternatives) {
    lines.push("");
    lines.push(
      `${language === "zh" ? "已排除方案" : "Rejected"}: ${normalise(m.alternatives)}`
    );
  }
  return lines.join("\n");
}

/**
 * Render the full SKILL.md content (frontmatter + body). Pure — same
 * inputs always produce byte-identical output.
 */
export function buildSkillContent(
  descriptor: SkillDescriptor,
  memories: ExtractedMemory[],
  language: "zh" | "en"
): string {
  const description = buildDescription(descriptor, memories, language);
  const heading = descriptor.bodyHeading[language];

  const note =
    language === "zh"
      ? "> 由 ai-memory 从 AI 对话历史自动生成。要修改请用 `ai-memory list` / `extract` / `resolve`，不要直接编辑该文件——下次运行 `ai-memory rules --target skills` 会被覆盖。"
      : "> Auto-generated by ai-memory from AI chat history. Edit memories via `ai-memory list` / `extract` / `resolve` rather than this file — it is fully regenerated on every `ai-memory rules --target skills`.";

  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${descriptor.name}`);
  // YAML scalars: keep description on one line; the spec doesn't forbid
  // folded-block style but most validators accept the simpler form.
  lines.push(`description: ${yamlScalar(description)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${heading}`);
  lines.push("");
  lines.push(note);
  lines.push("");

  for (const m of memories) {
    lines.push(renderEntry(m, language));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * YAML scalar that's safe for inline emission. We escape the few cases
 * where naked text would be ambiguous to a YAML parser.
 *
 * Most descriptions are plain English/Chinese sentences, which are valid
 * unquoted YAML scalars. We only need to quote when the description:
 *   - contains a colon followed by a space (`foo: bar` parses as a map)
 *   - starts with a YAML reserved indicator (`!`, `&`, `*`, `[`, `{`, `|`, `>`, `?`, `:`, `-` followed by space, `#`, `%`, `@`, `` ` ``)
 *   - contains a `#` (could be parsed as a line comment)
 *   - contains double-quotes that we'd need to escape
 *
 * When we have to quote, we use double quotes and escape `"` and `\\` —
 * sufficient for the content shapes our memories produce.
 */
function yamlScalar(value: string): string {
  const needsQuote =
    /(:\s)|(\s#)|^[!&*\[\]{}|>?%@`]|^- /.test(value) ||
    value.includes('"') ||
    value.includes("\\") ||
    /^[-?:]\s|^\s|\s$/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ---------- Filesystem IO ----------

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

async function writeOneSkill(
  descriptor: SkillDescriptor,
  memories: ExtractedMemory[],
  outputDir: string,
  language: "zh" | "en"
): Promise<SkillResult> {
  const skillPath = join(outputDir, descriptor.name, "SKILL.md");
  const next = buildSkillContent(descriptor, memories, language);
  const existing = await safeReadFile(skillPath);

  if (existing !== null && existing === next) {
    return {
      name: descriptor.name,
      path: skillPath,
      action: "already-up-to-date",
      wrote: false,
      memories: memories.length,
    };
  }

  await mkdir(dirname(skillPath), { recursive: true });
  await writeFile(skillPath, next, "utf-8");
  return {
    name: descriptor.name,
    path: skillPath,
    action: existing === null ? "created" : "updated",
    wrote: true,
    memories: memories.length,
  };
}

/**
 * Generate Skills directories under `outputDir` (defaults to
 * `.claude/skills`). For each catalogued skill we filter the memories to
 * its source type, skip if empty, otherwise overwrite the corresponding
 * `<name>/SKILL.md`.
 *
 * The output is intentionally a flat list of three (or fewer) skills —
 * the design rationale for "no per-author / per-theme split in v0" lives
 * in docs/skills-schema-snapshot-2026-04-26.md.
 */
export async function writeSkills(
  memories: ExtractedMemory[],
  options: WriteSkillsOptions
): Promise<WriteSkillsResult> {
  const { language } = options;
  const outputDir = options.outputDir ?? SKILLS_DEFAULT_DIR;

  const skills: SkillResult[] = [];
  const skipped: { name: string; memoryType: MemoryType }[] = [];

  for (const descriptor of SKILL_CATALOGUE) {
    const filtered = memories.filter((m) => {
      if (m.type !== descriptor.memoryType) return false;
      // Decisions: skip resolved ones — they're historical, shouldn't auto-trigger
      // future code generation. (Conventions / architecture have no "resolved" state.)
      if (descriptor.memoryType === "decision" && m.status === "resolved") return false;
      return true;
    });

    if (filtered.length === 0) {
      skipped.push({ name: descriptor.name, memoryType: descriptor.memoryType });
      continue;
    }

    skills.push(await writeOneSkill(descriptor, filtered, outputDir, language));
  }

  const totals = {
    convention: memories.filter((m) => m.type === "convention").length,
    decision: memories.filter((m) => m.type === "decision" && m.status !== "resolved").length,
    architecture: memories.filter((m) => m.type === "architecture").length,
  };

  return { skills, skipped, totals };
}

// Exported for tests that want to enumerate the catalogue (and assert
// nothing accidentally lands in the catalogue without going through the
// add-a-skill checklist in docs/skills-schema-snapshot-*.md).
export { SKILL_CATALOGUE };
