import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRuntimes, getPositions, getBacktestTrades } from '@/api/strategy'
import { dataRepository } from '@/data'

const mockFetch = vi.fn()
global.fetch = mockFetch

const MANIFEST_HEADER =
  'schema_version,data_day,strategy,source_strategy,strategy_display_name,strategy_version,symbol,runtime_name,engine,trading_mode,status,has_live,has_backtest,total_trades,winning_trades,losing_trades,win_rate,total_pnl,open_positions,floating_pnl,latest_run_id,latest_annualized_return,latest_roe,latest_max_drawdown,strategy_path'

function csvResponse(csv: string): Response {
  return new Response(csv, { status: 200 })
}

describe('Strategy API', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    dataRepository.clearCache()
  })

  describe('getRuntimes', () => {
    it('reads manifest.csv and uses the strategy directory as key', async () => {
      mockFetch.mockResolvedValueOnce(
        csvResponse(
          `${MANIFEST_HEADER}\n` +
            '1,20260806,DEMO_TREND_B_4H_2,demo_trend_b,示例策略A,20260806,BTCUSDT,DEMO_TREND_B_4H_2_BTCUSDT_LIVE,rust,live,success,1,1,0,0,0,0,0,0,0,r1,0,0,0,20260806/DEMO_TREND_B_4H_2\n' +
            '1,20260806,DEMO_MA_2H_1,demo_ma_cross,示例均线交叉,20260806,ETHUSDT,DEMO_MA_2H_1_ETHUSDT_LIVE,rust,live,failed,1,1,0,0,0,0,0,0,0,r2,0,0,0,20260806/DEMO_MA_2H_1\n',
        ),
      )

      const result = await getRuntimes('20260806')

      expect(result).toHaveLength(2)
      expect(result[0].runtime_name).toBe('DEMO_TREND_B_4H_2_BTCUSDT_LIVE')
      expect(result[0].dir_name).toBe('DEMO_TREND_B_4H_2')
      expect(result[0].strategy).toBe('DEMO_TREND_B_4H_2')
      expect(result[0].symbol).toBe('BTCUSDT')
      expect(result[0].trading_mode).toBe('live')
      expect(result[0].display_name).toBe('示例策略A')
      expect(result[0].status).toBe('success')
      expect(result[1].status).toBe('failed')
    })

    it('returns an empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }))
      const result = await getRuntimes('20260101')
      expect(result).toEqual([])
    })

    it('deduplicates by strategy/symbol', async () => {
      const row =
        '1,20260806,DEMO_TREND_B_4H_2,demo_trend_b,示例策略A,20260806,BTCUSDT,DEMO_TREND_B_4H_2_BTCUSDT_LIVE,rust,live,success,1,1,0,0,0,0,0,0,0,r1,0,0,0,path'
      mockFetch.mockResolvedValueOnce(csvResponse(`${MANIFEST_HEADER}\n${row}\n${row}\n`))

      const result = await getRuntimes('20260806')

      expect(result).toHaveLength(1)
    })
  })

  describe('getPositions', () => {
    it('reads live_positions.csv, filters by symbol and maps chart fields', async () => {
      mockFetch.mockResolvedValueOnce(
        csvResponse(
          'schema_version,data_day,strategy,source_strategy,strategy_display_name,strategy_version,symbol,runtime_name,engine,trading_mode,position_id,side,status,qty,entry_time,entry_price,exit_time,exit_price,realized_pnl,pnl_pct,max_pnl_pct,min_pnl_pct,leverage,exit_reason,updated_at\n' +
            '1,20260806,DEMO_TREND_B_4H_2,demo_trend_b,示例策略A,20260806,BTCUSDT,DEMO_TREND_B_4H_2_BTCUSDT_LIVE,rust,live,pos1,short,CLOSED,,2026-08-06T16:45:00Z,64725,2026-08-06T23:22:02Z,64225.4,0.77,0.7719,0.7718,-0.1058,1,,2026-08-06T23:22:02Z\n' +
            '1,20260806,DEMO_TREND_B_4H_2,demo_trend_b,示例策略A,20260806,ETHUSDT,DEMO_TREND_B_4H_2_ETHUSDT_LIVE,rust,live,pos2,long,OPEN,,2026-08-06T10:00:00Z,50000,,,0,0,1.5,-0.3,1,,2026-08-06T10:00:00Z\n',
        ),
      )

      const result = await getPositions('DEMO_TREND_B_4H_2', 'BTCUSDT', '20260806')

      expect(result).toHaveLength(1)
      expect(result[0].position_id).toBe('pos1')
      expect(result[0].type).toBe('short')
      expect(result[0].entry_price).toBe(64725)
      expect(result[0].exit_price).toBe(64225.4)
      expect(result[0].realized_pnl).toBe(0.7719)
      expect(result[0].exit_time).toBe('2026-08-06T23:22:02Z')
    })

    it('maps open positions with null exit fields', async () => {
      mockFetch.mockResolvedValueOnce(
        csvResponse(
          'strategy,symbol,position_id,side,status,entry_time,entry_price,exit_time,exit_price,realized_pnl,pnl_pct,max_pnl_pct,min_pnl_pct\n' +
            'STRAT,BTCUSDT,pos1,long,OPEN,2026-08-06T10:00:00Z,50000,,,0,0,1.5,-0.3\n',
        ),
      )

      const result = await getPositions('STRAT', 'BTCUSDT', '20260806')

      expect(result[0].exit_time).toBeNull()
      expect(result[0].exit_price).toBeNull()
      expect(result[0].realized_pnl).toBe(0)
    })

    it('returns an empty array on 404', async () => {
      mockFetch.mockResolvedValueOnce(new Response('', { status: 404 }))
      const result = await getPositions('STRAT', 'BTCUSDT', '20260806')
      expect(result).toEqual([])
    })
  })

  describe('getBacktestTrades (v1)', () => {
    it('should fetch and parse backtest.json', async () => {
      const trades = [
        { timestamp: '2026-08-06T09:15:00', side: 'BUY', price: 64746.8, pnl: 0.0 },
        { timestamp: '2026-08-06T12:30:00', side: 'SELL', price: 65000, pnl: 0.39 },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(trades),
      })
      const result = await getBacktestTrades('20260806', 'DEMO_TREND_B_4H_2', 'BTCUSDT')
      expect(result).toHaveLength(2)
      expect(result[0].side).toBe('BUY')
      expect(result[1].pnl).toBe(0.39)
    })
  })
})
