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
      // Anthropic is OpenAI-compatible only via proxy; default to openai endpoint
      base: process.env.ANTHROPIC_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.ANTHROPIC_MODEL,
    },
  ];

  for (const c of candidates) {
    if (c.key) {
      return {
        apiKey: c.key,
        baseUrl: c.base,
        // config.model > env model > default
        model: modelOverride || c.model || "gpt-4o-mini",
      };
    }
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

async function doFetch(url: string, body: string, apiKey: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });
}

/**
 * Call the LLM with automatic concurrency limiting, 429 retry, and
 * JSON sanitisation. Throws on non-recoverable errors.
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

    let res = await doFetch(url, body, config.apiKey);

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
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
  } finally {
    releaseSlot();
  }
}
