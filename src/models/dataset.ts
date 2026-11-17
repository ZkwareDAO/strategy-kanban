/** frontend-data v2 领域模型 */

export type DatasetTradingMode =
  | 'live'
  | 'paper_trading'
  | 'smoking'
  | 'backtest'
  | 'unknown'

export type PositionSide = 'long' | 'short'
export type PositionStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN'
export type SignalSide = 'BUY' | 'SELL'
export type SignalAction = 'open' | 'close'
export type SignalDirection = 'long' | 'short'

/** catalog.csv 一行 */
export interface CatalogDay {
  day: string
  strategies: string[]
  hasLive: boolean
  hasBacktest: boolean
  updatedAt: string
}

/** {day}/manifest.csv 一行 */
export interface ManifestEntryV2 {
  day: string
  strategy: string
  sourceStrategy: string
  displayName: string
  strategyVersion: string
  symbol: string
  runtimeName: string
  engine: string
  tradingMode: DatasetTradingMode
  status: string
  hasLive: boolean
  hasBacktest: boolean
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnl: number
  openPositions: number
  floatingPnl: number
  latestRunId: string
  latestAnnualizedReturn: number
  latestRoe: number
  latestMaxDrawdown: number
  strategyPath: string
}

/** {day}/backtest_runs.csv 一行（run × symbol） */
export interface BacktestRunRow {
  schemaVersion: number
  source: string
  day: string
  batchId: string
  runId: string
  runDay: string
  runStamp: string
  sweep: number
  strategy: string
  sourceStrategy: string
  displayName: string
  strategyVersion: string
  configVersion: string
  symbol: string
  startDate: string
  endDate: string
  status: string
  completedAt: string
  signalsProcessed: number
  tradesCount: number
  annualizedReturn: number
  roe: number
  totalReturn: number
  maxDrawdown: number
  winRate: number
  totalTrades: number
  sharpeRatio: number
  isLatest: boolean
}

/** {day}/{strategy}/meta.json */
export interface StrategyMetaV2 {
  schemaVersion: number
  day: string
  strategy: string
  sourceStrategy: string
  displayName: string
  description: string
  version: string
  engine: string
  timeframe: string
  leverage: number
  warmupDays: number | null
  indicators: string[]
  indicatorParams: Record<string, unknown>
  logic: Record<string, unknown>
  params: Record<string, unknown>
  capturedAt: string
}

/** live_positions.csv / backtest_positions.csv 一行 */
export interface LivePositionRow {
  schemaVersion: number
  source: string
  day: string
  strategy: string
  sourceStrategy: string
  displayName: string
  strategyVersion: string
  symbol: string
  runtimeName: string
  engine: string
  tradingMode: DatasetTradingMode
  positionId: string
  side: PositionSide
  status: PositionStatus
  qty: number
  entryTime: string
  entryPrice: number | null
  exitTime: string | null
  exitPrice: number | null
  realizedPnl: number | null
  pnlPct: number | null
  maxPnlPct: number | null
  minPnlPct: number | null
  leverage: number
  exitReason: string
  updatedAt: string
  /** 回测仓位独有：run 定位字段 */
  runId: string
  batchId: string
  runDay: string
  runStamp: string
  sweep: number
  isLatest: boolean
}

/** live_signals.csv / backtest_signals.csv 一行 */
export interface SignalRow {
  schemaVersion: number
  source: string
  day: string
  strategy: string
  sourceStrategy: string
  displayName: string
  strategyVersion: string
  symbol: string
  runtimeName: string
  engine: string
  tradingMode: DatasetTradingMode
  runId: string
  batchId: string
  runDay: string
  runStamp: string
  sweep: number
  isLatest: boolean
  signalId: string
  signalTime: string
  side: SignalSide
  action: SignalAction
  direction: SignalDirection
  price: number
  qty: number
  status: string
  filledPrice: number | null
  filledQty: number | null
  reason: string
}

/** signal_comparison.csv 一行 */
export interface SignalComparisonRow {
  schemaVersion: number
  day: string
  strategy: string
  sourceStrategy: string
  displayName: string
  symbol: string
  runId: string
  batchId: string
  recordType: string
  matchType: string
  signalSide: string
  signalAction: string
  liveSignalId: string
  backtestSignalId: string
  liveTime: string | null
  backtestTime: string | null
  timeDiffSeconds: number | null
  livePrice: number | null
  backtestPrice: number | null
  priceDiffPct: number | null
  status: string
}

/** 结果 JSON daily_equity 数据点 */
export interface EquityPointV2 {
  date: string
  equity: number
  cash: number
}
