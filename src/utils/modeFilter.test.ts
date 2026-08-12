import { describe, it, expect } from 'vitest'
import { buildModeMap, filterPositionsByModes, extractStrategyGroup, modeKey } from './modeFilter'
import type { Runtime } from '@/models/runtime'
import type { OrderPosition } from '@/models/performance'

function makeRuntime(dir: string, symbol: string, mode: Runtime['trading_mode']): Runtime {
  return {
    runtime_name: `${dir}_${symbol}_${mode.toUpperCase()}`,
    dir_name: dir,
    strategy: dir,
    symbol,
    trading_mode: mode,
    status: 'success',
    display_name: dir,
  }
}

function makePos(strategy_name: string, asset: string, pnl = 1, leverage = 10): OrderPosition {
  return {
    asset,
    strategy_name,
    pos_type: 2,
    pnl_value: pnl,
    deleted: 1,
    created_at: '2026-06-23T00:00:00Z',
    close_time: '2026-06-23T05:00:00Z',
    leverage,
  }
}

describe('extractStrategyGroup', () => {
  it('strips the trailing _SYMBOL segment', () => {
    expect(extractStrategyGroup('NEWOBV_4H_1_BTCUSDT')).toBe('NEWOBV_4H_1')
  })

  it('keeps SYNC_ option strategies intact', () => {
    expect(extractStrategyGroup('SYNC_SHORT_BTCUSDT')).toBe('SYNC_SHORT_BTCUSDT')
  })

  it('returns the input when there is no underscore', () => {
    expect(extractStrategyGroup('DOLPHIN')).toBe('DOLPHIN')
  })
})

describe('buildModeMap', () => {
  it('unions modes across days for the same (dir, asset)', () => {
    const runtimes = [
      makeRuntime('obv_atr_v2', 'BTCUSDT', 'live'),
      makeRuntime('obv_atr_v2', 'BTCUSDT', 'smoking'),
      makeRuntime('obv_atr_v2', 'ETHUSDT', 'smoking'),
    ]
    const map = buildModeMap(runtimes)
    expect(map.get(modeKey('obv_atr_v2', 'BTCUSDT'))).toEqual(new Set(['live', 'smoking']))
    expect(map.get(modeKey('obv_atr_v2', 'ETHUSDT'))).toEqual(new Set(['smoking']))
  })
})

describe('filterPositionsByModes', () => {
  const positions = [
    makePos('obv_atr_v2_BTCUSDT', 'BTCUSDT'),
    makePos('obv_atr_v2_ETHUSDT', 'ETHUSDT'),
    makePos('other_strategy_SOLUSDT', 'SOLUSDT'),
  ]
  const modeMap = buildModeMap([
    makeRuntime('obv_atr_v2', 'BTCUSDT', 'live'),
    makeRuntime('obv_atr_v2', 'ETHUSDT', 'smoking'),
    // SOLUSDT has no manifest entry -> unknown -> hidden
  ])

  it('keeps only positions whose (dir,asset) ran in live mode', () => {
    const live = filterPositionsByModes(positions, modeMap, new Set(['live']))
    expect(live.map((p) => p.asset)).toEqual(['BTCUSDT'])
  })

  it('keeps only positions whose (dir,asset) ran in smoking mode', () => {
    const smoking = filterPositionsByModes(positions, modeMap, new Set(['smoking']))
    expect(smoking.map((p) => p.asset)).toEqual(['ETHUSDT'])
  })

  it('hides positions with no matching manifest entry (unknown)', () => {
    const live = filterPositionsByModes(positions, modeMap, new Set(['live']))
    expect(live.find((p) => p.asset === 'SOLUSDT')).toBeUndefined()
  })

  it('multi-select keeps positions matching any selected mode', () => {
    const all = filterPositionsByModes(positions, modeMap, new Set(['live', 'smoking']))
    expect(all.map((p) => p.asset)).toEqual(['BTCUSDT', 'ETHUSDT'])
  })

  it('empty selection hides everything', () => {
    expect(filterPositionsByModes(positions, modeMap, new Set())).toEqual([])
  })
})
