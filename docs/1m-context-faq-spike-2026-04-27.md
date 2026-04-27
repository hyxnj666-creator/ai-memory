# Spike — "Doesn't 1M-token context obsolete you?" FAQ

> Date: 2026-04-27
> Tracks: ROADMAP v2.5-09
> Status: scope frozen, README copy follows

## 0. Why bother spiking a single FAQ entry

Two reasons:

1. The argument has to survive HN cross-examination, not just satisfy a
   sympathetic reader. Locking the claims, sources, and re-spike
   triggers up front means the published copy can be defended without a
   late-night scramble for citations.
2. The same "you're obsolete" framing will be used against every
   structured-extraction tool for at least the next 12-18 months. A
   single coherent answer that we link to (instead of re-arguing every
   thread) is a passive surface, like CCEB.

## 1. The skeptic claim, restated steel-man

> "Gemini 1.5 Pro and Claude Sonnet 4.5 already accept 1M+ tokens.
> GPT-4.1 hits 1M. I can paste my whole chat history into the next
> turn. Extraction layers add operational overhead for a problem the
> model providers solved by extending context."

This is the strongest version we've seen on HN/Reddit/X. We answer
*this* version, not a weaker straw-man.

## 2. What we will NOT argue

- "Long context doesn't work" — false; it does work for many tasks,
  and saying otherwise would invite legitimate counter-citations.
- "1M context is a marketing number" — true for *some* providers but
  not all, and the discriminator is provider-specific. Picking a
  fight here is off-topic.
- "Models can't follow instructions in long context" — overlaps with
  the lost-in-the-middle argument, but stating it bluntly is weaker
  than citing measured degradation.

## 3. What we WILL argue (ranked by HN-defensibility)

### 3.1 Cost compounds — extraction is amortised, dumping is per-query

**Claim:** Re-shipping a long chat history every turn pays the input
token bill *every query*, while extraction pays once and re-uses the
output across every session.

**Concrete framing for the FAQ:**

- Frontier model input pricing (as of 2026-04) sits in the **\$1–\$3
  per million input tokens** band: Anthropic Claude Sonnet 4.5
  ≈ \$3/M, OpenAI GPT-4.1 ≈ \$2/M, Gemini 1.5 Pro ≈ \$1.25/M up to
  128K and ≈ \$2.50/M above 128K. (Cite: provider pricing pages —
  anthropic.com/pricing, openai.com/api/pricing,
  ai.google.dev/pricing. Linked in README, not inlined, because
  prices drift.)
- A "moderate" Cursor session that's been running for two weeks is
  not 1M tokens but it's reliably 100–300K tokens of conversational
  text once you include `tool_use` payloads and file diffs. Dumping
  that into every query at \$2/M = **\$0.20–\$0.60 per query** before
  you've asked anything.
- An `AGENTS.md` generated from the same conversation is on the order
  of **1–5K tokens**, loaded **once per session** by the editor.
  Cost difference is two orders of magnitude even before prompt
  caching kicks in.

**Why this works rhetorically:** the reader can multiply by their own
team size and queries-per-day. We don't claim a specific saving
number; we hand them the unit cost and let them do the math.

**What we do NOT do:** quote a "saves you \$X/month" figure. Those
are unfalsifiable and they age fast.

### 3.2 Lost-in-the-middle is not solved, just moved

**Claim:** Long-context retrieval still degrades on *non-headline*
information past roughly 128–200K tokens, even on models that
advertise 1M-token windows. Compression-by-extraction is lossless on
the only signal that matters (the typed decision / convention /
architecture).

**Citations we'll link (NOT inline-quote — link only):**

- Liu et al. 2023, "Lost in the Middle: How Language Models Use Long
  Contexts" — the foundational paper, still the most-cited.
- Kuratov et al. 2024, "BABILong" — needle-in-haystack at 1M-token
  scale, shows all frontier LLMs lose >20% recall past ~256K on
  multi-hop questions.
- Anthropic's own published needle-in-haystack benchmarks for
  Claude Sonnet — they do not claim flat retrieval across the full
  1M window; they claim "near-perfect" recall *on single-needle
  tasks* up to ~200K.

**What this lets us say in the README, defensibly:**

> Long context works well for the most-recent and most-prominent
> turns; it degrades on the everyday "wait, what did we decide about
> X three weeks ago" question — exactly the queries memory tools are
> designed for.

**What we will NOT say:** "long context is broken." It isn't.

### 3.3 Per-session vs per-machine vs per-team

