import { describe, it, expect, vi } from 'vitest'
import {
  dedupeLivePositions,
  loadLivePositions,
  toOrderPosition,
} from '@/services/livePerformance'
import type { CatalogDay, LivePositionRow } from '@/models/dataset'

function row(overrides: Partial<LivePositionRow>): LivePositionRow {
  return {
    schemaVersion: 1,
    source: '',
    day: '20261022',
    strategy: 'DEMO_VOLUME_4H_1',
    sourceStrategy: 'demo_volume',
    displayName: '示例量能突破',
    strategyVersion: '20261022',
    symbol: 'BTCUSDT',
    runtimeName: '',
    engine: 'rust',
    tradingMode: 'live',
    positionId: 'p1',
    side: 'long',
    status: 'CLOSED',
    qty: 1,
    entryTime: '2026-10-22T00:00:00Z',
    entryPrice: 100,
    exitTime: '2026-10-22T01:00:00Z',
    exitPrice: 101,
    realizedPnl: 1,
    pnlPct: 1,
    maxPnlPct: 1,
    minPnlPct: -1,
    leverage: 2,
    exitReason: 'live_close',
    updatedAt: '',
    runId: '',
    batchId: '',
    runDay: '',
    runStamp: '',
    sweep: 0,
    isLatest: false,
    ...overrides,
  }
}

describe('services/livePerformance', () => {
  describe('dedupeLivePositions', () => {
    it('keeps one row per position id and prefers CLOSED', () => {
      const open = row({ positionId: 'p1', status: 'OPEN', realizedPnl: 0.2, day: '20261021' })
      const closed = row({ positionId: 'p1', status: 'CLOSED', realizedPnl: 5, day: '20261022' })

      const result = dedupeLivePositions([open, closed])

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('CLOSED')
      expect(result[0].realizedPnl).toBe(5)
    })

    it('keeps distinct position ids', () => {
      const result = dedupeLivePositions([
        row({ positionId: 'p1' }),
        row({ positionId: 'p2', symbol: 'ETHUSDT' }),
      ])
      expect(result).toHaveLength(2)
    })

    it('falls back to a composite key when position id is missing', () => {
      const result = dedupeLivePositions([
        row({ positionId: '', symbol: 'BTCUSDT', entryTime: 't1' }),
        row({ positionId: '', symbol: 'BTCUSDT', entryTime: 't1', status: 'OPEN' }),
        row({ positionId: '', symbol: 'ETHUSDT', entryTime: 't1' }),
      ])
      expect(result).toHaveLength(2)
    })
  })

  describe('toOrderPosition', () => {
    it('maps closed positions to realized order rows', () => {
      const mapped = toOrderPosition(row({ status: 'CLOSED', realizedPnl: -2.5 }))

      expect(mapped).toMatchObject({
        id: 'p1',
        asset: 'BTCUSDT',
        strategy_name: 'DEMO_VOLUME_4H_1',
        pos_type: 2,
        pnl_value: -2.5,
        deleted: 1,
        close_time: '2026-10-22T01:00:00Z',
        leverage: 2,
        trading_mode: 'live',
      })
    })

    it('maps open positions to open order rows', () => {
      const mapped = toOrderPosition(
        row({ status: 'OPEN', realizedPnl: 0.3, exitTime: null, exitPrice: null }),
      )
      expect(mapped.deleted).toBe(0)
      expect(mapped.pnl_value).toBe(0.3)
      expect(mapped.close_time).toBeNull()
    })

    it('treats missing realized pnl as zero', () => {
      expect(toOrderPosition(row({ realizedPnl: null })).pnl_value).toBe(0)
    })
  })

  describe('loadLivePositions', () => {
    it('loads every strategy of every day and dedupes across days', async () => {
      const days: CatalogDay[] = [
        { day: '20261021', strategies: ['A', 'B'], hasLive: true, hasBacktest: true, updatedAt: '' },
        { day: '20261022', strategies: ['A'], hasLive: true, hasBacktest: true, updatedAt: '' },
      ]
      const getLivePositions = vi.fn(async (day: string, strategy: string) => {
        if (day === '20261021' && strategy === 'A') {
          return [row({ positionId: 'p1', day, strategy, status: 'OPEN' })]
        }
        if (day === '20261022' && strategy === 'A') {
          return [row({ positionId: 'p1', day, strategy, status: 'CLOSED' })]
        }
        // 真实 repository 会按 symbol 过滤，这里模拟“该策略没有 BTCUSDT 仓位”
        return []
      })

      const result = await loadLivePositions(days, {
        repository: { getLivePositions },
        symbol: 'BTCUSDT',
      })

      expect(getLivePositions).toHaveBeenCalledTimes(3)
      expect(getLivePositions).toHaveBeenCalledWith('20261021', 'A', 'BTCUSDT')
      expect(getLivePositions).toHaveBeenCalledWith('20261021', 'B', 'BTCUSDT')
      expect(getLivePositions).toHaveBeenCalledWith('20261022', 'A', 'BTCUSDT')
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('CLOSED')
    })

    it('returns empty when there are no days', async () => {
      const getLivePositions = vi.fn(async () => [])
      await expect(
        loadLivePositions([], { repository: { getLivePositions } }),
      ).resolves.toEqual([])
      expect(getLivePositions).not.toHaveBeenCalled()
    })
  })
})
