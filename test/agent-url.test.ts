import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import {
  isAgentUrlCacheFresh,
  agentUrlCacheFilePath,
  readAgentUrlCache,
  writeAgentUrlCache,
  discoverAgentUrl,
} from "../src/agent-url.js"
import { resetClientVersionCache } from "../src/protocol/client-version.js"
import { CURSOR_AGENT_HOST } from "../src/shared.js"

const INSTALLER_FIXTURE = `var x="https://downloads.cursor.com/lab/2026.07.09-a3815c0/";`

function fakeJwt(ttlS: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + ttlS }
  return `header.${btoa(JSON.stringify(payload))}.sig`
}

describe("agent-url cache helpers", () => {
  it("isAgentUrlCacheFresh is true within TTL", () => {
    expect(isAgentUrlCacheFresh({ agentnUrl: "https://x", fetchedAt: Date.now() })).toBe(true)
  })

  it("isAgentUrlCacheFresh is false past TTL", () => {
    expect(
      isAgentUrlCacheFresh({ agentnUrl: "https://x", fetchedAt: Date.now() - 86_400_000 - 1 }),
    ).toBe(false)
  })

  it("agentUrlCacheFilePath joins cache dir + filename", () => {
    expect(agentUrlCacheFilePath("/tmp/cache")).toBe(
      path.join("/tmp/cache", "cursor-agent-url.json"),
    )
  })

  it("readAgentUrlCache returns null for missing file", async () => {
    expect(await readAgentUrlCache(path.join(os.tmpdir(), "no-such-dir-" + Date.now()))).toBeNull()
  })

  it("writeAgentUrlCache then readAgentUrlCache round-trips", async () => {
    const dir = path.join(os.tmpdir(), `agent-url-rt-${process.pid}-${Date.now()}`)
    await writeAgentUrlCache(dir, { agentnUrl: "https://agentn.us.api5.cursor.sh", fetchedAt: 123 })
    const got = await readAgentUrlCache(dir)
    expect(got).toEqual({ agentnUrl: "https://agentn.us.api5.cursor.sh", fetchedAt: 123 })
    await rm(dir, { recursive: true, force: true })
  })

  it("readAgentUrlCache returns null for malformed payload", async () => {
    const dir = path.join(os.tmpdir(), `agent-url-bad-${process.pid}-${Date.now()}`)
    await mkdir(dir, { recursive: true })
    const { writeFile } = await import("node:fs/promises")
    await writeFile(path.join(dir, "cursor-agent-url.json"), "{not json")
    expect(await readAgentUrlCache(dir)).toBeNull()
    await rm(dir, { recursive: true, force: true })
  })
})

describe("discoverAgentUrl", () => {
  let fakeHome: string
  let cacheDir: string
  let realFetch: typeof globalThis.fetch
  let serverConfigCalls: number

  beforeEach(async () => {
    fakeHome = path.join(
      os.tmpdir(),
      `agent-url-disc-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    process.env.HOME = fakeHome
    delete process.env.XDG_CACHE_HOME
    delete process.env.XDG_DATA_HOME
    cacheDir = path.join(fakeHome, ".cache", "opencode")
    await mkdir(cacheDir, { recursive: true })
    serverConfigCalls = 0
    realFetch = globalThis.fetch
    resetClientVersionCache()

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("GetServerConfig")) {
        serverConfigCalls += 1
        return Response.json({
          agentUrlConfig: {
            agentnUrl: "https://agentn.us.api5.cursor.sh",
            agentUrl: "https://agentn.us.api5.cursor.sh",
          },
        })
      }
      if (url.includes("cursor.com/install")) {
        return new Response(INSTALLER_FIXTURE, { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as typeof fetch
  })

  afterEach(async () => {
    globalThis.fetch = realFetch
    resetClientVersionCache()
    await rm(fakeHome, { recursive: true, force: true })
  })

  it("fetches and caches when no cache exists", async () => {
    const url = await discoverAgentUrl("token-abc", cacheDir)
    expect(url).toBe("https://agentn.us.api5.cursor.sh")
    expect(serverConfigCalls).toBe(1)
    expect(existsSync(agentUrlCacheFilePath(cacheDir))).toBe(true)
    const cached = await readAgentUrlCache(cacheDir)
    expect(cached?.agentnUrl).toBe("https://agentn.us.api5.cursor.sh")
  })

  it("returns cached url without fetching when cache is fresh", async () => {
    await writeAgentUrlCache(cacheDir, {
      agentnUrl: "https://agentn.eu.api5.cursor.sh",
      fetchedAt: Date.now(),
    })
    const url = await discoverAgentUrl("token-abc", cacheDir)
    expect(url).toBe("https://agentn.eu.api5.cursor.sh")
    // Background refresh is fire-and-forget; it may or may not have completed,
    // but the synchronous return must NOT depend on it. Assert no awaited call.
    expect(serverConfigCalls).toBeLessThanOrEqual(1)
  })

  it("re-fetches when cache is stale and updates the cache", async () => {
    await writeAgentUrlCache(cacheDir, {
      agentnUrl: "https://agentn.eu.api5.cursor.sh",
      fetchedAt: Date.now() - 86_400_000 - 1,
    })
    const url = await discoverAgentUrl("token-abc", cacheDir)
    expect(url).toBe("https://agentn.us.api5.cursor.sh")
    expect(serverConfigCalls).toBe(1)
    const cached = await readAgentUrlCache(cacheDir)
    expect(cached?.agentnUrl).toBe("https://agentn.us.api5.cursor.sh")
  })

  it("falls back to hardcoded CURSOR_AGENT_HOST when fetch fails and no cache", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down")
    }) as typeof fetch
    const url = await discoverAgentUrl("token-abc", cacheDir)
    expect(url).toBe(`https://${CURSOR_AGENT_HOST}`)
  })

  it("serves stale cache when fetch fails", async () => {
    await writeAgentUrlCache(cacheDir, {
      agentnUrl: "https://agentn.eu.api5.cursor.sh",
      fetchedAt: Date.now() - 86_400_000 - 1,
    })
    globalThis.fetch = (async () => {
      throw new Error("network down")
    }) as typeof fetch
    const url = await discoverAgentUrl("token-abc", cacheDir)
    expect(url).toBe("https://agentn.eu.api5.cursor.sh")
  })

  it("falls back when GetServerConfig returns no agentUrlConfig", async () => {
    globalThis.fetch = (async () => Response.json({})) as typeof fetch
    const url = await discoverAgentUrl(fakeJwt(3600), cacheDir)
    expect(url).toBe(`https://${CURSOR_AGENT_HOST}`)
  })
})