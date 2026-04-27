# AGENTS.md downstream-evaluation results

> **Status: prep skeleton — not yet executed.**  
> The methodology and fixtures below are committed; the numbers are not.
> When the maintainer runs the experiment per
> [`bench/agents-md-eval/README.md`](../bench/agents-md-eval/README.md),
> the placeholder fields (`<X>`, `<X_cursor>`, etc.) are replaced with
> real scores **without changing any of the surrounding methodology
> text** — that text is the verbatim publication template locked in
> [`docs/agents-md-eval-spike-2026-04-27.md`](agents-md-eval-spike-2026-04-27.md) §7.
>
> Any edit to the methodology / threats-to-validity / out-of-scope
> sections after results are first published is a re-spike per spike doc
> §6, not a normal doc edit.

---

## Headline

**`<X>` / 50 rule observations honored across Cursor + Claude Code.**

| Editor | Score | Editor version (run date) | Model |
|---|---|---|---|
| Cursor | `<X_cursor>` / 25 | `<vX.Y.Z>` (`<YYYY-MM-DD>`) | `<default at run time>` |
| Claude Code | `<X_cc>` / 25 | `<vX.Y.Z>` (`<YYYY-MM-DD>`) | `<default at run time>` |
| **Combined** | **`<X>` / 50** | — | — |

## What this measures

A controlled 10-task × 2-editor experiment scoring whether the rules in
the auto-generated `AGENTS.md` actually steer agent behaviour during
real coding-session prompts. Methodology, fixtures, and per-task
scoring rubric are pinned in
[`docs/agents-md-eval-spike-2026-04-27.md`](agents-md-eval-spike-2026-04-27.md);
the runbook for replication is at
[`bench/agents-md-eval/README.md`](../bench/agents-md-eval/README.md).

This is the **complementary credibility lever** to CCEB: CCEB measures
extraction quality (did the LLM extractor produce the right rules?);
this number measures downstream effect (do those rules actually steer
the agent?). Both numbers belong on every claim that touches "rules
work" — see `docs/competitive-landscape.md` for the matched pair.

## Per-task scores

| Task | Targeted rule | Cursor | Claude Code | Notes |
|---|---|---|---|---|
| T01 | OAuth PKCE | `<n>/3` | `<n>/3` | `<note>` |
| T02 | OAuth PKCE | `<n>/2` | `<n>/2` | `<note>` |
| T03 | OAuth PKCE | `<n>/3` | `<n>/3` | `<note>` |
| T04 | OAuth PKCE | `<n>/2` | `<n>/2` | `<note>` |
| T05 | OAuth PKCE | `<n>/2` | `<n>/2` | `<note>` |
| T06 | GraphQL cursor pagination | `<n>/3` | `<n>/3` | `<note>` |
| T07 | GraphQL cursor pagination | `<n>/3` | `<n>/3` | `<note>` |
| T08 | GraphQL cursor pagination | `<n>/2` | `<n>/2` | `<note>` |
| T09 | GraphQL cursor pagination | `<n>/2` | `<n>/2` | `<note>` |
| T10 | Cross-rule (PKCE + pagination) | `<n>/3` | `<n>/3` | `<note>` |
| **Total** | | **`<X_cursor>`/25** | **`<X_cc>`/25** | |

## Failure cases (verbatim)

> **Maintainer instruction:** quote at least three failed observations
> verbatim, one per rule type if any failed. Hiding failures inflates
> the credibility cost of any future quibble. If fewer than three
> failed, quote the closest-to-borderline successes instead and label
> them as such.

### Failure 1 — `<editor>` / `<task>` / `<observation>`

```text
<verbatim agent response excerpt>
```

Why this scored 0: `<one-sentence rubric tie-back>`

### Failure 2 — `<editor>` / `<task>` / `<observation>`

```text
<verbatim agent response excerpt>
```

Why this scored 0: `<one-sentence rubric tie-back>`

### Failure 3 — `<editor>` / `<task>` / `<observation>`

```text
<verbatim agent response excerpt>
```

Why this scored 0: `<one-sentence rubric tie-back>`

## Threats to validity

(Verbatim from
[`docs/agents-md-eval-spike-2026-04-27.md`](agents-md-eval-spike-2026-04-27.md) §2,
no softening — the spike doc commits us to publishing these as-is.)

1. **Not a benchmark of Cursor or Claude Code's intrinsic
   rule-following.** A low score may reflect rule clarity, not editor
   capability. We do not draw editor-vs-editor conclusions in this
   writeup beyond the per-editor breakdown above.
2. **Not statistical significance.** n=10 tasks × ~2.5 obs avg × 2
   editors = 50 obs is a sanity check, not a confidence interval.
3. **Not generalizable to all rule shapes.** We test the two rules
   bundled in the v2.5-02 demo scenario (OAuth PKCE decision, GraphQL
   cursor pagination convention). Adoption-relevant rules have similar
   shape ("MUST do X / reject Y") so it's a fair-but-not-universal
   sample.
4. **Not a measurement of long-term behaviour drift.** We score one
   single-shot interaction per task. Rules that decay over multi-turn
   conversations are not exercised.
5. **Not blind.** The maintainer scoring the runs is the same person
   who designed the rubric. Mitigation: literal-pattern scoring
   (spike doc §5).

## Replication

Full runbook + fixtures: [`bench/agents-md-eval/README.md`](../bench/agents-md-eval/README.md).
Estimated effort to replicate from a clean clone: ≈ 30 min per editor +
15 min scoring + 5 min publishing = ≈ 75 min total.

The CSV with per-observation scores is at
[`bench/agents-md-eval/results/scores.csv`](../bench/agents-md-eval/results/scores.csv);
per-task verbatim agent responses are at
`bench/agents-md-eval/results/<editor>/T0X-response.md`.

## What this number does NOT measure

(Verbatim from spike doc §2.)

- **Long-term rule decay** across multi-turn sessions.
- **Per-rule corpus coverage** beyond the 2 rules bundled in the demo
  scenario.
- **Lift over no-rules** (no null-baseline run; deferred to v2.6 per
  spike doc §8).
- **Cross-scorer agreement.** Single scorer; v2.6 candidate is to ship
  the fixture pack and ask one external contributor to re-score
  independently.

## Run metadata

- Run date: `<YYYY-MM-DD>`
- Operator: `<name / handle>`
- `ai-memory` version under test: `<vX.Y.Z>` (commit `<sha>`)
- AGENTS.md fixture hash: `<sha256 of bench/agents-md-eval/controlled-repo/AGENTS.md at run time>`
- `verify-agents-md.ts` exit code at run start: `<0 expected>`
- Cursor version: `<vX.Y.Z>` / model: `<name>`
- Claude Code version: `<vX.Y.Z>` / model: `<name>`
