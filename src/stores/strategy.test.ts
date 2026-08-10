import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStrategyStore } from '@/stores/strategy'

vi.mock('@/api/strategy', () => ({
  getRuntimes: vi.fn(),
  getPositions: vi.fn(),
}))

import { getRuntimes, getPositions } from '@/api/strategy'

function mockRuntime(overrides: Record<string, unknown> = {}) {
  return {
    runtime_name: 'ICT_1D_4_BTCUSDT_LIVE',
    dir_name: 'ICT_1D_4',
    strategy: 'cta_ict_v4',
    symbol: 'BTCUSDT',
    trading_mode: 'live' as const,
    status: 'success' as const,
    display_name: 'ICT',
    ...overrides,
  }
}

describe('StrategyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have empty runtimes and positions initially', () => {
      const store = useStrategyStore()
      expect(store.runtimes).toEqual([])
      expect(store.positions).toEqual({})
      expect(store.selectedMode).toBe('')
      expect(store.loading).toBe(false)
    })
  })

  describe('fetchRuntimes', () => {
    it('should fetch runtimes and store them', async () => {
      const mockRuntimes = [
        mockRuntime(),
        mockRuntime({
          runtime_name: 'RBREAKER_15M_3_BTCUSDT_PAPER',
          dir_name: 'RBREAKER_15M_3',
          strategy: 'cta_rbreaker_v3',
          trading_mode: 'paper_trading',
        }),
      ]
      vi.mocked(getRuntimes).mockResolvedValueOnce(mockRuntimes)
      vi.mocked(getPositions).mockResolvedValue([])

      const store = useStrategyStore()
      await store.fetchRuntimes('20260806')
      expect(getRuntimes).toHaveBeenCalledWith('20260806')
      expect(store.runtimes).toEqual(mockRuntimes)
      expect(store.loading).toBe(false)
    })

    it('should set loading state during fetch', async () => {
      vi.mocked(getRuntimes).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      )
      const store = useStrategyStore()
      const promise = store.fetchRuntimes('20260806')
      expect(store.loading).toBe(true)
      await promise
      expect(store.loading).toBe(false)
    })

    it('should handle fetch error gracefully', async () => {
      vi.mocked(getRuntimes).mockRejectedValueOnce(new Error('Network error'))
      const store = useStrategyStore()
      await store.fetchRuntimes('20260806')
      expect(store.error).toBe('Network error')
      expect(store.loading).toBe(false)
    })
  })

  describe('fetchPositions', () => {
    it('should fetch positions and cache them by runtime_name', async () => {
      const mockPositions = [
        {
          position_id: 'pos1',
          type: 'long' as const,
          entry_time: '2026-08-06T00:15:00+00:00',
          exit_time: '2026-08-06T05:11:00+00:00',
          entry_price: 65026.0,
          exit_price: 65100,
          realized_pnl: -1.12,
          max_potential_pnl: 1.17,
          max_drawdown: -1.98,
        },
      ]
      vi.mocked(getPositions).mockResolvedValueOnce(mockPositions)
      const store = useStrategyStore()
      await store.fetchPositions('ICT_1D_4', 'BTCUSDT', '20260806', 'ICT_1D_4_BTCUSDT_LIVE')
      expect(getPositions).toHaveBeenCalledWith('ICT_1D_4', 'BTCUSDT', '20260806')
      expect(store.positions['ICT_1D_4_BTCUSDT_LIVE']).toEqual(mockPositions)
    })
  })

  describe('filteredRuntimes', () => {
    it('should filter runtimes by selected mode', () => {
      const store = useStrategyStore()
      store.runtimes = [
        mockRuntime(),
        mockRuntime({
          runtime_name: 'RBREAKER_15M_3_BTCUSDT_PAPER',
          dir_name: 'RBREAKER_15M_3',
          strategy: 'cta_rbreaker_v3',
          trading_mode: 'paper_trading',
        }),
      ]
      store.selectedMode = 'live'
      const filtered = store.filteredRuntimes
      expect(filtered).toHaveLength(1)
      expect(filtered[0].runtime_name).toBe('ICT_1D_4_BTCUSDT_LIVE')
    })
  })

  describe('modeCounts', () => {
    it('should count runtimes per mode', () => {
      const store = useStrategyStore()
      store.runtimes = [
        mockRuntime({ runtime_name: 'A' }),
        mockRuntime({ runtime_name: 'B' }),
        mockRuntime({ runtime_name: 'C', trading_mode: 'paper_trading' }),
        mockRuntime({ runtime_name: 'D', trading_mode: 'smoking' }),
      ]
      const counts = store.modeCounts
      expect(counts.live).toBe(2)
      expect(counts.paper_trading).toBe(1)
      expect(counts.smoking).toBe(1)
    })
  })

  describe('strategySummaries', () => {
    it('should group runtimes by strategy and compute summaries', () => {
      const store = useStrategyStore()
      store.selectedMode = ''
      store.runtimes = [
        mockRuntime({ runtime_name: 'A_LIVE', strategy: 'cta_ict_v4' }),
        mockRuntime({ runtime_name: 'B_PAPER', strategy: 'cta_ict_v4', trading_mode: 'paper_trading' }),
        mockRuntime({ runtime_name: 'C_PAPER', dir_name: 'RBREAKER_15M_3', strategy: 'cta_rbreaker_v3', trading_mode: 'paper_trading' }),
      ]
      store.positions = {
        'A_LIVE': [
          { position_id: '1', type: 'long' as const, entry_time: '2026-08-06T10:00:00+00:00', exit_time: '2026-08-06T11:00:00+00:00', entry_price: 100, exit_price: 101, realized_pnl: 1.5, max_potential_pnl: 2.0, max_drawdown: -0.5 },
          { position_id: '2', type: 'short' as const, entry_time: '2026-08-06T12:00:00+00:00', exit_time: '2026-08-06T13:00:00+00:00', entry_price: 200, exit_price: 199, realized_pnl: -0.5, max_potential_pnl: 1.0, max_drawdown: -1.0 },
        ],
        'B_PAPER': [
          { position_id: '3', type: 'long' as const, entry_time: '2026-08-06T14:00:00+00:00', exit_time: '2026-08-06T15:00:00+00:00', entry_price: 300, exit_price: 306, realized_pnl: 2.0, max_potential_pnl: 3.0, max_drawdown: -0.2 },
        ],
      }
      const summaries = store.strategySummaries
      expect(summaries).toHaveLength(2)
      const ict = summaries.find((s) => s.strategy === 'cta_ict_v4')
      expect(ict).toBeDefined()
      expect(ict!.position_count).toBe(3)
      expect(ict!.completed_count).toBe(3)
      expect(ict!.avg_roi).toBeCloseTo(1.0)
    })
  })

  describe('setMode', () => {
    it('should update selected mode', () => {
      const store = useStrategyStore()
      store.setMode('live')
      expect(store.selectedMode).toBe('live')
    })
  })
})
