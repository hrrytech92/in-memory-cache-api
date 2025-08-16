// A simple in-memory cache with TTL and LRU eviction

type Key = string
type Namespace = string

// Node for doubly linked list used by LRU
class LRUNode {
  // key namespaced as ns:key
  fullKey: string
  // pointers for O(1) remove and move-to-front
  prev: LRUNode | null = null
  next: LRUNode | null = null
  constructor(fullKey: string) {
    this.fullKey = fullKey
  }
}

// Doubly linked list implementing LRU queue
class LRUList {
  // head is most recently used, tail least
  head: LRUNode | null = null
  tail: LRUNode | null = null

  moveToFront(node: LRUNode) {
    // if already head do nothing
    if (this.head === node) return
    // detach node from current position
    this.detach(node)
    // insert at head
    node.next = this.head
    if (this.head) this.head.prev = node
    this.head = node
    if (!this.tail) this.tail = node
  }

  pushFront(node: LRUNode) {
    // insert node at head, used for new keys
    node.prev = null
    node.next = this.head
    if (this.head) this.head.prev = node
    this.head = node
    if (!this.tail) this.tail = node
  }

  popBack(): LRUNode | null {
    // remove and return the least recently used node
    if (!this.tail) return null
    const node = this.tail
    this.detach(node)
    return node
  }

  detach(node: LRUNode) {
    // unlink node from list
    if (node.prev) node.prev.next = node.next
    if (node.next) node.next.prev = node.prev
    if (this.head === node) this.head = node.next
    if (this.tail === node) this.tail = node.prev
    node.prev = null
    node.next = null
  }
}

interface CacheEntry {
  // raw value stored as Buffer to be agnostic of type
  value: Buffer
  // when does this entry expire, in ms epoch, or 0 for no expiry
  expiresAt: number
  // pointer to the LRU node for O(1) updates
  lruNode: LRUNode
  // approximate size in bytes for capacity tracking
  size: number
}

export interface SetOptions {
  // time to live in milliseconds, 0 or undefined means no TTL
  ttlMs?: number
}

export class InMemoryCache {
  // backing map from fullKey to entry
  private store = new Map<string, CacheEntry>()
  // LRU list to evict when over capacity
  private lru = new LRUList()
  // maximum memory budget in bytes
  private maxBytes: number
  // current used bytes
  private usedBytes = 0
  // periodic sweeper timer id
  private sweeper?: NodeJS.Timeout

  constructor(options: { maxBytes?: number; sweepIntervalMs?: number } = {}) {
    // default budget 64 MB
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024
    // start background sweeper to remove expired keys
    const interval = options.sweepIntervalMs ?? 2000
    this.sweeper = setInterval(() => this.sweepExpired(), interval)
    // do not keep process alive solely due to interval
    this.sweeper.unref()
  }

  private makeFullKey(ns: Namespace, key: Key) {
    // namespace and key combined to avoid collisions
    return `${ns}:${key}`
  }

  set(ns: Namespace, key: Key, value: Buffer | string | object, opts: SetOptions = {}) {
    // normalize value to Buffer, stringify objects
    let buf: Buffer
    if (Buffer.isBuffer(value)) buf = value
    else if (typeof value === "string") buf = Buffer.from(value)
    else buf = Buffer.from(JSON.stringify(value))

    const fullKey = this.makeFullKey(ns, key)
    const exists = this.store.get(fullKey)
    const ttlMs = opts.ttlMs ?? 0
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0

    if (exists) {
      // update existing entry, adjust memory usage delta
      const delta = buf.length - exists.size
      this.usedBytes += delta
      exists.value = buf
      exists.size = buf.length
      exists.expiresAt = expiresAt
      // mark as recently used
      this.lru.moveToFront(exists.lruNode)
    } else {
      // create new entry and LRU node
      const node = new LRUNode(fullKey)
      const entry: CacheEntry = {
        value: buf,
        expiresAt,
        lruNode: node,
        size: buf.length,
      }
      this.store.set(fullKey, entry)
      this.lru.pushFront(node)
      this.usedBytes += entry.size
    }

    // evict as needed to meet memory budget
    this.evictUntilWithinBudget()
  }

  get(ns: Namespace, key: Key): Buffer | null {
    const fullKey = this.makeFullKey(ns, key)
    const entry = this.store.get(fullKey)
    if (!entry) return null
    // if expired, delete and return null
    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      this.delete(ns, key)
      return null
    }
    // mark as recently used
    this.lru.moveToFront(entry.lruNode)
    return entry.value
  }

  has(ns: Namespace, key: Key): boolean {
    // efficient existence check without touching LRU
    const fullKey = this.makeFullKey(ns, key)
    const entry = this.store.get(fullKey)
    if (!entry) return false
    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      // lazy purge of expired items
      this.delete(ns, key)
      return false
    }
    return true
  }

  delete(ns: Namespace, key: Key): boolean {
    const fullKey = this.makeFullKey(ns, key)
    const entry = this.store.get(fullKey)
    if (!entry) return false
    // update memory usage and remove from structures
    this.usedBytes -= entry.size
    this.lru.detach(entry.lruNode)
    this.store.delete(fullKey)
    return true
  }

  clearNamespace(ns: Namespace): number {
    // remove all keys for a namespace, returns count removed
    let removed = 0
    for (const fullKey of this.store.keys()) {
      if (fullKey.startsWith(`${ns}:`)) {
        const entry = this.store.get(fullKey)!
        this.usedBytes -= entry.size
        this.lru.detach(entry.lruNode)
        this.store.delete(fullKey)
        removed++
      }
    }
    return removed
  }

  stats() {
    // expose simple metrics for observability
    return {
      keys: this.store.size,
      usedBytes: this.usedBytes,
      maxBytes: this.maxBytes,
    }
  }

  private evictUntilWithinBudget() {
    // repeatedly evict least recently used until under budget
    while (this.usedBytes > this.maxBytes) {
      const victim = this.lru.popBack()
      if (!victim) break
      const entry = this.store.get(victim.fullKey)
      if (!entry) continue
      this.usedBytes -= entry.size
      this.store.delete(victim.fullKey)
    }
  }

  private sweepExpired() {
    // periodic scan that removes expired entries cheaply
    const now = Date.now()
    for (const [fullKey, entry] of this.store) {
      if (entry.expiresAt > 0 && entry.expiresAt <= now) {
        this.usedBytes -= entry.size
        this.lru.detach(entry.lruNode)
        this.store.delete(fullKey)
      }
    }
  }

  shutdown() {
    // stop background tasks
    if (this.sweeper) clearInterval(this.sweeper)
  }
}