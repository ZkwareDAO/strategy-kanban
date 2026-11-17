/**
 * frontend-data v2 示例数据生成。
 *
 * 与旧版差异：仓位入口是策略级 live_positions/backtest_positions.csv，
 * 回测索引由 {day}/backtest_runs.csv 承担，信号对比来自 signal_comparison.csv。
 * 所有数值仍由 market/trades/backtest/replay 中的模拟结果推导。
 */
import { join } from 'node:path'
import { createRng, hashSeed, randInt } from './rng.mjs'
import { formatCompactDate, startOfUtcDay } from './market.mjs'
import { STRATEGIES, runtimeName, buildStrategyMeta } from './strategies.mjs'
import { simulateTrades } from './trades.mjs'
import { planBacktestRuns, buildBacktestRun } from './backtest.mjs'
import { planReplayData } from './replay.mjs'
import { writeText, writeJson, ensureDir } from './fsx.mjs'

const MS_PER_DAY = 86400000
const MS_PER_MINUTE = 60000

const CATALOG_HEADER = [
  'schema_version', 'day', 'strategies', 'has_live', 'has_backtest', 'updated_at',
]
const MANIFEST_HEADER = [
  'schema_version', 'data_day', 'strategy', 'source_strategy', 'strategy_display_name',
  'strategy_version', 'symbol', 'runtime_name', 'engine', 'trading_mode', 'status',
  'has_live', 'has_backtest', 'total_trades', 'winning_trades', 'losing_trades',
  'win_rate', 'total_pnl', 'open_positions', 'floating_pnl', 'latest_run_id',
  'latest_annualized_return', 'latest_roe', 'latest_max_drawdown', 'strategy_path',
]
const STRATEGY_MANIFEST_HEADER = [
  'schema_version', 'data_day', 'strategy', 'symbol', 'runtime_name', 'engine',
  'trading_mode', 'status', 'has_live', 'has_backtest',
]
const RUNS_HEADER = [
  'schema_version', 'source', 'data_day', 'batch_id', 'run_id', 'run_day', 'run_stamp',
  'sweep', 'strategy', 'source_strategy', 'strategy_display_name', 'strategy_version',
  'config_version', 'symbol', 'start_date', 'end_date', 'status', 'completed_at',
  'signals_processed', 'trades_count', 'annualized_return', 'roe', 'total_return',
  'max_drawdown', 'win_rate', 'total_trades', 'sharpe_ratio', 'is_latest',
]
const LIVE_POSITION_HEADER = [
  'schema_version', 'data_day', 'strategy', 'source_strategy', 'strategy_display_name',
  'strategy_version', 'symbol', 'runtime_name', 'engine', 'trading_mode', 'position_id',
  'side', 'status', 'qty', 'entry_time', 'entry_price', 'exit_time', 'exit_price',
  'realized_pnl', 'pnl_pct', 'max_pnl_pct', 'min_pnl_pct', 'leverage', 'exit_reason',
  'updated_at',
]
const BACKTEST_POSITION_HEADER = [
  'schema_version', 'source', 'data_day', 'strategy', 'source_strategy',
  'strategy_display_name', 'strategy_version', 'symbol', 'run_id', 'batch_id', 'run_day',
  'run_stamp', 'sweep', 'is_latest', 'engine', 'trading_mode', 'position_id', 'side',
  'status', 'qty', 'entry_time', 'entry_price', 'exit_time', 'exit_price', 'realized_pnl',
  'pnl_pct', 'max_pnl_pct', 'min_pnl_pct', 'leverage', 'exit_reason', 'updated_at',
]
const LIVE_SIGNAL_HEADER = [
  'schema_version', 'data_day', 'strategy', 'source_strategy', 'strategy_display_name',
  'strategy_version', 'symbol', 'runtime_name', 'engine', 'trading_mode', 'signal_id',
  'signal_time', 'side', 'action', 'direction', 'price', 'qty', 'status', 'filled_price',
  'filled_qty', 'reason',
]
const BACKTEST_SIGNAL_HEADER = [
  'schema_version', 'source', 'data_day', 'strategy', 'source_strategy',
  'strategy_display_name', 'strategy_version', 'symbol', 'run_id', 'batch_id', 'run_day',
  'run_stamp', 'sweep', 'is_latest', 'engine', 'trading_mode', 'signal_id', 'signal_time',
  'side', 'action', 'direction', 'price', 'qty', 'status', 'filled_price', 'filled_qty',
  'reason',
]
const COMPARISON_HEADER = [
  'schema_version', 'data_day', 'strategy', 'source_strategy', 'strategy_display_name',
  'symbol', 'run_id', 'batch_id', 'record_type', 'match_type', 'signal_side',
  'signal_action', 'live_signal_id', 'backtest_signal_id', 'live_time', 'backtest_time',
  'time_diff_seconds', 'live_price', 'backtest_price', 'price_diff_pct', 'status',
]

