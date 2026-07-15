import { afterEach, describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import { kiloConfigDir } from "../src/config.js"

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

afterEach(() => {
  if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalXdgConfigHome
})

describe("kiloConfigDir", () => {
  it("uses Kilo's standard global configuration directory", () => {
    delete process.env.XDG_CONFIG_HOME

    expect(kiloConfigDir()).toBe(path.join(os.homedir(), ".config", "kilo"))
  })

  it("uses the XDG configuration home when set", () => {
    process.env.XDG_CONFIG_HOME = "/tmp/kilo-config"

    expect(kiloConfigDir()).toBe("/tmp/kilo-config/kilo")
  })
})
