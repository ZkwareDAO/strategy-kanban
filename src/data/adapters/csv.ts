import { parseCsv } from '@/utils/csv'
import type {
  BacktestRunRow,
  CatalogDay,
  LivePositionRow,
  ManifestEntryV2,
  SignalComparisonRow,
  SignalRow,
} from '@/models/dataset'
import {
  readFlag,
  readNullableNumber,
  readNullableString,
  readNumber,
  readString,
  readTradingMode,
  type CsvRow,
} from './parse'

function toRows(text: string): CsvRow[] {
  return parseCsv(text)
}

/** catalog.csv 行 → 日期目录 */
export function parseCatalogRows(rows: CsvRow[]): CatalogDay[] {
  return rows.map((row) => ({
    day: readString(row, 'day'),
    strategies: readString(row, 'strategies')
      .split('|')
      .map((name) => name.trim())
      .filter(Boolean),
    hasLive: readFlag(row, 'has_live'),
    hasBacktest: readFlag(row, 'has_backtest'),
    updatedAt: readString(row, 'updated_at'),
  }))
}

/** catalog.csv → 日期目录 */
export function parseCatalog(text: string): CatalogDay[] {
  return parseCatalogRows(toRows(text))
}

/** {day}/manifest.csv 行 → 策略 × 代币 */
export function parseManifestRows(rows: CsvRow[]): ManifestEntryV2[] {
  return rows.map((row) => ({
    day: readString(row, 'data_day'),
    strategy: readString(row, 'strategy'),
    sourceStrategy: readString(row, 'source_strategy'),
    displayName: readString(row, 'strategy_display_name'),
    strategyVersion: readString(row, 'strategy_version'),
    symbol: readString(row, 'symbol'),
    runtimeName: readString(row, 'runtime_name'),
    engine: readString(row, 'engine'),
    tradingMode: readTradingMode(row),
    status: readString(row, 'status'),
    hasLive: readFlag(row, 'has_live'),
    hasBacktest: readFlag(row, 'has_backtest'),
    totalTrades: readNumber(row, 'total_trades'),
    winningTrades: readNumber(row, 'winning_trades'),
    losingTrades: readNumber(row, 'losing_trades'),
    winRate: readNumber(row, 'win_rate'),
    totalPnl: readNumber(row, 'total_pnl'),
    openPositions: readNumber(row, 'open_positions'),
    floatingPnl: readNumber(row, 'floating_pnl'),
    latestRunId: readString(row, 'latest_run_id'),
    latestAnnualizedReturn: readNumber(row, 'latest_annualized_return'),
    latestRoe: readNumber(row, 'latest_roe'),
    latestMaxDrawdown: readNumber(row, 'latest_max_drawdown'),
    strategyPath: readString(row, 'strategy_path'),
  }))
}

/** {day}/manifest.csv → 策略 × 代币 */
export function parseManifest(text: string): ManifestEntryV2[] {
  return parseManifestRows(toRows(text))
}

/** backtest_runs.csv 行 → run × 代币 */
export function parseBacktestRunsRows(rows: CsvRow[]): BacktestRunRow[] {
  return rows.map((row) => ({
    schemaVersion: readNumber(row, 'schema_version'),
    source: readString(row, 'source'),
    day: readString(row, 'data_day'),
    batchId: readString(row, 'batch_id'),
    runId: readString(row, 'run_id'),
    runDay: readString(row, 'run_day'),
    runStamp: readString(row, 'run_stamp'),
    sweep: readNumber(row, 'sweep'),
    strategy: readString(row, 'strategy'),
    sourceStrategy: readString(row, 'source_strategy'),
    displayName: readString(row, 'strategy_display_name'),
    strategyVersion: readString(row, 'strategy_version'),
    configVersion: readString(row, 'config_version'),
    symbol: readString(row, 'symbol'),
    startDate: readString(row, 'start_date'),
    endDate: readString(row, 'end_date'),
    status: readString(row, 'status'),
    completedAt: readString(row, 'completed_at'),
    signalsProcessed: readNumber(row, 'signals_processed'),
    tradesCount: readNumber(row, 'trades_count'),
    annualizedReturn: readNumber(row, 'annualized_return'),
    roe: readNumber(row, 'roe'),
    totalReturn: readNumber(row, 'total_return'),
    maxDrawdown: readNumber(row, 'max_drawdown'),
    winRate: readNumber(row, 'win_rate'),
    totalTrades: readNumber(row, 'total_trades'),
    sharpeRatio: readNumber(row, 'sharpe_ratio'),
    isLatest: readFlag(row, 'is_latest'),
  }))
}

/** backtest_runs.csv → run × 代币 */
export function parseBacktestRuns(text: string): BacktestRunRow[] {
  return parseBacktestRunsRows(toRows(text))
}

