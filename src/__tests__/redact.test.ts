import { describe, it, expect } from "vitest";
import {
  DEFAULT_RULES,
  OPTIONAL_RULES,
  buildRules,
  formatAuditTrail,
  redact,
  shouldRedact,
} from "../extractor/redact.js";
import type { RedactConfig } from "../types.js";

// ---------------------------------------------------------------------------
// v2.5-05 — redaction unit tests.
//
// The spike doc at docs/redaction-policy-2026-04-26.md is the source of truth
// for the rule list and threat model. This file is the executable spec —
// every locked default rule has at least one golden positive test, every
// "deliberately not default" rule has a negative test pinning that decision,
// and every config-level toggle has a behaviour test.
// ---------------------------------------------------------------------------

describe("redact: default rule catalogue invariants", () => {
  it("ships exactly 10 default-on rules (frozen by spike doc)", () => {
    expect(DEFAULT_RULES).toHaveLength(10);
  });

  it("ships exactly 2 opt-in rules (frozen by spike doc)", () => {
    expect(OPTIONAL_RULES).toHaveLength(2);
  });

  it("every default rule has a kebab-case name and global-flag pattern", () => {
    for (const rule of [...DEFAULT_RULES, ...OPTIONAL_RULES]) {
      expect(rule.name).toMatch(/^[a-z][a-z0-9-]{0,30}$/);
      expect(rule.pattern.flags).toContain("g");
      expect(rule.replacement).toMatch(/^<REDACTED:[a-z0-9-]+>$/);
    }
  });

  it("default rule names are unique and don't collide with optional names", () => {
    const allNames = [...DEFAULT_RULES, ...OPTIONAL_RULES].map((r) => r.name);
    expect(new Set(allNames).size).toBe(allNames.length);
  });

  it("default-OFF list is exactly { jwt, aws-secret-key } per spike doc", () => {
    expect(OPTIONAL_RULES.map((r) => r.name).sort()).toEqual([
      "aws-secret-key",
      "jwt",
    ]);
  });
});

