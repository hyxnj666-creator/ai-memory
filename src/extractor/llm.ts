/**
 * Shared LLM client used by extract, summary, and context commands.
 * Centralises API config resolution, concurrency limiting, retry logic,
 * and JSON payload sanitisation.
 */

// --- Concurrency semaphore (shared across all LLM callers) ---

const MAX_CONCURRENT = 6;
let active = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (active < MAX_CONCURRENT) { active++; resolve(); }
    else queue.push(() => { active++; resolve(); });
  });
}

function releaseSlot(): void {
  active--;
  queue.shift()?.();
}

// --- API config ---

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Resolve LLM config from environment variables.
 * Priority: AI_REVIEW > OPENAI > ANTHROPIC (with proxy) > OLLAMA > LM_STUDIO
 * Local LLMs (Ollama, LM Studio) work without API keys.
 * @param modelOverride Optionally override the model (e.g. from .config.json `model` field).
 */
export function resolveAiConfig(modelOverride?: string): LLMConfig | null {
  const candidates = [
    {
      key: process.env.AI_REVIEW_API_KEY,
      base: process.env.AI_REVIEW_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.AI_REVIEW_MODEL,
    },
    {
      key: process.env.OPENAI_API_KEY,
      base: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL,
    },
    {
      key: process.env.ANTHROPIC_API_KEY,
      base: process.env.ANTHROPIC_BASE_URL,
      model: process.env.ANTHROPIC_MODEL,
      isAnthropic: true,
    },
  ];

  for (const c of candidates) {
    if (c.key) {
      if ("isAnthropic" in c && c.isAnthropic && !c.base) {
        process.stderr.write(
          "[warn] ANTHROPIC_API_KEY detected but no ANTHROPIC_BASE_URL set.\n" +
          "       Anthropic's native API is not OpenAI-compatible.\n" +
          "       Please set ANTHROPIC_BASE_URL to an OpenAI-compatible proxy,\n" +
          "       or use AI_REVIEW_API_KEY + AI_REVIEW_BASE_URL instead.\n"
        );
        continue;
      }
      return {
        apiKey: c.key,
        baseUrl: c.base ?? "https://api.openai.com/v1",
        model: modelOverride || c.model || "gpt-4o-mini",
      };
    }
  }

  // Local LLM fallback: Ollama (http://localhost:11434/v1)
  const ollamaHost = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL) {
    return {
      apiKey: "ollama",
      baseUrl: `${ollamaHost}/v1`,
      model: modelOverride || process.env.OLLAMA_MODEL || "llama3.2",
    };
  }

  // Local LLM fallback: LM Studio (http://localhost:1234/v1)
  if (process.env.LM_STUDIO_BASE_URL || process.env.LM_STUDIO_MODEL) {
    return {
      apiKey: "lm-studio",
      baseUrl: process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234/v1",
      model: modelOverride || process.env.LM_STUDIO_MODEL || "default",
    };
  }

  return null;
}

/** Remove characters that make JSON bodies invalid. */
function sanitize(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "");
}

const FETCH_TIMEOUT_MS = 120_000; // 2 minutes per LLM call

async function doFetch(url: string, body: string, apiKey: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

const MAX_RETRIES = 2;
const RETRY_DELAYS = [3_000, 6_000];

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("econnreset") ||
        msg.includes("econnrefused") || msg.includes("socket hang up") ||
        msg.includes("network")) return true;
  }
  return false;
}

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return `LLM request timed out after ${FETCH_TIMEOUT_MS / 1000}s. The model may be overloaded — try again or use a faster model.`;
    }
    if (err.message.includes("fetch failed")) {
      return `Network error: cannot reach API. Check your internet connection and API base URL.`;
    }
  }
  return String(err);
}

/**
 * Call the LLM with automatic concurrency limiting, retry (429 / network / timeout),
 * and JSON sanitisation. Throws on non-recoverable errors.
 */
export async function callLLM(
  prompt: string,
  config: LLMConfig,
  verbose = false
): Promise<string> {
  await acquireSlot();
  try {
    const safe = sanitize(prompt);
    const body = JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: safe }],
      temperature: 0.2,
    });
    const url = `${config.baseUrl}/chat/completions`;

    if (verbose) {
      process.stderr.write(
        `[llm] POST ${url} model=${config.model} prompt_chars=${safe.length}\n`
      );
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        let res = await doFetch(url, body, config.apiKey);

        if (res.status === 429) {
          const delay = RETRY_DELAYS[attempt] ?? 6_000;
          if (verbose) process.stderr.write(`[llm] 429 rate-limited, retry in ${delay / 1000}s...\n`);
          await new Promise((r) => setTimeout(r, delay));
          res = await doFetch(url, body, config.apiKey);
        }

        if (!res.ok) {
          const err = await res.text().catch(() => "");
          throw new Error(`LLM API error ${res.status}: ${err.slice(0, 300)}`);
        }

        const data = (await res.json()) as {
          choices: { message: { content: string } }[];
        };
        const result = data.choices[0]?.message?.content ?? "";

        if (verbose) {
          process.stderr.write(`[llm] response_chars=${result.length}\n`);
        }

        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          const delay = RETRY_DELAYS[attempt] ?? 3_000;
          if (verbose) process.stderr.write(`[llm] ${friendlyError(err)} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s...\n`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(friendlyError(err));
      }
    }
    throw new Error(friendlyError(lastErr));
  } finally {
    releaseSlot();
  }
}
