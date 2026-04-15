import { describe, it, expect } from "vitest";
import { CursorSource } from "../sources/cursor.js";

const source = new CursorSource();

describe("CursorSource.parseJsonlContent", () => {
  it("parses user and assistant turns", () => {
    const raw = [
      JSON.stringify({
        role: "user",
        message: {
          content: [{ type: "text", text: "<user_query>\nHello\n</user_query>" }],
        },
      }),
      JSON.stringify({
        role: "assistant",
        message: {
          content: [{ type: "text", text: "Hi there!" }],
        },
      }),
    ].join("\n");

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({ role: "user", text: "Hello" });
    expect(turns[1]).toEqual({ role: "assistant", text: "Hi there!" });
  });

  it("strips <user_query> tags", () => {
    const raw = JSON.stringify({
      role: "user",
      message: {
        content: [
          { type: "text", text: "<user_query>\nFix the bug\n</user_query>" },
        ],
      },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns[0].text).toBe("Fix the bug");
  });

  it("skips lines with unknown role", () => {
    const raw = JSON.stringify({
      role: "system",
      message: { content: [{ type: "text", text: "System message" }] },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(0);
  });

  it("skips tool_use blocks", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [
          { type: "text", text: "Let me check the files." },
          {
            type: "tool_use",
            name: "Shell",
            input: { command: "ls", working_directory: "/tmp" },
          },
        ],
      },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Let me check the files.");
  });

  it("skips empty text content", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Shell", input: {} }],
      },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(0);
  });

  it("skips malformed JSON lines", () => {
    const raw = [
      "not json at all",
      JSON.stringify({
        role: "user",
        message: { content: [{ type: "text", text: "Valid message" }] },
      }),
    ].join("\n");

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Valid message");
  });

  it("handles multiple text parts in one turn", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [
          { type: "text", text: "First part." },
          { type: "text", text: "Second part." },
        ],
      },
    });

    const turns = source.parseJsonlContent(raw);
    expect(turns[0].text).toContain("First part.");
    expect(turns[0].text).toContain("Second part.");
  });

  it("handles empty lines in input", () => {
    const raw = "\n\n" + JSON.stringify({
      role: "user",
      message: { content: [{ type: "text", text: "Hello" }] },
    }) + "\n\n";

    const turns = source.parseJsonlContent(raw);
    expect(turns).toHaveLength(1);
  });
});

describe("CursorSource.parseLegacyContent", () => {
  it("parses legacy txt format", () => {
    const raw = `user:
<user_query>
What is the plan?
</user_query>
assistant:
Here is the plan.
user:
Thanks!
`;

    const turns = source.parseLegacyContent(raw);
    expect(turns.length).toBeGreaterThan(0);
    expect(turns[0].role).toBe("user");
    expect(turns[0].text).toBe("What is the plan?");
  });
});
