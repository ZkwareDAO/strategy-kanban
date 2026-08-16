import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('strategyMeta', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals() })

  it('loads and looks up by directory name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ my_strat_v1: { display_name: '示例', indicators: ['RSI'], indicator_params: { EMA: { fast_period: 100 } } } }),
    })))
    const m = await import('@/api/strategyMeta')
    await m.loadStrategyMeta()
    expect(m.getStrategyMeta('my_strat_v1')?.display_name).toBe('示例')
    expect(m.getStrategyMeta('my_strat_v1')?.indicator_params?.EMA).toEqual({ fast_period: 100 })
  })

  it('returns null when file missing (404) and does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    const m = await import('@/api/strategyMeta')
    await expect(m.loadStrategyMeta()).resolves.toBeUndefined()
    expect(m.getStrategyMeta('anything')).toBeNull()
  })

  it('survives network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const m = await import('@/api/strategyMeta')
    await expect(m.loadStrategyMeta()).resolves.toBeUndefined()
    expect(m.getStrategyMeta('x')).toBeNull()
  })

  it('rejects array payload as malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ([1, 2]) })))
    const m = await import('@/api/strategyMeta')
    await m.loadStrategyMeta()
    expect(m.getStrategyMeta('x')).toBeNull()
  })

  it('fetches only once across concurrent calls', async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ a: {} }) }))
    vi.stubGlobal('fetch', spy)
    const m = await import('@/api/strategyMeta')
    await Promise.all([m.loadStrategyMeta(), m.loadStrategyMeta(), m.loadStrategyMeta()])
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('falls back to normalized uppercase key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ OBVATRV2: { display_name: 'X' } }) })))
    const m = await import('@/api/strategyMeta')
    await m.loadStrategyMeta()
    expect(m.getStrategyMeta('obv_atr_v2')?.display_name).toBe('X')
  })
})
