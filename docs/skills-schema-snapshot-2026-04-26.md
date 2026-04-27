# Anthropic Skills schema snapshot — 2026-04-26

> Spike artefact preceding `v2.5-04 — rules --target skills`
> ([strategy ADR](decisions/2026-04-26-post-v2.4-strategy.md) §v2.5-04).
> Pins the Skills spec we're targeting so future maintainers know which
> version of a still-evolving format we wrote against. Date-stamp this
> doc (don't overwrite) when the spec changes.

## Sources consulted (2026-04-26)

| Source | URL | Status |
|---|---|---|
| Official Claude Code docs — "Extend Claude with skills" | <https://docs.anthropic.com/en/docs/claude-code/skills> | Authoritative |
| Official API docs — "Agent Skills overview" | <https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview> | Authoritative |
| Anthropic Mintlify — "YAML Frontmatter" | <https://www.mintlify.com/anthropics/skills/creating-skills/frontmatter> | Secondary; describes a **superset** of the canonical schema (likely earlier draft). Discrepancies resolved in favour of `docs.anthropic.com`. |
| `claudecodeguides.com` / `dotclaude.com` | (community) | Cross-checked, useful but conflicted on description length (claimed "≤ 200 chars" — wrong). |

**Resolved discrepancy:** The "≤ 200 chars" description cap from community sources is **incorrect**. The official doc states the truncation point is **1,536 chars combined `description + when_to_use`** in the listing Claude indexes. Our writer targets ≤ 300 chars per skill description to stay well clear with margin for `when_to_use` overflow.

## Authoritative schema (frozen for v2.5-04)

Each skill is a **directory** under one of three discovery roots; a `SKILL.md` file is the required entrypoint.

### Discovery roots

| Scope | Path | We write to |
|---|---|---|
| Personal (cross-project) | `~/.claude/skills/` | No |
| **Project** | `.claude/skills/` | **Yes** |
| Plugin-bundled | (plugin's own `skills/`) | No |

Project-scoped skills take highest priority over personal/plugin skills. Our output lands in `.claude/skills/<skill-name>/SKILL.md`.

### Per-skill directory layout (we use the minimal form)

```
.claude/skills/ai-memory-coding-conventions/
└── SKILL.md       # required entrypoint — frontmatter + body
                   # (templates/, examples/, scripts/, references/ are optional;
                   # ai-memory does not generate any of them)
```

### `SKILL.md` frontmatter — fields we use

```yaml
---
name: ai-memory-coding-conventions
description: <≤ 300 chars: what + when, front-loaded with key topic words for triggering>
when_to_use: <optional, appended to description in the listing — used when description alone is ambiguous>
---
```

### `SKILL.md` frontmatter — full reference (per Anthropic docs 2026-04-26)

| Field | Required | We set | Rationale |
|---|---|---|---|
| `name` | No (defaults to dir name) | **Yes** — `ai-memory-<type-slug>` | Explicit ownership prefix avoids collisions with user-authored skills at `.claude/skills/<type-slug>/`. |
| `description` | Recommended | **Yes** | Primary trigger signal. We front-load with comma-separated first-N memory titles so Claude's auto-trigger has good keyword coverage. |
| `when_to_use` | No | Sometimes | Only when description alone doesn't explain the activation context (currently set for `decision-log` to disambiguate from `coding-conventions`). |
| `arguments` | No | No | We don't expose user-arg substitution in v0; our skills are passive context, not interactive commands. |
| `allowed-tools` | No | No | We don't grant tool permissions — our skills are documentation, not executable. |
| `paths` | No | No | Optional glob-based scoping. Skipped in v0 because we don't yet track per-memory file affinity; users can hand-add `paths:` to `SKILL.md` if they want to scope a skill to e.g. `src/**/*.ts`. **Note:** they'll lose that on regeneration — see "Idempotency contract" below. |
| `disable-model-invocation` | No | **No** (i.e. allow auto-invocation) | The whole point of emitting Skills is dynamic auto-loading; disabling this would defeat the v2.5-04 thesis. |
| `license` / `compatibility` (mintlify-only) | No | No | Likely earlier-draft fields not in the current canonical doc. Skipped; revisit if they reappear in `docs.anthropic.com`. |

### `SKILL.md` body

Plain markdown loaded **only when the skill is invoked** (auto or via `/<name>`). The frontmatter description stays in context until then. This is the budget split that makes Skills different from `AGENTS.md`:

| Layer | What's in context | When |
|---|---|---|
| Frontmatter `description` + `when_to_use` | Capability summary | Always (until 1,536-char skill-listing cap forces truncation) |
| Body | Full rules / decisions content | Only after Claude decides to invoke |

So we put **the trigger keywords in description**, **the actual rules in the body**.

## Memory → Skills mapping (v0)

Three skills, one per long-lived memory type. We deliberately exclude transient types.

| Skill | Source memory type | Skipped if |
|---|---|---|
| `ai-memory-coding-conventions` | `convention` | 0 conventions in store |
| `ai-memory-decision-log` | `decision` (status ≠ `resolved`) | 0 active decisions in store |
| `ai-memory-system-architecture` | `architecture` | 0 architecture memories in store |

**Why not `todo` / `issue`:** these are transient (status flips, items get resolved). Encoding them as auto-loaded skills risks teaching Claude to "follow" a TODO that's already done. They stay accessible via `recall` / `search` / `list`, just not as Skills.

**Why not split by author / theme:** ADR §v2.5-04 sketched "type × theme" but our memory model has no `theme` field today. v0 collapses to "type only"; v1+ can split by tag/scope if memories grow large enough that a single skill blows the body budget.

**Why the `ai-memory-` prefix on `name`:** disambiguates ownership from user-authored skills. A user who writes their own `.claude/skills/coding-conventions/` won't conflict with our `.claude/skills/ai-memory-coding-conventions/`. Slash-command becomes `/ai-memory-coding-conventions` (slightly longer but unambiguous; users wanting brevity can `mv` the directory after generation, accepting that re-running `rules --target skills` will recreate the prefixed version).

## Idempotency contract

Like `cursor-rules` (and unlike `agents-md`), Skills output is **full-file overwrite** within ai-memory-owned directories:

- **Owned**: `.claude/skills/ai-memory-*/SKILL.md` — fully regenerated each run; hand-edits inside are **not preserved**.
- **Not touched**: `.claude/skills/<other-name>/` (anything not prefixed `ai-memory-`) — left alone.

This is the same trade-off as `.cursor/rules/ai-memory-conventions.mdc`: a small file that's wholly owned by us, easier to reason about than partial-merge semantics. Users who want to extend a generated skill should:

1. Copy `.claude/skills/ai-memory-coding-conventions/` to a new directory (e.g. `.claude/skills/coding-conventions-custom/`).
2. Edit there. Their copy is invisible to ai-memory and survives regeneration.

We document this in the `rules --help` text and the README §`rules`.

## Worked example (what `rules --target skills` will emit on the bundled try-scenario)

For the v2.5-02 demo store (1 decision + 1 architecture + 1 convention), the writer produces three skill directories:

```
.claude/skills/ai-memory-coding-conventions/SKILL.md
.claude/skills/ai-memory-decision-log/SKILL.md
.claude/skills/ai-memory-system-architecture/SKILL.md
```

Sample `ai-memory-coding-conventions/SKILL.md`:

```markdown
---
name: ai-memory-coding-conventions
description: Project coding conventions extracted from chat history. Load when writing new code, naming variables, or designing API endpoints. Topics: Relay-style cursor pagination.
---

# Coding Conventions

> Auto-generated by ai-memory from chat-history-derived convention memories.
> Edit memories via `ai-memory list` / `extract` / `resolve` rather than this file —
> it is fully regenerated on every `ai-memory rules --target skills`.

## Relay-style cursor pagination

All paginated list endpoints return `{ edges, pageInfo: { endCursor, hasNextPage } }` shape. Cursor is an opaque base64-encoded string. No offset/limit anywhere in the public API.

Why: matches our existing GraphQL contract and lets clients fall back to default page size without breaking when we change the underlying index.
```

## Open questions deferred to v2.5-04+

- **Cursor / Windsurf Skills support:** Anthropic Skills are currently consumed by Claude Code only. As of 2026-04-26 there's no public commitment from Cursor / Windsurf to read `.claude/skills/`. We emit them anyway because the marginal cost is tiny and our positioning ("the only project that emits both AGENTS.md and Skills from chat history") survives whether or not Cursor adopts.
- **`paths:` auto-derivation:** would require per-memory file-affinity metadata we don't currently track. v2.6+ candidate.
- **Body size budget:** Anthropic doesn't publish a cap, but very large bodies cost more context-tokens at invocation time. If a single skill body exceeds ~50KB we'll likely want to split by sub-theme. Not a problem for v0 (typical store has < 30 memories per type).

## Re-spike trigger

Re-do this snapshot (with a new date in the filename — never overwrite this file) when **any** of the following changes:

- Anthropic adds / removes / renames a frontmatter field on `docs.anthropic.com/en/docs/claude-code/skills`.
- The 1,536-char description cap moves.
- The discovery root changes (e.g. `.claude/skills/` → `.skills/`).
- Cursor or Windsurf publishes a Skills compatibility statement (relevant for our README claims).
