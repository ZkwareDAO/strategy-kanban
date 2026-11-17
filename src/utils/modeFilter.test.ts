import { describe, it, expect } from 'vitest'
import { filterPositionsByTradingMode } from '@/utils/modeFilter'
import type { OrderPosition } from '@/models/performance'

function position(overrides: Partial<OrderPosition>): OrderPosition {
  return {
    id: 'p1',
    asset: 'BTCUSDT',
    strategy_name: 'DEMO_4H_1',
    pos_type: 2,
    pnl_value: 1,
    deleted: 1,
    created_at: '2026-10-22T00:00:00Z',
    close_time: '2026-10-22T01:00:00Z',
    leverage: 1,
    ...overrides,
  }
}

describe('filterPositionsByTradingMode', () => {
  it('keeps positions whose row mode is selected', () => {
    const result = filterPositionsByTradingMode(
      [
        position({ id: 'a', trading_mode: 'live' }),
        position({ id: 'b', trading_mode: 'smoking' }),
        position({ id: 'c', trading_mode: 'paper_trading' }),
      ],
      new Set(['live']),
    )

    expect(result.positions.map((p) => p.id)).toEqual(['a'])
    expect(result.unmatched).toEqual([])
  })

  it('keeps smoking when selected', () => {
    const result = filterPositionsByTradingMode(
      [position({ id: 'b', trading_mode: 'smoking' })],
      new Set(['smoking']),
    )
    expect(result.positions).toHaveLength(1)
  })

  it('reports unknown/missing modes as unmatched', () => {
    const result = filterPositionsByTradingMode(
      [
        position({ id: 'a' }),
        position({ id: 'b', trading_mode: 'unknown', strategy_name: 'X', asset: 'ETHUSDT' }),
        position({ id: 'c', trading_mode: 'unknown', strategy_name: 'X', asset: 'ETHUSDT' }),
      ],
      new Set(['live', 'smoking']),
    )

    expect(result.positions).toHaveLength(0)
    expect(result.unmatched).toEqual([
      { strategy: 'DEMO_4H_1', asset: 'BTCUSDT' },
      { strategy: 'X', asset: 'ETHUSDT' },
    ])
  })

  it('returns empty for empty input', () => {
    expect(filterPositionsByTradingMode([], new Set(['live']))).toEqual({
      positions: [],
      unmatched: [],
    })
  })
})
