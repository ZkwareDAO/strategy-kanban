import { describe, it, expect, vi } from 'vitest'
import {
  groupBacktestRuns,
  loadBacktestRuns,
  toBacktestOutputEntry,
} from '@/services/backtestRuns'
import type { BacktestRunRow, CatalogDay } from '@/models/dataset'

function run(overrides: Partial<BacktestRunRow>): BacktestRunRow {
  return {
    schemaVersion: 1,
    source: 'replay',
    day: '20261022',
    batchId: '20261023-0015',
    runId: 'DEMO_MA_2H_1-20261023T001530',
    runDay: '20261023',
    runStamp: '20261023T001530',
    sweep: 0,
    strategy: 'DEMO_MA_2H_1',
    sourceStrategy: 'demo_ma_cross',
    displayName: '示例均线交叉',
    strategyVersion: '20261023',
    configVersion: '1',
    symbol: 'BTCUSDT',
    startDate: '2026-10-22',
    endDate: '2026-10-22',
    status: 'success',
    completedAt: '2026-10-23T08:19:42Z',
    signalsProcessed: 2,
    tradesCount: 1,
    annualizedReturn: 0.1,
    roe: 0.1,
    totalReturn: 0.1,
    maxDrawdown: 0.02,
    winRate: 1,
    totalTrades: 1,
    sharpeRatio: 1,
    isLatest: true,
    ...overrides,
  }
}

const days: CatalogDay[] = [
  { day: '20261021', strategies: ['DEMO_MA_2H_1'], hasLive: true, hasBacktest: true, updatedAt: '' },
  { day: '20261022', strategies: ['DEMO_MA_2H_1'], hasLive: true, hasBacktest: true, updatedAt: '' },
]

describe('services/backtestRuns', () => {
  describe('loadBacktestRuns', () => {
    it('loads every day, keeps latest rows and filters source', async () => {
      const getDayRuns = vi.fn(async (day: string) => [
        run({ day, source: 'discovery', symbol: 'BTCUSDT' }),
        run({ day, source: 'replay', symbol: 'ETHUSDT' }),
        run({ day, source: 'discovery', symbol: 'SOLUSDT', isLatest: false }),
      ])

      const rows = await loadBacktestRuns(days, {
        repository: { getDayRuns },
        source: 'discovery',
      })

      expect(getDayRuns).toHaveBeenCalledTimes(2)
      expect(rows.map((r) => r.symbol)).toEqual(['BTCUSDT', 'BTCUSDT'])
      expect(rows.every((r) => r.isLatest)).toBe(true)
    })

    it('returns empty without days', async () => {
      const getDayRuns = vi.fn(async () => [])
      await expect(
        loadBacktestRuns([], { repository: { getDayRuns } }),
      ).resolves.toEqual([])
      expect(getDayRuns).not.toHaveBeenCalled()
    })
  })

  describe('toBacktestOutputEntry', () => {
    it('maps run rows to display entries', () => {
      const entry = toBacktestOutputEntry(run({}))
      expect(entry).toMatchObject({
        strategy: 'DEMO_MA_2H_1',
        symbol: 'BTCUSDT',
        date: '20261023',
        time: '001530',
        sweep: 0,
        start_date: '2026-10-22',
        end_date: '2026-10-22',
        signals_processed: 2,
        metrics: { roe: 0.1, annualized_return: 0.1, sharpe_ratio: 1 },
      })
    })
  })

  describe('groupBacktestRuns', () => {
    it('groups by strategy and batch, not by sweep', () => {
      const rows = [
        run({ batchId: 'b1', symbol: 'BTCUSDT', roe: 0.1 }),
        run({ batchId: 'b1', symbol: 'ETHUSDT', roe: 0.3 }),
        run({ batchId: 'b2', symbol: 'BTCUSDT', roe: 0.2, runStamp: '20261023T002000' }),
      ]

      const groups = groupBacktestRuns(rows)

      expect(groups).toHaveLength(2)
      const b1 = groups.find((g) => g.batch_id === 'b1')
      expect(b1?.symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
      expect(b1?.best_roe).toBe(0.3)
      expect(b1?.avg_roe).toBeCloseTo(0.2)
    })

    it('hides empty runs by default and can include them', () => {
      const rows = [
        run({ batchId: 'b1', symbol: 'BTCUSDT', signalsProcessed: 0, tradesCount: 0 }),
        run({ batchId: 'b2', symbol: 'ETHUSDT', signalsProcessed: 2 }),
      ]

      expect(groupBacktestRuns(rows).map((g) => g.batch_id)).toEqual(['b2'])
      expect(groupBacktestRuns(rows, { includeEmpty: true })).toHaveLength(2)
    })

    it('can group discovery rows by run day instead of batch', () => {
      const rows = [
        run({ batchId: 'b1', strategy: 'demo_trend', symbol: 'BTCUSDT' }),
        run({ batchId: 'b2', strategy: 'demo_trend', symbol: 'ETHUSDT' }),
      ]
      expect(groupBacktestRuns(rows).length).toBe(2)
      const groups = groupBacktestRuns(rows, { groupBy: 'runDay' })
      expect(groups).toHaveLength(1)
      expect(groups[0].symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
    })

    it('sorts groups by completed time descending', () => {
      const rows = [
        run({ batchId: 'old', completedAt: '2026-10-22T01:00:00Z' }),
        run({ batchId: 'new', completedAt: '2026-10-22T02:00:00Z' }),
      ]
      expect(groupBacktestRuns(rows).map((g) => g.batch_id)).toEqual(['new', 'old'])
    })
  })
})
