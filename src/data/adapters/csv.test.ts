import { describe, it, expect } from 'vitest'
import {
  parseBacktestRuns,
  parseCatalog,
  parseLivePositions,
  parseManifest,
  parseSignalComparison,
  parseSignals,
  parseStrategyMeta,
} from '@/data/adapters'

describe('data adapters', () => {
  describe('parseCatalog', () => {
    it('parses days and splits strategy lists', () => {
      const rows = parseCatalog(
        'schema_version,day,strategies,has_live,has_backtest,updated_at\n' +
          '1,20261022,DEMO_MA_2H_1|DEMO_FILTER_4H_1,1,0,2026-10-22T00:00:00Z\n',
      )
      expect(rows).toEqual([
        {
          day: '20261022',
          strategies: ['DEMO_MA_2H_1', 'DEMO_FILTER_4H_1'],
          hasLive: true,
          hasBacktest: false,
          updatedAt: '2026-10-22T00:00:00Z',
        },
      ])
    })

    it('returns an empty array for empty input', () => {
      expect(parseCatalog('')).toEqual([])
      expect(parseCatalog('\n')).toEqual([])
    })
  })

  describe('parseManifest', () => {
    it('maps manifest columns to camelCase', () => {
      const rows = parseManifest(
        'schema_version,data_day,strategy,source_strategy,strategy_display_name,strategy_version,symbol,runtime_name,engine,trading_mode,status,has_live,has_backtest,total_trades,winning_trades,losing_trades,win_rate,total_pnl,open_positions,floating_pnl,latest_run_id,latest_annualized_return,latest_roe,latest_max_drawdown,strategy_path\n' +
          '1,20261022,DEMO_MA_2H_1,demo_ma_cross,示例均线交叉,20261022,BNBUSDT,DEMO_MA_2H_1_BNBUSDT_LIVE,rust,live,success,1,1,1,1,0,1.0,0.000284,0,0,DEMO_MA_2H_1-20261023T001530,-0.99,-0.032,0.032,20261022/DEMO_MA_2H_1\n',
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        day: '20261022',
        strategy: 'DEMO_MA_2H_1',
        sourceStrategy: 'demo_ma_cross',
        displayName: '示例均线交叉',
        symbol: 'BNBUSDT',
        runtimeName: 'DEMO_MA_2H_1_BNBUSDT_LIVE',
        tradingMode: 'live',
        status: 'success',
        hasLive: true,
        hasBacktest: true,
        winRate: 1,
        totalPnl: 0.000284,
        latestRoe: -0.032,
        strategyPath: '20261022/DEMO_MA_2H_1',
      })
    })

    it('defaults missing numeric columns to 0', () => {
      const rows = parseManifest(
        'schema_version,data_day,strategy,symbol,trading_mode\n1,20261022,X,BTCUSDT,live\n',
      )
      expect(rows[0].winRate).toBe(0)
      expect(rows[0].hasLive).toBe(false)
    })
  })

  describe('parseBacktestRuns', () => {
    it('parses flags and numeric metrics', () => {
      const rows = parseBacktestRuns(
        'schema_version,source,data_day,batch_id,run_id,run_day,run_stamp,sweep,strategy,source_strategy,strategy_display_name,strategy_version,config_version,symbol,start_date,end_date,status,completed_at,signals_processed,trades_count,annualized_return,roe,total_return,max_drawdown,win_rate,total_trades,sharpe_ratio,is_latest\n' +
          '1,replay,20261022,20261023-0015,DEMO_MA_2H_1-20261023T001530,20261023,20261023T001530,0,DEMO_MA_2H_1,demo_ma_cross,示例均线交叉,20261023,1,BNBUSDT,2026-10-22,2026-10-22,success,2026-10-23T08:19:42Z,2,2,-0.9975,-0.0323,-0.0323,0.0323,0.0,1,0,1\n',
      )
      expect(rows[0]).toMatchObject({
        source: 'replay',
        day: '20261022',
        batchId: '20261023-0015',
        runId: 'DEMO_MA_2H_1-20261023T001530',
        runStamp: '20261023T001530',
        sweep: 0,
        strategy: 'DEMO_MA_2H_1',
        symbol: 'BNBUSDT',
        startDate: '2026-10-22',
        endDate: '2026-10-22',
        signalsProcessed: 2,
        tradesCount: 2,
        roe: -0.0323,
        isLatest: true,
      })
    })

    it('treats is_latest=0 as false', () => {
      const rows = parseBacktestRuns('strategy,symbol,is_latest\nX,BTCUSDT,0\n')
      expect(rows[0].isLatest).toBe(false)
    })
  })

  describe('parseLivePositions', () => {
    it('maps position fields and keeps row-level symbol', () => {
      const rows = parseLivePositions(
        'schema_version,data_day,strategy,source_strategy,strategy_display_name,strategy_version,symbol,runtime_name,engine,trading_mode,position_id,side,status,qty,entry_time,entry_price,exit_time,exit_price,realized_pnl,pnl_pct,max_pnl_pct,min_pnl_pct,leverage,exit_reason,updated_at\n' +
          '1,20261022,DEMO_VOLUME_4H_1,demo_volume,示例量能突破,20261022,BTCUSDT,DEMO_VOLUME_4H_1_BTCUSDT_LIVE,rust,live,pos-1,long,CLOSED,,,83442.7,2026-10-22T06:05:01Z,82756.5,-0.8224,-0.8224,1.6697,0.9987,2.0,,2026-10-22T06:05:01Z\n',
      )
      expect(rows[0]).toMatchObject({
        positionId: 'pos-1',
        symbol: 'BTCUSDT',
        strategy: 'DEMO_VOLUME_4H_1',
        side: 'long',
        status: 'CLOSED',
        entryTime: '',
        exitTime: '2026-10-22T06:05:01Z',
        entryPrice: 83442.7,
        exitPrice: 82756.5,
        realizedPnl: -0.8224,
        pnlPct: -0.8224,
        maxPnlPct: 1.6697,
        minPnlPct: 0.9987,
        leverage: 2,
        tradingMode: 'live',
      })
    })

    it('parses open positions with null exit fields', () => {
      const rows = parseLivePositions(
        'strategy,symbol,position_id,side,status,entry_time,exit_time,exit_price,realized_pnl\n' +
          'X,ETHUSDT,p2,short,OPEN,2026-10-22T00:00:00Z,,,\n',
      )
      expect(rows[0].status).toBe('OPEN')
      expect(rows[0].exitTime).toBeNull()
      expect(rows[0].exitPrice).toBeNull()
      expect(rows[0].realizedPnl).toBeNull()
    })
  })

  describe('parseSignals', () => {
    it('maps signal rows including reason and run fields', () => {
      const rows = parseSignals(
        'schema_version,source,data_day,strategy,source_strategy,strategy_display_name,strategy_version,symbol,run_id,batch_id,run_day,run_stamp,sweep,is_latest,engine,trading_mode,signal_id,signal_time,side,action,direction,price,qty,status,filled_price,filled_qty,reason\n' +
          '1,replay,20261022,DEMO_SCORE_8H_3,demo_trend_score,DEMO_SCORE_8H_3,20261023,ETHUSDT,run-1,b-1,20261023,20261023T004210,0,1,rust,backtest,sig-1,2026-10-22T00:00:00Z,BUY,open,long,2472.74,0,sent,,,SAR多头趋势\n',
      )
      expect(rows[0]).toMatchObject({
        signalId: 'sig-1',
        symbol: 'ETHUSDT',
        strategy: 'DEMO_SCORE_8H_3',
        runStamp: '20261023T004210',
        isLatest: true,
        side: 'BUY',
        action: 'open',
        direction: 'long',
        price: 2472.74,
        filledPrice: null,
        reason: 'SAR多头趋势',
      })
    })
  })

  describe('parseSignalComparison', () => {
    it('maps matched and unmatched records', () => {
      const rows = parseSignalComparison(
        'schema_version,data_day,strategy,source_strategy,strategy_display_name,symbol,run_id,batch_id,record_type,match_type,signal_side,signal_action,live_signal_id,backtest_signal_id,live_time,backtest_time,time_diff_seconds,live_price,backtest_price,price_diff_pct,status\n' +
          '1,20261022,SAR,src,SAR,SOLUSDT,,,unmatched_backtest,none,buy,buy,,sig-2,,2026-10-22T00:00:00Z,,,106.9,,missed\n',
      )
      expect(rows[0]).toMatchObject({
        symbol: 'SOLUSDT',
        recordType: 'unmatched_backtest',
        matchType: 'none',
        signalSide: 'buy',
        signalAction: 'buy',
        liveSignalId: '',
        backtestSignalId: 'sig-2',
        liveTime: null,
        backtestTime: '2026-10-22T00:00:00Z',
        livePrice: null,
        backtestPrice: 106.9,
        status: 'missed',
      })
    })
  })

  describe('parseStrategyMeta', () => {
    it('parses meta json', () => {
      const meta = parseStrategyMeta({
        schema_version: 1,
        day: '20261022',
        strategy: 'DEMO_FILTER_4H_1',
        source_strategy: 'demo_trend_filter',
        display_name: 'SAR趋势',
        version: '20261022',
        engine: 'rust',
        timeframe: '4h',
        leverage: 1,
        warmup_days: 30,
        indicators: ['SAR', 'ADX'],
        indicator_params: { ADX: { period: 14 } },
        logic: { entry: ['x'] },
        params: { stop_loss_pct: 2.5 },
      })
      expect(meta).toMatchObject({
        day: '20261022',
        strategy: 'DEMO_FILTER_4H_1',
        sourceStrategy: 'demo_trend_filter',
        displayName: 'SAR趋势',
        timeframe: '4h',
        leverage: 1,
        warmupDays: 30,
        indicators: ['SAR', 'ADX'],
        indicatorParams: { ADX: { period: 14 } },
        logic: { entry: ['x'] },
      })
    })

    it('returns null for non-object input', () => {
      expect(parseStrategyMeta(null)).toBeNull()
      expect(parseStrategyMeta([])).toBeNull()
    })
  })
})
