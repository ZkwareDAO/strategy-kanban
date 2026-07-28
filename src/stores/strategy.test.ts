import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStrategyStore } from '@/stores/strategy'

// Mock API
vi.mock('@/api/strategy', () => ({
  getRuntimes: vi.fn(),
  getPositions: vi.fn(),
}))

import { getRuntimes, getPositions } from '@/api/strategy'

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
      expect(store.selectedMode).toBe('paper_trading')
      expect(store.loading).toBe(false)
    })
  })

  describe('fetchRuntimes', () => {
    it('should fetch runtimes and store them', async () => {
      const mockRuntimes = [
        {
          runtime_name: 'ICT_1D_4_BTCUSDT_LIVE',
          strategy: 'cta_ict_v4',
          symbol: 'BTCUSDT',
          trading_mode: 'live' as const,
          status: 'success' as const,
        },
        {
          runtime_name: 'RBREAKER_15M_3_BTCUSDT_PAPER',
          strategy: 'cta_rbreaker_v3',
          symbol: 'BTCUSDT',
          trading_mode: 'paper_trading' as const,
          status: 'success' as const,
        },
      ]

      vi.mocked(getRuntimes).mockResolvedValueOnce(mockRuntimes)

      const store = useStrategyStore()
      await store.fetchRuntimes('20260720')

      expect(getRuntimes).toHaveBeenCalledWith('20260720')
      expect(store.runtimes).toEqual(mockRuntimes)
      expect(store.loading).toBe(false)
    })

    it('should set loading state during fetch', async () => {
      vi.mocked(getRuntimes).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      )

      const store = useStrategyStore()
      const promise = store.fetchRuntimes('20260720')

      expect(store.loading).toBe(true)

      await promise

      expect(store.loading).toBe(false)
    })

    it('should handle fetch error gracefully', async () => {
      vi.mocked(getRuntimes).mockRejectedValueOnce(new Error('Network error'))

      const store = useStrategyStore()
      await store.fetchRuntimes('20260720')

      expect(store.error).toBe('Network error')
      expect(store.loading).toBe(false)
    })
  })

  describe('fetchPositions', () => {
    it('should fetch positions for a runtime and cache them', async () => {
      const mockPositions = [
        {
          position_id: '1784506500',
          type: 'long' as const,
          entry_time: '00:15',
          exit_time: '05:11',
          entry_price: 65026.0,
          realized_pnl: -1.12,
          max_potential_pnl: 1.17,
          max_drawdown: -1.98,
        },
      ]

      vi.mocked(getPositions).mockResolvedValueOnce(mockPositions)

      const store = useStrategyStore()
      await store.fetchPositions('ICT_1D_4_BTCUSDT_LIVE', '20260720')

      expect(getPositions).toHaveBeenCalledWith('ICT_1D_4_BTCUSDT_LIVE', '20260720')
      expect(store.positions['ICT_1D_4_BTCUSDT_LIVE']).toEqual(mockPositions)
    })
  })

  describe('filteredRuntimes', () => {
    it('should filter runtimes by selected mode', () => {
      const store = useStrategyStore()
      store.runtimes = [
        {
          runtime_name: 'ICT_1D_4_BTCUSDT_LIVE',
          strategy: 'cta_ict_v4',
          symbol: 'BTCUSDT',
          trading_mode: 'live' as const,
          status: 'success' as const,
        },
        {
          runtime_name: 'RBREAKER_15M_3_BTCUSDT_PAPER',
          strategy: 'cta_rbreaker_v3',
          symbol: 'BTCUSDT',
          trading_mode: 'paper_trading' as const,
          status: 'success' as const,
        },
        {
          runtime_name: 'EMARSIPULLBACK_4H_2_BTCUSDT_SMOKING',
          strategy: 'ema_rsi_pullback',
          symbol: 'BTCUSDT',
          trading_mode: 'smoking' as const,
          status: 'success' as const,
        },
      ]
      store.selectedMode = 'live'

      const filtered = store.filteredRuntimes

      expect(filtered).toHaveLength(1)
      expect(filtered[0].runtime_name).toBe('ICT_1D_4_BTCUSDT_LIVE')
    })

    it('should return all runtimes when mode is empty', () => {
      const store = useStrategyStore()
      store.runtimes = [
        {
          runtime_name: 'ICT_1D_4_BTCUSDT_LIVE',
          strategy: 'cta_ict_v4',
          symbol: 'BTCUSDT',
          trading_mode: 'live' as const,
          status: 'success' as const,
        },
        {
          runtime_name: 'RBREAKER_15M_3_BTCUSDT_PAPER',
          strategy: 'cta_rbreaker_v3',
          symbol: 'BTCUSDT',
          trading_mode: 'paper_trading' as const,
          status: 'success' as const,
        },
      ]
      store.selectedMode = ''

      expect(store.filteredRuntimes).toHaveLength(2)
    })
  })

  describe('modeCounts', () => {
    it('should count runtimes per mode', () => {
      const store = useStrategyStore()
      store.runtimes = [
        { runtime_name: 'A_LIVE', strategy: 's1', symbol: 'BTC', trading_mode: 'live' as const, status: 'success' as const },
        { runtime_name: 'B_LIVE', strategy: 's1', symbol: 'ETH', trading_mode: 'live' as const, status: 'success' as const },
        { runtime_name: 'C_PAPER', strategy: 's2', symbol: 'SOL', trading_mode: 'paper_trading' as const, status: 'success' as const },
        { runtime_name: 'D_SMOKING', strategy: 's3', symbol: 'BNB', trading_mode: 'smoking' as const, status: 'success' as const },
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
      store.selectedMode = '' // Show all modes
      store.runtimes = [
        { runtime_name: 'A_LIVE', strategy: 'cta_ict_v4', symbol: 'BTC', trading_mode: 'live' as const, status: 'success' as const },
        { runtime_name: 'B_PAPER', strategy: 'cta_ict_v4', symbol: 'ETH', trading_mode: 'paper_trading' as const, status: 'success' as const },
        { runtime_name: 'C_PAPER', strategy: 'cta_rbreaker_v3', symbol: 'SOL', trading_mode: 'paper_trading' as const, status: 'success' as const },
      ]
      store.positions = {
        'A_LIVE': [
          { position_id: '1', type: 'long' as const, entry_time: '10:00', entry_price: 100, realized_pnl: 1.5, max_potential_pnl: 2.0, max_drawdown: -0.5 },
          { position_id: '2', type: 'short' as const, entry_time: '12:00', entry_price: 200, realized_pnl: -0.5, max_potential_pnl: 1.0, max_drawdown: -1.0 },
        ],
        'B_PAPER': [
          { position_id: '3', type: 'long' as const, entry_time: '14:00', entry_price: 300, realized_pnl: 2.0, max_potential_pnl: 3.0, max_drawdown: -0.2 },
        ],
        'C_PAPER': [],
      }

      const summaries = store.strategySummaries

      expect(summaries).toHaveLength(2)
      const ict = summaries.find((s) => s.strategy === 'cta_ict_v4')
      expect(ict).toBeDefined()
      expect(ict!.runtime_count).toBe(2)
      expect(ict!.position_count).toBe(3)
      expect(ict!.avg_roi).toBeCloseTo(1.0) // (1.5 + -0.5 + 2.0) / 3
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
