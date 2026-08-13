import { describe, it, expect } from 'vitest'
import {
  buildModeIndex,
  filterPositionsByModes,
  extractStrategyGroup,
  modeKey,
  resolveModes,
  dedupePositions,
  findRuntimeForAsset,
  splitQuote,
} from './modeFilter'
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

function makePos(
  strategy_name: string,
  asset: string,
  pnl = 1,
  leverage = 10,
  overrides: Partial<OrderPosition> = {},
): OrderPosition {
  return {
    asset,
    strategy_name,
    pos_type: 2,
    pnl_value: pnl,
    deleted: 1,
    created_at: '2026-06-23T00:00:00Z',
    close_time: '2026-06-23T05:00:00Z',
    leverage,
    ...overrides,
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

describe('splitQuote', () => {
  it('splits a USDT pair', () => {
    expect(splitQuote('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' })
  })

  it('splits a USDC pair', () => {
    expect(splitQuote('WLDUSDC')).toEqual({ base: 'WLD', quote: 'USDC' })
  })

  it('prefers the longest matching quote (FDUSD over USD)', () => {
    expect(splitQuote('BTCFDUSD')).toEqual({ base: 'BTC', quote: 'FDUSD' })
  })

  it('returns null quote when no known suffix', () => {
    expect(splitQuote('BTC-25DEC26-60000-P')).toEqual({
      base: 'BTC-25DEC26-60000-P',
      quote: null,
    })
  })
})

describe('buildModeIndex', () => {
  it('unions modes across days for the same (dir, asset)', () => {
    const index = buildModeIndex([
      makeRuntime('obv_atr_v2', 'BTCUSDT', 'live'),
      makeRuntime('obv_atr_v2', 'BTCUSDT', 'smoking'),
      makeRuntime('obv_atr_v2', 'ETHUSDT', 'smoking'),
    ])
    expect(index.exact.get(modeKey('obv_atr_v2', 'BTCUSDT'))).toEqual(
      new Set(['live', 'smoking']),
    )
    expect(index.exact.get(modeKey('obv_atr_v2', 'ETHUSDT'))).toEqual(new Set(['smoking']))
  })
})

describe('resolveModes', () => {
  it('matches exactly when the settlement currency agrees', () => {
    const index = buildModeIndex([makeRuntime('DIR', 'BTCUSDT', 'live')])
    const hit = resolveModes(makePos('DIR_BTCUSDT', 'BTCUSDT'), index)
    expect(hit).toEqual({
      modes: new Set(['live']),
      matchedSymbol: 'BTCUSDT',
      viaQuoteFallback: false,
    })
  })

  it('falls back across settlement currency when the base is unambiguous', () => {
    // 真实场景：manifest 配置 WLDUSDT，实盘成交 WLDUSDC
    const index = buildModeIndex([makeRuntime('SAR_V3', 'WLDUSDT', 'smoking')])
    const hit = resolveModes(makePos('SAR_V3_WLDUSDC', 'WLDUSDC'), index)
    expect(hit).toEqual({
      modes: new Set(['smoking']),
      matchedSymbol: 'WLDUSDT',
      viaQuoteFallback: true,
    })
  })

  it('prefers the exact match over the fallback when both exist', () => {
    // 用户同时跑 USDT 与 USDC：各自精确命中，绝不合并
    const index = buildModeIndex([
      makeRuntime('DIR', 'SOLUSDT', 'live'),
      makeRuntime('DIR', 'SOLUSDC', 'smoking'),
    ])
    expect(resolveModes(makePos('DIR_SOLUSDT', 'SOLUSDT'), index)).toEqual({
      modes: new Set(['live']),
      matchedSymbol: 'SOLUSDT',
      viaQuoteFallback: false,
    })
    expect(resolveModes(makePos('DIR_SOLUSDC', 'SOLUSDC'), index)).toEqual({
      modes: new Set(['smoking']),
      matchedSymbol: 'SOLUSDC',
      viaQuoteFallback: false,
    })
  })

  it('refuses to guess when several settlement currencies could match', () => {
    // manifest 有 USDT 与 BUSD，实盘是 USDC：无法判定归属，不猜
    const index = buildModeIndex([
      makeRuntime('DIR', 'SOLUSDT', 'live'),
      makeRuntime('DIR', 'SOLBUSD', 'smoking'),
    ])
    expect(resolveModes(makePos('DIR_SOLUSDC', 'SOLUSDC'), index)).toBeNull()
  })

  it('returns null when the strategy is absent from the manifest', () => {
    const index = buildModeIndex([makeRuntime('DIR', 'BTCUSDT', 'live')])
    expect(resolveModes(makePos('OTHER_SOLUSDT', 'SOLUSDT'), index)).toBeNull()
  })

  it('does not fall back for assets without a known quote suffix', () => {
    const index = buildModeIndex([makeRuntime('SYNC_X', 'BTC-25DEC26-60000-P', 'live')])
    expect(resolveModes(makePos('SYNC_Y', 'BTC-25DEC26-60000-C', 'live' as never), index)).toBeNull()
  })
})

describe('filterPositionsByModes', () => {
  const index = buildModeIndex([
    makeRuntime('obv_atr_v2', 'BTCUSDT', 'live'),
    makeRuntime('obv_atr_v2', 'ETHUSDT', 'smoking'),
    makeRuntime('SAR_V3', 'WLDUSDT', 'smoking'),
    // SOLUSDT 无 manifest 条目 -> unknown -> 隐藏
  ])
  const positions = [
    makePos('obv_atr_v2_BTCUSDT', 'BTCUSDT'),
    makePos('obv_atr_v2_ETHUSDT', 'ETHUSDT'),
    makePos('SAR_V3_WLDUSDC', 'WLDUSDC'),
    makePos('other_strategy_SOLUSDT', 'SOLUSDT'),
  ]

  it('keeps only positions that ran in live mode', () => {
    const r = filterPositionsByModes(positions, index, new Set(['live']))
    expect(r.positions.map((p) => p.asset)).toEqual(['BTCUSDT'])
  })

  it('counts a settlement-currency fallback exactly like an exact match', () => {
    const r = filterPositionsByModes(positions, index, new Set(['smoking']))
    expect(r.positions.map((p) => p.asset)).toEqual(['ETHUSDT', 'WLDUSDC'])
  })

  it('reports fallbacks separately without excluding them', () => {
    const r = filterPositionsByModes(positions, index, new Set(['live', 'smoking']))
    expect(r.positions.map((p) => p.asset)).toEqual(['BTCUSDT', 'ETHUSDT', 'WLDUSDC'])
    expect(r.quoteFallbacks).toEqual([
      { strategy: 'SAR_V3', asset: 'WLDUSDC', matchedSymbol: 'WLDUSDT' },
    ])
  })

  it('reports positions that match nothing', () => {
    const r = filterPositionsByModes(positions, index, new Set(['live', 'smoking']))
    expect(r.unmatched).toEqual([{ strategy: 'other_strategy', asset: 'SOLUSDT' }])
  })

  it('deduplicates diagnostics across repeated positions', () => {
    const many = [
      makePos('SAR_V3_WLDUSDC', 'WLDUSDC', 1, 10, { created_at: '2026-06-23T01:00:00Z' }),
      makePos('SAR_V3_WLDUSDC', 'WLDUSDC', 2, 10, { created_at: '2026-06-23T02:00:00Z' }),
    ]
    const r = filterPositionsByModes(many, index, new Set(['smoking']))
    expect(r.positions).toHaveLength(2)
    expect(r.quoteFallbacks).toHaveLength(1)
  })

  it('empty selection hides everything', () => {
    expect(filterPositionsByModes(positions, index, new Set()).positions).toEqual([])
  })
})

describe('dedupePositions', () => {
  it('collapses the same position repeated across daily snapshots', () => {
    const a = makePos('DIR_BTCUSDT', 'BTCUSDT', 5, 10, {
      created_at: '2026-08-12T16:31:02Z',
      deleted: 0,
      close_time: null,
    })
    const b = makePos('DIR_BTCUSDT', 'BTCUSDT', 5, 10, {
      created_at: '2026-08-12T16:31:02Z',
      deleted: 0,
      close_time: null,
    })
    expect(dedupePositions([a, b])).toHaveLength(1)
  })

  it('keeps the closed record when a position appears open on an earlier day', () => {
    const open = makePos('DIR_BTCUSDT', 'BTCUSDT', -6.4, 5, {
      created_at: '2026-08-12T16:31:02Z',
      deleted: 0,
      close_time: null,
    })
    const closed = makePos('DIR_BTCUSDT', 'BTCUSDT', -8.1, 5, {
      created_at: '2026-08-12T16:31:02Z',
      deleted: 1,
      close_time: '2026-08-13T20:00:07Z',
    })
    const out = dedupePositions([open, closed])
    expect(out).toHaveLength(1)
    expect(out[0].deleted).toBe(1)
    expect(out[0].pnl_value).toBe(-8.1)
  })

  it('is order independent', () => {
    const open = makePos('DIR_BTCUSDT', 'BTCUSDT', -6.4, 5, {
      created_at: '2026-08-12T16:31:02Z',
      deleted: 0,
      close_time: null,
    })
    const closed = makePos('DIR_BTCUSDT', 'BTCUSDT', -8.1, 5, {
      created_at: '2026-08-12T16:31:02Z',
      deleted: 1,
      close_time: '2026-08-13T20:00:07Z',
    })
    expect(dedupePositions([closed, open])[0].deleted).toBe(1)
  })

  it('treats different entry times as distinct positions', () => {
    const first = makePos('DIR_BTCUSDT', 'BTCUSDT', 1, 5, {
      created_at: '2026-08-12T00:01:03Z',
    })
    const second = makePos('DIR_BTCUSDT', 'BTCUSDT', 2, 5, {
      created_at: '2026-08-12T08:01:03Z',
    })
    expect(dedupePositions([first, second])).toHaveLength(2)
  })

  it('keeps positions of different assets under the same strategy', () => {
    const x = makePos('DIR_BTCUSDT', 'BTCUSDT', 1)
    const y = makePos('DIR_ETHUSDT', 'ETHUSDT', 1)
    expect(dedupePositions([x, y])).toHaveLength(2)
  })
})

describe('findRuntimeForAsset', () => {
  const runtimes = [
    makeRuntime('SAR_V3', 'WLDUSDT', 'smoking'),
    makeRuntime('SAR_V3', 'BTCUSDT', 'live'),
    makeRuntime('SAR_V3', 'BTCUSDT', 'smoking'),
  ]

  it('finds an exact symbol match', () => {
    const r = findRuntimeForAsset(runtimes, 'SAR_V3', 'WLDUSDT', new Set(['smoking']))
    expect(r?.symbol).toBe('WLDUSDT')
  })

  it('finds the runtime across settlement currencies', () => {
    // 点「蜡烛图」时 asset 是 WLDUSDC，runtime 是 WLDUSDT
    const r = findRuntimeForAsset(runtimes, 'SAR_V3', 'WLDUSDC', new Set(['smoking']))
    expect(r?.symbol).toBe('WLDUSDT')
  })

  it('prefers the selected mode', () => {
    const r = findRuntimeForAsset(runtimes, 'SAR_V3', 'BTCUSDT', new Set(['smoking']))
    expect(r?.trading_mode).toBe('smoking')
  })

  it('returns undefined when the strategy has no runtime for that base', () => {
    expect(findRuntimeForAsset(runtimes, 'SAR_V3', 'DOGEUSDC', new Set(['live']))).toBeUndefined()
  })

  it('does not cross bases', () => {
    expect(findRuntimeForAsset(runtimes, 'SAR_V3', 'ETHUSDT', new Set(['live']))).toBeUndefined()
  })
})