describe("redact: golden inputs per default rule", () => {
  // Each test feeds a realistic-looking conversation snippet and asserts:
  //   1. The token is replaced with the canonical placeholder.
  //   2. Surrounding context is preserved.
  //   3. The hit count is exactly 1 (not 0, not 2 — false-positives matter).

  it("redacts an OpenAI project key", () => {
    const input = "the key is sk-proj-abcDEF123456789012345 thanks";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe("the key is <REDACTED:openai-key> thanks");
    expect(out.hits).toEqual([{ rule: "openai-key", count: 1 }]);
  });

  it("redacts a legacy OpenAI key without the proj- prefix", () => {
    const input = "OPENAI_API_KEY=sk-abcDEF123456789012345xyz";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toContain("<REDACTED:openai-key>");
    expect(out.hits.find((h) => h.rule === "openai-key")?.count).toBe(1);
  });

  it("redacts an Anthropic api03 key", () => {
    const input =
      "ANTHROPIC_API_KEY=sk-ant-api03-abcDEF1234567890_XYZ-stuff_extra-padding";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toContain("<REDACTED:anthropic-key>");
    expect(out.hits.find((h) => h.rule === "anthropic-key")?.count).toBe(1);
  });

  it("redacts an AWS access-key id", () => {
    const input = "user pasted AKIAIOSFODNN7EXAMPLE in chat";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe("user pasted <REDACTED:aws-access-key> in chat");
    expect(out.hits).toEqual([{ rule: "aws-access-key", count: 1 }]);
  });

  it("does NOT match a 17-character prefix-resembling string (boundary check)", () => {
    // AKIA + 15 chars = 19 chars total, which is short by 1.
    const input = "value AKIAIOSFODNN7EXAMP and";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe(input);
    expect(out.hits).toEqual([]);
  });

  it("redacts a GitHub PAT", () => {
    const input = "use ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 to push";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe("use <REDACTED:github-pat> to push");
    expect(out.hits).toEqual([{ rule: "github-pat", count: 1 }]);
  });

  it("redacts GitHub OAuth/server/refresh tokens (gho_ / ghs_ / ghr_)", () => {
    const input = [
      "OAuth: gho_abcdefghij1234567890ABCDEFGHIJ1234567890",
      "Server: ghs_abcdefghij1234567890ABCDEFGHIJ1234567890",
      "Refresh: ghr_abcdefghij1234567890ABCDEFGHIJ1234567890",
    ].join("\n");
    const out = redact(input, DEFAULT_RULES);
    expect(out.hits.find((h) => h.rule === "github-app-token")?.count).toBe(3);
    expect(out.redacted).not.toContain("gho_");
    expect(out.redacted).not.toContain("ghs_");
    expect(out.redacted).not.toContain("ghr_");
  });

  it("redacts a Slack bot token", () => {
    const input = "incoming xoxb-12345678901-abcde-token";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe("incoming <REDACTED:slack-bot-token>");
    expect(out.hits).toEqual([{ rule: "slack-bot-token", count: 1 }]);
  });

  it("redacts a GCP API key", () => {
    const input = "key=AIzaSyD-aBc123DEFghi456jklmNO_PqrsTUvwxYZ in url";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toContain("<REDACTED:gcp-api-key>");
    expect(out.hits.find((h) => h.rule === "gcp-api-key")?.count).toBe(1);
  });

  it("redacts Stripe secret/publishable/restricted keys (sk_/pk_/rk_, test/live)", () => {
    // Deliberately constructed test vectors — not real keys.
    // Split across concat so GitHub secret-scanning doesn't flag them as live secrets.
    const sk = "sk_li" + "ve_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const pk = "pk_te" + "st_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const rk = "rk_li" + "ve_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const input = [`secret: ${sk}`, `pub: ${pk}`, `restricted: ${rk}`].join("\n");
    const out = redact(input, DEFAULT_RULES);
    expect(out.hits.find((h) => h.rule === "stripe-key")?.count).toBe(3);
    expect(out.redacted).not.toContain("sk_live_");
    expect(out.redacted).not.toContain("pk_test_");
    expect(out.redacted).not.toContain("rk_live_");
  });

  it("redacts an email address", () => {
    const input = "ping alice@example.com about it";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe("ping <REDACTED:email> about it");
    expect(out.hits).toEqual([{ rule: "email", count: 1 }]);
  });

  it("redacts an internal hostname while preserving the leading separator", () => {
    const input = "GET https://api.foo.internal/v1/users";
    const out = redact(input, DEFAULT_RULES);
    // The capture group is JUST the host — the leading `/` from `https://`
    // (or any other anchor character the regex required) must survive.
    expect(out.redacted).toContain("<REDACTED:internal-hostname>");
    expect(out.redacted).toContain("https://");
    expect(out.redacted).toContain("/v1/users");
    expect(out.hits).toEqual([{ rule: "internal-hostname", count: 1 }]);
  });

  it("matches all five internal-domain TLDs (.internal/.corp/.local/.lan/.intra)", () => {
    const input =
      "hosts: api.foo.internal db.bar.corp svc.baz.local job.qux.lan ad.fred.intra";
    const out = redact(input, DEFAULT_RULES);
    expect(out.hits.find((h) => h.rule === "internal-hostname")?.count).toBe(5);
  });
});

describe("redact: false-positive guards", () => {
  it("does NOT redact prose that mentions tokens without actual tokens", () => {
    const input =
      "We discussed the OpenAI API but no key was pasted. The format is sk-... or sk-proj-...";
    const out = redact(input, DEFAULT_RULES);
    // "sk-..." has the literal three dots, not 20+ chars of [A-Za-z0-9_-].
    expect(out.redacted).toBe(input);
    expect(out.hits).toEqual([]);
  });

  it("does NOT redact short alphanumeric strings near letter prefixes", () => {
    const input = "test ghp_short and gho_alsoshort here";
    const out = redact(input, DEFAULT_RULES);
    // ghp_/gho_ rules require 36+ chars after the prefix.
    expect(out.redacted).toBe(input);
  });

  it("does NOT match a generic 40-char base64 string under default rules (aws-secret-key is opt-in)", () => {
    // 40 chars of base64 — would be matched ONLY if aws-secret-key opted in.
    const input = "hash = abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe(input);
    expect(out.hits).toEqual([]);
  });

  it("does NOT match a JWT-shaped string under default rules (jwt is opt-in)", () => {
    const input =
      "token = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe(input);
    expect(out.hits).toEqual([]);
  });

  it("does NOT match a public-DNS hostname (only *.internal/.corp/.local/.lan/.intra)", () => {
    const input = "GET https://api.example.com/v1/users from production";
    const out = redact(input, DEFAULT_RULES);
    expect(out.redacted).toBe(input);
  });
});

