# Spike — Memory ↔ commit / file-path linking

> Date: 2026-04-27
> Tracks: ROADMAP v2.5-10
> Status: design only. v2.6 ships the implementation.

## 0. Why a spike (and not just code it)

Three decisions in this feature each have a wrong answer that's worse
than the no-feature baseline. A *bad* auto-linker quietly attaches a
random commit to a real memory, then `recall` confidently lies to
users. The cost of getting any of these wrong is higher than the
cost of writing them down first:

1. **Similarity scoring choice** (substring vs embedding vs LLM-judged).
   Each has a different cost / accuracy / dependency profile.
2. **Auto-link vs manual-confirm UX.** Auto-linking aggressively =
   plausible-sounding lies; manual-only = nobody uses the feature.
3. **Metadata schema.** `implemented_in: [<sha>, <path>]` from the
   ROADMAP sketch is a one-shot list and can't represent multi-commit
   implementations, partial reverts, or auto-vs-manual provenance.
   Schema mistakes are migration costs forever.

Same spike-first pattern as v2.5-04 / v2.5-05 / v2.5-06 / v2.5-07 /
v2.5-08 / v2.5-09: every one of those caught at least one
wrong-assumption that pure code-first would have shipped.

## 1. Out of scope for v2.5

This spike produces **only this document** in v2.5. No code in
`src/`, no new commands, no metadata writes, no test suites, no
dashboard changes. The deliverable for v2.5-10 is "design locked,
v2.6 has a plan it can execute without re-deciding anything."

The strategy ADR ([2026-04-26-post-v2.4-strategy.md §v2.5-10](decisions/2026-04-26-post-v2.4-strategy.md))
already locks "spike-only this cycle, ship in v2.6"; this doc fills in
the *what* the spike actually decides.

## 2. Steel-man the skeptic

The case against shipping this at all:

> "git already records what changed when. `ai-memory recall` already
> shows `git log --follow` of the memory file itself. Why do I need a
> second linking layer between memory files and the source files / SHAs
> that *implemented* them?"

The honest answer: `recall` shows how the memory *evolved* (every edit
to `oauth.md` since it was created). It does *not* show **the
implementation commits** — the SHAs that landed the code that
fulfilled the memory's instructions. That's a different question and
the data isn't currently there:

- Memory `decision-pkce.md` says "use OAuth 2.0 + PKCE". It was
  created on 2026-03-20.
- Three weeks later, commit `3f21251` actually lands the PKCE flow in
  `src/auth/pkce.ts`. The commit subject says "implement PKCE flow"
  but doesn't reference the memory.
- Today, `recall` against "PKCE" surfaces the memory and its own edit
  history. It cannot tell you `3f21251` is the implementation.
- Linking closes that loop, and unlocks "show me every commit that
  implements one of our recorded conventions" — which is the
  unique-to-us competitor-uncopyable surface from
  [`docs/competitive-landscape.md`](competitive-landscape.md). Plain
  Markdown in git makes this *possible*; nobody else's substrate does.

So the feature is worth shipping. The spike's job is to make sure
*how* it ships doesn't poison `recall` with bad links.

## 3. Decisions

### 3.1 Similarity scoring — substring default, embedding opt-in, LLM rejected

| Option | Cost | Accuracy | Dependency | Verdict |
|---|---|---|---|---|
| **A. Substring / weighted Jaccard** over `(memory title + content)` × `(commit subject + body + paths)` | ~0 — local CPU only | High precision, mediocre recall on paraphrased commits | Just `git` (already required) | ✅ **Default** |
| **B. Embedding cosine** over the same fields, reusing existing `.embeddings.json` infra | ~$0.0001 / commit at OpenAI prices | Better recall on paraphrasing; same precision with right threshold | OpenAI-compatible API key OR local embedding model (Ollama nomic-embed-text etc.) | ⚠ **Opt-in via `--similarity embedding`** |
| **C. LLM-judged** ("does this commit implement this memory?") on every (memory, commit) candidate | ~\$0.001 / pair × O(n × m) — explodes fast | Highest of the three | LLM API key always | ❌ **Rejected for v2.6 and v2.7** |

**Why this stack:**

