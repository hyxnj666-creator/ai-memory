# Spike: Built-in Free-Tier LLM Key (v2.6.2)

**Date**: 2026-04-27  
**Status**: Shipped in v2.6.2 (2026-04-28)  
**Motivation**: New users must configure an API key before they can run `extract`. This friction kills first-time adoption. Embedding a built-in SiliconFlow key lets users run their first extraction with zero setup.

---

## Problem

Current UX:
```
$ npx ai-memory-cli extract
❌ No AI API key found. Set AI_REVIEW_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.
```

Users give up before seeing the tool work. The `try` demo mode exists but doesn't use real user data.

## Goal

```
$ npx ai-memory-cli extract --pick 1
💡 Using built-in free-tier model (deepseek-ai/DeepSeek-V4-Flash via SiliconFlow).
   Limit: 2 conversations. Set OPENAI_API_KEY for unlimited extraction.

[1/1] "my-project" (2026-04-27) — extracting...
[+] Extracted 42 memories → .ai-memory/
```

Zero setup required for the first experience.

---

## Model Choice

**`deepseek-ai/DeepSeek-V4-Flash`** on SiliconFlow:

| Property | Value |
|---|---|
| Context | 1M tokens |
| Price | ¥1 / M input · ¥2 / M output |
| Arch | 284B total / 13B activated MoE |
| JSON output | ✅ reliable |
| Long convo | ✅ 1M covers any Cursor session |

Cost per 2-conversation run: ~¥0.5–1.0 (acceptable for a shared key).

---

## Design Decisions

### 1. Key encoding
Base64-encode the SiliconFlow key (same pattern as ai-review-pipeline).  
Not encryption — just prevents plain-text grep from leaking it in logs / CI output.

```typescript
// src/extractor/llm.ts
const _BK = '<base64-encoded-key>';
export const BUILTIN_KEY = atob(_BK);
export const BUILTIN_BASE_URL = 'https://api.siliconflow.cn/v1';
export const BUILTIN_MODEL = 'deepseek-ai/DeepSeek-V4-Flash';
```

### 2. 2-conversation limit

When `builtinFallback === true`:
- `--pick` accepts at most 2 conversation IDs → if user passes more, trim to first 2 + warn
- No `--incremental` or un-filtered full extract → require `--pick` or `--since`
- Each limit check prints a clear "get your own key" prompt

```
⚠️  Built-in key limit: max 2 conversations per run.
    Run: export OPENAI_API_KEY=<your-key>  to extract all.
```

### 3. Priority in resolveAiConfig

```
AI_REVIEW_API_KEY  →  OPENAI_API_KEY  →  ANTHROPIC_API_KEY
  →  OLLAMA_HOST/MODEL  →  LM_STUDIO  →  BUILTIN (fallback)
```

The built-in is last — any user-configured key takes precedence.

### 4. Concurrency throttle for built-in key

Built-in key calls: reduce `MAX_CONCURRENT` from 6 → 2 to be polite to the shared rate limit.  
User-provided keys keep MAX_CONCURRENT = 6.

### 5. Error handling for exhausted built-in key

If the built-in key returns 429 or 401:
```
⚠️  Built-in key rate-limited or exhausted.
    Set OPENAI_API_KEY or OPENAI_BASE_URL to continue.
```

---

## Files Changed

| File | Change |
|---|---|
| `src/extractor/llm.ts` | Add `BUILTIN_KEY`, `BUILTIN_BASE_URL`, `BUILTIN_MODEL`; update `resolveAiConfig` to return `builtinFallback: true` |
| `src/extractor/llm.ts` | Reduce concurrency to 2 when `builtinFallback` |
| `src/types.ts` | Add `builtinFallback?: boolean` to `LLMConfig` |
| `src/commands/extract.ts` | Early `resolveAiConfig` check; enforce 2-convo limit; print notice |
| `README.md` | Update Quick Start: no key needed for first run |
| `README.zh-CN.md` | Same |

---

## Non-goals

- No key rotation / server-side proxy (too complex for v2.7)
- No usage tracking per user (privacy-first)
- No built-in key for `summary`, `context`, or `recall` (low priority; those aren't the first-run critical path)
