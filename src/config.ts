import { homedir } from "node:os"
import path from "node:path"

function resolveHome(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir()
}

/** Kilo Code global config directory (`~/.config/kilo`). */
export function kiloConfigDir(): string {
  return path.join(process.env.XDG_CONFIG_HOME || path.join(resolveHome(), ".config"), "kilo")
}

/**
 * Kilo Code global cache directory (`~/.cache/kilo`).
 * Uses `$XDG_CACHE_HOME/kilo` when set, otherwise `$HOME/.cache/kilo`.
 * Model and client-version caches live here.
 */
export function kiloGlobalCacheDir(): string {
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, "kilo")
  }
  return path.join(resolveHome(), ".cache", "kilo")
}

/**
 * Kilo Code global data directory (`~/.local/share/kilo`).
 * Uses `$XDG_DATA_HOME/kilo` when set, otherwise `$HOME/.local/share/kilo`.
 * Auth credentials (`auth.json`) live here.
 */
export function kiloGlobalDataDir(): string {
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, "kilo")
  }
  return path.join(resolveHome(), ".local", "share", "kilo")
}
