import type { MemoryType } from "../types.js";

// ---------------------------------------------------------------------------
// Extraction prompt
// ---------------------------------------------------------------------------

export function buildExtractionPrompt(
  conversationText: string,
  types?: MemoryType[] | undefined,
  conversationDate?: string,
  existingTitles?: string
): string {
  const typeFilter = types
    ? `\nOnly extract these types: ${types.join(", ")}.\n`
    : "";

  const dateInstruction = conversationDate
    ? `Use "${conversationDate}" as the date for all extracted items.`
    : `Use the date from the conversation context, or today's date if unknown.`;

  const existingBlock = existingTitles
    ? `\nALREADY EXTRACTED (DO NOT re-extract these — skip any knowledge that overlaps):\n${existingTitles}\n`
    : "";

  return `You are an expert software knowledge extractor. Your task: read a developer-AI conversation and extract ONLY high-value, reusable knowledge that would save time in future sessions.

EXTRACTION PROCESS:
1. Scan the conversation for KEY MOMENTS: decisions made, architecture explained, bugs diagnosed, conventions established, tasks identified
2. For each candidate, apply the QUALITY CHECKLIST below — discard anything that fails
3. Output only items that score 4/5 or higher

QUALITY CHECKLIST (each item must satisfy ALL):
□ SPECIFIC: names files, functions, APIs, config keys, or data structures
□ ACTIONABLE: another developer can act on this without re-reading the conversation
□ NON-OBVIOUS: not something any developer would already know
□ DURABLE: still relevant weeks/months later (skip temporary debugging steps)
□ COMPLETE: contains the full technical picture (problem + solution + why)

RULES:
- Extract ONLY concrete, specific, actionable information
- Skip: small talk, failed debugging attempts that led nowhere, routine code generation, vague plans, tool setup steps, "let me try X" without conclusion
- Each "content" MUST contain ≥2 concrete technical details (file paths, function names, library versions, config keys, API endpoints, data schemas, algorithms)
- If you cannot name specific files, functions, or technical concepts → DO NOT extract
- Each "context" MUST describe the specific problem, constraint, or goal — not just "the project needed X"
- "reasoning" MUST compare against alternatives with concrete trade-offs (performance, compatibility, maintenance)
- "impact" MUST list exact file paths or module names — NEVER generic phrases
- Quality over quantity: 2 excellent items >>> 10 mediocre ones
- Language: match the conversation language
- ${dateInstruction}
${typeFilter}${existingBlock}
TYPE DEFINITIONS:
- decision: A concrete technical choice (library, pattern, algorithm, architecture approach). REQUIRES: reasoning + alternatives
- architecture: System structure, data flow, module boundaries, component relationships. REQUIRES: concrete module/file references
- convention: Code style, naming rules, file organization, workflow rules. REQUIRES: specific do/don't examples
- todo: Explicit follow-up task mentioned in conversation. REQUIRES: clear scope and acceptance criteria
- issue: Bug diagnosed and fixed. REQUIRES: root cause + exact fix + affected files

BAD examples (auto-rejected — DO NOT produce these):
  ✗ title: "数据库选择" content: "选择了 PostgreSQL"
    → WHY BAD: no reasoning, no alternatives, no details about schema or config
  ✗ content: "设计了 OAuth 认证方案"
    → WHY BAD: restates title, zero implementation detail
  ✗ content: "使用了 MCP 技术来实现功能"
    → WHY BAD: what tools? what protocol version? what transport? how does it connect?
  ✗ impact: "影响到整个项目的功能实现"
    → WHY BAD: which files? which modules? which endpoints?
  ✗ content: "实现了增量提取方式，提高了效率"
    → WHY BAD: what is incremental about it? state tracking? cursor position? hash comparison?
  ✗ content: "优化了性能"
    → WHY BAD: what metric? what technique? what before/after?

GOOD examples (aim for this level of detail):
  Example 1 — decision:
    title: "WebView OAuth 使用 Bridge 页中转"
    content: "App 内嵌 WebView 无法直接接收 OAuth redirect。方案：WebView 打开 static/oauth-bridge.html → Bridge 用 window.location.hash 接收 callback URL 中的 token → postMessage 传回 App 的 message listener → App 调用 /api/auth/verify 验证 token"
    context: "hf-app 需要在内嵌 WebView 中完成 Google/Facebook OAuth，但 WebView 不支持 deep link 且 Custom URL Scheme 在部分 Android 浏览器失效"
    reasoning: "Deep Link 在 Android/iOS 行为不一致且需要 App Links 配置；Custom URL Scheme 部分浏览器拦截；Bridge 页面方案跨平台稳定且无需原生代码修改"
    alternatives: "Deep Link, Custom URL Scheme, Server-side redirect"
    impact: "src/pages/login.tsx, static/oauth-bridge.html, backend/routes/oauth.ts, src/utils/auth-message.ts"

  Example 2 — architecture:
    title: "Hybrid search: semantic + keyword + recency"
    content: "搜索管线三阶段: 1) embedText() 生成 query embedding → searchByVector() 计算余弦相似度; 2) tokenize() 做 CJK bigram + Latin whitespace 分词 → keywordScore() 对 title×10/content×5/context×2 加权; 3) recencyScore() 用 90 天半衰期指数衰减。三路分数 normalize 后按 0.55/0.30/0.15 混合排序"
    impact: "src/embeddings/hybrid-search.ts, src/embeddings/embed.ts, src/embeddings/vector-store.ts"

  Example 3 — issue:
    title: "CursorSource loadTitleMap 临时文件泄漏"
    content: "loadTitleMap() 把 SQLite DB 复制到 os.tmpdir() 但没有 finally 清理。长时间运行 watch 模式下临时文件累积可达数 GB。修复：用 try/finally 包裹，确保 fs.unlinkSync(tmpPath) 在所有退出路径执行"
    impact: "src/sources/cursor.ts#loadTitleMap, os.tmpdir()/ai-memory-*.db"

Return JSON only (no markdown fences, no commentary, no trailing comma):

[
  {
    "type": "decision" | "architecture" | "convention" | "todo" | "issue",
    "title": "Short specific title (conversation language)",
    "date": "YYYY-MM-DD",
    "context": "The specific problem/constraint/goal (1-2 sentences)",
    "content": "Detailed technical content with ≥2 concrete specifics",
    "reasoning": "(decisions only) Why chosen over alternatives, with concrete trade-offs",
    "alternatives": "(decisions only) What was considered and rejected",
    "impact": "Comma-separated file paths, module names, or API routes"
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

/**
 * Build a compressed index of memories — one line per memory.
 * Used for older memories that don't fit in the full-detail budget.
 */
export function buildCondensedIndex(
  memories: MemoryForContext[],
  language: "zh" | "en"
): string {
  const isZh = language === "zh";
  const header = isZh
    ? "### 更多历史记忆（如需详情可追问）"
    : "### Older Memories (ask for details if needed)";

  const typeAbbr: Record<string, string> = {
    decision: "D", architecture: "A", convention: "C", todo: "T", issue: "I",
  };

  const lines = memories
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .map((m) => `- [${typeAbbr[m.type] ?? "?"}] ${m.title} _(${m.date})_`);

  return [header, ...lines].join("\n");
}