- Substring as default fits the project's "local-first by default,
  embeddings opt-in" stance already established in v2.0 semantic
  search and v2.4 `recall`. Users with no API key get something useful
  from day 1.
- Embedding fallback **reuses the existing semantic-search opt-in slot
  rather than introducing a new dependency**. If a user already has
  `.embeddings.json` populated for memory recall, the marginal cost of
  also embedding commits is small.
- LLM-judged is rejected because cost scales O(memories × commits)
  and the rejection criteria for "does this commit implement memory X"
  are exactly the criteria humans run after seeing a candidate — i.e.
  it's better as the human's confirmation step than as an automated
  scoring layer.

**Substring weighting locked for v2.6 default:**

```
Jaccard score(memory M, commit C) =
    weighted_token_overlap(tokens(M), tokens(C)) / weighted_union(...)

where:
    tokens(M) = 3× tokens(M.title)
              + 2× tokens(M.type)        # decision/architecture/etc.
              + 1× tokens(M.content[:500])
              + 2× tokens(must_contain hints if present)

    tokens(C) = 3× tokens(C.subject)
              + 2× tokens(C.paths_changed)
              + 1× tokens(C.body[:500])
              + 1× tokens(C.author_name)   # weak signal but cheap
```

The `tokens()` function is the same CJK-aware tokenizer from v2.2.0
(`src/search/tokenize.ts`) — bigrams + trigrams for CJK, lowercased
words for Latin, bilingual stop-word filtering. **Reuse, don't
re-implement.**

### 3.2 UX — three-band threshold model

The "auto vs manual" question collapses into a threshold choice. For
each (memory, commit) pair after scoring:

| Score band | Action | Stored where |
|---|---|---|
| `score >= AUTO_THRESHOLD` (default 0.70 Jaccard / 0.85 cosine) | Write to memory's frontmatter `links.implementations` with `confirmed_by: auto` | YAML frontmatter |
| `SUGGEST_THRESHOLD <= score < AUTO_THRESHOLD` (default 0.40–0.70 Jaccard / 0.70–0.85 cosine) | Surface in `recall` output as "possibly implemented in: …; confirm with `ai-memory link --confirm`" | NOT stored — re-derived on each `recall` |
| `score < SUGGEST_THRESHOLD` | Drop silently | — |

**Why a band, not a single threshold:**

- Single threshold = "auto-link or nothing". Auto-link bad → silent
  damage. Nothing → low recall.
- Band model lets the "easy cases" go through without pestering the
  user, while ambiguous cases stay surfaced and **opt-in to write**.
- The `confirmed_by: auto` flag means a maintainer can mass-clear
  every auto-link in one command (`ai-memory link --clear-auto`)
  without losing manual confirmations. Cheap recovery from a
  threshold-tuning mistake.

**Conservative default thresholds:**

The defaults bias toward precision over recall — the spike's
core principle is *"a bad auto-link is worse than no link"*.
v2.6 publishes empirical thresholds derived from a labeled
ground-truth corpus on the ai-memory repo itself (see §6 below).
Until then the thresholds in the table above are the conservative
starting points, tunable in `.ai-memory/.config.json`:

```json
{
  "linking": {
    "enabled": false,            // off by default; opt-in
    "similarity": "jaccard",     // | "embedding"
    "auto_threshold": 0.70,
    "suggest_threshold": 0.40,
    "max_suggestions_per_memory": 3,
    "scan_since": "30 days ago"  // git log --since=
  }
}
```

`enabled: false` by default for v2.6 — the feature is opt-in. Same
discipline as v2.5-05's `--redact` opt-in default: flipping a default
ON in a minor version would silently change extracted-memory file
contents on every existing user's `extract` run, which is a 3.0
breaking-change vector. v2.6 ships the feature with the opt-in flag;
flipping default ON is a v3.0 candidate and announced via the same
deprecation-warning hook v2.5-09 reserved.

### 3.3 Metadata schema — `links.implementations[]`

The ROADMAP sketch wrote `implemented_in: [<sha>, <path>]`. Three
revisions:

1. **A memory is implemented over multiple commits.** "Switch to
   PKCE" might land in 4 commits across 2 weeks. Schema must be a
   list with full per-link records, not a flat tuple.
