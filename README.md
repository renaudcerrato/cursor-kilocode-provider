# cursor-kilocode-provider

> This is a Kilo Code fork of [oakimov/cursor-opencode-provider](https://github.com/oakimov/cursor-opencode-provider).

Use [Cursor](https://cursor.com) subscription models from Kilo Code by speaking Cursor's Connect-RPC agent protocol.

This project is a custom **AI SDK provider** (`LanguageModelV3`) plus a **Kilo Code plugin** that handles authentication and model discovery. Instead of calling a generic chat-completions API, it encodes and decodes Cursor's protobuf agent protocol over HTTP/2 to Cursor's agent backend.

> **Status:** Usable end-to-end in Kilo Code (auth, models, streaming, tools). See [Known limitations](#known-limitations).

## Features

- **Kilo Code integration** — registers a `cursor` provider with auth hooks and cached model list
- **Authentication** — browser OAuth (PKCE), or API key from [cursor.com/settings](https://cursor.com/settings)
- **Model discovery** — fetches available models from Cursor's API and caches them locally
- **Streaming** — bidirectional Connect-RPC stream for agent runs, with stale HTTP/2 connection rotation and one transparent history rebase when a Run is interrupted before its terminal event
- **Tool calls** — maps Cursor exec-server messages to AI SDK / OpenCode tool-call parts, including native subagent/Task execution and the Pi read/bash/edit/write/grep/find/ls request/result field range; mirrors finalized display-only todo/plan state into OpenCode; strips OpenCode's `read` XML envelope (`<path>`/`<content>` + `N:` prefixes) before returning content to Cursor so the model cannot echo the wrapper into writes
- **Thinking / reasoning** — surfaces extended-thinking deltas where the model supports it

## Requirements

- [Bun](https://bun.sh) (for development and tests)
- Kilo Code with plugin support
- An active Cursor account with API access

## Installation

### From npm (after publish)

Add the package name to Kilo Code config under `~/.config/kilo/`:

```json
{
  "$schema": "https://app.kilo.ai/config.json",
  "plugin": ["cursor-kilocode-provider"],
  "provider": {
    "cursor": {
      "npm": "cursor-kilocode-provider",
      "name": "Cursor",
      "models": {}
    }
  }
}
```

Pin a version if you want: `"cursor-kilocode-provider@0.2.1"`.

### From a local clone

```bash
git clone https://github.com/renaudcerrato/cursor-kilocode-provider.git
cd cursor-kilocode-provider
bun install
bun run build
```

Point config at the built files with absolute `file://` URLs:

```json
{
  "plugin": ["file:///absolute/path/to/cursor-kilocode-provider/dist/plugin.js"],
  "provider": {
    "cursor": {
      "npm": "file:///absolute/path/to/cursor-kilocode-provider/dist/index.js",
      "name": "Cursor",
      "models": {}
    }
  }
}
```

## Kilo Code setup

If the `cursor` provider block is omitted, the classic plugin auto-registers it on startup (as **Cursor Integration**) using this package's entry. Model entries come from the local cache, which is filled after auth and again on startup when the cache is empty but credentials remain.
### Authenticate

```bash
kilo auth login
```

Choose the **cursor** provider, then one of:

| Method | Description |
|--------|-------------|
| **Cursor account (browser login)** | PKCE OAuth — opens cursor.com to sign in |
| **API key** | Paste a key from [cursor.com/settings](https://cursor.com/settings) (`sk-...`) |

After login, the plugin fetches your available models and writes them to `~/.cache/kilo/cursor-models.json` (or `$XDG_CACHE_HOME/kilo/` when set). On later startups, a missing, empty, expired, or old-schema cache is refreshed during config load when Cursor auth is available; an existing stale cache remains usable if refresh fails.

### Paths (XDG)

| Kind | Default | Override |
|------|---------|----------|
| Model / version **cache** | `~/.cache/kilo/` | `$XDG_CACHE_HOME/kilo/` |
| Kilo Code **auth** (`auth.json`) | `~/.local/share/kilo/` | `$XDG_DATA_HOME/kilo/` |
| Kilo Code **config** (`kilo.json`, AGENTS, skills, …) | `~/.config/kilo/` | `$XDG_CONFIG_HOME` |

### Select a model

Pick a model from the cached list (for example `composer-2.5`, `default`, or a Claude/GPT model exposed by your subscription):

```bash
kilo run --model cursor/composer-2.5 "Hello from Cursor via Kilo Code"
```

#### Variants

Cursor models often expose parameterized variants (effort, thinking, fast, context tier, …). The plugin materializes those as OpenCode **model variants**. In the TUI, pick one from the variant dialog or cycle with OpenCode’s `variant_cycle` keybind (default `ctrl+t`).

The selected variant’s Cursor parameter map is forwarded on the Run as `requested_model.parameters` (isolated under `providerOptions.cursor.cursorVariantParameters` so unrelated OpenCode options are not leaked onto the wire).

#### 1M / long context

OpenCode’s context limit is static per model entry, while Cursor’s long-context tier is a variant parameter (`context=1m`). When a model has both a base tier and a `1m` tier, the plugin emits a separate OpenCode entry `<model-id>-1m` (for example `claude-opus-4-8-1m`) with:

- `limit.context` set to the 1M window (so overflow checks and compaction match the tier)
- `limit.output` set to `128000` (max generation tokens — not the context window; base entries use `32000`)
- only the long-context variants in its picker
- the real Cursor model id carried in `options.cursorModelId` (not `config.id`, which would make OpenCode merge base variants into the 1M entry)

The Run still uses Cursor’s original model id; OpenCode’s synthetic `-1m` id is only for picking and limits.

#### Max mode

Cursor IDE has a separate **Max Mode** toggle that sets `requested_model.max_mode` and selects the default max / 1m variant. OpenCode has no equivalent custom toggle, so this provider approximates it:

- Selecting a `*-1m` model (or any resolved params with `context=1m`) sets wire `max_mode` to `true`
- An explicit `providerOptions.cursor.maxMode` hint also turns it on

There is no independent Max Mode chrome in OpenCode beyond choosing the 1M model / long-context variant.

## Programmatic usage

```ts
import { createCursor } from "cursor-kilocode-provider"

const cursor = createCursor({
  name: "cursor",
  accessToken: process.env.CURSOR_ACCESS_TOKEN,
  // apiBaseURL: "https://api2.cursor.sh",
  // agentBaseURL: "https://agentn.us.api5.cursor.sh", // explicit Run host override
  // telemetryEnabled: true, // opt in to GetServerConfig telemetry
})

const model = cursor.languageModel("composer-2.5")
// model implements AI SDK LanguageModelV3 (doStream / doGenerate)
```

Pass either `accessToken` (JWT from OAuth or key exchange) or `apiKey` (raw `sk-...` key). Optional: `apiBaseURL`, `agentBaseURL`, `headers`, `telemetryEnabled`. The older `baseURL` option is still accepted as a legacy alias for `agentBaseURL`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `CURSOR_WEBSITE_URL` | Override OAuth login base URL (default `https://cursor.com`) |
| `CURSOR_API_BASE_URL` | Override API base for auth, model discovery, and `GetServerConfig` agent URL resolution (default `https://api2.cursor.sh`) |
| `CURSOR_GET_SERVER_CONFIG_TELEMETRY` | Set to `1` or `true` to opt the `GetServerConfig` lookup into telemetry in Kilo Code/plugin usage |
| `CURSOR_PROVIDER_DEBUG` | Set to `1` or `true` to enable wire-level debug logging |
| `CURSOR_PROVIDER_DEBUG_FILE` | Debug log path (default `/tmp/cursor-provider-debug.log`) |
| `XDG_CACHE_HOME` | When set, model/version caches go under `$XDG_CACHE_HOME/kilo/` instead of `~/.cache/kilo/` |
| `XDG_DATA_HOME` | When set, Kilo Code `auth.json` is read from `$XDG_DATA_HOME/kilo/` instead of `~/.local/share/kilo/` |

`createCursor({ agentBaseURL })` overrides the agent Run host. When unset, the provider resolves the host from Cursor's `GetServerConfig` API (`agentUrlConfig.agentnUrl`, region-specific — e.g. `agentn.us.api5.cursor.sh`, `agent-gcpp-uswest.api5.cursor.sh`) once per process and holds it in memory (never written to disk), so a held-open Run stream is never repointed mid-session. Explicit agent overrides and GetServerConfig results are validated as HTTPS `*.cursor.sh` hosts (Cursor's agent hostnames vary and may change); non-`cursor.sh` hosts are rejected. Shared HTTP/2 connections are rotated before they become server-aged, while existing Runs may finish on their original connection. The lookup sends `{ "telem_enabled": false }` by default; set `telemetryEnabled: true` in provider config, or `CURSOR_GET_SERVER_CONFIG_TELEMETRY=1` for Kilo Code/plugin usage, to opt in. If the lookup fails or does not return a valid Cursor agent host, the model call fails clearly instead of falling back to `agentn.global.api5.cursor.sh`.

## Development

```bash
bun install          # install dependencies
bun run build        # compile TypeScript → dist/
bun run typecheck    # type-check without emit
bun test             # run unit tests
bun run test:watch   # watch mode
```

## Architecture

```
Kilo Code
  └── CursorPlugin (auth, model cache, config hook)
        └── createCursor() → LanguageModelV3
              ├── session.ts  held-open Run stream + exec bridge
              ├── protocol/   protobuf messages, framing, tools, thinking
              └── transport/  Connect-RPC over HTTP/2 to Cursor's agent backend
```

| Module | Role |
|--------|------|
| `src/plugin.ts` | Classic Kilo Code hooks: provider registration, OAuth, API key exchange, token refresh |
| `src/index.ts` | `createCursor` factory; default export is `CursorPlugin` |
| `src/language-model.ts` | AI SDK `LanguageModelV3` adapter (`doStream`, `doGenerate`) |
| `src/session.ts` | Held-open agent Run session and pending exec correlation |
| `src/debug.ts` | Opt-in wire-level debug logging (`CURSOR_PROVIDER_DEBUG`) |
| `src/auth.ts` | PKCE OAuth, API key exchange, JWT refresh |
| `src/models.ts` | `AvailableModels` fetch and `cursor-models.json` cache |
| `src/agent-url.ts` | `GetServerConfig` fetch + in-process memo (region-specific Run host) |
| `src/transport/connect.ts` | HTTP/2 bidi stream and unary RPC calls |
| `src/protocol/` | Protobuf encode/decode, checksum/device ids, exec + display tool-call mapping (`tool-call-bridge.ts`) |

## Package exports

| Import path | Export |
|-------------|--------|
| `cursor-kilocode-provider` | `createCursor`, `CursorPlugin` (named + default) |
| `cursor-kilocode-provider/plugin` | `CursorPlugin` (classic Hooks — auth) |

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| No Cursor models in the picker | Confirm Cursor auth (`kilo auth login` → **cursor**). Restart Kilo Code — if auth is present and the cache is empty, models are fetched on startup. Confirm `provider.cursor.npm` is the package name (or a built `file://…/dist/index.js`). |
| Auth / 401 errors mid-session | Re-login. OAuth and exchanged API-key JWTs refresh automatically when near expiry; a revoked refresh token needs a fresh login. |
| “Too many connections from different devices” | Device IDs are derived from stable OS identifiers (same approach as the Cursor CLI). Avoid running multiple clients that invent different machine fingerprints for the same account. |
| Empty or stale model list | Delete `~/.cache/kilo/cursor-models.json` (or under `$XDG_CACHE_HOME/kilo/`) and restart Kilo Code. Existing Cursor auth is enough to refill the cache; re-login only if auth itself is broken. Cache TTL is 24h; a failed background refresh keeps serving the previous cache. |
| Stream hangs or HTTP/2 errors | The provider keeps Cursor's Run open across Kilo Code tool calls, rotates aged shared connections, and transparently rebases once from full Kilo Code history if the Run ends before `turn_ended`. Repeated interruption is surfaced as an error instead of a false successful stop; retry the turn after checking connectivity. With debug logging enabled, look for `Run interrupted` and `rebasing fresh Run`. Restart Kilo Code after rebuilding a local `file://` install. |
| No response / silent 200 + close | HTTP 200 alone is not a successful agent turn: the provider now requires Cursor's explicit `turn_ended`, captures HTTP/2 trailers/GOAWAY, and recovers once from bare EOF. The Run host still comes from in-memory `GetServerConfig` resolution; set `CURSOR_PROVIDER_DEBUG=1` to confirm the host and termination reason. |
| Need wire-level logs | Set `CURSOR_PROVIDER_DEBUG=1` (optional `CURSOR_PROVIDER_DEBUG_FILE`, default `/tmp/cursor-provider-debug.log`) and reproduce the issue. |

## Known limitations

- **Personal use / ToS** — this provider speaks Cursor’s private agent protocol (CLI-shaped client identity). Use only with an account you own; Cursor may change or restrict the API without notice.
- **`request_context` from Kilo Code** — each Run sends Cursor `RequestContext` built from Kilo Code project context (workspace env, `AGENTS.md` / `instructions`, `.kilocode` and `.kilo` agents/skills/plugins, git, layout, plus `.claude`/`.agents` skill fallbacks). Same discovery as Kilo Code — including `.cursor/` paths only when listed in `instructions`. Cursor-only cloud/sandbox marketplace surfaces are omitted.
- **Configured MCP tools keep their upstream server id** — Kilo Code builtins and plugin/custom tools are advertised under a synthetic `opencode` MCP server. Tools whose flattened name matches an MCP server in merged `kilo.json` configuration (`github_create_pull_request`, …) are grouped into that server's `mcp_descriptors` / `provider_identifier` (`github`, …). Unknown underscore-containing names stay under `opencode` rather than being guessed incorrectly. Cursor's MCP-state exec probe is answered from the same advertised descriptors before the actual tool request, and exec still reconstructs the full Kilo Code tool id.
- **Display completions are notifications, not execution requests** — Cursor `tool_call_*` frames use a typed `ToolCall` oneof. The provider decodes them for diagnostics but only mirrors finalized todo/plan state (`update_todos_tool_call` / `create_plan_tool_call`) into advertised Kilo Code `todowrite`; the completed payload already contains the authoritative final list. Interactive, data-returning, and side-effecting completions are never replayed as new tools because their result could not be returned to Cursor. Exec-backed native subagent/Task and Pi read/bash/edit/write/grep/find/ls calls use their typed request/result fields instead. Unknown display variants are logged; unknown exec variants fail the turn explicitly rather than receiving a guessed response that could deadlock the Run.
- **Cursor-native interaction queries remain headless** — Cursor UI/approval *queries* (as distinct from display tool calls) still cannot be surfaced through the AI SDK provider interface. The normal system prompt redirects questions, planning, plan-mode transitions, and known-URL fetching to equivalent Kilo Code tools only when they are advertised (`question`, `todowrite`, `plan_enter` / `plan_exit`, `webfetch`); native web/PR/MCP/image/SCM requests are declined so they remain behind Kilo Code's tools and permissions. Compaction prompts are unchanged. Unknown future interaction variants fail the turn explicitly instead of hanging the Run stream.
- **Compaction resets Cursor conversation state** — the classic plugin marks Kilo Code's `compaction` agent explicitly. On those turns the provider mints an isolated Cursor `conversation_id`, drops the prior checkpoint + KV blobs, preserves real tool-result text in the seed history, and re-advertises the session's last tool catalog while refusing execution during the summary itself. The first normal turn then rebases once more onto a fresh conversation seeded with Kilo Code's compacted prompt and normal system instructions, so the summary-agent checkpoint cannot suppress later tool calls. Ordinary no-tool / `toolChoice:none` calls do not reset conversation state.
- **Conversation bindings and compaction catalogs are bounded** — process-global per-session bindings, prior tool catalogs, and pending post-compaction rebases use a 256-session LRU bound. Evicting a conversation binding also drops its checkpoint and KV blobs.
- **Interrupted Runs rebase once** — a remote EOF, Connect end-stream, trailer error, failed continuation write, or closed pending-tool session is never emitted as a successful `stop`. The provider starts one fresh Cursor conversation seeded from the complete Kilo Code prompt (including trailing tool results and the live user request), re-advertises the same tools, and preserves compaction's no-execution behavior. A second interruption is returned as an explicit error. Recovery cannot see tokens already streamed to the UI on the interrupted attempt, so mid-generation recovery may briefly duplicate visible text/reasoning even though the rebase prompt asks the model not to repeat completed work.
- **No fallback models** — if Cursor’s `AvailableModels` API is unreachable and there is no local cache, the provider exposes no models.

## License

MIT