describe("redact: opt-in rules behave when explicitly enabled", () => {
  it("redacts a JWT only when 'jwt' is in enableOptional", () => {
    const cfg: RedactConfig = { enableOptional: ["jwt"] };
    const rules = buildRules(cfg);
    // Realistic JWT lengths: header (~36 chars), payload (~80 chars),
    // signature (~43 chars). The default rule requires 20+/10+/20+
    // chars per segment respectively.
    const input =
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c after";
    const out = redact(input, rules);
    expect(out.redacted).toContain("<REDACTED:jwt>");
    expect(out.hits.find((h) => h.rule === "jwt")?.count).toBe(1);
  });

  it("redacts a 40-char base64 only when 'aws-secret-key' is in enableOptional", () => {
    const cfg: RedactConfig = { enableOptional: ["aws-secret-key"] };
    const rules = buildRules(cfg);
    // The lookbehind in aws-secret-key excludes any [A-Za-z0-9/+=] char
    // immediately before the 40-char run. Use a SPACE separator so the
    // boundary is clean (a literal `=` would itself be in the
    // excluded class — that's intentional for KEY=VALUE shapes where
    // the value would more typically be quoted).
    const input = "aws_secret_access_key abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN done";
    const out = redact(input, rules);
    expect(out.redacted).toContain("<REDACTED:aws-secret-key>");
    expect(out.hits.find((h) => h.rule === "aws-secret-key")?.count).toBe(1);
  });

  it("ignores unknown rule names in enableOptional silently (no crash, no false positives)", () => {
    const cfg: RedactConfig = { enableOptional: ["does-not-exist"] };
    const rules = buildRules(cfg);
    expect(rules.length).toBe(DEFAULT_RULES.length);
  });
});

describe("redact: custom rules and config merging", () => {
  it("merges user rules AFTER defaults when extendDefaults is true (the default)", () => {
    const cfg: RedactConfig = {
      rules: [
        {
          name: "internal-jira",
          pattern: "JIRA-[0-9]{4,}",
        },
      ],
    };
    const rules = buildRules(cfg);
    expect(rules.length).toBe(DEFAULT_RULES.length + 1);
    expect(rules[rules.length - 1].name).toBe("internal-jira");
  });

  it("REPLACES defaults when extendDefaults is false", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [
        {
          name: "only-rule",
          pattern: "secret-[a-z]+",
        },
      ],
    };
    const rules = buildRules(cfg);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("only-rule");
  });

  it("still honours enableOptional even when extendDefaults is false (user explicitly named the opt-in)", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      enableOptional: ["jwt"],
      rules: [],
    };
    const rules = buildRules(cfg);
    expect(rules.map((r) => r.name)).toEqual(["jwt"]);
  });

  it("custom replacement string overrides the default <REDACTED:name> format", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [
        {
          name: "ticket",
          pattern: "JIRA-[0-9]{4,}",
          replacement: "<TICKET>",
        },
      ],
    };
    const rules = buildRules(cfg);
    const out = redact("see JIRA-1234 for details", rules);
    expect(out.redacted).toBe("see <TICKET> for details");
  });

  it("custom rule with capture group=1 only replaces the inner group", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [
        {
          name: "wrapped",
          // The outer parens preserve the surrounding `[`/`]` brackets.
          pattern: "\\[(secret-[a-z]+)\\]",
          group: 1,
        },
      ],
    };
    const rules = buildRules(cfg);
    const out = redact("look at [secret-foo] please", rules);
    expect(out.redacted).toBe("look at [<REDACTED:wrapped>] please");
  });
});

