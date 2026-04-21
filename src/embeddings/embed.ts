/**
 * Embedding API client — uses the same OpenAI-compatible API already
 * configured for extraction. Calls /embeddings endpoint.
 */

import { resolveAiConfig } from "../extractor/llm.js";

const FETCH_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS = [2_000, 4_000];

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export interface EmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function resolveEmbeddingConfig(modelOverride?: string): EmbeddingConfig | null {
  const llm = resolveAiConfig();
  if (!llm) return null;
  return {
    apiKey: llm.apiKey,
    baseUrl: llm.baseUrl,
    model: modelOverride || DEFAULT_EMBEDDING_MODEL,
  };
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("econnreset") ||
        msg.includes("econnrefused") || msg.includes("429") ||
        msg.includes("rate") || msg.includes("network")) return true;
  }
  return false;
}

/**
 * Embed a single text string. Returns the vector (number[]).
 */
export async function embedText(
  text: string,
  config: EmbeddingConfig
): Promise<number[]> {
  const result = await embedBatch([text], config);
  return result[0];
}

/**
 * Embed multiple texts in one API call (batch).
 * OpenAI-compatible APIs support array input.
 */
export async function embedBatch(
  texts: string[],
  config: EmbeddingConfig
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const url = `${config.baseUrl}/embeddings`;
  const body = JSON.stringify({
    model: config.model,
    input: texts,
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status === 429) {
        const delay = RETRY_DELAYS[attempt] ?? 4_000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Embedding API error ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index (API may return out of order)
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        const delay = RETRY_DELAYS[attempt] ?? 2_000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