/** live_positions.csv / backtest_positions.csv 行 → 仓位 */
export function parseLivePositionsRows(rows: CsvRow[]): LivePositionRow[] {
  return rows.map((row) => ({
    schemaVersion: readNumber(row, 'schema_version'),
    source: readString(row, 'source'),
    day: readString(row, 'data_day'),
    strategy: readString(row, 'strategy'),
    sourceStrategy: readString(row, 'source_strategy'),
    displayName: readString(row, 'strategy_display_name'),
    strategyVersion: readString(row, 'strategy_version'),
    symbol: readString(row, 'symbol'),
    runtimeName: readString(row, 'runtime_name'),
    engine: readString(row, 'engine'),
    tradingMode: readTradingMode(row),
    positionId: readString(row, 'position_id'),
    side: row.side === 'short' ? 'short' : 'long',
    status:
      row.status === 'CLOSED' ? 'CLOSED' : row.status === 'OPEN' ? 'OPEN' : 'UNKNOWN',
    qty: readNumber(row, 'qty'),
    entryTime: readString(row, 'entry_time'),
    entryPrice: readNullableNumber(row, 'entry_price'),
    exitTime: readNullableString(row, 'exit_time'),
    exitPrice: readNullableNumber(row, 'exit_price'),
    realizedPnl: readNullableNumber(row, 'realized_pnl'),
    pnlPct: readNullableNumber(row, 'pnl_pct'),
    maxPnlPct: readNullableNumber(row, 'max_pnl_pct'),
    minPnlPct: readNullableNumber(row, 'min_pnl_pct'),
    leverage: readNumber(row, 'leverage', 1),
    exitReason: readString(row, 'exit_reason'),
    updatedAt: readString(row, 'updated_at'),
    runId: readString(row, 'run_id'),
    batchId: readString(row, 'batch_id'),
    runDay: readString(row, 'run_day'),
    runStamp: readString(row, 'run_stamp'),
    sweep: readNumber(row, 'sweep'),
    isLatest: readFlag(row, 'is_latest'),
  }))
}

/** live_positions.csv / backtest_positions.csv → 仓位 */
export function parseLivePositions(text: string): LivePositionRow[] {
  return parseLivePositionsRows(toRows(text))
}

/** live_signals.csv / backtest_signals.csv 行 → 信号 */
export function parseSignalsRows(rows: CsvRow[]): SignalRow[] {
  return rows.map((row) => ({
    schemaVersion: readNumber(row, 'schema_version'),
    source: readString(row, 'source'),
    day: readString(row, 'data_day'),
    strategy: readString(row, 'strategy'),
    sourceStrategy: readString(row, 'source_strategy'),
    displayName: readString(row, 'strategy_display_name'),
    strategyVersion: readString(row, 'strategy_version'),
    symbol: readString(row, 'symbol'),
    runtimeName: readString(row, 'runtime_name'),
    engine: readString(row, 'engine'),
    tradingMode: readTradingMode(row),
    runId: readString(row, 'run_id'),
    batchId: readString(row, 'batch_id'),
    runDay: readString(row, 'run_day'),
    runStamp: readString(row, 'run_stamp'),
    sweep: readNumber(row, 'sweep'),
    isLatest: readFlag(row, 'is_latest'),
    signalId: readString(row, 'signal_id'),
    signalTime: readString(row, 'signal_time'),
    side: row.side === 'SELL' ? 'SELL' : 'BUY',
    action: row.action === 'close' ? 'close' : 'open',
    direction: row.direction === 'short' ? 'short' : 'long',
    price: readNumber(row, 'price'),
    qty: readNumber(row, 'qty'),
    status: readString(row, 'status'),
    filledPrice: readNullableNumber(row, 'filled_price'),
    filledQty: readNullableNumber(row, 'filled_qty'),
    reason: readString(row, 'reason'),
  }))
}

/** live_signals.csv / backtest_signals.csv → 信号 */
export function parseSignals(text: string): SignalRow[] {
  return parseSignalsRows(toRows(text))
}

/** signal_comparison.csv 行 → 实盘/回放差异 */
export function parseSignalComparisonRows(rows: CsvRow[]): SignalComparisonRow[] {
  return rows.map((row) => ({
    schemaVersion: readNumber(row, 'schema_version'),
    day: readString(row, 'data_day'),
    strategy: readString(row, 'strategy'),
    sourceStrategy: readString(row, 'source_strategy'),
    displayName: readString(row, 'strategy_display_name'),
    symbol: readString(row, 'symbol'),
    runId: readString(row, 'run_id'),
    batchId: readString(row, 'batch_id'),
    recordType: readString(row, 'record_type'),
    matchType: readString(row, 'match_type'),
    signalSide: readString(row, 'signal_side'),
    signalAction: readString(row, 'signal_action'),
    liveSignalId: readString(row, 'live_signal_id'),
    backtestSignalId: readString(row, 'backtest_signal_id'),
    liveTime: readNullableString(row, 'live_time'),
    backtestTime: readNullableString(row, 'backtest_time'),
    timeDiffSeconds: readNullableNumber(row, 'time_diff_seconds'),
    livePrice: readNullableNumber(row, 'live_price'),
    backtestPrice: readNullableNumber(row, 'backtest_price'),
    priceDiffPct: readNullableNumber(row, 'price_diff_pct'),
    status: readString(row, 'status'),
  }))
}

/** signal_comparison.csv → 实盘/回放差异 */
export function parseSignalComparison(text: string): SignalComparisonRow[] {
  return parseSignalComparisonRows(toRows(text))
}
