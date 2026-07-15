import { homedir } from "node:os"
import path from "node:path"

/** Kilo Code global config directory (`~/.config/kilo`). */
export function kiloConfigDir(): string {
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "kilo")
}
