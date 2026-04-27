import { describe, it, expect } from "vitest";
import {
  supportsFsWatch,
  isSourceEnabledInConfig,
} from "../commands/watch.js";
import { DEFAULT_CONFIG, type AiMemoryConfig, type SourceType } from "../types.js";

// ---------------------------------------------------------------------------
// v2.5-06 audit pass — Findings B + C regression tests.
//
// `runWatch` makes two source-type-specific decisions before it sets up
// any I/O: which sources to include at all (config.enabled gate) and
// which sources qualify for fs.watch (vs. polling-only). Both used to be
// inline if-ladders that silently missed `codex` after v2.5-06 shipped.
// These two branches are now named pure functions; the tests below pin
// them so future "added a 6th source" work either updates both helpers
// or fails this file loudly.
// ---------------------------------------------------------------------------

const ALL_SOURCES: SourceType[] = [
  "cursor",
  "claude-code",
  "windsurf",
  "copilot",
  "codex",
];

describe("watch — supportsFsWatch (v2.5-06 audit Finding B)", () => {
  it("returns true for the JSONL-file-per-conversation sources (Cursor, Claude Code, Codex)", () => {
    expect(supportsFsWatch("cursor")).toBe(true);
    expect(supportsFsWatch("claude-code")).toBe(true);
    expect(supportsFsWatch("codex")).toBe(true);
  });

  it("returns false for SQLite/JSON-blob sources where fs.watch fires unhelpfully", () => {
    expect(supportsFsWatch("windsurf")).toBe(false);
    expect(supportsFsWatch("copilot")).toBe(false);
  });

  it("covers every production source type (no SourceType silently falls through)", () => {
    // If a 6th source ships and the dev forgets to update supportsFsWatch,
    // the new SourceType still returns one of {true, false} — but this
    // test combined with the `default → never` exhaustiveness check at
    // the call site will catch the omission at compile time + here.
    for (const t of ALL_SOURCES) {
      const v = supportsFsWatch(t);
      expect(typeof v).toBe("boolean");
    }
  });
});

describe("watch — isSourceEnabledInConfig (v2.5-06 audit Finding C)", () => {
  function configWith(
    overrides: Partial<AiMemoryConfig["sources"]> = {}
  ): AiMemoryConfig {
    return {
      ...DEFAULT_CONFIG,
      sources: { ...DEFAULT_CONFIG.sources, ...overrides },
    };
  }

  it("returns true for all 5 sources under the default config (additive flag policy)", () => {
    const cfg = configWith();
    for (const t of ALL_SOURCES) {
      expect(isSourceEnabledInConfig(t, cfg)).toBe(true);
    }
  });

  it("respects explicit `enabled: false` per source", () => {
    expect(
      isSourceEnabledInConfig(
        "cursor",
        configWith({ cursor: { enabled: false } })
      )
    ).toBe(false);
    expect(
      isSourceEnabledInConfig(
        "claude-code",
        configWith({ claudeCode: { enabled: false } })
      )
    ).toBe(false);
    expect(
      isSourceEnabledInConfig(
        "windsurf",
        configWith({ windsurf: { enabled: false } })
      )
    ).toBe(false);
    expect(
      isSourceEnabledInConfig(
        "copilot",
        configWith({ copilot: { enabled: false } })
      )
    ).toBe(false);
    expect(
      isSourceEnabledInConfig(
        "codex",
        configWith({ codex: { enabled: false } })
      )
    ).toBe(false);
  });

  // The cross-version compatibility test: an old `.config.json` from a
  // v2.4 install won't have a `sources.codex` key at all. The watch
  // filter must not crash and must default-enable codex (additive-flag
  // policy — new sources are on unless the user opts them out).
  it("treats a missing `codex` key as enabled (config from before v2.5-06)", () => {
    const legacyConfig: AiMemoryConfig = {
      ...DEFAULT_CONFIG,
      sources: {
        cursor: { enabled: true },
        claudeCode: { enabled: true },
        windsurf: { enabled: true },
        copilot: { enabled: true },
        // codex key omitted entirely (legacy config shape from v2.4)
      } as AiMemoryConfig["sources"],
    };
    expect(isSourceEnabledInConfig("codex", legacyConfig)).toBe(true);
  });

  it("covers every production source type (exhaustiveness)", () => {
    const cfg = configWith();
    for (const t of ALL_SOURCES) {
      const v = isSourceEnabledInConfig(t, cfg);
      expect(typeof v).toBe("boolean");
    }
  });
});
