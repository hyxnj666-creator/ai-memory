import { describe, it, expect } from "vitest";
import { CopilotSource } from "../sources/copilot.js";

const source = new CopilotSource();

describe("CopilotSource.parseSession + sessionToTurns", () => {
  it("parses JSON session with markdownContent response", () => {
    const raw = JSON.stringify({
      sessionId: "abc-123",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_1",
          timestamp: 1700000001000,
          message: { text: "What is TypeScript?" },
          response: [
            {
              kind: "markdownContent",
              value: { value: "TypeScript is a typed superset of JavaScript." },
            },
          ],
        },
      ],
    });

    const session = source.parseSession(raw);
    expect(session).not.toBeNull();
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({ role: "user", text: "What is TypeScript?" });
    expect(turns[1]).toEqual({
      role: "assistant",
      text: "TypeScript is a typed superset of JavaScript.",
    });
  });

  it("parses JSON session with string response value", () => {
    const raw = JSON.stringify({
      sessionId: "abc-456",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_2",
          timestamp: 1700000002000,
          message: { text: "Hello" },
          response: { value: "Hi there!" },
        },
      ],
    });

    const session = source.parseSession(raw);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(2);
    expect(turns[1].text).toBe("Hi there!");
  });

  it("skips slash commands", () => {
    const raw = JSON.stringify({
      sessionId: "abc-789",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_3",
          timestamp: 1700000003000,
          message: { text: "/clear" },
        },
        {
          requestId: "req_4",
          timestamp: 1700000004000,
          message: { text: "Real question" },
          response: [
            { kind: "markdownContent", value: { value: "Real answer" } },
          ],
        },
      ],
    });

    const session = source.parseSession(raw);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("Real question");
  });

  it("handles empty response gracefully", () => {
    const raw = JSON.stringify({
      sessionId: "abc-empty",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_5",
          timestamp: 1700000005000,
          message: { text: "Hello?" },
        },
      ],
    });

    const session = source.parseSession(raw);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("user");
  });

  it("handles multiple response parts", () => {
    const raw = JSON.stringify({
      sessionId: "abc-multi",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_6",
          timestamp: 1700000006000,
          message: { text: "Explain" },
          response: [
            { kind: "markdownContent", value: { value: "Part 1." } },
            { kind: "codeblockUri", value: {} },
            { kind: "markdownContent", value: { value: "Part 2." } },
          ],
        },
      ],
    });

    const session = source.parseSession(raw);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(2);
    expect(turns[1].text).toContain("Part 1.");
    expect(turns[1].text).toContain("Part 2.");
  });
});

describe("CopilotSource.parseSession JSONL format", () => {
  it("parses JSONL with kind:0 wrapper", () => {
    const lines = [
      JSON.stringify({
        kind: 0,
        v: {
          sessionId: "jsonl-1",
          creationDate: 1700000000000,
          version: 3,
          requests: [
            {
              requestId: "req_1",
              timestamp: 1700000001000,
              message: { text: "First message" },
              response: [
                { kind: "markdownContent", value: { value: "First response" } },
              ],
            },
          ],
        },
      }),
      JSON.stringify({
        kind: 1,
        v: { some: "incremental update" },
      }),
      JSON.stringify({
        kind: 0,
        v: {
          sessionId: "jsonl-1",
          creationDate: 1700000000000,
          version: 3,
          requests: [
            {
              requestId: "req_1",
              timestamp: 1700000001000,
              message: { text: "First message" },
              response: [
                { kind: "markdownContent", value: { value: "First response" } },
              ],
            },
            {
              requestId: "req_2",
              timestamp: 1700000002000,
              message: { text: "Second message" },
              response: [
                { kind: "markdownContent", value: { value: "Second response" } },
              ],
            },
          ],
        },
      }),
    ].join("\n");

    const session = source.parseSession(lines, "test.jsonl");
    expect(session).not.toBeNull();
    expect(session!.requests).toHaveLength(2);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(4);
  });

  it("returns null for invalid JSONL", () => {
    const session = source.parseSession("not json\nalso not json", "test.jsonl");
    expect(session).toBeNull();
  });
});

describe("CopilotSource.sessionToTurns edge cases", () => {
  it("returns empty for null session", () => {
    const turns = source.sessionToTurns(null);
    expect(turns).toHaveLength(0);
  });

  it("skips requests with empty message text", () => {
    const raw = JSON.stringify({
      sessionId: "edge-1",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_1",
          timestamp: 1700000001000,
          message: { text: "" },
        },
        {
          requestId: "req_2",
          timestamp: 1700000002000,
          message: { text: "Valid" },
          response: [
            { kind: "markdownContent", value: { value: "Answer" } },
          ],
        },
      ],
    });

    const session = source.parseSession(raw);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("Valid");
  });

  it("handles response with result.value format", () => {
    const raw = JSON.stringify({
      sessionId: "edge-2",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_1",
          timestamp: 1700000001000,
          message: { text: "Question" },
          response: { result: { value: "Answer via result" } },
        },
      ],
    });

    const session = source.parseSession(raw);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(2);
    expect(turns[1].text).toBe("Answer via result");
  });

  it("handles markdownContent with string value (not nested)", () => {
    const raw = JSON.stringify({
      sessionId: "edge-3",
      creationDate: 1700000000000,
      version: 3,
      requests: [
        {
          requestId: "req_1",
          timestamp: 1700000001000,
          message: { text: "Question" },
          response: [
            { kind: "markdownContent", value: "Direct string answer" },
          ],
        },
      ],
    });

    const session = source.parseSession(raw);
    const turns = source.sessionToTurns(session);
    expect(turns).toHaveLength(2);
    expect(turns[1].text).toBe("Direct string answer");
  });
});
