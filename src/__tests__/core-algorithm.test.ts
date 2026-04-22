import { describe, it, expect } from "vitest";
import { tokenize } from "../embeddings/hybrid-search.js";
import { keywordOnlySearch } from "../embeddings/hybrid-search.js";
import {
  shingles,
  jaccardSimilarity,
  containmentSimilarity,
  isVagueContent,
  specificityScore,
  stripConversationNoise,
} from "../extractor/ai-extractor.js";
import { buildExtractionPrompt } from "../extractor/prompts.js";
import type { ExtractedMemory } from "../types.js";

function makeMemory(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
  return {
    type: "decision",
    title: "Use PostgreSQL",
    date: "2026-04-21",
    content: "We chose PostgreSQL for its JSONB and full-text search capabilities.",
    context: "Need a database for the new API",
    sourceId: "test-123",
    sourceTitle: "DB Selection Chat",
    sourceType: "cursor",
    author: "test-author",
    ...overrides,
  };
}

// ============================================================
// CJK Tokenizer — upgraded with trigrams + stopwords
// ============================================================

describe("tokenize", () => {
  it("splits English text on whitespace", () => {
    const tokens = tokenize("hello world test");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("test");
  });

  it("generates bigrams for Chinese text", () => {
    const tokens = tokenize("提取策略");
    expect(tokens).toContain("提取");
    expect(tokens).toContain("取策");
    expect(tokens).toContain("策略");
  });

  it("generates trigrams for Chinese text", () => {
    const tokens = tokenize("提取策略");
    expect(tokens).toContain("提取策");
    expect(tokens).toContain("取策略");
  });

  it("includes individual CJK characters (non-stopwords)", () => {
    const tokens = tokenize("提取策略");
    expect(tokens).toContain("提");
    expect(tokens).toContain("取");
    expect(tokens).toContain("策");
    expect(tokens).toContain("略");
  });

  it("filters CJK stopwords from individual chars", () => {
    const tokens = tokenize("的了在是");
    expect(tokens).not.toContain("的");
    expect(tokens).not.toContain("了");
    expect(tokens).not.toContain("在");
    expect(tokens).not.toContain("是");
  });

  it("filters English stopwords", () => {
    const tokens = tokenize("the quick brown fox");
    expect(tokens).not.toContain("the");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
  });

  it("filters short English tokens (< 2 chars)", () => {
    const tokens = tokenize("I am a test");
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("test");
  });

  it("handles mixed CJK and Latin text", () => {
    const tokens = tokenize("使用 OAuth 认证");
    expect(tokens).toContain("使用");
    expect(tokens).toContain("oauth");
    expect(tokens).toContain("认证");
  });

  it("deduplicates tokens", () => {
    const tokens = tokenize("test test");
    const unique = new Set(tokens);
    expect(tokens.length).toBe(unique.size);
  });

  it("lowercases all tokens", () => {
    const tokens = tokenize("PostgreSQL");
    expect(tokens).toContain("postgresql");
    expect(tokens).not.toContain("PostgreSQL");
  });

  it("handles empty string", () => {
    expect(tokenize("")).toHaveLength(0);
  });

  it("handles pure whitespace", () => {
    expect(tokenize("   ")).toHaveLength(0);
  });

  it("trigrams boost precision for longer CJK terms", () => {
    const tokens = tokenize("服务器架构设计");
    expect(tokens).toContain("服务器");
    expect(tokens).toContain("架构设");
  });
});

describe("CJK keyword search integration", () => {
  const memories: ExtractedMemory[] = [
    makeMemory({ title: "提取策略选择", content: "默认提取行为是提取整条对话的全部内容" }),
    makeMemory({ title: "MCP 服务器架构设计", content: "MCP 服务器包含三个工具" }),
    makeMemory({ title: "Use PostgreSQL", content: "We chose PostgreSQL for JSONB support" }),
  ];

  it("finds Chinese memories by single character search", () => {
    const results = keywordOnlySearch("提取", memories);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.title).toBe("提取策略选择");
  });

  it("finds Chinese memories by multi-character search", () => {
    const results = keywordOnlySearch("服务器", memories);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.title).toBe("MCP 服务器架构设计");
  });

  it("still works for English queries", () => {
    const results = keywordOnlySearch("PostgreSQL", memories);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.title).toBe("Use PostgreSQL");
  });

  it("finds results with mixed CJK+Latin queries", () => {
    const results = keywordOnlySearch("MCP 服务", memories);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns empty for no matches", () => {
    const results = keywordOnlySearch("xyz_nothing_matches", memories);
    expect(results).toHaveLength(0);
  });
});

// ============================================================
// Shingle-based Deduplication
// ============================================================

