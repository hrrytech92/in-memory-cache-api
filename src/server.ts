// Minimal REST API over the cache using Express

import express from "express"
import bodyParser from "body-parser"
import { InMemoryCache } from "./cache"

const app = express()
// parse JSON payloads for set operations
app.use(bodyParser.json())

// create cache with defaults or env overrides
const cache = new InMemoryCache({
  maxBytes: parseInt(process.env.CACHE_MAX_BYTES || "", 10) || 64 * 1024 * 1024,
  sweepIntervalMs: parseInt(process.env.CACHE_SWEEP_MS || "", 10) || 2000,
})

// health and stats
app.get("/health", (_req, res) => {
  // quick health check
  res.json({ ok: true })
})

app.get("/stats", (_req, res) => {
  // expose cache stats for inspection
  res.json(cache.stats())
})

// set value
app.put("/cache/:ns/:key", (req, res) => {
  // read namespace and key
  const { ns, key } = req.params
  // value can be string or object, support TTL via query
  const { ttlMs } = req.query
  const ttl = ttlMs ? parseInt(ttlMs as string, 10) : undefined
  const value = req.body?.value ?? req.body

  if (value === undefined) {
    // require a value field
    return res.status(400).json({ error: "missing value" })
  }

  console.log(`[CACHE] Setting key: ${ns}/${key}`)
  console.log(`[CACHE] Value:`, value)
  console.log(`[CACHE] TTL (ms):`, ttl)

  cache.set(ns, key, value, { ttlMs: ttl })
  res.status(204).end()
})

// get value
app.get("/cache/:ns/:key", (req, res) => {
  const { ns, key } = req.params
  const buf = cache.get(ns, key)
  if (!buf) return res.status(404).json({ error: "not found" })

  // attempt to return JSON if possible, else base64
  try {
    const str = buf.toString()
    const maybe = JSON.parse(str)
    return res.json({ value: maybe })
  } catch {
    return res.json({ value: buf.toString("base64"), encoding: "base64" })
  }
})

// exists
app.head("/cache/:ns/:key", (req, res) => {
  const { ns, key } = req.params
  if (cache.has(ns, key)) return res.status(200).end()
  return res.status(404).end()
})

// delete key
app.delete("/cache/:ns/:key", (req, res) => {
  const { ns, key } = req.params
  const ok = cache.delete(ns, key)
  res.status(ok ? 204 : 404).end()
})

// clear namespace
app.delete("/cache/:ns", (req, res) => {
  const { ns } = req.params
  const removed = cache.clearNamespace(ns)
  res.json({ removed })
})

const port = parseInt(process.env.PORT || "3000", 10)
app.listen(port, () => {
  // start server
  console.log(`cache listening on ${port}`)
})

// graceful shutdown
process.on("SIGINT", () => {
  cache.shutdown()
  process.exit(0)
})