2. **Auto-linked vs manually-confirmed must be distinguishable** so
   `ai-memory link --clear-auto` is safe and `ai-memory link
   --confirm <sha>` can promote auto → manual.
3. **Reproducibility.** Record `score` + `method` so a future re-scan
   with stricter thresholds can drop low-confidence links without
   touching manual ones.

**Locked schema** (YAML frontmatter, slotted under existing memory
fields without breaking parsers that don't know about it):

```yaml
---
type: decision
title: Use OAuth 2.0 + PKCE for the auth flow
date: 2026-03-20
author: conor
status: active
links:
  implementations:
    - sha: 3f21251
      short: 3f21251
      paths:
        - src/auth/pkce.ts
        - src/auth/__tests__/pkce.test.ts
      subject: "feat: ship PKCE auth flow"
      author: Conor Liu
      date: 2026-04-26T14:23:11Z
      method: jaccard
      score: 0.82
      confirmed_by: auto         # auto | manual
      first_linked: 2026-05-15T10:23:00Z
    - sha: 7d8e9aa
      short: 7d8e9aa
      paths:
        - src/auth/middleware.ts
      subject: "fix: PKCE state validation race"
      author: Alice Chen
      date: 2026-05-02T09:11:42Z
      method: jaccard
      score: 0.71
      confirmed_by: manual
      first_linked: 2026-05-16T08:00:00Z
---
```

**Schema invariants** (pin in v2.6 type-checks):

- `sha`: full 40-char SHA. `short` is convenience-cached; recomputable
  from `sha`.
- `paths`: list of repo-relative paths the commit touched **that
  matched the memory's tokens**. Not the full set of paths in the
  commit. Stored at link time; on re-scan with `--follow` the path
  may have moved — re-deriving uses `git log --follow` per path.
- `score` + `method` are honest at link time; if the user re-runs
  the scanner with different thresholds, *new* links are added but
  existing ones are not retroactively rescored unless
  `ai-memory link --rescore` is invoked.
- `first_linked` is *idempotent* — once written, never updated. So
  re-scans don't keep churning the file.
- `confirmed_by: auto` links are removable by `link --clear-auto`;
  `confirmed_by: manual` links are only removable by explicit
  `link --remove <sha>`.

**What we are NOT doing in v2.6:**

- `reverted_in: [<sha>]` — useful but adds a second cross-reference
  surface. Logged for v2.7 once the linker has real-world usage.
- `references: [<other-memory-id>]` — out of scope; that's the v2.6+
  "memory graph" feature, separate roadmap item.
- `pull_request: <number>` — assumes GitHub; we don't lock to a
  forge. v2.7 candidate behind a `--with-pr-numbers` flag.

### 3.4 Surfacing — `recall`, dashboard, summary

**`ai-memory recall <query>`** gains an `Implementations` block per
result memory:

```
$ ai-memory recall "PKCE"

decision: Use OAuth 2.0 + PKCE for the auth flow
  conor · 2026-03-20 · active

  Use PKCE to mitigate authorization-code interception attacks…

  Implementations (2 confirmed, 1 suggested):
    ✓ 3f21251  feat: ship PKCE auth flow            Conor Liu  2026-04-26  (auto, score 0.82)
    ✓ 7d8e9aa  fix: PKCE state validation race      Alice Chen 2026-05-02  (manual)
    ? 9a1b2cc  refactor: split auth middleware      Conor Liu  2026-05-08  (suggested, score 0.52)

  Confirm with: ai-memory link --confirm <memory-id> 9a1b2cc
```

The `?` row is re-derived on every `recall` (not stored). The `✓` rows
are read from frontmatter. **Performance budget**: `recall` adds at
most one `git log --since=<scan_window>` call when `linking.enabled`,
bounded by the `git` 10-second timeout already established in v2.4
recall.

**Dashboard** gains an "Implementations" column on the memory cards:

- Confirmed count: `2 ✓` (clickable → diff view in github.com if
  remote is set, else `git show <sha>`).
- Suggested count: `1 ?` (clickable → confirm dialog).

**`ai-memory summary`** gains a "Recently implemented" section:
"In the last 30 days, 8 memories were linked to commits — 6
auto-confirmed, 2 manually confirmed by you." Lightweight; ignored
when `linking.enabled = false`.

### 3.5 Command shape — `ai-memory link`

New top-level command, sibling of `recall` / `extract` / `rules`.

```
ai-memory link                       # default: scan + apply at AUTO_THRESHOLD
ai-memory link --dry-run             # preview, no writes
ai-memory link --since "1 week ago"  # override scan window
ai-memory link --memory <id>         # scope to one memory file
ai-memory link --rescore             # rescore existing auto-links
ai-memory link --clear-auto          # remove every confirmed_by: auto entry
ai-memory link --confirm <mem> <sha> # promote auto/suggestion → manual
ai-memory link --remove <mem> <sha>  # remove a specific link (auto or manual)
```

**Lock-in invariants:**

- Subcommands are flags, not positional — same convention as `ai-memory
  rules --target` and `ai-memory extract --redact`.
- `--dry-run` prints unified-diff-style "would add / would remove"
  output, mirroring `reindex --dedup` v2.2.0's UX.
- Every write is idempotent (re-running the same `link` invocation
  produces zero net writes if state hasn't changed).
- `link` never touches commits / git history; reads only via
  `execFile('git', ...)` with bounded 10-second timeout (same
  guardrail as `recall`).

## 4. Implementation plan (v2.6 work breakdown)

Estimate locked for v2.6 ROADMAP entry. Each item is independently
mergeable.

| # | Item | Est | Depends on |
|---|---|---|---|
| 4.1 | `src/linking/scorer.ts` — pure substring + Jaccard scoring with the §3.1 weighting. Reuses `src/search/tokenize.ts`. ~25 unit tests. | 1 dev day | nothing |
| 4.2 | `src/linking/git-walker.ts` — bounded `git log --since` walker that emits `{sha, subject, body, paths, author, date}` records. Soft-fails outside git repos (same fallback shape as v2.4 `recall`). ~10 unit tests. | 0.5 dev day | nothing |
| 4.3 | `src/linking/embedding-scorer.ts` — opt-in, requires existing `.embeddings.json` infra. ~12 unit tests. | 1 dev day | 4.1 |
| 4.4 | `src/linking/frontmatter-writer.ts` — read / merge / write `links.implementations` in memory `.md` YAML, respecting the §3.3 invariants (idempotent `first_linked`, separate auto vs manual). ~20 unit tests covering merge / clear-auto / confirm / remove paths. | 1 dev day | nothing |
| 4.5 | `src/commands/link.ts` — CLI wiring of the §3.5 surface. ~12 CLI tests. | 0.5 dev day | 4.1, 4.2, 4.4 |
| 4.6 | `src/commands/recall.ts` integration — append `Implementations` block to `recall` output when `linking.enabled`. Re-uses 4.2 walker for the suggestion-band re-derivation. ~6 integration tests. | 0.5 dev day | 4.1, 4.2 |
| 4.7 | Dashboard "Implementations" panel — JS-only, reads frontmatter via existing memory loader. ~4 dashboard tests. | 0.5 dev day | 4.4 |
| 4.8 | `summary` command "Recently implemented" section. ~3 unit tests. | 0.25 dev day | 4.4 |
| 4.9 | Ground-truth corpus + threshold-tuning benchmark on the ai-memory repo itself. See §6. | 0.5 dev day | 4.1 |
| 4.10 | Same-day audit pass — fresh-eyes re-read of every artefact in 4.1–4.9. Pattern is now load-bearing for any v2.x feature touching an external surface (filesystem, git, command surface). | 0.5 dev day | 4.1–4.9 |

**Total:** ~6 dev days. The original strategy ADR estimated v2.5-10 at
"1 dev day for the spike" + the v2.6 ship presumed on the order of
3-5 dev days. Locked-in 6 days reflects the audit-pass discipline now
being a budgeted line item, not free overhead.

## 5. Testing strategy

### 5.1 Unit tests (~85)

Per the breakdown in §4. Pure-function-first: scorer, git-walker,
frontmatter-writer all have no I/O dependencies in their test scope.

### 5.2 Integration tests (~15)

- Real git tmpdir scenarios (same shape as v2.4 `log-reader.test.ts`):
  init → commit → memory creation → link scan → frontmatter assert.
- Renamed-file scenario: file moved between memory creation and link
  scan; verify `--follow` correctly resolves.
- Reverted-commit scenario: memory linked, then commit reverted; verify
  link survives but is flagged in summary output (foreshadows §3.3
  v2.7 `reverted_in`).

### 5.3 Ground-truth corpus (Item 4.9)

A v2.6 prerequisite for publishing default thresholds is a labeled
corpus. Plan:

1. Build the corpus *on the ai-memory repo itself* — 20 hand-picked
   memories from `.ai-memory/conor/` × the last 90 days of git
   history. For each (memory, commit) pair, the maintainer marks
   `implements: yes/no/maybe`.
2. Output: `bench/linking/ground-truth.json` (committed). Format:
   ```json
   {
     "memory_id": "decision-pkce",
     "commit_sha": "3f21251",
     "label": "yes",
     "rationale": "PKCE flow body added; subject mentions PKCE; paths under src/auth/"
   }
   ```
3. Threshold-tuning report: precision-recall curve at 0.05 increments
   of `auto_threshold` and `suggest_threshold` for both `jaccard` and
   `embedding` methods. Published in `docs/benchmarks/linking-baseline.md`
   following the CCEB baseline doc template.
4. Re-spike trigger #1 (substring recall <50% on the corpus) is
   measured against this corpus. Until it exists, "<50%" is a
   placeholder.

Out of scope for v2.5: corpus authoring is a v2.6 work item, not a
spike deliverable. The spike's job is to *say a corpus is required*
and *describe its shape*.

### 5.4 Drift guard

Same shape as v2.5-07's `verify-agents-md.ts`: a `verify-linking.ts`
script that validates the linker's output against a known-stable
input set. Catches "we changed the tokenizer and now scoring drifts"
regressions in CI.

## 6. Re-spike triggers

Re-open this spike doc and revise the design if any of these surface
in v2.6 implementation or post-ship telemetry:

1. **Substring scoring's recall on the §5.3 ground-truth corpus is
   below 50%** at any reasonable precision (e.g. 80%+). Promote
   embedding default; substring drops to fallback.
2. **Embedding storage size for the commit-set crosses 50% of the
   existing `.embeddings.json` budget** on a typical 1000-commit repo.
   Reconsider: should commit embeddings live in a separate
   `.embeddings.commits.json` file? Or be re-derived on every scan?
3. **A competitor in any bucket** (chat-history extractors, git-markdown
   runtimes, opaque-DB runtimes) ships any form of memory↔commit
   linking. Re-evaluate whether our shape stays differentiated; expect
   to compete on linking accuracy (the corpus-derived numbers) rather
   than on novelty.
4. **False-positive rate in the `link --dry-run` output across the
   maintainer's first 10 personal repos exceeds 5% on auto-linked
   entries.** Tighten thresholds before opening v2.6 to
   non-maintainer testers.
5. **`git log --follow` proves unreliable across `--follow` boundaries**
   (e.g. multiple-renames-in-one-commit hide implementations from the
   re-derivation pass). Expand path tracking to also store the *file
   blob OID* alongside the path; verify post-rename via
   `git log --find-copies` rather than `--follow`.

## 7. Known unknowns / honest gaps

Documented now so they don't surprise v2.6 reviewers later.

1. **No labeled corpus exists yet.** §5.3 spec'd it; v2.6 builds it.
   Default thresholds (0.70 Jaccard auto / 0.40 suggest) are educated
   guesses, not empirically tuned. v2.6 publishes the corpus and the
   tuned thresholds simultaneously; treat the v2.6 first-ship as
   beta-quality on accuracy.
2. **Memory title vs commit subject overlap is artificially high in
   single-author repos.** When the same engineer writes both the
   memory and the commit, lexical similarity is inflated by shared
   personal vocabulary. Multi-author repos are the harder case; the
   corpus must include cross-author pairs to be representative.
3. **Renamed files break path-based scoring** if `--follow` is omitted
   and **break path-based stored-link-resolution** even with `--follow`
   when a rename and a content edit happen in different commits.
   Mitigation in §6.5 (re-spike trigger #5); v2.6 implementation must
   prove `--follow` is sufficient before relying on it.
4. **Reverted commits / reverted memories** aren't modeled. A memory
   linked to a commit that is later `git revert`-ed will keep showing
   the link with no warning. v2.7 candidate per §3.3.
5. **Multi-repo memory stores** (the v2.5+ "common conventions across
   repos" future-ideas item) break the in-this-repo-git-log assumption
   entirely. Out of scope; flagged here so the v2.6 implementer
   doesn't accidentally over-generalise.
6. **Threshold defaults are opinions until corpus exists.** §5.3
   makes this explicit; the README + dashboard copy in v2.6 must say
   "thresholds are calibrated against an internal 20-memory corpus
   (commit-by-commit publication in `bench/linking/`); your repo may
   need tuning."

## 8. Acceptance criteria for v2.5-10 (this spike)

- [x] This document exists at
      `docs/memory-commit-linking-spike-2026-04-27.md`.
- [x] Similarity-scoring stack is locked: substring default, embedding
      opt-in, LLM rejected.
- [x] UX three-band threshold model (auto / suggest / drop) is locked
      with conservative starting thresholds.
- [x] `links.implementations[]` schema is locked with auto-vs-manual
      distinction and idempotent `first_linked`.
- [x] `ai-memory link` command surface is locked.
- [x] `recall` / dashboard / `summary` integration points are
      described.
- [x] v2.6 implementation plan is broken into ≤1-day chunks.
- [x] Re-spike triggers (5) are documented.
- [x] Known unknowns (6) are documented.
- [x] No code in `src/` was touched.
- [ ] ROADMAP / CHANGELOG / launch-plan / strategy ADR all flip
      v2.5-10 status from `[ ]` to `✅ spike shipped 2026-04-27 /
      feature deferred to v2.6` *(syncing in the same PR as this doc)*.

## 9. Acceptance criteria for v2.6 ship (forward-looking)

- [ ] `ai-memory link` command implemented per §3.5.
- [ ] `links.implementations[]` schema populated by the linker;
      validated by frontmatter parser tests.
- [ ] `recall` shows `Implementations` block when `linking.enabled`.
- [ ] Dashboard "Implementations" panel functional.
- [ ] `summary` shows "Recently implemented" section.
- [ ] Ground-truth corpus published at `bench/linking/ground-truth.json`.
- [ ] Tuned default thresholds published at
      `docs/benchmarks/linking-baseline.md`.
- [ ] Same-day audit pass closes ≥0 issues (the bar is "we ran the
      audit", not "we found bugs" — three consecutive
      v2.5-04/05/06/07/08/09 audits caught 0–4 issues each).
- [ ] No new runtime dependencies beyond what `recall` already pulls
      in (`execFile`, `git`).
- [ ] Opt-in default holds: `linking.enabled: false` in
      `DEFAULT_CONFIG`. Flipping to `true` is a v3.0 candidate.

## 10. Honest assessment of strategic value

Per `docs/competitive-landscape.md` §"Bucket 3 — Adjacent: opaque-DB
runtime memory middleware", **no competitor in any of our three
buckets can do this**:

- Chat-history extractors (Palinode, SQLite Memory): no commit linking.
- Git-markdown runtimes: store git-tracked snapshots of an internal
  store, not memory files; they don't have a "memory file" to link
  against.
- Opaque-DB runtimes (mem0, letta, zep, cortexmem): their memory
  isn't in the user's git history at all; linking is structurally
  impossible.

This makes v2.6 memory↔commit linking a **structural moat**, not a
feature competitors will copy in a quarter. The substrate enables it
(plain Markdown in git as the memory store); the substrate is itself
the v2.4 launch's headline differentiator. The linker turns "your
memories are in git" from a *substrate* into a *substrate that
*compounds**.

Strategic priority for v2.6: **flagship**. This is the v2.6 candidate
the v2.5 strategy ADR called out as "earns a v2.6 flagship slot, not
a v2.5 sub-feature." This spike confirms that read; the v2.6 ROADMAP
should lead with this rather than slot it into a corner.
