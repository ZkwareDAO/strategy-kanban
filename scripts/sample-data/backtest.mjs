/**
 * 合成历史回测结果（策略发现页数据源）
 *
 * 与每日 `backtest.json`（当日回放交易点）不是一回事：这里是独立的历史回测
 * 报告，目录结构为 `{strategy}/{YYYYMMDD}/{HHMMSS}/{SYMBOL}/`。
 *
 * 两个索引相关的约束（见 vite.config.ts 的 backtestIndexPlugin）：
 *   - 只有存在 `backtest_result.json` 的目录才被索引，它是「回测完成」的标志
 *   - `signals_processed` 为 0 的回测不会展示，因此必须为正数
 *
 * 为演示列表页的分组规则，刻意安排了三种情形：
 *   1. 同一天多个标的分批启动（HHMMSS 相差几十秒）→ 合并为一行
 *   2. 同一标的当天重跑 → 拆成两行
 *   3. 不同日期、不同回测区间 → 各自成行
 */
import { createRng, hashSeed, gaussian } from './rng.mjs'
import { formatDate } from './market.mjs'

const MS_PER_DAY = 86400000

/** 保留 n 位小数 */
function round(value, digits) {
  return Number(value.toFixed(digits))
}

/** 两位零填充 */
function p2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 由权益曲线反推各项指标，保证 metrics 与 equity CSV 自洽
 * （用户点开详情页时，曲线形状与右侧指标不会互相矛盾）。
 */
