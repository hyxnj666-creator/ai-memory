import { describe, it, expect } from "vitest";
import { resolveAiConfig } from "../extractor/llm.js";

describe("resolveAiConfig", () => {
  it("returns null when no key is set", () => {
    const old = {
      AI_REVIEW_API_KEY: process.env.AI_REVIEW_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    delete process.env.AI_REVIEW_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(resolveAiConfig()).toBeNull();

    // Restore
    if (old.AI_REVIEW_API_KEY) process.env.AI_REVIEW_API_KEY = old.AI_REVIEW_API_KEY;
    if (old.OPENAI_API_KEY) process.env.OPENAI_API_KEY = old.OPENAI_API_KEY;
    if (old.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = old.ANTHROPIC_API_KEY;
  });

  it("prefers AI_REVIEW_API_KEY over OPENAI_API_KEY", () => {
    const old = process.env.AI_REVIEW_API_KEY;
    const oldOai = process.env.OPENAI_API_KEY;
    process.env.AI_REVIEW_API_KEY = "review-key";
    process.env.OPENAI_API_KEY = "openai-key";

    const cfg = resolveAiConfig();
    expect(cfg?.apiKey).toBe("review-key");

    process.env.AI_REVIEW_API_KEY = old ?? "";
    if (!old) delete process.env.AI_REVIEW_API_KEY;
    process.env.OPENAI_API_KEY = oldOai ?? "";
    if (!oldOai) delete process.env.OPENAI_API_KEY;
  });

  it("uses OPENAI_BASE_URL when OPENAI_API_KEY is used", () => {
    const old = process.env.AI_REVIEW_API_KEY;
    const oldOai = process.env.OPENAI_API_KEY;
    const oldBase = process.env.OPENAI_BASE_URL;
    delete process.env.AI_REVIEW_API_KEY;
    process.env.OPENAI_API_KEY = "oai-key";
    process.env.OPENAI_BASE_URL = "https://custom.openai.com/v1";

    const cfg = resolveAiConfig();
    expect(cfg?.baseUrl).toBe("https://custom.openai.com/v1");

    if (old) process.env.AI_REVIEW_API_KEY = old; else delete process.env.AI_REVIEW_API_KEY;
    process.env.OPENAI_API_KEY = oldOai ?? "";
    if (!oldOai) delete process.env.OPENAI_API_KEY;
    if (oldBase) process.env.OPENAI_BASE_URL = oldBase; else delete process.env.OPENAI_BASE_URL;
  });
});
