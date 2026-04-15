import type { MemoryType } from "../types.js";

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

export function buildExtractionPrompt(
  conversationText: string,
  types?: MemoryType[] | undefined,
  conversationDate?: string
): string {
  const typeFilter = types
    ? `\nOnly extract these types: ${types.join(", ")}.\n`
    : "";

  const dateInstruction = conversationDate
    ? `Use "${conversationDate}" as the date for all extracted items.`
    : `Use the date from the conversation context, or today's date if unknown.`;

  return `You are a software development conversation analyst. Given a conversation between a developer and an AI assistant, extract structured knowledge that would help another AI (or the same developer) continue work on this project later.

RULES:
- Extract ONLY concrete, specific, actionable information
- Skip: small talk, failed debugging attempts, routine code generation, vague plans
- Each "content" field MUST contain specific technical details — NOT just restate the title
- Each "context" field MUST explain the specific problem or goal that caused this
- For decisions: "reasoning" MUST explain WHY this approach beats alternatives
- Write in the same language as the conversation (Chinese if the conversation is in Chinese)
- ${dateInstruction}
${typeFilter}
TYPE DEFINITIONS:
- decision: A concrete technical choice that was made (library, pattern, algorithm, approach)
- architecture: How the system/module is structured, data flow, component relationships
- convention: Naming rules, code style, file organisation, workflow rules the team follows
- todo: Explicit follow-up task or known gap mentioned in the conversation
- issue: A bug that was diagnosed and fixed (include root cause + solution)

BAD example (DO NOT write like this):
  title: "OAuth 方案设计"
  content: "设计了 OAuth 认证方案"   ← too vague, just restates title

GOOD example (write like this):
  title: "WebView OAuth 使用 Bridge 页中转"
  content: "App 内嵌 WebView 无法直接接收 OAuth redirect。方案：WebView 打开 static/oauth-bridge.html → Bridge 接收 callback URL → postMessage 传回 App → App 解析 token"
  context: "hf-app 需要在内嵌 WebView 中完成 Google/Facebook OAuth，但 WebView 不支持 deep link"
  reasoning: "Deep Link 在 Android/iOS 行为不一致；Custom URL Scheme 部分浏览器不支持；Bridge 跨平台稳定"
  alternatives: "Deep Link, Custom URL Scheme"
  impact: "hf-app login 页面、oauth-web 静态站、后端 OAuth callback 路由"

Return JSON only (no markdown fences, no explanation):

[
  {
    "type": "decision" | "architecture" | "convention" | "todo" | "issue",
    "title": "Short specific title (in the conversation's language)",
    "date": "YYYY-MM-DD",
    "context": "The specific problem or goal that led to this (1-2 sentences)",
    "content": "Detailed, specific content with concrete technical choices and how they work",
    "reasoning": "(decisions only) Why this approach was chosen over alternatives",
    "alternatives": "(decisions only) What was considered and rejected",
    "impact": "Which specific files, modules, APIs, or systems are affected"
  }
]

If the conversation contains no extractable knowledge, return exactly: []

Conversation:
${conversationText}`;
}

// ---------------------------------------------------------------------------
// Summary prompt — write a human-readable project document
// ---------------------------------------------------------------------------

export function buildSummaryPrompt(
  memoriesJson: string,
  language: "zh" | "en",
  focus?: string
): string {
  const lang = language === "zh" ? "Chinese" : "English";
  const focusLine = focus ? `\nFocus specifically on: "${focus}"\n` : "";

  return `You are a technical documentation writer. Given a set of extracted project memories (decisions, architecture notes, TODOs, conventions, issues), write a concise but complete project knowledge document.
${focusLine}
Write in ${lang}. Use clear markdown headings. Prioritise recent information (higher dates = more important).

Required sections (skip empty ones):
## Project Overview
One paragraph: what this project does, its main tech stack, and current development stage.

## Key Technical Decisions
Bullet list. For each: what was decided, why, and what was rejected.
Format: **[title]**: [content]. Reasoning: [why]. Rejected: [alternatives].

## Architecture
How the system is structured. Include module boundaries, data flow, key patterns.

## Code Conventions
Rules the team follows. Each should be actionable (what to do / what NOT to do).

## Active TODOs
Uncompleted tasks. Mark with priority if evident from context.

## Known Issues & Fixes
Diagnosed bugs and their solutions (useful to avoid re-diagnosing).

Memories (JSON):
${memoriesJson}`;
}