function esc(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(header, rows) {
  return `${[header.join(','), ...rows.map((row) => row.map(esc).join(','))].join('\n')}\n`
}

function round(value, digits) {
  return Number(value.toFixed(digits))
}

function isoUtc(ms) {
  return `${new Date(ms).toISOString().slice(0, 19)}+00:00`
}

function timeframeOf(strategy) {
  if (strategy.dirName.includes('_15M_')) return '15m'
  if (strategy.dirName.includes('_1H_')) return '1h'
  return '4h'
}

function strategyBySource(sourceStrategy) {
  return STRATEGIES.find((item) => item.sourceStrategy === sourceStrategy)
}

function runStampOf(dateDir, timeDir) {
  return `${dateDir}T${timeDir}`
}

function batchOf(dateDir, timeDir) {
  return `${dateDir}-${timeDir.slice(0, 4)}`
}

function positionIdFor(strategy, symbol, trade) {
  return `${strategy.dirName}_${symbol}_${Math.floor(trade.entryTs / 1000)}`
}

/** 当日 live_positions 行：同日开平只保留 CLOSED；跨日开仓日 OPEN，平仓日 CLOSED */
function buildLivePositionRows(strategy, symbol, trades, dayMs, isLastDay) {
  const rows = []
  const runtime = runtimeName(strategy, symbol)
  for (const trade of trades) {
    const entryDay = startOfUtcDay(trade.entryTs)
    const exitDay = trade.exitTs === null ? null : startOfUtcDay(trade.exitTs)
    const notional = 1000 * strategy.leverage
    const realizedAmount = trade.realizedPnl === null
      ? null
      : round((trade.realizedPnl / 100) * notional, 4)

    const build = (status) => [
      1,
      formatCompactDate(dayMs),
      strategy.dirName,
      strategy.sourceStrategy,
      strategy.dirName,
      formatCompactDate(dayMs),
      symbol,
      runtime,
      'rust',
      strategy.tradingMode,
      positionIdFor(strategy, symbol, trade),
      trade.type,
      status,
      1,
      isoUtc(trade.entryTs),
      trade.entryPrice,
      trade.exitTs === null ? '' : isoUtc(trade.exitTs),
      trade.exitPrice ?? '',
      status === 'CLOSED' ? realizedAmount : 0,
      status === 'CLOSED' ? trade.realizedPnl : 0,
      trade.maxPotentialPnl,
      trade.maxDrawdown,
      strategy.leverage,
      status === 'CLOSED' ? 'live_close' : '',
      isoUtc(dayMs + MS_PER_DAY - 1),
    ]

    if (exitDay === dayMs) {
      rows.push(build('CLOSED'))
    } else if (entryDay === dayMs) {
      rows.push(build('OPEN'))
    } else if (isLastDay && exitDay === null && entryDay < dayMs) {
      rows.push(build('OPEN'))
    }
  }
  return rows
}

/** 当日实盘信号（开/平各一行） */
function buildLiveSignalRows(strategy, symbol, trades, dayMs) {
  const rows = []
  const runtime = runtimeName(strategy, symbol)
  const day = formatCompactDate(dayMs)
  trades.forEach((trade, index) => {
    const push = (ts, side, action, price) => {
      if (startOfUtcDay(ts) !== dayMs) return
      rows.push([
        1, day, strategy.dirName, strategy.sourceStrategy, strategy.dirName, day,
        symbol, runtime, 'rust', strategy.tradingMode,
        `sig_${strategy.dirName}_${symbol}_${Math.floor(ts / 1000)}`,
        isoUtc(ts), side, action, trade.type, price, 1, 'filled', price, 1,
        `${strategy.dirName} ${trade.type === 'long' ? '多头' : '空头'}条件满足: `
          + `EMA趋势=up RSI=${round(30 + ((index * 7) % 40), 2)} ATR=${round(1 + index % 3, 2)}`,
      ])
    }
    push(trade.entryTs, trade.type === 'long' ? 'BUY' : 'SELL', 'open', trade.entryPrice)
    if (trade.exitTs !== null && trade.exitPrice !== null) {
      push(trade.exitTs, trade.type === 'long' ? 'SELL' : 'BUY', 'close', trade.exitPrice)
    }
  })
  return rows
}

/** 回放信号 + 对比行；约 8% 实盘信号在回放侧丢失 */
function buildBacktestAndComparison(strategy, symbol, liveSignalRows, dayMs) {
  const day = formatCompactDate(dayMs)
  const rng = createRng(hashSeed(`v2:${strategy.dirName}:${symbol}:${day}`))
  const runStamp = `${day}T220000`
  const batchId = `${day}-2200`
  const backtestRows = []
  const comparisonRows = []

  for (const live of liveSignalRows) {
    const liveId = live[10]
    const liveTime = live[11]
    const side = live[12]
    const action = live[13]
    const direction = live[14]
    const livePrice = Number(live[15])

    if (rng() < 0.08) {
      comparisonRows.push([
        1, day, strategy.dirName, strategy.sourceStrategy, strategy.dirName, symbol,
        '', '', 'unmatched_live', 'none', side.toLowerCase(), action,
        liveId, '', liveTime, '', '', livePrice, '', '', 'missed',
      ])
      continue
    }

    const backtestTs = Date.parse(liveTime) + randInt(rng, -2, 2) * MS_PER_MINUTE
    const backtestTime = isoUtc(backtestTs)
    const backtestPrice = round(livePrice * (1 + (rng() - 0.5) * 0.001), 6)
    const backtestId = `sig_bt_${strategy.dirName}_${symbol}_${Math.floor(backtestTs / 1000)}`
    const reason = `回放条件满足: ${live[20] ?? ''}`

    backtestRows.push([
      1, 'replay', day, strategy.dirName, strategy.sourceStrategy, strategy.dirName,
      day, symbol, `${strategy.dirName}-${runStamp}`, batchId, day, runStamp, 0, 1,
      'rust', 'backtest', backtestId, backtestTime, side, action, direction,
      backtestPrice, 1, 'sent', '', '', reason,
    ])

    const diffSeconds = round(Math.abs(backtestTs - Date.parse(liveTime)) / 1000, 2)
    const diffPct = round((Math.abs(backtestPrice - livePrice) / livePrice) * 100, 4)
    comparisonRows.push([
      1, day, strategy.dirName, strategy.sourceStrategy, strategy.dirName, symbol,
      '', '', 'matched', 'window', side.toLowerCase(), action,
      liveId, backtestId, liveTime, backtestTime, diffSeconds, livePrice,
      backtestPrice, diffPct, 'matched',
    ])
  }

  return { backtestRows, comparisonRows, runStamp, batchId }
}

function buildMetaJson(strategy, day, meta) {
  return {
    schema_version: 1,
    day,
    strategy: strategy.dirName,
    source_strategy: strategy.sourceStrategy,
    display_name: meta?.display_name ?? strategy.dirName,
    description: meta?.description ?? '',
    version: day,
    engine: 'rust',
    timeframe: timeframeOf(strategy),
    leverage: strategy.leverage,
    warmup_days: 30,
    indicators: meta?.indicators ?? [],
    indicator_params: meta?.indicator_params ?? {},
    logic: meta?.logic ?? {},
    params: {},
    config_scope: 'strategy_default',
    default_config_version: '1',
    config_ref: 'backtest_results/{run_stamp}/config.json',
    captured_at: new Date().toISOString(),
  }
}

function runRow({
  source,
  dataDay,
  dateDir,
  timeDir,
  strategy,
  result,
  symbol,
  strategyKey = strategy.dirName,
  displayName = strategy.dirName,
}) {
  const runStamp = runStampOf(dateDir, timeDir)
  const metrics = result.metrics ?? {}
  return [
    1, source, dataDay, batchOf(dateDir, timeDir), `${strategyKey}-${runStamp}`,
    dateDir, runStamp, 0, strategyKey, strategy.sourceStrategy, displayName,
    dateDir, '1', symbol, result.config?.start_date ?? '', result.config?.end_date ?? '',
    result.status ?? 'success', result.end_time ?? '',
    result.signals_processed ?? 0, result.trades_count ?? 0,
    metrics.annualized_return ?? 0, metrics.roe ?? 0, metrics.total_return ?? 0,
    metrics.max_drawdown ?? 0, metrics.win_rate ?? 0, metrics.total_trades ?? 0,
    metrics.sharpe_ratio ?? 0, 1,
  ]
}

/**
 * 生成全部 frontend-data v2 文件。
 * @returns {{positionCount: number, runCount: number}}
 */
export function writeFrontendDataV2({ sampleRoot, dates, marketBySymbol, todayMs }) {
  const frontendRoot = join(sampleRoot, 'frontend-data')
  ensureDir(frontendRoot)
  const dateSet = new Set(dates.map((ms) => formatCompactDate(ms)))
  const metaMap = buildStrategyMeta()

  // 1. 模拟交易序列
  const tradesByKey = new Map()
  let positionCount = 0
  for (const strategy of STRATEGIES) {
    for (const symbol of strategy.symbols) {
      const market = marketBySymbol.get(symbol)
      const trades = simulateTrades(strategy, symbol, market.minuteRows)
      tradesByKey.set(`${strategy.dirName}|${symbol}`, trades)
      positionCount += trades.length
    }
  }

  // 2. 回测 runs（每日 replay 按天；历史 discovery 用全局目录）
  const runRowsByDay = new Map()
  const runRowsByStrategyDay = new Map()
  const discoveryRows = []
  const discoveryMetaWritten = new Set()
  const addReplayRun = (dataDay, strategy, row, runStamp, symbol, result) => {
    if (!dateSet.has(dataDay)) return
    const dayRows = runRowsByDay.get(dataDay) ?? []
    dayRows.push(row)
    runRowsByDay.set(dataDay, dayRows)
    const key = `${dataDay}|${strategy.dirName}`
    const strategyRows = runRowsByStrategyDay.get(key) ?? []
    strategyRows.push(row)
    runRowsByStrategyDay.set(key, strategyRows)

    const resultDir = join(
      frontendRoot, dataDay, strategy.dirName, 'backtest_results', runStamp,
    )
    writeJson(join(resultDir, `${symbol}.json`), result)
  }

  let runCount = 0
  for (const run of planReplayData(dates)) {
    const strategy = strategyBySource(run.strategyId)
    if (!strategy) continue
    const runStamp = runStampOf(run.dateDir, run.timeDir)
    addReplayRun(
      run.dayDir, strategy,
      runRow({
        source: 'replay', dataDay: run.dayDir, dateDir: run.dateDir,
        timeDir: run.timeDir, strategy, result: run.result, symbol: run.symbol,
      }),
      runStamp, run.symbol, run.result,
    )
    runCount += 1
  }

  for (const plan of planBacktestRuns(todayMs)) {
    const strategy = strategyBySource(plan.strategyId)
    if (!strategy) continue
    const { result } = buildBacktestRun(plan)
    const runStamp = runStampOf(plan.dateDir, plan.timeDir)
    const sourceKey = strategy.sourceStrategy
    const meta = metaMap[sourceKey]
    discoveryRows.push(
      runRow({
        source: 'discovery', dataDay: plan.dateDir, dateDir: plan.dateDir,
        timeDir: plan.timeDir, strategy, result, symbol: plan.symbol,
        strategyKey: sourceKey, displayName: meta?.display_name ?? sourceKey,
      }),
    )

    const resultDir = join(
      frontendRoot, 'discovery', sourceKey, 'backtest_results', runStamp,
    )
    writeJson(join(resultDir, `${plan.symbol}.json`), result)
    if (!discoveryMetaWritten.has(sourceKey)) {
      discoveryMetaWritten.add(sourceKey)
      writeJson(join(frontendRoot, 'discovery', sourceKey, 'meta.json'), {
        ...buildMetaJson(strategy, plan.dateDir, meta),
        strategy: sourceKey,
        source_strategy: sourceKey,
      })
    }
    runCount += 1
  }

  if (discoveryRows.length > 0) {
    writeText(
      join(frontendRoot, 'discovery', 'runs.csv'),
      toCsv(RUNS_HEADER, discoveryRows),
    )
  }

  // 3. 逐日写 manifest / 策略文件 / 仓位与信号
  for (let dayIndex = 0; dayIndex < dates.length; dayIndex += 1) {
    const dayMs = dates[dayIndex]
    const day = formatCompactDate(dayMs)
    const isLastDay = dayIndex === dates.length - 1
    const dayDir = join(frontendRoot, day)
    const manifestRows = []

    for (const strategy of STRATEGIES) {
      const meta = metaMap[strategy.sourceStrategy]
      writeJson(join(dayDir, strategy.dirName, 'meta.json'), buildMetaJson(strategy, day, meta))

      const strategyManifestRows = []
      const livePositions = []
      const liveSignals = []
      const backtestPositions = []
      const backtestSignals = []
      const comparisonRows = []

      for (const symbol of strategy.symbols) {
        const runtime = runtimeName(strategy, symbol)
        const trades = tradesByKey.get(`${strategy.dirName}|${symbol}`) ?? []
        strategyManifestRows.push([
          1, day, strategy.dirName, symbol, runtime, 'rust', strategy.tradingMode,
          'success', 1, 1,
        ])

        const positions = buildLivePositionRows(strategy, symbol, trades, dayMs, isLastDay)
        livePositions.push(...positions)
        const signals = buildLiveSignalRows(strategy, symbol, trades, dayMs)
        liveSignals.push(...signals)

        const { backtestRows, comparisonRows: cmpRows, runStamp, batchId } =
          buildBacktestAndComparison(strategy, symbol, signals, dayMs)
        backtestSignals.push(...backtestRows)
        comparisonRows.push(...cmpRows)

        for (const row of positions) {
          backtestPositions.push([
            1, 'replay', day, strategy.dirName, strategy.sourceStrategy, strategy.dirName,
            day, symbol, `${strategy.dirName}-${runStamp}`, batchId, day, runStamp, 0, 1,
            'rust', 'backtest', row[10], row[11], row[12], row[13], row[14], row[15],
            row[16], row[17], row[18], row[19], row[20], row[21], row[22], row[23], row[24],
          ])
        }

        const latestRun = (runRowsByStrategyDay.get(`${day}|${strategy.dirName}`) ?? [])
          .find((run) => run[13] === symbol)
        manifestRows.push([
          1, day, strategy.dirName, strategy.sourceStrategy,
          meta?.display_name ?? strategy.dirName, day, symbol, runtime, 'rust',
          strategy.tradingMode, 'success', 1, 1, 0, 0, 0, 0, 0, 0, 0,
          latestRun ? latestRun[4] : '', latestRun ? latestRun[20] : 0,
          latestRun ? latestRun[21] : 0, latestRun ? latestRun[22] : 0,
          `${day}/${strategy.dirName}`,
        ])
      }

      const strategyDir = join(dayDir, strategy.dirName)
      writeText(
        join(strategyDir, 'manifest.csv'),
        toCsv(STRATEGY_MANIFEST_HEADER, strategyManifestRows),
      )
      if (livePositions.length > 0) {
        writeText(
          join(strategyDir, 'live_positions.csv'),
          toCsv(LIVE_POSITION_HEADER, livePositions),
        )
      }
      if (liveSignals.length > 0) {
        writeText(join(strategyDir, 'live_signals.csv'), toCsv(LIVE_SIGNAL_HEADER, liveSignals))
      }
      if (backtestPositions.length > 0) {
        writeText(
          join(strategyDir, 'backtest_positions.csv'),
          toCsv(BACKTEST_POSITION_HEADER, backtestPositions),
        )
      }
      if (backtestSignals.length > 0) {
        writeText(
          join(strategyDir, 'backtest_signals.csv'),
          toCsv(BACKTEST_SIGNAL_HEADER, backtestSignals),
        )
      }
      if (comparisonRows.length > 0) {
        writeText(
          join(strategyDir, 'signal_comparison.csv'),
          toCsv(COMPARISON_HEADER, comparisonRows),
        )
      }

      const strategyRuns = runRowsByStrategyDay.get(`${day}|${strategy.dirName}`) ?? []
      if (strategyRuns.length > 0) {
        writeText(join(strategyDir, 'backtest_runs.csv'), toCsv(RUNS_HEADER, strategyRuns))
      }
    }

    writeText(join(dayDir, 'manifest.csv'), toCsv(MANIFEST_HEADER, manifestRows))
    const dayRuns = runRowsByDay.get(day) ?? []
    if (dayRuns.length > 0) {
      writeText(join(dayDir, 'backtest_runs.csv'), toCsv(RUNS_HEADER, dayRuns))
    }
  }

  // 4. catalog.csv
  const catalogRows = dates.map((dayMs) => {
    const day = formatCompactDate(dayMs)
    return [
      1, day, STRATEGIES.map((strategy) => strategy.dirName).join('|'), 1, 1,
      new Date().toISOString(),
    ]
  })
  writeText(join(frontendRoot, 'catalog.csv'), toCsv(CATALOG_HEADER, catalogRows))

  return { positionCount, runCount }
}