describe("shingles", () => {
  it("generates 3-grams from text", () => {
    const result = shingles("hello");
    expect(result.has("hel")).toBe(true);
    expect(result.has("ell")).toBe(true);
    expect(result.has("llo")).toBe(true);
  });

  it("works with Chinese text", () => {
    const result = shingles("提取策略选择");
    expect(result.has("提取策")).toBe(true);
    expect(result.has("取策略")).toBe(true);
    expect(result.has("策略选")).toBe(true);
  });

  it("returns empty set for very short text", () => {
    expect(shingles("ab").size).toBe(0);
    expect(shingles("").size).toBe(0);
  });

  it("normalizes whitespace", () => {
    const a = shingles("hello  world");
    const b = shingles("hello world");
    expect(a.size).toBe(b.size);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const s = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(s, s)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns correct value for overlapping sets", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });

  it("returns 1 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it("returns 0 for empty vs non-empty set", () => {
    expect(jaccardSimilarity(new Set(), new Set(["a"]))).toBe(0);
  });

  it("detects near-duplicate Chinese content", () => {
    const content1 = "默认提取行为是提取整条对话的全部内容，按约20000字符（约5k token）切成多个 chunk 进行处理。使用 --incremental 可以只提取新增的轮次，避免重复处理旧内容。";
    const content2 = "提取策略为：使用 --incremental 选项时，系统只提取自上次提取以来的新对话轮次，而不是重复处理旧内容。默认情况下，使用 --pick 1 提取整条对话的全部内容，按约20000字符切分为多个 chunk 进行处理。";

    const s1 = shingles(content1);
    const s2 = shingles(content2);
    const sim = jaccardSimilarity(s1, s2);

    expect(sim).toBeGreaterThan(0.3);
  });

  it("correctly separates unrelated content", () => {
    const content1 = "使用 Bridge 页面模式来完成 OAuth 认证中转";
    const content2 = "数据库选择 PostgreSQL 作为主要存储引擎因为支持 JSONB";

    const s1 = shingles(content1);
    const s2 = shingles(content2);
    const sim = jaccardSimilarity(s1, s2);

    expect(sim).toBeLessThan(0.2);
  });
});

// ============================================================
// Containment Similarity
// ============================================================

describe("containmentSimilarity", () => {
  it("returns 1 when A is a subset of B", () => {
    const a = new Set(["x", "y"]);
    const b = new Set(["x", "y", "z", "w"]);
    expect(containmentSimilarity(a, b)).toBe(1);
  });

  it("returns 0 when A is disjoint from B", () => {
    const a = new Set(["x", "y"]);
    const b = new Set(["z", "w"]);
    expect(containmentSimilarity(a, b)).toBe(0);
  });

  it("returns 1 for empty A", () => {
    expect(containmentSimilarity(new Set(), new Set(["a"]))).toBe(1);
  });

  it("detects subsumption in real content", () => {
    const short = "使用 PostgreSQL 数据库";
    const long = "使用 PostgreSQL 数据库作为主存储，配置了 JSONB 索引和全文搜索，部署在 Docker 容器中";

    const shortSh = shingles(short);
    const longSh = shingles(long);
    // Short content should be mostly contained in long content
    expect(containmentSimilarity(shortSh, longSh)).toBeGreaterThan(0.7);
    // But long is NOT contained in short
    expect(containmentSimilarity(longSh, shortSh)).toBeLessThan(0.5);
  });
});

// ============================================================
// Conversation Noise Stripping
// ============================================================

describe("stripConversationNoise", () => {
  it("replaces tool call XML blocks", () => {
    const text = 'Before <tool_call name="read">file.ts</tool_call> After';
    const result = stripConversationNoise(text);
    expect(result).toContain("[tool call]");
    expect(result).not.toContain("tool_call");
  });

  it("replaces tool result blocks", () => {
    const text = "Before <tool_result>lots of output here</tool_result> After";
    const result = stripConversationNoise(text);
    expect(result).toContain("[tool output]");
  });

  it("replaces long hex hashes", () => {
    const hash = "a".repeat(40);
    const text = `Commit: ${hash}`;
    const result = stripConversationNoise(text);
    expect(result).toContain("[hash]");
    expect(result).not.toContain(hash);
  });

  it("replaces data URIs", () => {
    const text = "Image: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA";
    const result = stripConversationNoise(text);
    expect(result).toContain("[data-uri]");
  });

  it("truncates very long single lines", () => {
    // Use chars that won't match base64 regex (include spaces, special chars)
    const longLine = "error: something went wrong at line 42, " + "detail info here; ".repeat(35);
    expect(longLine.length).toBeGreaterThan(500);
    const result = stripConversationNoise(longLine);
    expect(result.length).toBeLessThan(longLine.length);
    expect(result).toContain("[truncated");
  });

  it("collapses excessive blank lines", () => {
    const text = "a\n\n\n\n\n\n\nb";
    const result = stripConversationNoise(text);
    expect(result).toBe("a\n\n\nb");
  });

  it("preserves normal conversation text", () => {
    const text = "User: How do I configure PostgreSQL?\n\nAssistant: You need to edit config.json.";
    expect(stripConversationNoise(text)).toBe(text);
  });
});

// ============================================================
// Specificity Score
// ============================================================

describe("specificityScore", () => {
  it("returns 0 for completely generic text", () => {
    expect(specificityScore("这个改动优化了用户体验")).toBe(0);
  });

  it("scores file paths", () => {
    expect(specificityScore("修改了 src/index.ts")).toBeGreaterThan(0);
  });

  it("scores function declarations", () => {
    expect(specificityScore("function extractMemories() 执行提取")).toBeGreaterThan(0);
  });

  it("scores API routes", () => {
    expect(specificityScore("GET /api/memories 返回数据")).toBeGreaterThan(0);
  });

  it("scores version numbers", () => {
    expect(specificityScore("升级到 react 18.2.0")).toBeGreaterThan(0);
  });

  it("gives higher score for more technical content", () => {
    const simple = "修改了 src/index.ts";
    const complex = "修改 src/index.ts 中的 extractMemories() 函数，调用 /api/v2/extract 接口，使用 config.json 配置";
    expect(specificityScore(complex)).toBeGreaterThan(specificityScore(simple));
  });
});

// ============================================================
// Vague Content Detection — upgraded
// ============================================================

describe("isVagueContent", () => {
  it("flags content with only vague Chinese phrases", () => {
    expect(isVagueContent("这个改动影响到整个项目的功能实现")).toBe(true);
  });

  it("flags content with only vague English phrases", () => {
    expect(isVagueContent("This change improves user experience")).toBe(true);
  });

  it("flags new vague phrases", () => {
    expect(isVagueContent("提升了开发效率")).toBe(true);
    expect(isVagueContent("simplifies the process for everyone")).toBe(true);
  });

  it("allows vague phrases if technical specifics also present", () => {
    expect(isVagueContent("影响到整个项目，修改了 src/api/auth.ts 和 config.json")).toBe(false);
  });

  it("flags very short content without technical indicators", () => {
    expect(isVagueContent("使用了某种优化方式")).toBe(true);
  });

  it("allows short content with file paths", () => {
    expect(isVagueContent("修改 src/index.ts")).toBe(false);
  });

  it("allows content with function references", () => {
    expect(isVagueContent("重构了 resolveAuthor() 的逻辑，增加了 git config 的回退检测")).toBe(false);
  });

  it("allows detailed technical content", () => {
    expect(isVagueContent(
      "App 内嵌 WebView 无法直接接收 OAuth redirect。方案：WebView 打开 static/oauth-bridge.html → Bridge 接收 callback URL → postMessage 传回 App → App 解析 token"
    )).toBe(false);
  });

  it("flags generic impact phrases", () => {
    expect(isVagueContent("优化了整体性能表现")).toBe(true);
  });

  it("flags medium-length content with no technical substance", () => {
    expect(isVagueContent(
      "这个技术选择对我们的项目来说非常重要，它能够帮助我们更好地实现功能需求，同时也能够保证系统的稳定性和可维护性"
    )).toBe(true);
  });

  it("allows medium-length content with enough technical detail", () => {
    expect(isVagueContent(
      "使用 PostgreSQL 的 JSONB 列存储用户配置，在 config.yaml 中配置连接池大小为 20"
    )).toBe(false);
  });
});

// ============================================================
// Extraction Prompt Improvements
// ============================================================

describe("buildExtractionPrompt", () => {
  it("includes existing titles when provided", () => {
    const prompt = buildExtractionPrompt(
      "test conversation",
      undefined,
      "2026-04-21",
      "[decision] Use PostgreSQL\n[convention] Naming rules"
    );
    expect(prompt).toContain("ALREADY EXTRACTED");
    expect(prompt).toContain("Use PostgreSQL");
    expect(prompt).toContain("Naming rules");
  });

  it("excludes existing titles block when empty", () => {
    const prompt = buildExtractionPrompt("test conversation", undefined, "2026-04-21");
    expect(prompt).not.toContain("ALREADY EXTRACTED");
  });

  it("includes quality checklist", () => {
    const prompt = buildExtractionPrompt("test", undefined, "2026-04-21");
    expect(prompt).toContain("QUALITY CHECKLIST");
    expect(prompt).toContain("SPECIFIC");
    expect(prompt).toContain("ACTIONABLE");
    expect(prompt).toContain("DURABLE");
  });

  it("includes bad examples with WHY BAD explanations", () => {
    const prompt = buildExtractionPrompt("test", undefined, "2026-04-21");
    expect(prompt).toContain("WHY BAD");
    expect(prompt).toContain("影响到整个项目的功能实现");
  });

  it("includes multiple GOOD examples", () => {
    const prompt = buildExtractionPrompt("test", undefined, "2026-04-21");
    expect(prompt).toContain("Example 1");
    expect(prompt).toContain("Example 2");
    expect(prompt).toContain("Example 3");
  });

  it("requires ≥2 concrete technical details", () => {
    const prompt = buildExtractionPrompt("test", undefined, "2026-04-21");
    expect(prompt).toContain("≥2 concrete technical details");
  });

  it("includes extraction process steps", () => {
    const prompt = buildExtractionPrompt("test", undefined, "2026-04-21");
    expect(prompt).toContain("EXTRACTION PROCESS");
    expect(prompt).toContain("KEY MOMENTS");
  });
});
