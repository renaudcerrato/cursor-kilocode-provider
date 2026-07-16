import { afterEach, describe, expect, it } from "bun:test"
import path from "node:path"
import {
  kiloConfigDir,
  kiloGlobalCacheDir,
  kiloGlobalDataDir,
} from "../src/config.js"

const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE
const originalXdgConfig = process.env.XDG_CONFIG_HOME
const originalXdgCache = process.env.XDG_CACHE_HOME
const originalXdgData = process.env.XDG_DATA_HOME

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = originalUserProfile
  if (originalXdgConfig === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalXdgConfig
  if (originalXdgCache === undefined) delete process.env.XDG_CACHE_HOME
  else process.env.XDG_CACHE_HOME = originalXdgCache
  if (originalXdgData === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = originalXdgData
})

describe("kiloGlobalCacheDir", () => {
  it("defaults to $HOME/.cache/kilo", () => {
    process.env.HOME = "/tmp/fake-home"
    delete process.env.XDG_CACHE_HOME
    expect(kiloGlobalCacheDir()).toBe(path.join("/tmp/fake-home", ".cache", "kilo"))
  })

  it("uses $XDG_CACHE_HOME/kilo when set", () => {
    process.env.HOME = "/tmp/fake-home"
    process.env.XDG_CACHE_HOME = "/tmp/xdg-cache"
    expect(kiloGlobalCacheDir()).toBe(path.join("/tmp/xdg-cache", "kilo"))
  })

  it("falls back to USERPROFILE when HOME is unset", () => {
    delete process.env.HOME
    process.env.USERPROFILE = "/tmp/win-home"
    delete process.env.XDG_CACHE_HOME
    expect(kiloGlobalCacheDir()).toBe(path.join("/tmp/win-home", ".cache", "kilo"))
  })
})

describe("kiloConfigDir", () => {
  it("stays under $HOME/.config/kilo", () => {
    process.env.HOME = "/tmp/fake-home"
    delete process.env.XDG_CONFIG_HOME
    expect(kiloConfigDir()).toBe(path.join("/tmp/fake-home", ".config", "kilo"))
  })

  it("uses $XDG_CONFIG_HOME/kilo when set", () => {
    process.env.HOME = "/tmp/fake-home"
    process.env.XDG_CONFIG_HOME = "/tmp/xdg-config"
    expect(kiloConfigDir()).toBe(path.join("/tmp/xdg-config", "kilo"))
  })
})

describe("kiloGlobalDataDir", () => {
  it("defaults to $HOME/.local/share/kilo", () => {
    process.env.HOME = "/tmp/fake-home"
    delete process.env.XDG_DATA_HOME
    expect(kiloGlobalDataDir()).toBe(path.join("/tmp/fake-home", ".local", "share", "kilo"))
  })

  it("uses $XDG_DATA_HOME/kilo when set", () => {
    process.env.HOME = "/tmp/fake-home"
    process.env.XDG_DATA_HOME = "/tmp/xdg-data"
    expect(kiloGlobalDataDir()).toBe(path.join("/tmp/xdg-data", "kilo"))
  })
})