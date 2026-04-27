/**
 * Redaction layer for outbound LLM calls (extract / summary /
 * context --summarize). v2.5-05.
 *
 * The full threat model + rule rationale lives in
 * `docs/redaction-policy-2026-04-26.md`. This module is the executable
 * spec — anything that disagrees with the doc is a bug in one or the
 * other; the doc is the source of truth.
 *
 * Key invariants:
 *   - All exported functions are pure (no IO, no global state).
 *   - Default rules are kept ASCII-only; multibyte input is handled
 *     correctly by JS regex engines without special casing.
 *   - The redacted output is deterministic — same input + same rules
 *     produce byte-identical output. This is what lets the dedup
 *     logic in `ai-extractor.ts` skip already-extracted memories.
 *   - We never log the matched text. Audit trail surfaces RULE NAME
 *     and CHAR RANGE only — printing the matched value would defeat
 *     the entire purpose.
 */

import type { RedactConfig, RedactRuleSpec } from "../types.js";

// ---------- Types ----------

export interface RedactRule {
  name: string;
  pattern: RegExp;
  replacement: string;
  /**
   * If 1, only capture group 1 of `pattern` is replaced. Used by
   * patterns that anchor on a non-token boundary character which
   * itself shouldn't be redacted (e.g. internal-hostname).
   */
  group?: 1;
}

export interface RedactionHit {
  rule: string;
  count: number;
}

export interface RedactionResult {
  /** Text after applying all rules. No metadata about matches is leaked here. */
  redacted: string;
  /** Per-rule hit counts in rule order. Rules with zero hits are omitted. */
  hits: RedactionHit[];
  /** Total characters redacted (across all rules). */
  totalChars: number;
}

// ---------- Default rule catalogue ----------

/**
 * The 10 default-ON rules. See the spike doc for FP/FN analysis per rule.
 *
 * Order matters: more-specific prefixes come first so a generic rule
 * doesn't consume their match. Specifically `anthropic-key` MUST run
 * before `openai-key` because the openai pattern `sk-...` would
 * otherwise greedily consume the `sk-ant-api03-...` shape (the `-`
 * character is inside the openai char class).
 */
