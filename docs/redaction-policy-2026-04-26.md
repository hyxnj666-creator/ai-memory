# Redaction Policy — `--redact` (v2.5-05)

> **Status:** spike-locked 2026-04-26, before any code in
> `src/extractor/redact.ts`. Same discipline as the v2.5-04 Skills schema
> snapshot — write the policy first, surface the dishonest defaults
> *before* they get baked into pattern matchers.
>
> When the policy changes (new pattern added, threat model widens,
> default flipped), append-only: add `redaction-policy-<new-date>.md`
> rather than overwriting this one.

---

## What problem are we solving?

`ai-memory extract` and `ai-memory summary` send conversation text to a
configured LLM provider (OpenAI by default). "Local-first" applies to
**storage** — the resulting `.ai-memory/` is plain Markdown on the
user's disk, never uploaded by us — but the **extraction call** is
necessarily an outbound HTTPS request carrying real conversation
excerpts. For users whose chat history contains:

- API keys (their own, or sample tokens pasted from documentation),
- internal hostnames (`*.internal`, `*.corp`),
- email addresses (their own, customers',
  colleagues'),
- JWT tokens (debug-pasted into chat),

…the extraction call is a privacy and compliance surface. Today nothing
scrubs that text before it leaves the machine. `--redact` is the
opt-in scrubber.

## Threat model — what we DO and DON'T defend against

### In scope (these are what `--redact` exists for)

1. **Accidentally pasted API keys** in chat. The most common pattern
   is `sk-proj-...` or `ghp_...` followed by 40+ base64 chars. User
   didn't intend to send their key to OpenAI's extraction endpoint
   alongside the rest of the conversation; we should redact before send.
2. **Internal hostnames in stack traces / config blobs.** `https://api.foo.internal/...` reveals corporate
   topology. Defense-in-depth — if the LLM provider's logs are ever
   compromised the leakage radius shouldn't include "yes, foo.com has
   an internal `api.foo.internal` host".
3. **Email addresses in pasted commit messages / log lines.** GDPR /
   CCPA exposure on third-party customer / colleague PII.
4. **JWT tokens** debug-pasted from cookies / headers. Tokens often
   include user IDs, role claims, or internal service identities. Even
   expired tokens reveal payload structure. Opt-in (high false-positive
   risk on long base64 strings).

### Out of scope (do NOT use `--redact` as your primary defense for)

1. **A user who deliberately wants to send a secret to the LLM.** If
   the conversation says `"please debug this OAuth flow, the client
   secret is sk_..."`, the user wants the LLM to see it. We can't
   distinguish intentional from accidental — by default we'll redact
   both. If the user needs the LLM to see secrets, they should turn
   `--redact` off (`--no-redact`, the default for v2.5+) or selectively
   exempt patterns via config.
2. **Anything inside an attachment / image.** Cursor / Claude / Windsurf
   chat history can include base64 image attachments and file-tree
   blobs. We don't OCR images; redaction works on text only.
3. **Field-level structured leak prevention.** This is a regex
   blacklist, not a structured PII / secrets vault inspector. SOC2 /
   ISO 27001 don't accept regex redaction as a sole control. The
   README + this doc must say "defense in depth, not your primary
   secrets-management story" in the same prominent block.
4. **Adversarial obfuscation.** `s k - p r o j _ ...` won't match. A
   user actively trying to bypass redaction (which makes no sense for
   their own secrets, but matters for shared-machine threat models)
   can. We don't try to defeat that.
5. **Re-extraction of memories that were extracted *before* `--redact`
   was enabled.** Pre-existing `.ai-memory/*.md` files were generated
   on round-trips that didn't redact; they may contain secrets. The
   `--redact` flag protects future extractions, not past ones. (Future
   `ai-memory scrub` command — out of v2.5-05 scope — could do a
   pass-and-rewrite over existing memories. Logged in
   "Deferred to later versions" below.)

## Default opt-in vs opt-out: **opt-in for v2.5-05**

We considered making `--redact` the default. Decided against it for v2.5-05:

| Choice | Pros | Cons |
|---|---|---|
| **Default ON** (have to pass `--no-redact`) | Safer baseline; new users protected without reading the doc. | Silently changes extraction quality on existing users — a real `sk_test_...` placeholder in a tutorial paste suddenly becomes `<REDACTED:openai-key>`, the LLM extracts a different convention from it, and the user gets a different memory than v2.4 produced for the same input. Treating that as a breaking change in a minor (v2.5) is the wrong call. |
| **Default OFF** (have to pass `--redact`) | No behaviour change for existing users; redaction is a deliberate user choice with audit-trail surfaced. Backwards-compatible. | Users who don't read the docs aren't protected. |

The v2.5-04 lesson applies: `--target both` semantics deliberately
unchanged from v2.4. Same logic here — additive flag, opt-in. We can
flip the default in v3.0 with a deprecation warning in v2.5+ runs that
detect likely-redactable content but `--redact` was off.

> **Deprecation hook (deferred to v2.5-09 / v2.6):** when `--redact` is
> off and the conversation text matches any default rule, emit a single
> stderr warning *after* the LLM call: `[!] redaction-off: 3 likely
> secrets sent to LLM (run \`ai-memory extract --redact\` next time)`.
> This lets us flip the default in a major version without surprise.
> Out of v2.5-05 scope — too easy to ship a noisy/false-positive warning
> without first calibrating the patterns against real corpora.

## Default rules (locked for v2.5-05)

Order matters — earlier rules run first. Each rule is a `RegExp` that
matches the entire token; the captured match is replaced with a
`<REDACTED:<rule-name>>` placeholder. The placeholder name lets the
LLM still understand "there was *something* of this kind here" without
seeing the value.

| Rule name | Pattern (RegExp) | Example match | Notes |
|---|---|---|---|
| `openai-key` | `sk-(?:proj-)?[A-Za-z0-9_-]{20,}` | `sk-proj-abc123...` | Covers both legacy `sk-` and project-scoped `sk-proj-`. The `_-` char class catches the URL-safe base64 the new format uses. |
| `anthropic-key` | `sk-ant-(?:api03-)?[A-Za-z0-9_-]{20,}` | `sk-ant-api03-...` | Anthropic claims `api03-` is the current prefix; we match optionally to survive future versions. |
| `aws-access-key` | `AKIA[0-9A-Z]{16}` | `AKIAIOSFODNN7EXAMPLE` | AWS IAM access key ID format is well-defined; very low false-positive rate. |
| `aws-secret-key` | `(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])` | 40-char base64 standalone | High false-positive risk — many UUID-shaped strings could match. **Default OFF, must opt-in via config.** Marked here for completeness. |
| `github-pat` | `ghp_[A-Za-z0-9]{36,}` | `ghp_abcdef...` | GitHub fine-grained personal access tokens. |
| `github-app-token` | `(?:gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}` | `gho_...` | OAuth / user / server / refresh tokens. |
| `slack-bot-token` | `xox[baprs]-[A-Za-z0-9-]{10,}` | `xoxb-...` | Slack bot / app / refresh / user tokens. |
| `gcp-api-key` | `AIza[0-9A-Za-z_-]{35}` | `AIzaSy...` | Google Cloud API keys. |
| `stripe-key` | `(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{20,}` | `sk_live_...` / `pk_test_...` | Stripe secret / publishable / restricted keys. |
| `email` | `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` | `alice@example.com` | RFC5322-ish; we accept loose matches. |
| `internal-hostname` | `(?:^|[^A-Za-z0-9])([A-Za-z0-9-]+\.(?:internal\|corp\|local\|lan\|intra)\b)` | `api.foo.internal` | Capture group keeps the host visible for testing; the replacer redacts only the captured part. |
| `jwt` (opt-in) | `eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}` | `eyJ...` 3-dotted parts | High recall on debug-pasted tokens; high false-positive on long base64 in prose. **Default OFF**, opt-in via config. |

The two **default-OFF** rules (`aws-secret-key`, `jwt`) are listed
here so users know what they CAN turn on, not what runs without
asking. The default ON set is **10 rules** — high signal, low
false-positive in our v2.4 memory corpus eyeball check.

> **Implementation order note** (locked 2026-04-26 during impl): the
> rule list above is the **logical** ordering for documentation; the
> **execution** order in `DEFAULT_RULES` flips `anthropic-key` to run
> *before* `openai-key`. Both keys start with `sk-`, and the `openai-key`
> regex `sk-(?:proj-)?[A-Za-z0-9_-]{20,}` would greedily consume an
> `sk-ant-api03-...` token before the `anthropic-key` rule could see it
> (because `-` is in the char class). Putting anthropic first preserves
> the more-specific match. This is a pure ordering detail; the rule
> SET (which 10 rules ship default-on) is unchanged.

## Custom rules — config schema

Users can extend / override the defaults via `.ai-memory/.config.json`:

```json
{
  "redact": {
    "enabled": false,
    "rules": [
      { "name": "internal-jira", "pattern": "JIRA-[0-9]{4,}", "replacement": "<REDACTED:jira>" }
    ],
    "extendDefaults": true,
    "enableOptional": ["jwt"]
  }
}
```

Field semantics:

| Field | Type | Default | What it does |
|---|---|---|---|
| `enabled` | boolean | `false` | Master switch. CLI `--redact` and `--no-redact` override. |
| `rules` | `RedactRule[]` | `[]` | User-defined patterns. |
| `extendDefaults` | boolean | `true` | If `false`, user `rules` *replace* the default 9 rather than augment them. |
| `enableOptional` | `string[]` | `[]` | Names of opt-in default rules to turn on (`jwt`, `aws-secret-key`). |

Custom rule shape:

```typescript
interface RedactRule {
  name: string;          // becomes part of the <REDACTED:name> placeholder
  pattern: string;       // RegExp source (NOT a string match — fed to `new RegExp(pattern, "g")`)
  replacement?: string;  // defaults to `<REDACTED:${name}>`
  /** If true, only match the first capture group rather than the full match. */
  group?: 1 | undefined;
}
```

Validation rules (enforced at config load):

- `name` must match `/^[a-z][a-z0-9-]{0,30}$/` — kebab-case, no path traversal in placeholder text.
- `pattern` must compile as a RegExp; if it doesn't, drop the rule with a stderr warning rather than crashing extraction.
- `pattern` is rejected if it has an empty regex (`""`) — catches "I tried to disable a default by setting an empty rule" mistakes.
- Catastrophic-backtracking guard: reject patterns containing `(.+)+`, `(.*)+`, `([^x]*)*` shapes (well-known ReDoS triggers). Best-effort heuristic — a determined attacker on the user's own machine isn't the threat model.

## Where redaction applies

| Command | Calls LLM? | Redaction applies? |
|---|---|---|
| `extract` | Yes (per-chunk `callLLM`) | **Yes** — primary use case |
| `summary` | Yes | **Yes** — same boundary, same risk |
| `context --summarize` | Yes | **Yes** — same risk |
| `try` | No (uses bundled scenario) | **No** — bundled demo content has no real secrets |
| `recall` / `search` / `list` / `resolve` | No (local FS / git) | **No** — no LLM call, no privacy boundary |
| `rules` (any target) | No (deterministic renderer) | **No** — operates on already-extracted memories that are by definition local-only Markdown |

The redaction surface is **the LLM call site**, not the memory store.
Once a memory is in `.ai-memory/`, it's already on the user's disk and
in their git history — redacting it in `recall` would be theatre.

## Audit trail — surfacing what got redacted

After every LLM-bound conversation, we emit a per-rule count:

**Human output (extract default):**
```
[+] Extracted 5 memories from "OAuth migration" (1234 turns, 8.2 KB)
    [redacted: 2 openai-key, 1 internal-hostname]
```

**`--json` output:**
```json
{
  "extracted": 5,
  "redactions": [
    { "rule": "openai-key", "count": 2 },
    { "rule": "internal-hostname", "count": 1 }
  ]
}
```

**`--verbose` output (extract):** prints the rule-name + character-range
of each redaction so the user can grep their own conversation file to
verify nothing important got nuked. Does **not** print the matched
text — that would defeat the purpose.

The audit trail is **always on** when `--redact` is on. There's no
way to silently redact — if the user is paying the false-positive
cost they get to see what they paid for.

## Idempotency interaction

Redaction is applied to the conversation text, not the extracted
memories. Two implications:

1. **Same conversation + same rules = same prompt = same memories** (modulo LLM nondeterminism — `temperature: 0` recommended but not enforced). Re-running `extract --redact` on a conversation that already produced memories: the incremental dedup logic in `ai-extractor.ts` catches the overlap and skips. We don't re-redact memories that are already on disk.
2. **A user enabling `--redact` after the fact does NOT scrub existing memories.** Existing `.ai-memory/*.md` from pre-redact runs will retain whatever secrets they captured. This is the "Deferred to later versions" `ai-memory scrub` use case.

Worth a one-line README warning: "If you've been extracting without
`--redact` and just turned it on, audit your `.ai-memory/` directory
for any existing leaked tokens — `--redact` only scrubs new
extractions." We'll add that line when shipping.

## Failure modes — what can go wrong

1. **Catastrophic backtracking on user-supplied patterns.** Mitigated by the heuristic check above + a per-conversation 5-second hard timeout on the redaction pass. If timeout hits, we abort the LLM call (don't risk sending un-redacted text) with a clear stderr error.
2. **Placeholder collision with conversation content.** A user types `<REDACTED:openai-key>` literally in a chat about this very feature — the redacted output and the original become indistinguishable. Acceptable; collision is rare and the worst case is "the LLM thinks there's a redacted token where there wasn't one".
3. **Multibyte boundary issues.** Our patterns are all ASCII; if a multibyte character sits adjacent to a match the JS regex engine handles it correctly. No special handling needed.
4. **Rule that matches everything.** A custom rule like `pattern: ".+"` would redact the entire conversation. We don't reject this — it's a foot-gun the user opted into. Audit trail would show `[redacted: 1 user-rule]` covering the whole text. The empty-pattern check catches `""` but not greedy patterns.
5. **Performance.** For an 8 KB conversation × 10 default rules, expect <5 ms overhead per conversation on commodity hardware. Negligible vs the 1-3 s LLM round-trip.

## Open questions deferred to later versions

1. **`ai-memory scrub`** — pass-and-rewrite over existing `.ai-memory/*.md` to retroactively redact already-extracted memories. Probably v2.6.
2. **Pattern calibration via user corpus.** Before flipping `--redact` to default-ON in v3.0, we want a study: collect (with explicit opt-in) anonymised redaction-hit counts from beta users to confirm the false-positive rate is low enough. Not v2.5-05 work.
3. **Allowlist support** (the inverse of redaction). "Don't redact patterns matching `^localhost`" — useful for users debugging local services where `localhost.internal` is a real local DNS name. Defer; can be done with custom rules `extendDefaults: false` today.
4. **Encrypted-at-rest config option.** Some users ship `.ai-memory/.config.json` with redaction rules that themselves contain enterprise-specific patterns ("redact our internal product codename `Project Foo`"). The config file lives in plain JSON. Defer to v3.0 — outside threat model for v2.5.

## Re-spike triggers

Update or supersede this doc when any of these happen:

1. New default rule added (the table is exhaustive).
2. `enabled` default flips ON.
3. New command starts calling the LLM (would need to be added to the "Where redaction applies" table).
4. LLM provider changes our outbound contract (e.g. moves to a different provider where the threat-model surface differs).
5. We learn of a real-world bypass (e.g. a published CVE on a similar redactor).

## Implementation contract — what `src/extractor/redact.ts` must export

The doc IS the spec; the impl will export:

```typescript
// All pure functions — no IO, no global state.
export interface RedactRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface RedactionResult {
  /** Original text after applying all rules (no metadata reveals the matches). */
  redacted: string;
  /** Per-rule hit counts, in rule order. */
  hits: { rule: string; count: number }[];
  /** Total bytes / chars redacted (bytes != chars for multibyte but we use chars consistently). */
  totalChars: number;
}

export const DEFAULT_RULES: RedactRule[]; // The 10 default-on rules
export const OPTIONAL_RULES: RedactRule[]; // The 2 opt-in rules (jwt, aws-secret-key)

export function buildRules(config: RedactConfig | undefined): RedactRule[];
export function redact(text: string, rules: RedactRule[]): RedactionResult;
```

`runRedaction` (in `ai-extractor.ts`) wraps:
1. `formatConversation(conversation)` → `text`
2. `redact(text, buildRules(config.redact))` → `{ redacted, hits, totalChars }` if redaction enabled, else passthrough
3. `splitIntoChunks(redacted)` → chunks
4. `callLLM(...)` per chunk
5. Aggregate `hits` into the per-conversation log line.

Tests live in `src/__tests__/redact.test.ts`. Each default rule gets a
golden-input → expected-output test, plus per-rule false-positive
guards (e.g. a Python triple-quoted string near a `sk-` literal
shouldn't match if the token doesn't actually have 20+ chars).

---

*Last updated: 2026-04-26 (initial spike-lock for v2.5-05 — written before any code in `src/extractor/redact.ts` lands).*
