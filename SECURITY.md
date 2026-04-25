# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| 1.x     | No (EOL)  |

Security fixes are backported to the latest minor release only.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue**
2. Email: [create a security advisory](https://github.com/hyxnj666-creator/ai-memory/security/advisories/new) on GitHub

We will acknowledge your report within 48 hours and provide a fix timeline.

## Privacy & Data Handling

ai-memory processes potentially sensitive data (conversation history, API keys). Here's how we handle it:

### What stays local

- **All data is local.** Conversation files, extracted memories, config, and state never leave your machine.
- **No telemetry.** We don't collect any usage data, analytics, or crash reports.
- **No cloud.** There is no server, no account, no cloud storage.

### API key usage

- API keys are read from environment variables only — never written to disk by ai-memory.
- Keys are sent only to the API endpoint you configure (`AI_REVIEW_BASE_URL`, `OPENAI_BASE_URL`, etc.).
- We do **not** proxy, log, or store API keys.

### What is sent to the LLM

When you run `extract`, `summary`, or `context --summarize`, conversation text is sent to the configured LLM API for processing. This includes:
- Conversation content (chunked, ~5k tokens per request)
- The extraction/summary prompt

**If your conversations contain sensitive information (credentials, PII, proprietary code), be aware that this data is sent to the LLM provider.**

To mitigate:
- Use a self-hosted LLM (Ollama + local model) or a provider with data privacy guarantees
- Use `--type` to extract only specific knowledge types
- Review extracted memories before committing to git

### .gitignore recommendations

```gitignore
# Machine-specific state (do NOT commit)
.ai-memory/.state.json

# Config may contain author name (commit if comfortable)
# .ai-memory/.config.json
```

## Dependencies

ai-memory v2 has two runtime dependencies, both well-audited:
- `@modelcontextprotocol/sdk` — official MCP SDK for the `serve` command
- `zod` — runtime schema validation for bundle import

Prior to v2.0 the project had zero runtime dependencies. If you need the zero-deps posture for CLI-only usage, `ai-memory-cli@1.4.x` is still installable on npm.
