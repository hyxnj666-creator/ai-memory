import { describe, it, expect } from "vitest";
import { WindsurfSource } from "../sources/windsurf.js";

const source = new WindsurfSource();

describe("WindsurfSource.parseTurns", () => {
  it("parses messages with role and content string", () => {
    const conv = {
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({ role: "user", text: "Hello" });
    expect(turns[1]).toEqual({ role: "assistant", text: "Hi there!" });
  });

  it("parses messages with text array content", () => {
    const conv = {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "How do I deploy?" }],
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "You can deploy with:" },
            { type: "text", text: "npm run build" },
          ],
        },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("How do I deploy?");
    expect(turns[1].text).toContain("You can deploy with:");
    expect(turns[1].text).toContain("npm run build");
  });

  it("normalizes various role names", () => {
    const conv = {
      messages: [
        { role: "human", content: "Question" },
        { role: "ai", content: "Answer" },
        { role: "cascade", content: "More context" },
        { role: "bot", content: "Bot response" },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(4);
    expect(turns[0].role).toBe("user");
    expect(turns[1].role).toBe("assistant");
    expect(turns[2].role).toBe("assistant");
    expect(turns[3].role).toBe("assistant");
  });

  it("skips messages with unknown roles", () => {
    const conv = {
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "Real question" },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Real question");
  });

  it("skips messages with empty content", () => {
    const conv = {
      messages: [
        { role: "user", content: "" },
        { role: "user", content: "Valid" },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe("Valid");
  });

  it("returns empty for non-object input", () => {
    expect(source.parseTurns(null)).toHaveLength(0);
    expect(source.parseTurns(undefined)).toHaveLength(0);
    expect(source.parseTurns("string")).toHaveLength(0);
  });

  it("handles turns field instead of messages", () => {
    const conv = {
      turns: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "World" },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(2);
  });

  it("handles steps field instead of messages", () => {
    const conv = {
      steps: [
        { role: "user", text: "Step 1" },
        { role: "assistant", visible: "Step 2 response" },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("Step 1");
    expect(turns[1].text).toBe("Step 2 response");
  });

  it("uses type/sender fields as role fallback", () => {
    const conv = {
      messages: [
        { type: "user", message: "Typed message" },
        { sender: "assistant", content: "Sender response" },
      ],
    };

    const turns = source.parseTurns(conv);
    expect(turns).toHaveLength(2);
  });
});

describe("WindsurfSource.parseChatData", () => {
  it("parses array of conversations", () => {
    const data = [
      {
        messages: [
          { role: "user", content: "Conv 1" },
          { role: "assistant", content: "Reply 1" },
        ],
      },
      {
        messages: [
          { role: "user", content: "Conv 2" },
          { role: "assistant", content: "Reply 2" },
        ],
      },
    ];

    const metas = source.parseChatData(
      JSON.stringify(data),
      "testKey",
      "/tmp/state.vscdb",
      Date.now(),
      "workspace-1"
    );

    expect(metas).toHaveLength(2);
    expect(metas[0].source).toBe("windsurf");
    expect(metas[0].turnCount).toBe(2);
  });

  it("parses object with conversations array", () => {
    const data = {
      conversations: [
        {
          title: "My Chat",
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi" },
          ],
        },
      ],
    };

    const metas = source.parseChatData(
      JSON.stringify(data),
      "testKey",
      "/tmp/state.vscdb",
      Date.now(),
      "workspace-2"
    );

    expect(metas).toHaveLength(1);
    expect(metas[0].title).toBe("My Chat");
  });

  it("returns empty for invalid JSON", () => {
    const metas = source.parseChatData(
      "not json",
      "testKey",
      "/tmp/state.vscdb",
      Date.now(),
      "workspace-3"
    );

    expect(metas).toHaveLength(0);
  });

  it("returns empty for conversations with no turns", () => {
    const data = [{ messages: [] }];
    const metas = source.parseChatData(
      JSON.stringify(data),
      "testKey",
      "/tmp/state.vscdb",
      Date.now(),
      "workspace-4"
    );

    expect(metas).toHaveLength(0);
  });

  it("extracts title from first user message when no title field", () => {
    const data = [
      {
        messages: [
          { role: "user", content: "How do I setup authentication in my Next.js app?" },
          { role: "assistant", content: "You can use NextAuth..." },
        ],
      },
    ];

    const metas = source.parseChatData(
      JSON.stringify(data),
      "testKey",
      "/tmp/state.vscdb",
      Date.now(),
      "workspace-5"
    );

    expect(metas).toHaveLength(1);
    expect(metas[0].title).toBe("How do I setup authentication in my Next.js app?");
  });
});

describe("WindsurfSource.extractTurnsFromChatData", () => {
  it("extracts turns for matching conversation index", () => {
    const data = [
      {
        messages: [
          { role: "user", content: "First conv" },
          { role: "assistant", content: "First reply" },
        ],
      },
      {
        messages: [
          { role: "user", content: "Second conv" },
          { role: "assistant", content: "Second reply" },
        ],
      },
    ];

    const turns = source.extractTurnsFromChatData(
      JSON.stringify(data),
      "workspace:key:1"
    );

    expect(turns).toHaveLength(2);
    expect(turns[0].text).toBe("Second conv");
  });

  it("returns empty for non-matching index", () => {
    const data = [
      {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "World" },
        ],
      },
    ];

    const turns = source.extractTurnsFromChatData(
      JSON.stringify(data),
      "workspace:key:5"
    );

    expect(turns).toHaveLength(0);
  });
});