export const DEFAULT_RULES: RedactRule[] = [
  {
    name: "anthropic-key",
    pattern: /sk-ant-(?:api03-)?[A-Za-z0-9_-]{20,}/g,
    replacement: "<REDACTED:anthropic-key>",
  },
  {
    name: "openai-key",
    pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
    replacement: "<REDACTED:openai-key>",
  },
  {
    name: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "<REDACTED:aws-access-key>",
  },
  {
    name: "github-pat",
    pattern: /ghp_[A-Za-z0-9]{36,}/g,
    replacement: "<REDACTED:github-pat>",
  },
  {
    name: "github-app-token",
    pattern: /(?:gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/g,
    replacement: "<REDACTED:github-app-token>",
  },
  {
    name: "slack-bot-token",
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    replacement: "<REDACTED:slack-bot-token>",
  },
  {
    name: "gcp-api-key",
    pattern: /\bAIza[0-9A-Za-z_-]{35,}\b/g,
    replacement: "<REDACTED:gcp-api-key>",
  },
  {
    name: "stripe-key",
    pattern: /(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{20,}/g,
    replacement: "<REDACTED:stripe-key>",
  },
  {
    name: "email",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: "<REDACTED:email>",
  },
  {
    name: "internal-hostname",
    // The capture group keeps the leading whitespace/punctuation visible
    // so we can split mid-sentence cleanly without the redactor swallowing
    // a separator character.
    pattern: /(?:^|[^A-Za-z0-9])([A-Za-z0-9][A-Za-z0-9-]*\.(?:internal|corp|local|lan|intra)\b)/g,
    replacement: "<REDACTED:internal-hostname>",
    group: 1,
  },
];

/**
 * Opt-in rules. These have high false-positive rates against
 * conversational prose so they're off unless the user adds them via
 * `redact.enableOptional`.
 */
export const OPTIONAL_RULES: RedactRule[] = [
  {
    name: "jwt",
    pattern: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g,
    replacement: "<REDACTED:jwt>",
  },
  {
    name: "aws-secret-key",
    pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    replacement: "<REDACTED:aws-secret-key>",
  },
];

// ---------- Validation helpers ----------

/** Kebab-case name validator, also used to gate placeholder text. */
const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;

/**
 * Heuristic ReDoS sniff. Rejects patterns matching well-known
 * catastrophic-backtracking shapes. Best-effort — a malicious user on
 * their own machine isn't the threat model, but we still want to
 * prevent accidentally pasting a quadratic regex from StackOverflow.
 */
const REDOS_SHAPES = [
  /\(\.[+*]\)[+*]/,   // (.+)+, (.*)+, (.+)*, (.*)*
  /\(\[\^[^\]]*\][+*]\)[+*]/, // ([^x]+)+, ([^x]*)*
  /\([^()]{1,20}[+*]\)[+*]/, // (a+)+, (\w*)+, etc.
];

function looksLikeReDoS(source: string): boolean {
  return REDOS_SHAPES.some((s) => s.test(source));
}

/**
 * Compile a user-supplied rule spec into a runtime rule. Returns null
 * (with a stderr warning) when the rule is unsafe or malformed —
 * extraction continues with a smaller rule set rather than crashing.
 */
function compileUserRule(spec: RedactRuleSpec): RedactRule | null {
  if (!spec || typeof spec !== "object") {
    process.stderr.write(`[warn] redact: ignoring non-object rule\n`);
    return null;
  }
  if (typeof spec.name !== "string" || !NAME_RE.test(spec.name)) {
    process.stderr.write(
      `[warn] redact: rule name must match ${NAME_RE} (got: ${JSON.stringify(spec.name)})\n`
    );
    return null;
  }
  if (typeof spec.pattern !== "string" || spec.pattern.length === 0) {
    process.stderr.write(
      `[warn] redact: rule "${spec.name}" has empty/non-string pattern, skipping\n`
    );
    return null;
  }
  if (looksLikeReDoS(spec.pattern)) {
    process.stderr.write(
      `[warn] redact: rule "${spec.name}" rejected — pattern has a catastrophic-backtracking shape (e.g. \`(.+)+\`)\n`
    );
    return null;
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(spec.pattern, "g");
  } catch (err) {
    process.stderr.write(
      `[warn] redact: rule "${spec.name}" has invalid regex: ${
        (err as Error).message
      }\n`
    );
    return null;
  }
  if (spec.group !== undefined && spec.group !== 1) {
    process.stderr.write(
      `[warn] redact: rule "${spec.name}" group must be 1 or undefined, got ${spec.group}\n`
    );
    return null;
  }
  return {
    name: spec.name,
    pattern,
    replacement: spec.replacement ?? `<REDACTED:${spec.name}>`,
    group: spec.group,
  };
}

// ---------- Rule assembly ----------

/**
 * Build the final rule list from a config block. Order:
 *   1. Defaults (if extendDefaults != false)
 *   2. Opt-in defaults named in `enableOptional`
 *   3. User rules (always last so they can override / add to defaults)
 */
export function buildRules(config: RedactConfig | undefined): RedactRule[] {
  const extend = config?.extendDefaults !== false;
  const out: RedactRule[] = [];

  if (extend) {
    out.push(...DEFAULT_RULES);

    const optionalNames = new Set(config?.enableOptional ?? []);
    for (const rule of OPTIONAL_RULES) {
      if (optionalNames.has(rule.name)) out.push(rule);
    }
  }

  // Catch the "user named an opt-in rule but extendDefaults is false"
  // case — the user clearly wants the optional rule, so honour it
  // even though we skipped the default extension above.
  if (!extend && config?.enableOptional && config.enableOptional.length > 0) {
    const optionalNames = new Set(config.enableOptional);
    for (const rule of OPTIONAL_RULES) {
      if (optionalNames.has(rule.name)) out.push(rule);
    }
  }

  for (const spec of config?.rules ?? []) {
    const compiled = compileUserRule(spec);
    if (compiled) out.push(compiled);
  }

  return out;
}

// ---------- Apply ----------

/**
 * Apply all rules in order to `text`. Each rule sees the OUTPUT of
 * the previous rules — this is intentional: redactions don't fight
 * each other (a generic `email` rule won't re-match the placeholder
 * left by `openai-key`).
 */
export function redact(text: string, rules: RedactRule[]): RedactionResult {
  if (rules.length === 0 || text.length === 0) {
    return { redacted: text, hits: [], totalChars: 0 };
  }

  let current = text;
  const hits: RedactionHit[] = [];
  let totalChars = 0;

  for (const rule of rules) {
    let count = 0;
    let charsRedactedByRule = 0;

    // Reset lastIndex defensively — RegExp objects with the `g` flag
    // are stateful, and a rule passed in from elsewhere might have a
    // stale pointer.
    rule.pattern.lastIndex = 0;

    current = current.replace(rule.pattern, (match, ...groups) => {
      // groups: [g1, g2, ..., offset, fullString]
      // We want g1 if rule.group === 1, otherwise the full match.
      if (rule.group === 1) {
        const g1 = groups[0];
        if (typeof g1 !== "string") return match; // No g1 captured — pass through.
        // Replace only g1 inside the full match, preserving any
        // boundary characters the regex anchored on.
        const idxInMatch = match.indexOf(g1);
        if (idxInMatch < 0) return match;
        count += 1;
        charsRedactedByRule += g1.length;
        return (
          match.slice(0, idxInMatch) +
          rule.replacement +
          match.slice(idxInMatch + g1.length)
        );
      }
      count += 1;
      charsRedactedByRule += match.length;
      return rule.replacement;
    });

    if (count > 0) {
      hits.push({ rule: rule.name, count });
      totalChars += charsRedactedByRule;
    }
  }

  return { redacted: current, hits, totalChars };
}

// ---------- Convenience for the rest of the codebase ----------

/**
 * Decide whether redaction is on, given CLI flags + config. CLI wins
 * over config: `--no-redact` always disables, `--redact` always
 * enables. When neither is set, fall back to `config.redact.enabled`.
 */
export function shouldRedact(
  cliRedact: boolean | undefined,
  cliNoRedact: boolean | undefined,
  config: RedactConfig | undefined
): boolean {
  if (cliNoRedact === true) return false;
  if (cliRedact === true) return true;
  return config?.enabled === true;
}

/**
 * Format the audit-trail bracket for human stdout.
 *
 *   formatAuditTrail([{ rule: "openai-key", count: 2 }, { rule: "email", count: 1 }])
 *   // => "[redacted: 2 openai-key, 1 email]"
 *
 * Returns an empty string when there were zero hits — caller can
 * concatenate unconditionally.
 */
export function formatAuditTrail(hits: RedactionHit[]): string {
  if (hits.length === 0) return "";
  const parts = hits.map((h) => `${h.count} ${h.rule}`);
  return `[redacted: ${parts.join(", ")}]`;
}
