/**
 * Minimal in-memory cache with a time-to-live and a size limit.
 *
 * A JavaScript Map keeps insertion order, so the first key is always the
 * oldest entry; when the cache is full we evict it. Reading an entry moves it
 * to the end, which makes this a simple LRU (least recently used) cache.
 *
 * Good enough for a single instance. With several instances you would swap
 * this for Redis behind the same get/set interface.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency: move to the end of the Map.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  get size(): number {
    return this.entries.size;
  }
}
