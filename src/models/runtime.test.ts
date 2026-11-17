import { describe, it, expect } from 'vitest'
import type { Runtime, StrategySummary } from '@/models/runtime'

describe('Runtime Model', () => {
  describe('Runtime type definition', () => {
    it('should have correct structure for live mode', () => {
      const runtime: Runtime = {
        runtime_name: 'DEMO_TREND_1D_4_BTCUSDT_LIVE',
        strategy: 'demo_trend',
        symbol: 'BTCUSDT',
        trading_mode: 'live',
        status: 'success'
      }

      expect(runtime.runtime_name).toBe('DEMO_TREND_1D_4_BTCUSDT_LIVE')
      expect(runtime.strategy).toBe('demo_trend')
      expect(runtime.symbol).toBe('BTCUSDT')
      expect(runtime.trading_mode).toBe('live')
      expect(runtime.status).toBe('success')
    })

    it('should accept paper_trading mode', () => {
      const runtime: Runtime = {
        runtime_name: 'DEMO_BREAKOUT_15M_3_BTCUSDT_PAPER',
        strategy: 'demo_breakout',
        symbol: 'BTCUSDT',
        trading_mode: 'paper_trading',
        status: 'success'
      }

      expect(runtime.trading_mode).toBe('paper_trading')
    })

    it('should accept smoking mode', () => {
      const runtime: Runtime = {
        runtime_name: 'DEMO_TREND_1D_4_BTCUSDT_SMOKING',
        strategy: 'demo_trend',
        symbol: 'BTCUSDT',
        trading_mode: 'smoking',
        status: 'failed'
      }

      expect(runtime.trading_mode).toBe('smoking')
      expect(runtime.status).toBe('failed')
    })
  })

  describe('StrategySummary type definition', () => {
    it('should have correct structure for strategy summary', () => {
      const summary: StrategySummary = {
        strategy: 'demo_trend',
        runtime_count: 7,
        position_count: 4,
        avg_roi: 2.35
      }

      expect(summary.strategy).toBe('demo_trend')
      expect(summary.runtime_count).toBe(7)
      expect(summary.position_count).toBe(4)
      expect(summary.avg_roi).toBe(2.35)
    })

    it('should handle negative ROI', () => {
      const summary: StrategySummary = {
        strategy: 'demo_breakout',
        runtime_count: 2,
        position_count: 1,
        avg_roi: -1.12
      }

      expect(summary.avg_roi).toBe(-1.12)
    })
  })
})