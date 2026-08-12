/**
 * 回放交易数据类型定义
 */

/**
 * 回放交易记录
 *
 * 数据来源：frontend_data/{date}/{strategy}/{symbol}/backtest.json
 * 仅保留前端展示所需字段，便于开源。
 */
export interface BacktestTrade {
  /** 时间戳（ISO 8601，如 2026-08-06T09:15:00） */
  timestamp: string
  /** 方向: BUY, SELL, BUY_CLOSE, SELL_CLOSE */
  side: 'BUY' | 'SELL' | 'BUY_CLOSE' | 'SELL_CLOSE'
  /** 价格 */
  price: number
  /** 盈亏 */
  pnl: number
}

/**
 * 回放信号点（用于图表显示）
 */
export interface BacktestSignal {
  /** 时间 */
  datetime: string
  /** 价格 */
  price: number
  /** 方向: long/short */
  position_type: 'long' | 'short'
  /** 类型: open/close */
  action: 'open' | 'close'
}

/**
 * 回测绩效指标（backtest_result.json 的 metrics 字段）
 * 所有字段可选--不同策略可能缺失，缺失时前端显示 "-"
 */
export interface BacktestMetrics {
  total_return?: number
  roe?: number
  annualized_return?: number
  sharpe_ratio?: number
  sortino_ratio?: number
  max_drawdown?: number
  win_rate?: number
  profit_factor?: number
  total_trades?: number
  winning_trades?: number
  losing_trades?: number
  avg_trade_pnl?: number
  largest_win?: number
  largest_loss?: number
  avg_win?: number
  avg_loss?: number
  trading_days?: number
  daily_return_mean?: number
  daily_return_std?: number
  [key: string]: number | undefined
}

/**
 * 回测账户信息（backtest_result.json 的 accounts[0]）
 */
export interface BacktestAccount {
  strategy_id?: string
  cash?: number
  frozen_cash?: number
  total_equity?: number
  peak_equity?: number
  max_drawdown?: number
  position_count?: number
  trade_count?: number
}

/**
 * 回测结果（backtest_result.json 顶层结构）
 */
export interface BacktestResult {
  config?: {
    name?: string
    start_date?: string
    end_date?: string
    initial_cash?: number
    symbols?: string[]
  }
  start_time?: string
  end_time?: string
  duration_seconds?: number
  accounts?: BacktestAccount[]
  metrics?: BacktestMetrics
  trades_count?: number
  signals_processed?: number
  klines_processed?: number
  status?: string
  performance_summary?: string
}

/**
 * 回测索引条目：一个 (策略, 代币) 的最新完整回测定位
 */
export interface BacktestOutputEntry {
  /** 策略目录名，如 cta_ict_v3 */
  strategy: string
  /** 代币，如 BTCUSDT */
  symbol: string
  /** 回测运行日期 YYYYMMDD（目录名） */
  date: string
  /** 回测运行时间 HHMMSS（目录名） */
  time: string
  /** 相对 backtest-output 的路径，如 cta_ict_v3/20260629/101907/BTCUSDT */
  path: string
}

/**
 * 回测索引文件结构（public/backtest-output-index.json）
 */
export interface BacktestOutputIndex {
  /** 生成时间 ISO */
  generated_at: string
  entries: BacktestOutputEntry[]
}

/**
 * 策略发现页的策略层级分组行：同一策略 + 同一回测区间合并成一行。
 *
 * 分组键 = `${strategy}|${start_date}|${end_date}`。
 * 同一策略若有不同回测区间，则拆成多行。
 */
export interface BacktestGroupRow {
  /** 策略目录名，如 obv_atr_v2 */
  strategy: string
  /** 该组下所有代币（展示时用 `|` 连接） */
  symbols: string[]
  /** 组内最佳年化收益（取所有代币 annualized_return 的最大值） */
  best_annualized: number
  /** 回测区间开始日期（backtest_result.config.start_date） */
  start_date: string
  /** 回测区间结束日期（backtest_result.config.end_date） */
  end_date: string
  /** 完成时间（组内最新 end_time，回退为索引 date+time） */
  completed_at: string
  /** 该组下每个代币的索引条目（供代币层列表页跳转） */
  token_entries: BacktestOutputEntry[]
}