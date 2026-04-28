/**
 * Shared LLM client used by extract, summary, and context commands.
 * Centralises API config resolution, concurrency limiting, retry logic,
 * and JSON payload sanitisation.
 */

// --- Built-in free-tier fallback (SiliconFlow / DeepSeek-V4-Flash) ---
// Shared key for first-time users who haven't configured their own API key.
// Base64-encoded to avoid plain-text leakage in logs / CI output.
// Max 2 conversations per run enforced in extract.ts when this key is active.
const _BK = 'c2stZGhxdGN2dXl4ZHR1bm5lZ3RmbGdranlob2hhY2tiamt3dmxtbmR1aHlyb2FuZHZs';
export const BUILTIN_KEY = atob(_BK);
export const BUILTIN_BASE_URL = 'https://api.siliconflow.cn/v1';
export const BUILTIN_MODEL = 'deepseek-ai/DeepSeek-V4-Flash';
export const BUILTIN_MAX_PICKS = 2;
/** Max chunks processed per conversation when using the built-in key. */
export const BUILTIN_MAX_CHUNKS = 20;

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
  /** True when using the built-in shared key rather than a user-configured one. */
  builtinFallback?: boolean;
}

/**
 * Resolve LLM config from environment variables.
 * Priority: AI_REVIEW > OPENAI > ANTHROPIC (with proxy) > OLLAMA > LM_STUDIO > builtin
 * Local LLMs (Ollama, LM Studio) work without API keys.
 * When no key is found, falls back to the built-in SiliconFlow/DeepSeek-V4-Flash key
 * (limited to BUILTIN_MAX_PICKS conversations per run, enforced in extract.ts).
 * @param modelOverride Optionally override the model (e.g. from .config.json `model` field).
 */
export function resolveAiConfig(modelOverride?: string): LLMConfig {
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

  // Built-in free-tier fallback — no user config required.
  return {
    apiKey: BUILTIN_KEY,
    baseUrl: BUILTIN_BASE_URL,
    model: BUILTIN_MODEL,
    builtinFallback: true,
  };
}

/** Remove characters that make JSON bodies invalid. */
function sanitize(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "");
}

const FETCH_TIMEOUT_MS = 60_000; // 60 s — fail fast so retries start sooner

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

// Transient HTTP status codes that should be retried.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Base delays (ms) for exponential back-off. Actual delay = base × jitter(0.7–1.3).
const RETRY_BASE_DELAYS = [5_000, 15_000, 30_000, 60_000];
const MAX_RETRIES = RETRY_BASE_DELAYS.length; // 4 attempts after the first

/** Full-jitter sleep: uniform random in [base * 0.7, base * 1.3]. */
function jitteredDelay(base: number): number {
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("fetch failed") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("socket hang up") ||
      msg.includes("network")
    );
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
 * Call the LLM with automatic concurrency limiting, exponential back-off with
 * full jitter for transient HTTP errors (429 / 5xx) and network failures,
 * and JSON payload sanitisation. Throws on non-recoverable errors.
 *
 * Retry strategy:
 *  - Up to MAX_RETRIES retries (4), total 5 attempts
 *  - Transient HTTP codes: 429, 500, 502, 503, 504
 *  - Network / timeout errors are also retried
 *  - Delay uses exponential back-off with ±30% jitter to avoid thundering herd
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

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const baseDelay = RETRY_BASE_DELAYS[attempt] ?? RETRY_BASE_DELAYS[RETRY_BASE_DELAYS.length - 1];

      let res: Response;
      try {
        res = await doFetch(url, body, config.apiKey);
      } catch (fetchErr) {
        if (!isLastAttempt && isRetryableError(fetchErr)) {
          const delay = jitteredDelay(baseDelay);
          if (verbose) process.stderr.write(
            `[llm] ${friendlyError(fetchErr)} — retry ${attempt + 1}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s\n`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(friendlyError(fetchErr));
      }

      // Transient server-side errors — retry via the loop (not inline)
      if (RETRYABLE_STATUS.has(res.status)) {
        if (!isLastAttempt) {
          const delay = jitteredDelay(baseDelay);
          if (verbose) process.stderr.write(
            `[llm] HTTP ${res.status} — retry ${attempt + 1}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s\n`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        const body2 = await res.text().catch(() => "");
        throw new Error(`LLM API error ${res.status}: ${body2.slice(0, 300)}`);
      }

      if (!res.ok) {
        const body2 = await res.text().catch(() => "");
        throw new Error(`LLM API error ${res.status}: ${body2.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      const result = data.choices[0]?.message?.content ?? "";

      if (verbose) {
        process.stderr.write(`[llm] response_chars=${result.length}\n`);
      }

      return result;
    }

    // Unreachable — loop always returns or throws.
    throw new Error("LLM call failed after all retries.");
  } finally {
    releaseSlot();
  }
}