describe("redact: custom rule validation (invalid rules dropped, not thrown)", () => {
  // The spike doc requires we never crash extraction over a malformed rule —
  // emit a stderr warning and continue with a smaller rule set.

  it("drops a rule with a non-kebab-case name", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [
        // @ts-expect-error — intentionally malformed for the test
        { name: "Invalid_Name", pattern: "x" },
      ],
    };
    const rules = buildRules(cfg);
    expect(rules).toHaveLength(0);
  });

  it("drops a rule with an empty pattern", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [{ name: "empty", pattern: "" }],
    };
    const rules = buildRules(cfg);
    expect(rules).toHaveLength(0);
  });

  it("drops a rule with an invalid regex (unclosed bracket)", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [{ name: "bad-regex", pattern: "[unclosed" }],
    };
    const rules = buildRules(cfg);
    expect(rules).toHaveLength(0);
  });

  it("drops a rule whose pattern looks like catastrophic-backtracking", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [
        // The classic ReDoS triggers — none of these should slip through.
        { name: "redos-1", pattern: "(.+)+x" },
        { name: "redos-2", pattern: "(.*)*y" },
        { name: "redos-3", pattern: "([^x]*)*z" },
        { name: "redos-4", pattern: "(a+)+b" },
      ],
    };
    const rules = buildRules(cfg);
    expect(rules).toHaveLength(0);
  });

  it("drops a non-object rule entry without crashing the rest of the rule set", () => {
    const cfg: RedactConfig = {
      extendDefaults: false,
      rules: [
        // @ts-expect-error — intentionally malformed for the test
        null,
        { name: "good", pattern: "foo" },
      ],
    };
    const rules = buildRules(cfg);
    expect(rules).toHaveLength(1);
    expect(rules[0].name).toBe("good");
  });
});

