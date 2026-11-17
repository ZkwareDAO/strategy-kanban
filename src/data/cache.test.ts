import { describe, it, expect } from 'vitest'
import { LruCache } from '@/data/cache'

describe('data/cache LruCache', () => {
  it('stores and reads values', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    expect(cache.get('a')).toBe(1)
    expect(cache.size).toBe(1)
  })

  it('evicts the least recently used entry', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a') // refresh a
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
  })

  it('treats a non-positive capacity as one entry', () => {
    const cache = new LruCache<string, number>(0)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.size).toBe(1)
    expect(cache.get('b')).toBe(2)
  })

  it('supports delete, has and clear', () => {
    const cache = new LruCache<string, number>(3)
    cache.set('a', 1)
    expect(cache.has('a')).toBe(true)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
  })
})
