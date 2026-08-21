/**
 * 合成每日回测结果（每日回放页数据源）
 *
 * 与 backtest.mjs 的区别只在**组织方式**，回测报告本身同格式，故直接复用
 * 其 buildBacktestRun：
 *   - backtest.mjs  → backtest-output/{strategy}/{date}/{time}/{SYMBOL}/
 *     按策略累积全部历史，回测区间可跨月跨年
 *   - 本文件        → data/{所属日期}/backtest_results/{strategy}/{运行日期}/{time}/{SYMBOL}/
 *     每天一份，回测区间就是所属当天
 *
 * 为让页面的各项行为都有数据可演示，刻意安排了三种情形：
 *   1. 每天多个策略、多个标的分批启动 → 各策略合并为一行
 *   2. 部分回测 signals_processed 为 0 → 演示「显示无信号策略」开关
 *   3. 每 5 天有一次回测跨零点才跑完 → 运行日期比所属日期晚一天
 */
import { buildBacktestRun, equityToCsv } from './backtest.mjs'
import { formatCompactDate } from './market.mjs'

const MS_PER_DAY = 86400000

/**
 * 单日回测的权益曲线预热天数。
 *
 * 真实数据里 config 区间只有当天，但权益曲线会回溯约 40 天——策略需要历史
 * K 线预热指标。这里保持同一特征，否则详情页的曲线只有一个点。
 */
const WARMUP_DAYS = 41

/** 单日回测的初始资金（远小于历史回测，单日成交量级也更小） */
const INITIAL_CASH = 5000

/** 两位零填充 */
function p2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 每日参与回测的策略与标的。
 *
 * 沿用 backtest.mjs 的 demo_* 策略名，使两个页面看起来出自同一套策略体系。
 * emptyEvery 表示每隔几天该标的出现一次无信号回测（0 = 从不，1 = 总是）。
 */
const REPLAY_STRATEGIES = [
  { strategyId: 'demo_ema_cross', symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], emptyEvery: 0 },
  { strategyId: 'demo_boll_reversion', symbols: ['ETHUSDT', 'SOLUSDT'], emptyEvery: 2 },
  // 总是无信号：用于演示"当天跑了但没动作"的策略如何被开关过滤
  { strategyId: 'demo_atr_breakout', symbols: ['BTCUSDT', 'SOLUSDT'], emptyEvery: 1 },
]

/** 判断某个 run 是否为无信号回测 */
function isEmptyRun(emptyEvery, dayIndex, symbolIndex) {
  if (emptyEvery === 0) return false
  if (emptyEvery === 1) return true
  return (dayIndex + symbolIndex) % emptyEvery === 0
}

/**
 * 规划某一天要生成哪些每日回测 run。
 *
 * @param {number} dayMs 数据所属日期的 UTC 00:00
 * @param {number} dayIndex 第几天（用于制造跨零点等差异）
 * @returns {Array<object>} run 描述数组
 */
function planReplayRuns(dayMs, dayIndex) {
  const runs = []
  // 每 5 天出现一次跨零点：回测在次日凌晨才跑完，运行日期比所属日期晚一天
  const crossesMidnight = dayIndex % 5 === 4
  // 不跨零点时当晚 22 点起跑；跨零点时次日 00:30 起跑
  const baseMs = crossesMidnight
    ? dayMs + MS_PER_DAY + 30 * 60 * 1000
    : dayMs + 22 * 3600 * 1000

  let offsetSec = 0
  for (const strategy of REPLAY_STRATEGIES) {
    for (const [i, symbol] of strategy.symbols.entries()) {
      // 逐标的启动，相差几十秒——与真实脚本的行为一致
      offsetSec += 40 + ((dayIndex * 7 + i * 13) % 50)
      const launchMs = baseMs + offsetSec * 1000
      const d = new Date(launchMs)

      runs.push({
        strategyId: strategy.strategyId,
        symbol,
        dayDir: formatCompactDate(dayMs),
        dateDir: formatCompactDate(launchMs),
        timeDir: `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`,
        launchMs,
        dayMs,
        isEmpty: isEmptyRun(strategy.emptyEvery, dayIndex, i),
      })
    }
  }
  return runs
}

/** 无信号回测的权益曲线：全程平线（没有交易，权益不变） */
function flatEquityCsv(dayMs) {
  const points = []
  for (let i = 0; i < WARMUP_DAYS; i += 1) {
    const ms = dayMs - (WARMUP_DAYS - 1 - i) * MS_PER_DAY
    points.push({
      date: new Date(ms).toISOString().slice(0, 10),
      equity: INITIAL_CASH,
      cash: INITIAL_CASH,
    })
  }
  return equityToCsv(points)
}

/**
 * 构造单个每日回测 run 的 backtest_result.json 与权益曲线。
 *
 * 复用 buildBacktestRun 合成指标与曲线，再把区间改写为「所属当天」——
 * 这是每日回测与历史回测唯一的实质差异（前端据此不展示回测区间列）。
 *
 * @returns {{result: object, equityCsv: string}}
 */
function buildReplayRun(run) {
  const { result, equityCsv } = buildBacktestRun({
    strategyId: run.strategyId,
    symbol: run.symbol,
    // 曲线回溯预热期，末点落在所属当天
    rangeStartMs: run.dayMs - (WARMUP_DAYS - 1) * MS_PER_DAY,
    rangeDays: WARMUP_DAYS,
    launchMs: run.launchMs,
    initialCash: INITIAL_CASH,
  })

  const isoDay = new Date(run.dayMs).toISOString().slice(0, 10)
  // 单日回测：区间起止都是所属当天
  result.config.start_date = isoDay
  result.config.end_date = isoDay
  result.config.name = `${run.strategyId}_${run.symbol} 每日回测`
  // 单日 15 分钟线共 96 根
  result.klines_processed = 96

  if (run.isEmpty) {
    // 无信号：跑完了但没触发交易。指标归零，曲线保持平线更贴近真实
    result.signals_processed = 0
    result.trades_count = 0
    result.metrics = {
      ...result.metrics,
      roe: 0,
      annualized_return: 0,
      total_return: 0,
      max_drawdown: 0,
      win_rate: 0,
      profit_factor: 0,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      sharpe_ratio: 0,
    }
    result.accounts[0].total_equity = INITIAL_CASH
    result.accounts[0].cash = INITIAL_CASH
    result.accounts[0].peak_equity = INITIAL_CASH
    result.accounts[0].max_drawdown = 0
    result.accounts[0].trade_count = 0
    return { result, equityCsv: flatEquityCsv(run.dayMs) }
  }

  // 单日成交量级远小于跨年回测，缩到个位数更可信
  const trades = 1 + (run.launchMs % 4)
  result.trades_count = trades
  result.signals_processed = trades * 2
  result.metrics.total_trades = trades

  return { result, equityCsv }
}

/**
 * 规划整个窗口的每日回测。
 *
 * @param {number[]} dates 各日 UTC 00:00 毫秒
 * @returns {Array<object>} run 描述数组（含 result 与 equityCsv）
 */
export function planReplayData(dates) {
  const out = []
  for (const [dayIndex, dayMs] of dates.entries()) {
    for (const run of planReplayRuns(dayMs, dayIndex)) {
      const { result, equityCsv } = buildReplayRun(run)
      out.push({ ...run, result, equityCsv })
    }
  }
  return out
}
