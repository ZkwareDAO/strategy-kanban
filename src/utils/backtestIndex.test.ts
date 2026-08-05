import { describe, it, expect } from 'vitest'
import { buildIndex, type RawRun } from '@/utils/backtestIndex'

function run(strategy: string, symbol: string, date: string, time: string, hasResult = true): RawRun {
  return { strategy, symbol, date, time, hasResult }
}

describe('buildIndex', () => {
  it('returns empty for empty input', () => {
    expect(buildIndex([])).toEqual([])
  })

  it('keeps the latest date per (strategy, symbol)', () => {
    const runs = [
      run('cta_ict_v3', 'BTCUSDT', '20260609', '091024'),
      run('cta_ict_v3', 'BTCUSDT', '20260629', '101907'),
      run('cta_ict_v3', 'BTCUSDT', '20260622', '153939'),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(1)
    expect(entries[0].date).toBe('20260629')
    expect(entries[0].time).toBe('101907')
    expect(entries[0].path).toBe('cta_ict_v3/20260629/101907/BTCUSDT')
  })

  it('within the same date, keeps the latest time', () => {
    const runs = [
      run('cta_ict_v3', 'BTCUSDT', '20260629', '101907'),
      run('cta_ict_v3', 'BTCUSDT', '20260629', '234833'),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(1)
    expect(entries[0].time).toBe('234833')
  })

  it('handles multiple strategies and symbols independently', () => {
    const runs = [
      run('cta_ict_v3', 'BTCUSDT', '20260629', '101907'),
      run('cta_rbreaker_v3', 'ETHUSDT', '20260630', '002951'),
      run('cta_ict_v3', 'ETHUSDT', '20260629', '101908'),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(3)
    expect(entries.map(e => `${e.strategy}/${e.symbol}`).sort()).toEqual([
      'cta_ict_v3/BTCUSDT',
      'cta_ict_v3/ETHUSDT',
      'cta_rbreaker_v3/ETHUSDT',
    ])
  })

  it('skips runs without result.json (incomplete backtests)', () => {
    // 20260630 更新但没有 result.json，应回退到 20260623
    const runs = [
      run('cta_ict_v3', 'ZECUSDT', '20260630', '000349', false),
      run('cta_ict_v3', 'ZECUSDT', '20260623', '040221', true),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(1)
    expect(entries[0].date).toBe('20260623')
  })

  it('drops a (strategy, symbol) entirely if no run has result.json', () => {
    const runs = [run('obv_atr_v2', 'SOLUSDT', '20260701', '030422', false)]
    expect(buildIndex(runs)).toEqual([])
  })

  it('sorts entries by strategy then symbol', () => {
    const runs = [
      run('dolphin_trading_v2', 'ZECUSDT', '20260630', '063430'),
      run('cta_ict_v3', 'BTCUSDT', '20260629', '101907'),
      run('cta_ict_v3', 'ADAUSDT', '20260629', '101907'),
    ]
    const entries = buildIndex(runs)
    expect(entries.map(e => `${e.strategy}/${e.symbol}`)).toEqual([
      'cta_ict_v3/ADAUSDT',
      'cta_ict_v3/BTCUSDT',
      'dolphin_trading_v2/ZECUSDT',
    ])
  })
})
