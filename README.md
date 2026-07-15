# cursor-kilocode-provider

> This is a Kilo Code fork of [oakimov/cursor-opencode-provider](https://github.com/oakimov/cursor-opencode-provider).

Use [Cursor](https://cursor.com) subscription models from Kilo Code by speaking Cursor's Connect-RPC agent protocol.

This project is a custom **AI SDK provider** (`LanguageModelV3`) plus a **Kilo Code plugin** that handles authentication and model discovery. Instead of calling a generic chat-completions API, it encodes and decodes Cursor's protobuf agent protocol over HTTP/2 to `agentn.global.api5.cursor.sh`.

> **Status:** Usable end-to-end in Kilo Code (auth, models, streaming, tools). See [Known limitations](#known-limitations).

## Demo

Kilo Code driving a Cursor-routed Grok model through this provider:

![Kilo Code running a Grok model via cursor-kilocode-provider](https://raw.githubusercontent.com/renaudcerrato/cursor-kilocode-provider/main/assets/opencode-grok.png)

## Features

- **Kilo Code integration** — registers a `cursor` provider with auth hooks and cached model list
- **Authentication** — browser OAuth (PKCE), or API key from [cursor.com/settings](https://cursor.com/settings)
- **Model discovery** — fetches available models from Cursor's API and caches them locally
- **Streaming** — bidirectional Connect-RPC stream for agent runs
- **Tool calls** — maps Cursor exec-server messages to AI SDK tool-call parts
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

Pin a version if you want: `"cursor-kilocode-provider@0.1.2"`.

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

If the `cursor` provider block is omitted, the classic plugin auto-registers it on startup (as **Cursor Integration**) using this package's entry. Model entries are filled from the local cache after you authenticate.

### Authenticate

```bash
kilo auth login
```

Choose the **cursor** provider, then one of:

| Method | Description |
|--------|-------------|
| **Cursor account (browser login)** | PKCE OAuth — opens cursor.com to sign in |
| **API key** | Paste a key from [cursor.com/settings](https://cursor.com/settings) (`sk-...`) |

After login, the plugin fetches your available models and writes them to `cursor-models.json` (`~/.config/kilo/`, or `CURSOR_CONFIG_DIR` if set).

### Select a model

Pick a model from the cached list (for example `composer-2.5`, `default`, or a Claude/GPT variant exposed by your subscription):

```bash
kilo run --model cursor/composer-2.5 "Hello from Cursor via Kilo Code"
```

## Programmatic usage

```ts
import { createCursor } from "cursor-kilocode-provider"

const cursor = createCursor({
  name: "cursor",
  accessToken: process.env.CURSOR_ACCESS_TOKEN,
})

const model = cursor.languageModel("composer-2.5")
// model implements AI SDK LanguageModelV3 (doStream / doGenerate)
```

Pass either `accessToken` (JWT from OAuth or key exchange) or `apiKey` (raw `sk-...` key). Optional: `baseURL`, `headers`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `CURSOR_CONFIG_DIR` | Override directory for `cursor-models.json` cache (defaults to the Kilo Code directory passed into the plugin) |
| `CURSOR_WEBSITE_URL` | Override OAuth login base URL (default `https://cursor.com`) |
| `CURSOR_API_BASE_URL` | Override API base for auth and model discovery (default `https://api2.cursor.sh`) |
| `CURSOR_PROVIDER_DEBUG` | Set to `1` or `true` to enable wire-level debug logging |
| `CURSOR_PROVIDER_DEBUG_FILE` | Debug log path (default `/tmp/cursor-provider-debug.log`) |

`createCursor({ baseURL })` also overrides the agent Run host (default `https://agentn.global.api5.cursor.sh`).

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
              └── transport/  Connect-RPC over HTTP/2 to agentn.global.api5.cursor.sh
```

| Module | Role |
|--------|------|
| `src/plugin.ts` | Classic Kilo Code hooks: provider registration, OAuth, API key exchange, token refresh |
| `src/index.ts` | `createCursor` factory; default export is `CursorPlugin` |
| `src/language-model.ts` | AI SDK `LanguageModelV3` adapter (`doStream`, `doGenerate`) |
| `src/session.ts` | Held-open agent Run session and pending exec correlation |
| `src/auth.ts` | PKCE OAuth, API key exchange, JWT refresh |
| `src/models.ts` | `AvailableModels` fetch and `cursor-models.json` cache |
| `src/transport/connect.ts` | HTTP/2 bidi stream and unary RPC calls |
| `src/protocol/` | Protobuf encode/decode, checksum/device ids, tool-call mapping |

## Package exports

| Import path | Export |
|-------------|--------|
| `cursor-kilocode-provider` | `createCursor`, `CursorPlugin` (named + default) |
| `cursor-kilocode-provider/plugin` | `CursorPlugin` (classic Hooks — auth) |

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| No Cursor models in the picker | Run `kilo auth login`, choose **cursor**, then restart Kilo Code so the plugin reloads `cursor-models.json`. Confirm `provider.cursor.npm` is the package name (or a built `file://…/dist/index.js`). |
| Auth / 401 errors mid-session | Re-login. OAuth and exchanged API-key JWTs refresh automatically when near expiry; a revoked refresh token needs a fresh login. |
| “Too many connections from different devices” | Device IDs are derived from stable OS identifiers (same approach as the Cursor CLI). Avoid running multiple clients that invent different machine fingerprints for the same account. |
| Empty or stale model list | Delete `~/.config/kilo/cursor-models.json` (or the file under `CURSOR_CONFIG_DIR`), then re-authenticate and restart Kilo Code. Cache TTL is 24h; a failed background refresh keeps serving the previous cache. |
| Stream hangs or HTTP/2 errors | Abort the turn and retry. The agent Run uses a bidirectional HTTP/2 stream to `agentn.global.api5.cursor.sh`; a dropped connection leaves the in-flight session unusable. |
| Need wire-level logs | Set `CURSOR_PROVIDER_DEBUG=1` (optional `CURSOR_PROVIDER_DEBUG_FILE`, default `/tmp/cursor-provider-debug.log`) and reproduce the issue. |

## Known limitations

- **Personal use / ToS** — this provider speaks Cursor’s private agent protocol (CLI-shaped client identity). Use only with an account you own; Cursor may change or restrict the API without notice.
- **`request_context` from Kilo Code** — each Run sends Cursor `RequestContext` built from Kilo Code project context (workspace env, `AGENTS.md` / `instructions`, `.kilocode` and `.kilo` agents/skills/plugins, git, layout, plus `.claude`/`.agents` skill fallbacks). `.cursor/` paths are included only when listed in `instructions`. Cursor-only cloud/sandbox marketplace surfaces are omitted.
- **Tool-call display stub** — semantic `tool_call_started` frames are only partially decoded. Tool execution itself goes through the exec channel and works; UI that relied solely on the display type would be incomplete.
- **No fallback models** — if Cursor’s `AvailableModels` API is unreachable and there is no local cache, the provider exposes no models.

## License

MIT