function deriveMetrics(equity, initialCash, tradeCount, rng) {
  const finalEquity = equity[equity.length - 1].equity
  const totalReturn = (finalEquity - initialCash) / initialCash

  let peak = equity[0].equity
  let maxDrawdown = 0
  for (const point of equity) {
    if (point.equity > peak) peak = point.equity
    const dd = (peak - point.equity) / peak
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  // 日收益序列 → 年化与夏普
  const dailyReturns = []
  for (let i = 1; i < equity.length; i += 1) {
    dailyReturns.push((equity[i].equity - equity[i - 1].equity) / equity[i - 1].equity)
  }
  const avgDaily = dailyReturns.reduce((s, v) => s + v, 0) / (dailyReturns.length || 1)
  const variance =
    dailyReturns.reduce((s, v) => s + (v - avgDaily) ** 2, 0) / (dailyReturns.length || 1)
  const stdDaily = Math.sqrt(variance)
  const years = equity.length / 365
  const annualized = years > 0 ? (1 + totalReturn) ** (1 / years) - 1 : 0
  const sharpe = stdDaily > 0 ? (avgDaily / stdDaily) * Math.sqrt(365) : 0
  // 索提诺只惩罚下行波动，故通常大于夏普
  const downside = dailyReturns.filter((r) => r < 0)
  const stdDown = Math.sqrt(downside.reduce((s, v) => s + v ** 2, 0) / (downside.length || 1))
  const sortino = stdDown > 0 ? (avgDaily / stdDown) * Math.sqrt(365) : 0

  const winRate = 0.45 + rng() * 0.3
  const winningTrades = Math.round(tradeCount * winRate)
  const losingTrades = tradeCount - winningTrades
  const totalPnl = finalEquity - initialCash
  // 以总盈亏与胜负笔数反推平均盈利/亏损，保持 profit_factor 自洽
  const avgWin = winningTrades > 0 ? (Math.abs(totalPnl) * 1.8) / winningTrades : 0
  const avgLoss = losingTrades > 0 ? (Math.abs(totalPnl) * 0.8) / losingTrades : 0
  const grossProfit = avgWin * winningTrades
  const grossLoss = avgLoss * losingTrades

  return {
    total_return: round(totalReturn, 4),
    roe: round(totalReturn, 4),
    annualized_return: round(annualized, 4),
    sharpe_ratio: round(sharpe, 4),
    sortino_ratio: round(sortino, 4),
    max_drawdown: round(maxDrawdown, 4),
    win_rate: round(winRate, 4),
    profit_factor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : 0,
    total_trades: tradeCount,
    winning_trades: winningTrades,
    losing_trades: losingTrades,
    avg_trade_pnl: tradeCount > 0 ? round(totalPnl / tradeCount, 2) : 0,
    largest_win: round(avgWin * (2 + rng()), 2),
    largest_loss: round(-avgLoss * (2 + rng()), 2),
    avg_win: round(avgWin, 2),
    avg_loss: round(avgLoss, 2),
    trading_days: equity.length,
  }
}

/**
 * 生成权益曲线（几何随机游走 + 正漂移）
 * @returns {Array<{date: string, equity: number, cash: number}>}
 */
function buildEquityCurve(seedKey, startMs, days, initialCash) {
  const rng = createRng(hashSeed(`equity:${seedKey}`))
  const points = []
  let equity = initialCash
  // 正漂移让示例回测整体盈利，曲线更好看；波动率控制回撤幅度
  const drift = 0.0016
  const vol = 0.012

  for (let i = 0; i < days; i += 1) {
    if (i > 0) equity = equity * (1 + drift + gaussian(rng) * vol)
    // 仓位占用部分资金，cash 低于 equity
    const cash = equity * (0.55 + rng() * 0.4)
    points.push({
      date: formatDate(startMs + i * MS_PER_DAY),
      equity: round(equity, 2),
      cash: round(cash, 2),
    })
  }
  return points
}

/** 权益曲线序列化为 CSV（首行必须以 `date` 开头，否则前端视为无效数据） */
export function equityToCsv(points) {
  const lines = ['date,equity,cash']
  for (const p of points) {
    lines.push(`${p.date},${p.equity},${p.cash}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * 构造单个 run 的 backtest_result.json 与权益曲线
 *
 * @returns {{result: object, equityCsv: string}}
 */
export function buildBacktestRun({
  strategyId,
  symbol,
  rangeStartMs,
  rangeDays,
  launchMs,
  initialCash = 100000,
}) {
  const seedKey = `${strategyId}:${symbol}:${launchMs}`
  const rng = createRng(hashSeed(`run:${seedKey}`))
  const equity = buildEquityCurve(seedKey, rangeStartMs, rangeDays, initialCash)
  const tradeCount = Math.max(12, Math.round(rangeDays * (0.3 + rng() * 0.5)))
  const metrics = deriveMetrics(equity, initialCash, tradeCount, rng)
  const finalEquity = equity[equity.length - 1].equity
  const finalCash = equity[equity.length - 1].cash

  // 回测耗时十分钟到几小时
  const durationSeconds = round(600 + rng() * 12000, 1)
  const endMs = launchMs + durationSeconds * 1000

  const result = {
    config: {
      name: `${strategyId}_${symbol} 示例回测`,
      start_date: formatDate(rangeStartMs),
      end_date: formatDate(rangeStartMs + (rangeDays - 1) * MS_PER_DAY),
      initial_cash: initialCash,
      symbols: [symbol],
    },
    start_time: new Date(launchMs).toISOString().slice(0, 19),
    end_time: new Date(endMs).toISOString().slice(0, 19),
    duration_seconds: durationSeconds,
    status: 'success',
    // 必须为正：为 0 的回测不会出现在列表页
    signals_processed: tradeCount * 2,
    trades_count: tradeCount,
    klines_processed: rangeDays * 1440,
    accounts: [
      {
        strategy_id: `${strategyId}_${symbol}`,
        cash: finalCash,
        total_equity: finalEquity,
        peak_equity: round(Math.max(...equity.map((e) => e.equity)), 2),
        max_drawdown: metrics.max_drawdown,
        position_count: 0,
        trade_count: tradeCount,
      },
    ],
    metrics,
  }

  return { result, equityCsv: equityToCsv(equity) }
}

/**
 * 规划要生成哪些回测 run
 *
 * @param {number} todayMs 今天 UTC 00:00
 * @returns {Array<object>} run 描述数组
 */
export function planBacktestRuns(todayMs) {
  const runs = []

  /** 把启动时刻拆成目录名所需的 YYYYMMDD 与 HHMMSS */
  const dirsFor = (launchMs) => {
    const d = new Date(launchMs)
    return {
      dateDir: formatDate(launchMs).replace(/-/g, ''),
      timeDir: `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`,
    }
  }

  const push = (strategyId, symbol, launchMs, rangeStartMs, rangeDays) => {
    runs.push({ strategyId, symbol, ...dirsFor(launchMs), rangeStartMs, rangeDays, launchMs })
  }

  // 情形 1：3 天前一批启动，三个标的相差几十秒 → 列表页合并为 1 行
  const batchDay = todayMs - 3 * MS_PER_DAY
  const batchBase = batchDay + (10 * 3600 + 19 * 60 + 7) * 1000
  const range1Start = todayMs - 400 * MS_PER_DAY
  push('demo_ema_cross', 'BTCUSDT', batchBase, range1Start, 400)
  push('demo_ema_cross', 'ETHUSDT', batchBase + 43000, range1Start, 400)
  push('demo_ema_cross', 'SOLUSDT', batchBase + 91000, range1Start, 400)

  // 情形 2：同一天下午重跑 BTCUSDT（同标的同区间）→ 拆成独立的第 2 行
  push('demo_ema_cross', 'BTCUSDT', batchDay + (16 * 3600 + 2 * 60 + 41) * 1000, range1Start, 400)

  // 情形 3：另一策略、另一天、另一回测区间 → 各自成行
  const otherDay = todayMs - 8 * MS_PER_DAY
  const range2Start = todayMs - 220 * MS_PER_DAY
  push(
    'demo_boll_reversion',
    'ETHUSDT',
    otherDay + (9 * 3600 + 5 * 60 + 12) * 1000,
    range2Start,
    220,
  )
  push(
    'demo_boll_reversion',
    'SOLUSDT',
    otherDay + (9 * 3600 + 6 * 60 + 3) * 1000,
    range2Start,
    220,
  )

  const thirdDay = todayMs - 15 * MS_PER_DAY
  const range3Start = todayMs - 540 * MS_PER_DAY
  push(
    'demo_atr_breakout',
    'BTCUSDT',
    thirdDay + (21 * 3600 + 44 * 60 + 30) * 1000,
    range3Start,
    540,
  )
  push('demo_atr_breakout', 'SOLUSDT', thirdDay + (21 * 3600 + 45 * 60 + 8) * 1000, range3Start, 540)

  return runs
}
