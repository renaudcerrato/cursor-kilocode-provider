# cursor-kilocode-provider

Kilo Code plugin + AI SDK provider that runs Cursor subscription models by speaking Cursor’s Connect-RPC agent protocol (not a generic chat-completions API). This is a Kilo Code fork of [oakimov/cursor-opencode-provider](https://github.com/oakimov/cursor-opencode-provider); see `CONTRIBUTING.md` for the adaptation layer.

**Stack:** TypeScript (ESM), Bun for install/test, `tsc` for build. Peer: `@kilocode/plugin`. Deps: `@ai-sdk/provider`, `protobufjs`.

## Commands

```bash
bun install
bun run build        # tsc → dist/
bun run typecheck
bun test
bun run test:watch
```

Publish surface is `dist/` only (`files` in `package.json`). Always rebuild before testing a local `file://` Kilo Code install.

## Architecture

```
Kilo Code
  └── CursorPlugin (auth, model cache, config hook)
        └── createCursor() → LanguageModelV3
              ├── session.ts     held-open Run stream + exec bridge
              ├── context/       RequestContext from Kilo Code discovery
              ├── protocol/      protobuf encode/decode, tools, thinking
              └── transport/     Connect-RPC over HTTP/2
```

| Area | Path | Notes |
|------|------|--------|
| Package entry | `src/index.ts` | `createCursor`; default export = classic `CursorPlugin` |
| Classic plugin | `src/plugin.ts` | Auth, OAuth, model cache, provider registration |
| Language model | `src/language-model.ts` | AI SDK `LanguageModelV3` (`doStream` / `doGenerate`) |
| Session | `src/session.ts` | Held-open agent Run + pending exec correlation |
| Auth / models | `src/auth.ts`, `src/models.ts` | PKCE/API key, JWT refresh, `cursor-models.json` cache |
| Agent host | `src/agent-url.ts` | `GetServerConfig` → region-specific Run host (in-memory memo) |
| Request context | `src/context/` | Rules, skills, agents, plugins, git, layout, env |
| Wire protocol | `src/protocol/` | Framing, messages, tools, thinking, checksums, device id, tool-call bridge, interactions, conversation bind |
| Transport | `src/transport/connect.ts` | HTTP/2 bidi + unary RPC |
| Path helpers | `src/config.ts` | `kiloConfigDir` / `kiloGlobalCacheDir` / `kiloGlobalDataDir` (XDG) |

Package exports:

- `cursor-kilocode-provider` → `createCursor` + classic plugin
- `cursor-kilocode-provider/plugin` → classic Hooks (auth)

> This fork **dropped** `src/plugin-v2.ts` and the `./plugin/v2` export (upstream keeps them for the Effect/Promise v2 plugin API). Do not re-add them.

## Working conventions

- Prefer minimal, targeted changes. Fix root causes; no temporary workarounds.
- Do not commit unless the user (or an explicit implementation task) asks.
- Keep README accurate when behavior users care about changes (auth, env vars, architecture, limitations).
- Tests live in `test/` (Bun test). Mirror protocol/context behavior with unit tests when changing encode/decode or discovery.
- When integrating upstream, follow `CONTRIBUTING.md` (adaptation table + triage buckets).

## Context this provider sends to Cursor

`src/context/build.ts` builds Cursor `RequestContext` from Kilo Code-shaped discovery:

- First of `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` walking up to the git worktree
- Global `~/.config/kilo/AGENTS.md` and `~/.claude/CLAUDE.md`
- `instructions` globs from merged `kilo.json` / `kilo.jsonc` / `config.json` / `config.jsonc` / `opencode.json` / `opencode.jsonc` (including `.cursor/` **only** when listed)
- `.kilocode` / `.kilo` agents/skills/plugins, plus `.claude` / `.agents` skill fallbacks
- Git + project layout + env

When changing rule/skill discovery, keep parity with Kilo Code behavior and update `test/context.test.ts`.

## Critical behavioral constraints

- **Agent host:** resolve via `GetServerConfig` (`agentUrlConfig.agentnUrl`). Memoize once per process in memory; never write to disk; never silently fall back to a legacy global host on failure.
- **URL options:** `apiBaseURL` (auth/models/GetServerConfig) vs `agentBaseURL` (Run stream) are separate. Legacy `baseURL` aliases `agentBaseURL` only.
- **Host validation:** explicit agent overrides and GetServerConfig results must be HTTPS `*.cursor.sh`; reject others.
- **Telemetry:** `GetServerConfig` sends `telem_enabled: false` by default; opt in via `telemetryEnabled` or `CURSOR_GET_SERVER_CONFIG_TELEMETRY`.
- **Tool results:** strip Kilo Code’s `read` XML envelope before returning content to Cursor so the model cannot echo wrappers into writes.
- **Device identity:** stable OS-derived device ids (CLI-shaped); inventing new fingerprints risks “too many devices” errors.
- **Personal use:** private Cursor agent protocol; account you own; API can change without notice.

## Intentionally NOT adapted (wire identifiers)

These look like they should change but must stay as-is (see `CONTRIBUTING.md`):

- **`providerIdentifier = "opencode"` and the `opencode-` MCP prefix** in `src/protocol/tools.ts` — on-the-wire identifiers sent to Cursor's agent backend; changing them breaks the Cursor protocol contract.
- **`x-opencode-session` header** and the `cursor-opencode-provider:conv:` blob hash prefix** in `src/language-model.ts` — opaque correlation keys exchanged with Cursor; their literal value is arbitrary and must match upstream.

## Env / paths (quick)

| Variable / path | Role |
|-----------------|------|
| `CURSOR_API_BASE_URL` | Auth, models, GetServerConfig (default `https://api2.cursor.sh`) |
| `CURSOR_WEBSITE_URL` | OAuth login base |
| `CURSOR_PROVIDER_DEBUG` | Wire debug log (`CURSOR_PROVIDER_DEBUG_FILE`, default `/tmp/cursor-provider-debug.log`) |
| `CURSOR_GET_SERVER_CONFIG_TELEMETRY` | Opt in GetServerConfig telemetry |
| `KILO_AUTH_CONTENT` | Test-only auth injection hook (replaces upstream `OPENCODE_AUTH_CONTENT`) |
| `~/.cache/kilo/cursor-models.json` | Model cache (`$XDG_CACHE_HOME/kilo/` when set) |
| Kilo Code auth | `~/.local/share/kilo/auth.json` (`$XDG_DATA_HOME`) |
| Kilo Code config | `~/.config/kilo/` (`$XDG_CONFIG_HOME`) — `kilo.json`, AGENTS, skills, … |

## Docs map

| File | Purpose |
|------|---------|
| `README.md` | User-facing install, setup, troubleshooting |
| `AGENTS.md` | Canonical agent/project context (this file) |
| `CONTRIBUTING.md` | Upstream integration workflow + Kilo Code adaptation layer |
| `.claude/CLAUDE.md` | Pointer to `AGENTS.md` for Claude Code |
