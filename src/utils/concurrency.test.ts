import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from '@/utils/concurrency'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('mapWithConcurrency', () => {
  it('preserves input order in results', async () => {
    const result = await mapWithConcurrency([30, 10, 20], 2, async (ms, index) => {
      await new Promise((r) => setTimeout(r, ms))
      return index
    })
    expect(result).toEqual([0, 1, 2])
  })

  it('never runs more than the limit at once', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active -= 1
    })
    expect(peak).toBe(2)
  })

  it('treats a non-positive limit as one', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 2))
      active -= 1
    })
    expect(peak).toBe(1)
  })

  it('returns an empty array for empty input', async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([])
  })

  it('propagates mapper errors', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (value) => {
        if (value === 2) throw new Error('boom')
        return value
      }),
    ).rejects.toThrow('boom')
  })

  it('starts the next item as soon as a slot frees up', async () => {
    const gate = deferred<void>()
    const started: number[] = []
    const task = mapWithConcurrency([0, 1, 2], 2, async (value) => {
      started.push(value)
      if (value !== 2) await gate.promise
      return value
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([0, 1])
    gate.resolve()
    await task
    expect(started).toEqual([0, 1, 2])
  })
})
