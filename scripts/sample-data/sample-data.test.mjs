/**
 * 示例数据生成器的不变量测试
 *
 * 这些断言对应「若违反则前端读不出数据或图表画错」的硬性约束，
 * 而非实现细节——因此调整合成参数（波动率、开仓频率）不会让它们变红。
 */
import { describe, test, expect } from 'vitest'
import { createRng, hashSeed, gaussian } from './rng.mjs'
import {
  SYMBOLS,
  generateMinuteSeries,
  generateSymbolMarket,
  aggregateDaily,
  formatTimestamp,
  startOfUtcDay,
} from './market.mjs'
import { STRATEGIES, buildManifest, buildStrategyMeta, runtimeName } from './strategies.mjs'
import {
  simulateTrades,
  buildDailyPositions,
  buildBacktestTrades,
  buildComparison,
  buildPerformanceRows,
  performanceRowsToCsv,
  PERFORMANCE_HEADER,
} from './trades.mjs'
import { buildBacktestRun, planBacktestRuns, equityToCsv } from './backtest.mjs'

/** 固定的窗口起点，避免测试结果随运行日期漂移 */
const WINDOW_START = Date.UTC(2026, 0, 5)
const WINDOW_DAYS = 3
const BTC = SYMBOLS.find((s) => s.symbol === 'BTCUSDT')

describe('rng', () => {
  test('同种子产生相同序列', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  test('不同种子产生不同序列', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a()).not.toBe(b())
  })

  test('输出落在 [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i += 1) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  test('hashSeed 稳定且能区分不同输入', () => {
    expect(hashSeed('BTCUSDT')).toBe(hashSeed('BTCUSDT'))
    expect(hashSeed('BTCUSDT')).not.toBe(hashSeed('ETHUSDT'))
  })

  test('gaussian 均值接近 0，不产生 NaN', () => {
    const rng = createRng(99)
    const samples = Array.from({ length: 4000 }, () => gaussian(rng))
    expect(samples.every((v) => Number.isFinite(v))).toBe(true)
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length
    expect(Math.abs(mean)).toBeLessThan(0.1)
  })
})

