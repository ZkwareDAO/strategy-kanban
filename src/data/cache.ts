/**
 * 轻量 LRU 缓存。
 *
 * 依赖 Map 的插入顺序：每次读取把命中项移到末尾，容量超限时删除队首。
 * 容量小于 1 时按 1 处理，避免调用方传入 0 后行为不可预期。
 */
export class LruCache<K, V> {
  private readonly entries = new Map<K, V>()
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity) || 1)
  }

  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key) as V
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.entries.has(key)) this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  has(key: K): boolean {
    return this.entries.has(key)
  }

  delete(key: K): boolean {
    return this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}
