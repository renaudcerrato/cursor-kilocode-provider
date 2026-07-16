# Contributing

This is a Kilo Code fork of [oakimov/cursor-opencode-provider](https://github.com/oakimov/cursor-opencode-provider). Most upstream changes are path-agnostic (protocol, framing, tool mapping, session handling) and apply cleanly. A small, stable set of divergence points needs manual adaptation when integrating upstream changes.

This document lists those points so future integrations stay mechanical and repeatable.

## Integrating upstream changes

### 1. Track upstream (one-time)

```sh
git remote add upstream https://github.com/oakimov/cursor-opencode-provider.git
git fetch upstream
```

### 2. See what changed since the last integration

```sh
git log --oneline upstream/main ^main
git diff main upstream/main -- src/ test/ README.md
```

Use `git diff` (content), not just `git log` (commits). Upstream may merge a PR you already ported, so the commit list overstates the delta.

### 3. Triage each commit

| Bucket | Action |
|--------|--------|
| Path-agnostic (protocol, tool mapping, framing, session, tests for those) | Cherry-pick, resolve trivially |
| Path/SDK-sensitive (cache/auth/config/paths/plugin imports/README) | Cherry-pick, then re-apply the adaptation from the table below |
| OpenCode-only (CI, opencode plugin-v2, opencode-specific config) | Skip |

### 4. Cherry-pick and adapt

```sh
git checkout -b integrate/upstream-<topic>
git cherry-pick <sha>
```

Resolve conflicts using the adaptation table below, then verify.

### 5. Verify

```sh
bun run typecheck && bun run build && bun test
```

The test suite (247 tests) asserts the Kilo Code paths and auth behavior. A missed adaptation will fail loudly rather than ship the wrong paths.

## Adaptation layer

The entire fork maintenance burden is this table. Apply it when resolving conflicts.

### XDG paths (`src/config.ts`, `src/context/paths.ts`)

| Upstream (OpenCode) | This fork (Kilo Code) | Helper |
|---------------------|-----------------------|--------|
| `~/.config/opencode` | `~/.config/kilo` | `kiloConfigDir()` |
| `~/.cache/opencode` | `~/.cache/kilo` | `kiloGlobalCacheDir()` |
| `~/.local/share/opencode` | `~/.local/share/kilo` | `kiloGlobalDataDir()` |

All three honor `$XDG_CONFIG_HOME` / `$XDG_CACHE_HOME` / `$XDG_DATA_HOME` respectively and fall back to `HOME`/`USERPROFILE`/`homedir()`.

Upstream uses `opencodeGlobalConfigDir()` / `opencodeGlobalCacheDir()` / `opencodeGlobalDataDir()` from `src/context/paths.ts`. This fork keeps the path helpers in `src/config.ts` alongside `kiloConfigDir()`.

### Env vars

| Upstream | This fork | Notes |
|----------|-----------|-------|
| `OPENCODE_AUTH_CONTENT` | `KILO_AUTH_CONTENT` | Test-only auth injection hook in `src/context/auth-store.ts`. Kilo Code core does not export one; this is a provider-local test affordance. |
| `CURSOR_CONFIG_DIR` | *(removed)* | Upstream PR #3 dropped this override; the cache now resolves exclusively through the XDG helpers. Do not re-introduce it. |

### SDK / plugin imports

| Upstream | This fork |
|----------|-----------|
| `@opencode-ai/plugin` | `@kilocode/plugin` |
| `@opencode-ai/sdk` (for `Auth`) | `@kilocode/sdk/v2` (for `Auth`) |

The `Auth` type comes from `@kilocode/sdk/v2` because that is where `@kilocode/plugin` itself sources it (see the plugin package's `index.d.ts` re-export). The v2 `OAuth` type carries `accountId` and `enterpriseUrl`; preserve them on refresh.

`package.json` `peerDependencies` and `devDependencies` use `@kilocode/plugin` (current: `^7.4.7`).

### Project discovery directories (`src/context/`)

Upstream scans `.opencode/`. This fork scans both `.kilocode/` and `.kilo/` (Kilo Code accepts either), plus the unchanged `.claude/` and `.agents/` fallbacks.

| Upstream | This fork |
|----------|-----------|
| `.opencode/agents` | `.kilocode/agents` and `.kilo/agents` |
| `.opencode/skills` | `.kilocode/skills` and `.kilo/skills` |
| `.opencode/plugins` | `.kilocode/plugins` and `.kilo/plugins` |
| layout skip rule: `name !== ".opencode"` | `[".kilocode", ".kilo", ".claude", ".agents"].includes(name)` |

Affected files: `src/context/agents.ts`, `src/context/skills.ts`, `src/context/plugins.ts`, `src/context/layout.ts`.

### Config filenames (`src/context/rules.ts`)

| Upstream | This fork |
|----------|-----------|
| `opencode.json`, `opencode.jsonc` | `config.json`, `config.jsonc`, `kilo.json`, `kilo.jsonc`, `opencode.json`, `opencode.jsonc` |

This fork reads all of them (Kilo Code's primary is `kilo.json`/`config.json`; `opencode.json` is kept for migration). `loadMergedConfig` merges global + project config the same way, but ignores malformed files instead of returning `{}` on the first bad file (Kilo Code treats these as optional context).

### Dropped: plugin-v2

This fork **removed** `src/plugin-v2.ts` and the `./plugin/v2` package export. Upstream keeps them for the Effect/Promise v2 plugin API.

- Do **not** re-add `src/plugin-v2.ts`.
- Do **not** re-add the `./plugin/v2` entry in `package.json` `exports`.
- `src/index.ts` does not re-export `CursorPluginV2` (upstream's comment about the legacy loader is also removed).

If upstream changes `plugin-v2.ts`, the change is irrelevant to this fork — skip it.

### Package identity (`package.json`)

| Upstream | This fork |
|----------|-----------|
| `name`: `cursor-opencode-provider` | `name`: `cursor-kilocode-provider` |
| repo / issues / homepage URLs | `renaudcerrato/cursor-kilocode-provider` |
| keywords | add `kilo`, `kilocode`; drop nothing |
| `peerDependencies` | `@kilocode/plugin` |

### Auth store

`src/context/auth-store.ts` reads `auth.json` from `kiloGlobalDataDir()` (default `~/.local/share/kilo`). Upstream's equivalent reads from the OpenCode data dir. The `StoredAuth` type and `asStoredAuth` validation are otherwise identical.

The loader (`src/plugin.ts`) prefers Kilo Code's live `getAuth()`, falls back to the durable store, and keeps an in-memory `sessionAccessToken` so a refresh that succeeded in-process but failed to persist is still usable. Preserve this ordering when porting loader changes.

## Intentionally NOT adapted

These look like they should change but must stay as-is:

- **`providerIdentifier = "opencode"` and the `opencode-` MCP prefix** in `src/protocol/tools.ts`. These are on-the-wire identifiers sent to Cursor's agent backend, not local paths. Upstream uses the identical values. Changing them would break the Cursor protocol contract (Cursor routes tool calls back by this identifier). Leave `src/protocol/tools.ts` identifiers alone unless upstream itself changes them.
- **`x-opencode-session` header** and the `cursor-opencode-provider:conv:` blob hash prefix** in `src/language-model.ts`. These are opaque correlation keys exchanged with Cursor; their literal value is arbitrary and must match upstream.

## Notes

- The `opencode` word appears in many comments and variable names inside `src/protocol/tools.ts` (`opencodeToolToCursor`, etc.). These describe the Cursor<->host tool bridge and are identical upstream. Rewriting them is cosmetic and increases merge friction — leave them unless upstream renames them.
- When in doubt about whether something is path-agnostic, check: `git diff main upstream/main -- <file>`. If the diff only touches paths/imports/config names, it's a path-sensitive change; apply the table. If it touches logic, it's path-agnostic; cherry-pick as-is.