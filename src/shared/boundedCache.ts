/** LRU bounded by retained bytes as well as entry count. Oversized values are not cached. */
export class BoundedCache<K, V> {
  private entries = new Map<K, { value: V; bytes: number }>()
  private retained = 0
  constructor(private maxBytes: number, private maxEntries: number, private weight: (value: V) => number) {}
  get bytes() { return this.retained }
  get size() { return this.entries.size }
  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key); this.entries.set(key, entry)
    return entry.value
  }
  set(key: K, value: V): void {
    this.delete(key)
    const bytes = Math.max(0, this.weight(value))
    if (!Number.isFinite(bytes) || bytes > this.maxBytes) return
    while (this.entries.size && (this.retained + bytes > this.maxBytes || this.entries.size >= this.maxEntries)) this.delete(this.entries.keys().next().value!)
    this.entries.set(key, { value, bytes }); this.retained += bytes
  }
  delete(key: K): void {
    const entry = this.entries.get(key)
    if (entry) { this.retained -= entry.bytes; this.entries.delete(key) }
  }
  clear(): void { this.entries.clear(); this.retained = 0 }
}
