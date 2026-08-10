import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRuntimes, getPositions, getBacktestTrades } from '@/api/strategy'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Strategy API', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('getRuntimes', () => {
    it('should fetch and parse manifest.json', async () => {
      const manifest = {
        date: '20260806',
        strategies: [
          {
            strategy: 'DOLPHINV2_4H_2',
            symbol: 'BTCUSDT',
            trading_mode: 'live',
            runtime_name: 'DOLPHINV2_4H_2_BTCUSDT_LIVE',
            status: 'success',
            source_strategy: 'dolphin_trading_v2',
          },
          {
            strategy: 'ERP_2H_1',
            symbol: 'ETHUSDT',
            trading_mode: 'live',
            runtime_name: 'ERP_2H_1_ETHUSDT_LIVE',
            status: 'failed',
            source_strategy: 'ema_rsi_pullback',
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(manifest),
      })

      const result = await getRuntimes('20260806')

      expect(result).toHaveLength(2)
      expect(result[0].runtime_name).toBe('DOLPHINV2_4H_2_BTCUSDT_LIVE')
      expect(result[0].dir_name).toBe('DOLPHINV2_4H_2')
      expect(result[0].strategy).toBe('dolphin_trading_v2')
      expect(result[0].symbol).toBe('BTCUSDT')
      expect(result[0].trading_mode).toBe('live')
      expect(result[0].display_name).toBe('DOLPHINV2')
      expect(result[1].status).toBe('failed')
    })

    it('should return empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      const result = await getRuntimes('20260101')
      expect(result).toEqual([])
    })

    it('should deduplicate by dir_name/symbol', async () => {
      const manifest = {
        date: '20260806',
        strategies: [
          { strategy: 'DOLPHINV2_4H_2', symbol: 'BTCUSDT', trading_mode: 'live', runtime_name: 'DOLPHINV2_4H_2_BTCUSDT_LIVE', status: 'success', source_strategy: 'dolphin_trading_v2' },
          { strategy: 'DOLPHINV2_4H_2', symbol: 'BTCUSDT', trading_mode: 'live', runtime_name: 'DOLPHINV2_4H_2_BTCUSDT_LIVE', status: 'success', source_strategy: 'dolphin_trading_v2' },
        ],
      }
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifest) })
      const result = await getRuntimes('20260806')
      expect(result).toHaveLength(1)
    })
  })

  describe('getPositions', () => {
    it('should fetch and parse positions.json', async () => {
      const positions = [
        {
          position_id: 'DOLPHIN_4H_2_BTCUSDT_LIVE_BTCUSDT_1786034700',
          type: 'short',
          entry_time: '2026-08-06T16:45:00+00:00',
          exit_time: '2026-08-06T23:22:02+00:00',
          entry_price: 64725.0,
          exit_price: 64225.4,
          realized_pnl: 0.7719,
          max_potential_pnl: 0.7718,
          max_drawdown: -0.1058,
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(positions),
      })

      const result = await getPositions('DOLPHINV2_4H_2', 'BTCUSDT', '20260806')

      expect(result).toHaveLength(1)
      expect(result[0].position_id).toBe('DOLPHIN_4H_2_BTCUSDT_LIVE_BTCUSDT_1786034700')
      expect(result[0].type).toBe('short')
      expect(result[0].entry_price).toBe(64725.0)
      expect(result[0].exit_price).toBe(64225.4)
      expect(result[0].realized_pnl).toBe(0.7719)
      expect(result[0].exit_time).toBe('2026-08-06T23:22:02+00:00')
    })

    it('should handle open positions with null fields', async () => {
      const positions = [
        {
          position_id: 'pos1',
          type: 'long',
          entry_time: '2026-08-06T10:00:00+00:00',
          exit_time: null,
          entry_price: 50000,
          exit_price: null,
          realized_pnl: null,
          max_potential_pnl: 1.5,
          max_drawdown: -0.3,
        },
      ]
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(positions) })
      const result = await getPositions('STRAT', 'BTCUSDT', '20260806')
      expect(result[0].exit_time).toBeNull()
      expect(result[0].exit_price).toBeNull()
      expect(result[0].realized_pnl).toBeNull()
    })

    it('should return empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      const result = await getPositions('STRAT', 'BTCUSDT', '20260806')
      expect(result).toEqual([])
    })
  })

  describe('getBacktestTrades', () => {
    it('should fetch and parse backtest.json', async () => {
      const trades = [
        { timestamp: '2026-08-06T09:15:00', side: 'BUY', price: 64746.8, pnl: 0.0 },
        { timestamp: '2026-08-06T12:30:00', side: 'SELL', price: 65000, pnl: 0.39 },
      ]
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(trades) })
      const result = await getBacktestTrades('20260806', 'DOLPHINV2_4H_2', 'BTCUSDT')
      expect(result).toHaveLength(2)
      expect(result[0].side).toBe('BUY')
      expect(result[1].pnl).toBe(0.39)
    })
  })
})