**Claim:** A 1M-token chat history lives inside one editor on one
laptop. It cannot be reviewed by your teammate, code-reviewed in a
PR, branched, or rolled back. `AGENTS.md` (and `.ai-memory/*.md`)
committed to git can.

This is the same argument the v2.4 launch already made for the
overall product positioning; the FAQ just re-states it in
"long-context-can't-do-that" form. **Do not duplicate the prose** —
link to the existing "What only ai-memory does" section rather than
re-arguing.

### 3.4 Prompt-cache friendliness (sleeper, optional)

**Claim:** A byte-stable `AGENTS.md` between sessions is exactly the
shape modern provider prompt-caches optimise for. Anthropic and
OpenAI both offer ~90% read discounts on cached tokens. Raw chat
history is per-session unique → cache-miss every time → no discount.

This is technically correct but adds a fourth bullet. Decision: **cut
from the README copy**, retain in this spike doc as fallback if a
specific HN counter-argument needs answering. Three points reads
better than four; the cache argument also requires a brief
explanation of how prompt caches work, which inflates the section.

### 3.5 Cross-cutting: latency

Time-to-first-token scales roughly linearly with prefill length on
all major providers. 200K-token prefills add 5–20s to every query
even before generation. Mention as a one-liner inside the cost
argument, not as a separate bullet — it's the same lever ("you pay
for what you ship") with a different unit.

## 4. README placement decision

**Where:** A new `## FAQ` section, placed **between
`## We measure ourselves` and `## Quick Start`**.

Rationale:

- A skeptical reader who isn't sold by "We measure ourselves" needs
  the FAQ in their critical path before deciding whether to install.
- Putting it at the bottom of the README means scroll-bouncers never
  see it — the highest-leverage skeptic question deserves above-fold
  treatment, but not above the proof block (CCEB numbers).
- Section title is exact-quote of the question. HN headlines are the
  primary referrer; `#faq--doesnt-1m-token-context-obsolete-you`
  becomes a directly-linkable anchor.

**Length cap:** 2-3 paragraphs + the cost framing. We will *not*
inline benchmark tables for long-context degradation; we link out.

**Companion section in `docs/competitive-landscape.md`:** a one-line
cross-reference, not a duplicate. The FAQ is the canonical place;
the landscape doc points at it.

## 5. Re-spike triggers

Re-open this doc and revise the FAQ if any of these land:

1. **Sub-\$0.50/M frontier pricing** for ≥1M-token windows ships from
   any of the three majors. Cost argument weakens to a 4-5x ratio
   instead of 50-100x; needs reframing around determinism / sharing.
2. **Long-context retrieval benchmarks publish < 5% degradation past
   500K** on multi-hop tasks across all majors. Lost-in-the-middle
   argument has to be retired or narrowed.
3. **A native "automatic conversation compression" feature** ships in
   Cursor or Claude Code such that the editor itself maintains a
   rolling summary across sessions. The "per-session" argument
   weakens; need to pivot to "still per-machine, still
   non-reviewable, still no provenance."
4. **Provider prompt-cache pricing changes** (e.g. Anthropic drops
   the 90% read discount). Promotes 3.4 from optional to required.

## 6. Acceptance criteria

- [ ] README.md and README.zh-CN.md ship the FAQ section, byte-mirror
      structure (titles in English in both, since `AGENTS.md` and
      `1M-token` are loanwords in zh-CN README convention).
- [ ] `docs/competitive-landscape.md` has a single one-line back-ref;
      no duplicated argument.
- [ ] No specific dollar saving figure is quoted; only the unit-cost
      band and the dimension to multiply along.
- [ ] No "long context doesn't work" framing anywhere.
- [ ] No inline citations heavier than a hyperlink — paper titles can
      be named, but not quoted.
- [ ] `npm test` still green; the README-snapshot tests (if any) are
      updated alongside the copy.

## 7. Known unknowns / honest gaps

1. **We have not measured Gemini 1.5 Pro's actual retrieval
   degradation past 256K ourselves.** We rely on Kuratov et al.'s
   BABILong numbers. If a reviewer demands first-party measurement,
   that's a v2.6 task.
2. **The cost framing assumes "moderate Cursor session = 100–300K
   tokens".** This is from internal observation across ~50 of the
   maintainer's own sessions, not a community-wide measurement.
   Could be off by 2-3x at the long-tail. The FAQ uses range
   language to reflect this uncertainty.
3. **Prompt-cache pricing is provider-specific and subject to
   change.** The cache argument is parked in §3.4 partly because
   pinning it accurately is more work than its rhetorical value.