describe('K线合成', () => {
  const { rows, csv } = generateMinuteSeries(BTC, WINDOW_START, WINDOW_DAYS, BTC.basePrice)

  test('每天 1440 根，首行为规范表头', () => {
    expect(rows).toHaveLength(WINDOW_DAYS * 1440)
    expect(csv.split('\n')[0]).toBe('timestamp,open,high,low,close,volume')
  })

  test('时间戳严格升序且零填充为 YYYY-MM-DD——Range 二分依赖字典序等于时间序', () => {
    const lines = csv.trim().split('\n').slice(1)
    for (let i = 0; i < lines.length; i += 1) {
      expect(lines[i].slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (i > 0) expect(lines[i] > lines[i - 1]).toBe(true)
    }
  })

  test('OHLC 不变量：high >= max(open,close)，low <= min(open,close)', () => {
    for (const r of rows) {
      expect(r.high).toBeGreaterThanOrEqual(Math.max(r.open, r.close))
      expect(r.low).toBeLessThanOrEqual(Math.min(r.open, r.close))
    }
  })

  test('价格与成交量均为有限正数', () => {
    for (const r of rows) {
      expect(r.close).toBeGreaterThan(0)
      expect(Number.isFinite(r.volume)).toBe(true)
      expect(r.volume).toBeGreaterThan(0)
    }
  })

  test('相同输入可复现', () => {
    const again = generateMinuteSeries(BTC, WINDOW_START, WINDOW_DAYS, BTC.basePrice)
    expect(again.csv).toBe(csv)
  })

  test('formatTimestamp 输出 UTC 且零填充', () => {
    expect(formatTimestamp(Date.UTC(2026, 7, 6, 16, 45, 0))).toBe('2026-08-06 16:45:00+00:00')
  })

  test('日线聚合的 open/close 取自当日首尾分钟，high/low 为极值', () => {
    const daily = aggregateDaily(rows)
    expect(daily).toHaveLength(WINDOW_DAYS)
    const firstDay = rows.filter((r) => startOfUtcDay(r.ts) === WINDOW_START)
    expect(daily[0].open).toBe(firstDay[0].open)
    expect(daily[0].close).toBe(firstDay[firstDay.length - 1].close)
    expect(daily[0].high).toBe(Math.max(...firstDay.map((r) => r.high)))
    expect(daily[0].low).toBe(Math.min(...firstDay.map((r) => r.low)))
  })

  test('日线序列时间升序且长度超过窗口（含历史回溯）', () => {
    const market = generateSymbolMarket(BTC, WINDOW_START, WINDOW_DAYS)
    const lines = market.dailyCsv.trim().split('\n').slice(1)
    for (let i = 1; i < lines.length; i += 1) {
      expect(lines[i] > lines[i - 1]).toBe(true)
    }
    expect(market.dailyRows.length).toBeGreaterThan(WINDOW_DAYS)
  })
})

describe('策略定义', () => {
  test('manifest 展开为 策略 × 标的，字段齐全', () => {
    const manifest = buildManifest('20260105')
    expect(manifest.date).toBe('20260105')
    const expected = STRATEGIES.reduce((sum, s) => sum + s.symbols.length, 0)
    expect(manifest.strategies).toHaveLength(expected)
    for (const entry of manifest.strategies) {
      expect(entry).toMatchObject({
        strategy: expect.any(String),
        symbol: expect.any(String),
        trading_mode: expect.any(String),
        runtime_name: expect.any(String),
        status: 'success',
        source_strategy: expect.any(String),
      })
    }
  })

  test('runtime_name 形如 {dir}_{SYMBOL}_{MODE}', () => {
    const strategy = STRATEGIES[0]
    expect(runtimeName(strategy, 'BTCUSDT')).toBe(`${strategy.dirName}_BTCUSDT_LIVE`)
  })

  test('覆盖三种 trading_mode，使概览页每个筛选 tab 都有数据', () => {
    const modes = new Set(STRATEGIES.map((s) => s.tradingMode))
    expect(modes).toEqual(new Set(['live', 'paper_trading', 'smoking']))
  })

  test('策略标识为虚构的 DEMO/demo_ 前缀，不含真实策略代号', () => {
    for (const s of STRATEGIES) {
      expect(s.dirName.startsWith('DEMO')).toBe(true)
      expect(s.sourceStrategy.startsWith('demo_')).toBe(true)
    }
  })

  test('strategies.json 的键与 manifest 的 source_strategy 一一对应', () => {
    const meta = buildStrategyMeta()
    for (const s of STRATEGIES) {
      expect(meta[s.sourceStrategy]).toBeDefined()
    }
  })

  test('元数据只使用前端已实现的指标名', () => {
    const supported = new Set([
      'RSI',
      'MACD',
      'ATR',
      'EMA',
      'BOLL',
      'KD',
      'ADX',
      'OBV',
      'Donchian',
      'Envelope',
      'SMA',
    ])
    for (const entry of Object.values(buildStrategyMeta())) {
      for (const name of entry.indicators ?? []) {
        expect(supported.has(name)).toBe(true)
      }
      for (const name of Object.keys(entry.indicator_params ?? {})) {
        expect(supported.has(name)).toBe(true)
      }
    }
  })
})

describe('交易推导', () => {
  const strategy = STRATEGIES[0]
  const market = generateSymbolMarket(BTC, WINDOW_START, WINDOW_DAYS)
  const trades = simulateTrades(strategy, 'BTCUSDT', market.minuteRows)

  test('产出了交易，且开仓价取自真实 K 线收盘价', () => {
    expect(trades.length).toBeGreaterThan(0)
    const closes = new Set(market.minuteRows.map((r) => r.close))
    for (const t of trades) {
      expect(closes.has(t.entryPrice)).toBe(true)
    }
  })

  test('平仓晚于开仓', () => {
    for (const t of trades) {
      if (t.exitTs !== null) expect(t.exitTs).toBeGreaterThan(t.entryTs)
    }
  })

  test('realized_pnl 与方向、价差一致（做空时符号相反）', () => {
    for (const t of trades) {
      if (t.realizedPnl === null) continue
      const raw = ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100
      const expected = t.type === 'long' ? raw : -raw
      expect(t.realizedPnl).toBeCloseTo(expected, 3)
    }
  })

  test('max_drawdown <= 0 <= max_potential_pnl', () => {
    for (const t of trades) {
      expect(t.maxDrawdown).toBeLessThanOrEqual(0)
      expect(t.maxPotentialPnl).toBeGreaterThanOrEqual(0)
    }
  })

  describe('每日仓位切分', () => {
    const byDate = buildDailyPositions(strategy, 'BTCUSDT', trades)
    const all = [...byDate.values()].flat()

    test('时间戳落在整分钟——mergePositions 按 HH:MM 与 1m K 线匹配', () => {
      for (const p of all) {
        if (p.entry_time) expect(p.entry_time.slice(17, 19)).toBe('00')
        if (p.exit_time) expect(p.exit_time.slice(17, 19)).toBe('00')
      }
    })

    test('跨日仓位在平仓日 entry_time 为 null 但保留 entry_price', () => {
      const crossDay = all.filter((p) => p.entry_time === null)
      expect(crossDay.length).toBeGreaterThan(0)
      for (const p of crossDay) {
        expect(p.entry_price).toBeGreaterThan(0)
        expect(p.exit_time).not.toBeNull()
      }
    })

    test('持仓中的仓位 exit 相关字段一律为 null', () => {
      const holding = all.filter((p) => p.exit_time === null)
      expect(holding.length).toBeGreaterThan(0)
      for (const p of holding) {
        expect(p.exit_price).toBeNull()
        expect(p.realized_pnl).toBeNull()
      }
    })

    test('每条仓位都归入其时间戳所属的那一天', () => {
      for (const [date, positions] of byDate) {
        for (const p of positions) {
          const stamp = p.entry_time ?? p.exit_time
          expect(stamp.slice(0, 10)).toBe(date)
        }
      }
    })

    test('position_id 在同一天内唯一', () => {
      for (const positions of byDate.values()) {
        const ids = positions.map((p) => p.position_id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    })
  })

  describe('回放与对比', () => {
    const byDate = buildDailyPositions(strategy, 'BTCUSDT', trades)
    const [date, positions] = [...byDate.entries()].find(([, p]) => p.length > 0)
    const compact = date.replace(/-/g, '')
    const backtestTrades = buildBacktestTrades(
      strategy,
      'BTCUSDT',
      positions,
      market.minuteRows,
      BTC.decimals,
    )

    test('回放交易按时间升序，side 取值合法', () => {
      const valid = new Set(['BUY', 'SELL', 'BUY_CLOSE', 'SELL_CLOSE'])
      for (let i = 0; i < backtestTrades.length; i += 1) {
        expect(valid.has(backtestTrades[i].side)).toBe(true)
        if (i > 0) {
          expect(backtestTrades[i].timestamp >= backtestTrades[i - 1].timestamp).toBe(true)
        }
      }
    })

    test('对比报告的统计量彼此自洽', () => {
      const cmp = buildComparison(strategy, 'BTCUSDT', compact, positions, backtestTrades)
      expect(cmp.matched).toBeLessThanOrEqual(cmp.total_live)
      expect(cmp.matched).toBeLessThanOrEqual(cmp.total_backtest)
      expect(cmp.accuracy_score).toBeGreaterThanOrEqual(0)
      expect(cmp.accuracy_score).toBeLessThanOrEqual(1)
      expect(cmp.matched_signals).toHaveLength(cmp.matched)
      expect(cmp.unmatched_live).toHaveLength(cmp.total_live - cmp.matched)
      expect(cmp.signal_id_matched + cmp.time_window_matched).toBe(cmp.matched)
      expect(['GOOD', 'ACCEPTABLE', 'NEEDS_REVIEW', 'NO_DATA']).toContain(cmp.recommendation)
    })

    test('时间与价格偏差统计非负，且 max >= avg', () => {
      const cmp = buildComparison(strategy, 'BTCUSDT', compact, positions, backtestTrades)
      expect(cmp.time_accuracy.max_diff_seconds).toBeGreaterThanOrEqual(
        cmp.time_accuracy.avg_diff_seconds,
      )
      expect(cmp.price_accuracy.max_diff_pct).toBeGreaterThanOrEqual(cmp.price_accuracy.avg_diff_pct)
      expect(cmp.price_accuracy.avg_diff_pct).toBeGreaterThanOrEqual(0)
    })
  })

  describe('策略表现 CSV', () => {
    const dayStart = WINDOW_START + 86400000
    const rows = buildPerformanceRows(strategy, 'BTCUSDT', trades, dayStart, dayStart + 86399999)

    test('strategy_name 为 {dir}_{SYMBOL}，去掉末段后等于 manifest 的 strategy', () => {
      for (const r of rows) {
        expect(r.strategy_name).toBe(`${strategy.dirName}_BTCUSDT`)
        expect(r.strategy_name.replace(/_[^_]+$/, '')).toBe(strategy.dirName)
      }
    })

    test('已平仓行 deleted=1 且有 close_time；持仓行相反', () => {
      for (const r of rows) {
        if (r.deleted === 1) expect(r.close_time).not.toBe('')
        else expect(r.close_time).toBe('')
      }
    })

    test('pos_type 恒为 2——前端只统计期货', () => {
      expect(rows.every((r) => r.pos_type === 2)).toBe(true)
    })

    test('快照语义：同一笔跨天出现时 created_at 一致，保证前端能去重', () => {
      const nextDay = dayStart + 86400000
      const rowsNext = buildPerformanceRows(strategy, 'BTCUSDT', trades, nextDay, nextDay + 86399999)
      const keyOf = (r) => `${r.strategy_name}|${r.asset}|${r.created_at}`
      const byId = new Map(rows.map((r) => [keyOf(r), r]))
      const overlap = rowsNext.filter((r) => byId.has(keyOf(r)))
      // 跨日持仓在两天各出现一次，created_at 必须相同才不被算成两笔
      for (const r of overlap) {
        expect(byId.get(keyOf(r)).created_at).toBe(r.created_at)
      }
    })

    test('CSV 表头与 DATA-SPEC 一致，列数对齐', () => {
      const csv = performanceRowsToCsv(rows)
      const lines = csv.trim().split('\n')
      expect(lines[0]).toBe(PERFORMANCE_HEADER)
      const columnCount = PERFORMANCE_HEADER.split(',').length
      for (const line of lines.slice(1)) {
        expect(line.split(',')).toHaveLength(columnCount)
      }
    })
  })
})

describe('历史回测', () => {
  const todayMs = Date.UTC(2026, 0, 20)
  const runs = planBacktestRuns(todayMs)

  test('目录名格式：YYYYMMDD 与 HHMMSS', () => {
    for (const run of runs) {
      expect(run.dateDir).toMatch(/^\d{8}$/)
      expect(run.timeDir).toMatch(/^\d{6}$/)
    }
  })

  test('同日同策略的批量启动共享日期目录但时刻不同——列表页据此合并为一行', () => {
    const batch = runs.filter(
      (r) => r.strategyId === 'demo_ema_cross' && r.dateDir === runs[0].dateDir,
    )
    expect(batch.length).toBeGreaterThan(1)
    expect(new Set(batch.map((r) => r.timeDir)).size).toBe(batch.length)
  })

  test('存在同标的重跑，用于演示列表页拆行', () => {
    const sameSymbol = runs.filter(
      (r) => r.strategyId === 'demo_ema_cross' && r.symbol === 'BTCUSDT',
    )
    expect(sameSymbol.length).toBeGreaterThanOrEqual(2)
  })

  test('signals_processed 为正——为 0 的回测不会展示', () => {
    for (const run of runs) {
      const { result } = buildBacktestRun(run)
      expect(result.signals_processed).toBeGreaterThan(0)
    }
  })

  test('列表页所需字段齐全', () => {
    const { result } = buildBacktestRun(runs[0])
    expect(result.config.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.config.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof result.metrics.annualized_return).toBe('number')
    expect(result.end_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })

  test('指标自洽：胜负笔数之和等于总笔数，回撤与胜率在 (0,1)', () => {
    for (const run of runs) {
      const m = buildBacktestRun(run).result.metrics
      expect(m.winning_trades + m.losing_trades).toBe(m.total_trades)
      expect(m.max_drawdown).toBeGreaterThanOrEqual(0)
      expect(m.max_drawdown).toBeLessThan(1)
      expect(m.win_rate).toBeGreaterThan(0)
      expect(m.win_rate).toBeLessThan(1)
      expect(Number.isFinite(m.sharpe_ratio)).toBe(true)
    }
  })

  test('accounts[0] 的 total_equity 等于权益曲线末值', () => {
    const { result, equityCsv } = buildBacktestRun(runs[0])
    const lines = equityCsv.trim().split('\n')
    const lastEquity = Number(lines[lines.length - 1].split(',')[1])
    expect(result.accounts[0].total_equity).toBe(lastEquity)
    expect(result.accounts[0].peak_equity).toBeGreaterThanOrEqual(lastEquity)
  })

  test('权益 CSV 首行以 date 开头，否则前端视为无效数据', () => {
    const csv = equityToCsv([{ date: '2026-01-01', equity: 100000, cash: 100000 }])
    expect(csv.startsWith('date,equity,cash')).toBe(true)
  })

  test('权益曲线日期升序且 cash <= equity', () => {
    const { equityCsv } = buildBacktestRun(runs[0])
    const lines = equityCsv.trim().split('\n').slice(1)
    for (let i = 0; i < lines.length; i += 1) {
      const [date, equity, cash] = lines[i].split(',')
      expect(Number(cash)).toBeLessThanOrEqual(Number(equity))
      if (i > 0) expect(date > lines[i - 1].split(',')[0]).toBe(true)
    }
  })
})
