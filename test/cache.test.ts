import { describe, it, expect } from "vitest"
import { InMemoryCache } from "../src/cache"

describe("cache", () => {
  it("sets and gets", () => {
    const c = new InMemoryCache({ maxBytes: 1024 })
    c.set("n", "k", { a: 1 })
    expect(c.has("n", "k")).toBe(true)
    const v = c.get("n", "k")
    expect(JSON.parse(v!.toString())).toEqual({ a: 1 })
  })

  it("expires with ttl", async () => {
    const c = new InMemoryCache({ maxBytes: 1024, sweepIntervalMs: 10 })
    c.set("n", "k", "v", { ttlMs: 20 })
    expect(c.has("n", "k")).toBe(true)
    await new Promise(r => setTimeout(r, 30))
    expect(c.has("n", "k")).toBe(false)
  })

  it("evicts LRU when over budget", () => {
    const c = new InMemoryCache({ maxBytes: 10 })
    c.set("n", "a", "12345")
    c.set("n", "b", "12345")
    // both fit exactly, next set should evict LRU "a"
    c.set("n", "c", "1")
    expect(c.has("n", "a")).toBe(false)
    expect(c.has("n", "b")).toBe(true)
    expect(c.has("n", "c")).toBe(true)
  })
})