describe("redact: ordering and idempotency", () => {
  it("returns byte-identical output on a second run with identical rules (same input → same output)", () => {
    const input =
      "key=sk-proj-abcDEF123456789012345 from alice@example.com on api.foo.internal";
    const out1 = redact(input, DEFAULT_RULES);
    const out2 = redact(out1.redacted, DEFAULT_RULES);
    // Second pass over already-redacted text produces no new hits and
    // doesn't mangle the placeholder.
    expect(out2.redacted).toBe(out1.redacted);
    expect(out2.hits).toEqual([]);
  });

  it("does NOT re-match its own placeholder (placeholders survive a second pass)", () => {
    const out = redact(
      "<REDACTED:openai-key> already redacted, plus sk-proj-abcDEF123456789012345 fresh",
      DEFAULT_RULES
    );
    // The pre-existing placeholder is preserved verbatim; only the new
    // token gets replaced.
    expect(
      (out.redacted.match(/<REDACTED:openai-key>/g) || []).length
    ).toBe(2);
  });

  // v2.5-05 audit-fix D: extend the placeholder-survives check to
  // ALL default rule placeholders. Previously we only verified
  // `<REDACTED:openai-key>` — a regression that made any default rule
  // start matching its own placeholder text would have slipped past us.
  // Build a payload of every default placeholder concatenated with
  // separators that don't accidentally satisfy any rule's leading
  // boundary, then run a second pass and assert byte-identity.
  it("no default rule re-matches any default placeholder (full coverage)", () => {
    const placeholders = DEFAULT_RULES.map((r) => r.replacement);
    // Use newline + plain-prose separators (avoiding `@`, `.internal`,
    // alphanumerics adjacent to boundary patterns) so the input itself
    // doesn't trigger any rule.
    const payload = placeholders.join("\nseparator line: ") + "\n";
    const out = redact(payload, DEFAULT_RULES);
    expect(out.hits).toEqual([]);
    expect(out.totalChars).toBe(0);
    expect(out.redacted).toBe(payload);
  });

  it("aggregates multi-rule hits in rule order", () => {
    const input =
      "key=sk-proj-abcDEF123456789012345 emailing alice@example.com twice: alice@example.com";
    const out = redact(input, DEFAULT_RULES);
    expect(out.hits).toEqual([
      { rule: "openai-key", count: 1 },
      { rule: "email", count: 2 },
    ]);
  });

  it("counts character totals across all rules (matches sum of replaced chars)", () => {
    const input = "alice@example.com and bob@example.com";
    const out = redact(input, DEFAULT_RULES);
    expect(out.totalChars).toBe(
      "alice@example.com".length + "bob@example.com".length
    );
  });

  it("returns an empty result for empty input (fast path)", () => {
    const out = redact("", DEFAULT_RULES);
    expect(out.redacted).toBe("");
    expect(out.hits).toEqual([]);
    expect(out.totalChars).toBe(0);
  });

  it("returns input unchanged when no rules are passed", () => {
    const input = "any sk-proj-xxx alice@example.com would normally match";
    const out = redact(input, []);
    expect(out.redacted).toBe(input);
    expect(out.hits).toEqual([]);
  });

  // v2.5-05 audit-fix C: pin the result shape for the "redaction ran but
  // matched nothing" case. Callers (extract.ts, summary.ts JSON output)
  // distinguish "we ran" from "we didn't run" by external state — the
  // redact() function ITSELF must return a consistent, stable shape so
  // downstream code can map it to JSON without surprises. Without this
  // test, any future change that returns `null`/`undefined` for "no
  // hits" would silently break the `--json` shape contract.
  it("returns a consistent empty-hits shape when nothing matches (zero-hit invariant)", () => {
    const cleanInput = "this conversation contains no secrets at all.";
    const out = redact(cleanInput, DEFAULT_RULES);
    // Shape contract: redacted is the input verbatim, hits is an empty
    // ARRAY (not undefined / null), totalChars is exactly 0 (not null).
    expect(out.redacted).toBe(cleanInput);
    expect(Array.isArray(out.hits)).toBe(true);
    expect(out.hits).toHaveLength(0);
    expect(out.totalChars).toBe(0);
    // formatAuditTrail on empty hits returns "" — confirms the
    // human-output side concatenates safely without a guard.
    expect(formatAuditTrail(out.hits)).toBe("");
  });
});

describe("redact: shouldRedact — CLI/config precedence", () => {
  // The spike doc locks the precedence order:
  //   1. --no-redact wins absolutely
  //   2. --redact wins over config
  //   3. config.enabled is the default fallback

  it("--no-redact disables even when --redact is also set (paranoid wins)", () => {
    expect(shouldRedact(true, true, { enabled: true })).toBe(false);
  });

  it("--no-redact disables even when config has enabled=true", () => {
    expect(shouldRedact(undefined, true, { enabled: true })).toBe(false);
  });

  it("--redact enables even when config is undefined", () => {
    expect(shouldRedact(true, undefined, undefined)).toBe(true);
  });

  it("--redact enables even when config.enabled is false", () => {
    expect(shouldRedact(true, undefined, { enabled: false })).toBe(true);
  });

  it("falls back to config.enabled when neither flag is set", () => {
    expect(shouldRedact(undefined, undefined, { enabled: true })).toBe(true);
    expect(shouldRedact(undefined, undefined, { enabled: false })).toBe(false);
  });

  it("defaults to OFF when both CLI and config are absent (v2.5-05 default)", () => {
    expect(shouldRedact(undefined, undefined, undefined)).toBe(false);
  });
});

describe("redact: formatAuditTrail (human output formatting)", () => {
  it("returns empty string for zero hits (caller can concatenate unconditionally)", () => {
    expect(formatAuditTrail([])).toBe("");
  });

  it("formats a single hit", () => {
    expect(formatAuditTrail([{ rule: "openai-key", count: 2 }])).toBe(
      "[redacted: 2 openai-key]"
    );
  });

  it("formats multiple hits in given order (count + rule, comma-separated)", () => {
    expect(
      formatAuditTrail([
        { rule: "openai-key", count: 2 },
        { rule: "email", count: 1 },
      ])
    ).toBe("[redacted: 2 openai-key, 1 email]");
  });
});
