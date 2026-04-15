import { describe, it, expect } from "vitest";
import {
  buildExtractionPrompt,
  buildSummaryPrompt,
  buildContextPrompt,
} from "../extractor/prompts.js";

describe("buildExtractionPrompt", () => {
  it("includes conversation text in prompt", () => {
    const prompt = buildExtractionPrompt("User: hello\nAssistant: hi");
    expect(prompt).toContain("User: hello");
    expect(prompt).toContain("Assistant: hi");
  });

  it("includes type filter when types are specified", () => {
    const prompt = buildExtractionPrompt("text", ["decision", "todo"]);
    expect(prompt).toContain("decision");
    expect(prompt).toContain("todo");
  });

  it("requests JSON output", () => {
    const prompt = buildExtractionPrompt("text");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain('"type"');
  });

  it("handles no type filter", () => {
    const prompt = buildExtractionPrompt("text");
    expect(prompt).not.toContain("Only extract these types");
  });

  it("instructs to return [] for no knowledge", () => {
    const prompt = buildExtractionPrompt("text");
    expect(prompt).toContain("[]");
  });
});

describe("buildSummaryPrompt", () => {
  it("includes memories JSON", () => {
    const memories = JSON.stringify([{ type: "decision", title: "Test" }]);
    const prompt = buildSummaryPrompt(memories, "zh");
    expect(prompt).toContain("Test");
  });

  it("specifies Chinese language", () => {
    const prompt = buildSummaryPrompt("[]", "zh");
    expect(prompt).toContain("Chinese");
  });

  it("specifies English language", () => {
    const prompt = buildSummaryPrompt("[]", "en");
    expect(prompt).toContain("English");
  });

  it("includes focus topic when provided", () => {
    const prompt = buildSummaryPrompt("[]", "zh", "payment module");
    expect(prompt).toContain("payment module");
  });
});

describe("buildContextPrompt", () => {
  it("includes memories JSON", () => {
    const memories = JSON.stringify([{ title: "OAuth decision" }]);
    const prompt = buildContextPrompt(memories, "zh");
    expect(prompt).toContain("OAuth decision");
  });

  it("specifies language", () => {
    expect(buildContextPrompt("[]", "zh")).toContain("Chinese");
    expect(buildContextPrompt("[]", "en")).toContain("English");
  });

  it("includes topic when provided", () => {
    const prompt = buildContextPrompt("[]", "zh", "coupon system");
    expect(prompt).toContain("coupon system");
  });

  it("instructs output as pasteable markdown", () => {
    const prompt = buildContextPrompt("[]", "zh");
    expect(prompt).toContain("markdown");
  });
});
