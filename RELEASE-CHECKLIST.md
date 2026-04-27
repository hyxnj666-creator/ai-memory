# Release Checklist

> One-stop gate for shipping a new `ai-memory-cli` version to npm. Copy-paste the
> whole block into an issue or scratch file when cutting a release.
>
> **Cutting `2.5.0`?** Read [`docs/v2.5-maintainer-handoff.md`](docs/v2.5-maintainer-handoff.md)
> first — there are four release-gated tasks (GIF render + benchmark run +
> AGENTS.md eval + marketplace submissions) that need to land in a specific
> order alongside this checklist.

## Preflight

### Code quality
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm test` — all tests pass (431 at v2.4.0; should only ever go up)
- [ ] `npm run build` — succeeds, `dist/` regenerated
- [ ] `npm run bench:cceb:dry` — passes with no LLM call (catches scorer/loader regressions cheaply)
- [ ] `npm pack --dry-run` — tarball contains only `dist/`, `README.md`, `README.zh-CN.md`, `LICENSE`, `package.json` (no tests, fixtures, bench/, docs/, scenario/)

### Docs
- [ ] `CHANGELOG.md` top entry matches the new version (date + highlights)
- [ ] `README.md` updated for any user-facing changes
- [ ] `README.zh-CN.md` kept in sync
- [ ] `ROADMAP.md` — any completed items checked off, v-next focus clear
- [ ] If decisions were made, new ADR dropped in `docs/decisions/`

### Package
- [ ] `package.json` version bumped (semver)
- [ ] `files` field covers `dist`, `README.md`, `README.zh-CN.md`, `LICENSE`
- [ ] `bin.ai-memory` points to `./dist/index.js`
- [ ] `engines.node` is `>=18`
- [ ] `repository.url`, `homepage`, `bugs.url` point to `https://github.com/hyxnj666-creator/ai-memory`

### Smoke tests (real CLI against `dist/`)
```bash
node dist/index.js --version            # prints ai-memory v<N>
node dist/index.js --help               # full help, no warnings
node dist/index.js try --json           # bundled scenario found, AGENTS.md generated, tmp cleaned (v2.5+)
node dist/index.js list                 # detects Cursor/Claude/Windsurf/Copilot/Codex CLI as applicable (v2.5-06+)
node dist/index.js extract --dry-run --pick 1   # dry-run extraction works
node dist/index.js dashboard --port 3157 &      # web UI serves on :3157
curl -s http://localhost:3157/api/stats | head  # returns JSON, kill the process after
node dist/index.js serve --debug &       # MCP handshake works (Ctrl+C to stop)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js serve | head -c 200
node dist/index.js export --output /tmp/bundle.json && \
  node dist/index.js import /tmp/bundle.json --dry-run
```

- [ ] No `ExperimentalWarning` leaks on any of the above
- [ ] MCP server responds to `tools/list` with `remember`, `recall`, `search_memories`

## Publishing

```bash
# 1. Build
npm run build

# 2. Log in to npm (if not already)
npm whoami || npm login

# 3. Publish
npm publish --access public

# 4. Git tag
git tag v<N.N.N>
git push origin v<N.N.N>
```

## Post-release

- [ ] Push `main` with the version bump commit
- [ ] Verify the package renders correctly on <https://www.npmjs.com/package/ai-memory-cli>
- [ ] Create a GitHub release with the CHANGELOG excerpt as the body
- [ ] Launch content (only for `.0` releases): Dev.to long-form, Reddit post, HN submission — see [docs/launch-plan.md](docs/launch-plan.md)
