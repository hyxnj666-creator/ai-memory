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

  it("falls back to Ollama when OLLAMA_HOST is set", () => {
    const saved = {
      AI_REVIEW_API_KEY: process.env.AI_REVIEW_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OLLAMA_HOST: process.env.OLLAMA_HOST,
      OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    };
    delete process.env.AI_REVIEW_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OLLAMA_HOST = "http://my-ollama:11434";
    process.env.OLLAMA_MODEL = "mistral";

    const cfg = resolveAiConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.apiKey).toBe("ollama");
    expect(cfg!.baseUrl).toBe("http://my-ollama:11434/v1");
    expect(cfg!.model).toBe("mistral");

    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v; else delete process.env[k];
    }
  });

  it("falls back to LM Studio when LM_STUDIO_BASE_URL is set", () => {
    const saved = {
      AI_REVIEW_API_KEY: process.env.AI_REVIEW_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OLLAMA_HOST: process.env.OLLAMA_HOST,
      OLLAMA_MODEL: process.env.OLLAMA_MODEL,
      LM_STUDIO_BASE_URL: process.env.LM_STUDIO_BASE_URL,
      LM_STUDIO_MODEL: process.env.LM_STUDIO_MODEL,
    };
    delete process.env.AI_REVIEW_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_MODEL;
    process.env.LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
    process.env.LM_STUDIO_MODEL = "codellama";

    const cfg = resolveAiConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.apiKey).toBe("lm-studio");
    expect(cfg!.baseUrl).toBe("http://localhost:1234/v1");
    expect(cfg!.model).toBe("codellama");

    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v; else delete process.env[k];
    }
  });

  it("cloud API keys take priority over local LLM", () => {
    const saved = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OLLAMA_HOST: process.env.OLLAMA_HOST,
    };
    process.env.OPENAI_API_KEY = "sk-real-key";
    process.env.OLLAMA_HOST = "http://localhost:11434";

    const cfg = resolveAiConfig();
    expect(cfg!.apiKey).toBe("sk-real-key");

    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v; else delete process.env[k];
    }
  });
});
