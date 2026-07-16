import { AGENT_URL_CACHE_FILE, MODEL_CACHE_TTL_MS, CURSOR_AGENT_HOST } from "./shared.js"
import { fetchAgentUrl } from "./transport/connect.js"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

export type AgentUrlCache = {
  agentnUrl: string
  fetchedAt: number
}

export function isAgentUrlCacheFresh(cache: AgentUrlCache, ttlMs = MODEL_CACHE_TTL_MS): boolean {
  return Date.now() - cache.fetchedAt < ttlMs
}

export function agentUrlCacheFilePath(cacheDir: string): string {
  return path.join(cacheDir, AGENT_URL_CACHE_FILE)
}

export async function readAgentUrlCache(cacheDir: string): Promise<AgentUrlCache | null> {
  const filePath = agentUrlCacheFilePath(cacheDir)
  try {
    if (!existsSync(filePath)) return null
    const data = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(data) as Partial<AgentUrlCache>
    if (typeof parsed.agentnUrl !== "string" || typeof parsed.fetchedAt !== "number") return null
    return { agentnUrl: parsed.agentnUrl, fetchedAt: parsed.fetchedAt }
  } catch {
    return null
  }
}

export async function writeAgentUrlCache(cacheDir: string, cache: AgentUrlCache): Promise<void> {
  const filePath = agentUrlCacheFilePath(cacheDir)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(cache, null, 2), "utf-8")
}

/**
 * Resolve the Run stream origin for this account, mirroring `discoverModels`:
 *  - fresh cache → return it; fire-and-forget background refresh
 *  - stale/missing cache → await fetch, write, return
 *  - fetch fails → fall back to the hardcoded `CURSOR_AGENT_HOST` (never throw)
 *
 * Region routing changes rarely (account migration / team switch), so this
 * reuses `MODEL_CACHE_TTL_MS` (24h) rather than introducing a new TTL.
 */
export async function discoverAgentUrl(
  token: string,
  cacheDir: string,
  options: { baseURL?: string; headers?: Record<string, string> } = {},
): Promise<string> {
  const cached = await readAgentUrlCache(cacheDir)

  if (cached && isAgentUrlCacheFresh(cached)) {
    void fetchAgentUrl(token, options)
      .then((agentnUrl) => writeAgentUrlCache(cacheDir, { agentnUrl, fetchedAt: Date.now() }))
      .catch(() => { /* background refresh failure is non-fatal */ })
    return cached.agentnUrl
  }

  if (cached) {
    try {
      const agentnUrl = await fetchAgentUrl(token, options)
      await writeAgentUrlCache(cacheDir, { agentnUrl, fetchedAt: Date.now() })
      return agentnUrl
    } catch {
      return cached.agentnUrl
    }
  }

  try {
    const agentnUrl = await fetchAgentUrl(token, options)
    await writeAgentUrlCache(cacheDir, { agentnUrl, fetchedAt: Date.now() })
    return agentnUrl
  } catch {
    return `https://${CURSOR_AGENT_HOST}`
  }
}