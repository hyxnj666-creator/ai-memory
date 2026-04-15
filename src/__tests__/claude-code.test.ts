import { describe, it, expect } from "vitest";
import { ClaudeCodeSource } from "../sources/claude-code.js";

const source = new ClaudeCodeSource();

describe("ClaudeCodeSource.parseJsonlContent", () => {
  it("parses string content format", () => {
    const raw = JSON.stringify({
      role: "user",
      message: { content: "Hello Claude" },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual({ role: "user", text: "Hello Claude" });
  });

  it("parses array content format (text blocks)", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [{ type: "text", text: "Here is the answer." }],
      },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Here is the answer.");
  });

  it("skips tool_use and tool_result blocks", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [
          { type: "text", text: "Thinking..." },
          { type: "tool_use", id: "abc", name: "bash", input: {} },
          { type: "tool_result", tool_use_id: "abc", content: "output" },
        ],
      },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Thinking...");
  });

  it("skips lines with unknown role", () => {
    const raw = JSON.stringify({
      role: "system",
      content: "System init",
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(0);
  });

  it("skips malformed JSON lines", () => {
    const raw = [
      "{bad json}",
      JSON.stringify({
        role: "user",
        message: { content: "Valid message" },
      }),
    ].join("\n");

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
  });

  it("skips empty content", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [{ type: "tool_use", name: "bash", input: {} }],
      },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(0);
  });

  it("handles direct content field (not nested in message)", () => {
    const raw = JSON.stringify({
      role: "user",
      content: "Direct content field",
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Direct content field");
  });
});