// ---------------------------------------------------------------------------
// Context prompt — LLM-summarized version (used with --summarize flag)
// ---------------------------------------------------------------------------

export function buildContextPrompt(
  memoriesJson: string,
  language: "zh" | "en",
  topic?: string
): string {
  const lang = language === "zh" ? "Chinese" : "English";
  const topicLine = topic ? `\nFocus specifically on: "${topic}"\n` : "";

  return `You are generating a PROJECT CONTEXT BLOCK that a developer will paste at the very start of a new AI coding session (Cursor, Claude Code, etc.) to provide instant context continuity.
${topicLine}
Write in ${lang}. The output will be pasted VERBATIM — so format it as a clean markdown block the AI assistant can read immediately.

REQUIRED OUTPUT FORMAT (fill in all sections, skip only if truly no data):

## Project Context

> Paste this at the start of your new conversation.

### What this project is
[One sentence: what does this software do and who uses it]

### Tech stack
[Key languages, frameworks, databases, deployment — one line each]

### Current focus
[What was being actively worked on most recently — be specific]

### Key decisions (follow these without re-discussion)
- **[Decision title]**: [What was decided + why + what was rejected]
- ...

### Conventions (always follow)
- [Convention 1]
- ...

### Active TODOs
- [ ] [Task] — [context if needed]
- ...

### Known gotchas
- [Issue/fix that is easy to re-hit]
- ...

Memories (JSON):
${memoriesJson}`;
}

// ---------------------------------------------------------------------------
// Direct context builder — no LLM, assembles memories into a ready-to-paste
// block using a deterministic template. Faster, free, and lossless.
// ---------------------------------------------------------------------------

export interface MemoryForContext {
  type: string;
  title: string;
  date: string;
  content: string;
  context?: string;
  reasoning?: string;
  alternatives?: string;
  impact?: string;
  sourceTitle?: string;
}

export function buildDirectContext(
  memories: MemoryForContext[],
  language: "zh" | "en",
  topic?: string
): string {
  const isZh = language === "zh";
  const topicNote = topic
    ? isZh
      ? `> 话题过滤: ${topic}\n\n`
      : `> Filtered by topic: ${topic}\n\n`
    : "";

  const header = isZh
    ? `## 项目上下文\n\n> 将以下内容粘贴到新对话的开头，让 AI 立即了解项目背景。\n\n${topicNote}`
    : `## Project Context\n\n> Paste this at the start of your new conversation to give the AI instant project context.\n\n${topicNote}`;

  const byType: Record<string, MemoryForContext[]> = {};
  for (const m of memories) {
    (byType[m.type] ??= []).push(m);
  }

  const sections: string[] = [header];

  const typeOrder = ["architecture", "decision", "convention", "todo", "issue"];
  const typeLabels: Record<string, { zh: string; en: string }> = {
    architecture: { zh: "架构设计", en: "Architecture" },
    decision: { zh: "技术决策（勿随意更改）", en: "Key Decisions (follow without re-discussion)" },
    convention: { zh: "代码约定（必须遵守）", en: "Conventions (always follow)" },
    todo: { zh: "待办事项", en: "Active TODOs" },
    issue: { zh: "已知问题与解决方案", en: "Known Issues & Fixes" },
  };

  for (const type of typeOrder) {
    const items = byType[type];
    if (!items?.length) continue;

    const label = isZh ? typeLabels[type].zh : typeLabels[type].en;
    sections.push(`### ${label}`);

    // Sort by date descending (most recent first)
    items.sort((a, b) => (b.date > a.date ? 1 : -1));

    for (const m of items) {
      if (type === "todo") {
        sections.push(`- [ ] **${m.title}**${m.content !== m.title ? ` — ${m.content}` : ""}`);
      } else if (type === "convention") {
        sections.push(`- **${m.title}**: ${m.content}`);
      } else {
        let entry = `- **${m.title}** _(${m.date})_\n  ${m.content}`;
        if (m.reasoning) entry += `\n  ${isZh ? "理由" : "Why"}: ${m.reasoning}`;
        if (m.alternatives) entry += `\n  ${isZh ? "排除" : "Rejected"}: ${m.alternatives}`;
        if (m.impact) entry += `\n  ${isZh ? "影响" : "Affects"}: ${m.impact}`;
        sections.push(entry);
      }
    }
  }

  if (sections.length === 1) {
    // Only header, no memories
    const empty = isZh ? "_暂无提取的记忆。_" : "_No memories extracted yet._";
    sections.push(empty);
  }

  return sections.join("\n\n");
}
