import { homedir } from "node:os"
import path from "node:path"

/** OpenCode global config dir (`~/.config/opencode`). */
export function opencodeGlobalConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir()
  return path.join(home, ".config", "opencode")
}

export function resolveHomeRelative(p: string): string {
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2))
  return p
}
