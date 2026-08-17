/**
 * 由行情推导交易数据
 *
 * 关键设计：仓位不是独立编造的，而是**在合成行情上真实模拟出来的**——
 * 开仓价取自某一分钟 K 线的收盘价，之后逐分钟向前扫描，触及止盈/止损/
 * 最大持仓时长才平仓，`realized_pnl` 由真实价差算出。
 *
 * 这样做的收益：详情页图上的开平仓标记会精确落在蜡烛上，ROI 曲线与 K 线走势
 * 吻合；若改为随机编造盈亏，标记会漂浮在 K 线之外，一眼假。
 *
 * 时间对齐要求：仓位的 entry_time/exit_time 按 `HH:MM` 与 1m K 线匹配
 * （见 src/utils/klineV2.ts 的 mergePositions），因此秒位必须为 00。
 */
import { createRng, hashSeed, randInt } from './rng.mjs'
import { formatDate, startOfUtcDay } from './market.mjs'
import { runtimeName } from './strategies.mjs'

const MS_PER_MINUTE = 60000
const MINUTES_PER_DAY = 1440

/** ISO 8601（UTC，秒位归零以对齐 1m K 线） */
function isoUtc(ms) {
  return `${new Date(ms).toISOString().slice(0, 19)}+00:00`
}

/** 保留 n 位小数的数字 */
function round(value, digits) {
  return Number(value.toFixed(digits))
}

/** 收益率（%）：做空时价差取反 */
function pnlPct(type, entryPrice, price) {
  const raw = ((price - entryPrice) / entryPrice) * 100
  return type === 'long' ? raw : -raw
}

/**
 * 从某根 K 线开仓，向前扫描直到平仓，返回一笔完整交易。
 *
 * 退出条件按优先级：触及止盈 → 触及止损 → 达到最大持仓时长（按市价平）。
 * 扫描过程中记录浮盈峰值与最大回撤，作为 max_potential_pnl / max_drawdown。
 *
 * 序列末尾不足以完成持仓时返回未平仓（exitIdx 为 null），正好演示
 * DATA-SPEC 中「持仓中」的字段形态。
 */
function simulateTrade(rows, entryIdx, type, cfg) {
  const entryPrice = rows[entryIdx].close
  const maxHold = cfg.holdMinutes[1]
  const takeProfit = cfg.pnlScale
  // 止损略宽于止盈：小亏多、大赚少的形态更接近真实策略，也让胜率自然高于 50%
  const stopLoss = cfg.pnlScale * 1.25

  let peak = 0
  let trough = 0
  let exitIdx = null

  const lastIdx = Math.min(entryIdx + maxHold, rows.length - 1)
  for (let i = entryIdx + 1; i <= lastIdx; i += 1) {
    const pnl = pnlPct(type, entryPrice, rows[i].close)
    if (pnl > peak) peak = pnl
    if (pnl < trough) trough = pnl
    if (pnl >= takeProfit || pnl <= -stopLoss) {
      exitIdx = i
      break
    }
  }
  // 扫到上限仍未触发止盈止损：按最后一根平仓（若已到序列末尾则视为持仓中）
  if (exitIdx === null && lastIdx < rows.length - 1) exitIdx = lastIdx

  const trade = {
    type,
    entryIdx,
    entryTs: rows[entryIdx].ts,
    entryPrice,
    exitIdx,
    exitTs: exitIdx === null ? null : rows[exitIdx].ts,
    exitPrice: exitIdx === null ? null : rows[exitIdx].close,
    maxPotentialPnl: round(peak, 4),
    maxDrawdown: round(trough, 4),
  }
  trade.realizedPnl =
    exitIdx === null ? null : round(pnlPct(type, entryPrice, rows[exitIdx].close), 4)
  return trade
}

/**
 * 为一个 (策略, 标的) 组合在整个窗口内模拟交易序列。
 *
 * 在整个窗口上连续模拟（而非按天独立生成），是为了自然产出**跨日仓位**——
 * 前一天开仓、次日平仓的情况，用于演示 DATA-SPEC 中 entry_time 为 null 的规则。
 */
export function simulateTrades(strategy, symbol, rows) {
  const rng = createRng(hashSeed(`trades:${strategy.dirName}:${symbol}`))
  const trades = []
  // 开仓间隔的期望分钟数，由日均开仓次数反推
  const avgGap = MINUTES_PER_DAY / strategy.tradesPerDay
  let cursor = randInt(rng, 0, Math.floor(avgGap))

  while (cursor < rows.length - 1) {
    const type = rng() < 0.5 ? 'long' : 'short'
    const trade = simulateTrade(rows, cursor, type, strategy)
    trades.push(trade)

    if (trade.exitIdx === null) break // 持仓中，窗口内不再开新仓
    // 平仓后等待一段随机间隔再开下一笔（指数分布近似泊松到达）
    const gap = Math.max(5, Math.round(-Math.log(1 - rng()) * avgGap * 0.6))
    cursor = trade.exitIdx + gap
  }

  return trades
}

/**
 * 把交易序列按日切分为每日 positions.json
 *
 * 每天收录「当天开仓」与「当天平仓」的仓位。跨日仓位在平仓日的
 * `entry_time` 置为 null（当天没有开仓动作，不该画开仓标记），但保留
 * `entry_price` 供 ROI 曲线计算——见 DATA-SPEC 第 2 节「跨日仓位处理规则」。
 */
export function buildDailyPositions(strategy, symbol, trades) {
  const runtime = runtimeName(strategy, symbol)
  const byDate = new Map()
  const ensure = (dateKey) => {
    let arr = byDate.get(dateKey)
    if (!arr) {
      arr = []
      byDate.set(dateKey, arr)
    }
    return arr
  }

  for (const t of trades) {
    const entryDay = formatDate(startOfUtcDay(t.entryTs))
    const exitDay = t.exitTs === null ? null : formatDate(startOfUtcDay(t.exitTs))
    const positionId = `${runtime}_${symbol}_${Math.floor(t.entryTs / 1000)}`

    const base = {
      position_id: positionId,
      type: t.type,
      entry_price: t.entryPrice,
      max_potential_pnl: t.maxPotentialPnl,
      max_drawdown: t.maxDrawdown,
    }

    if (exitDay === entryDay) {
      // 当日开当日平：完整一条
      ensure(entryDay).push({
        ...base,
        entry_time: isoUtc(t.entryTs),
        exit_time: isoUtc(t.exitTs),
        exit_price: t.exitPrice,
        realized_pnl: t.realizedPnl,
      })
      continue
    }

    // 开仓日：记为持仓中（当天尚未平仓）
    ensure(entryDay).push({
      ...base,
      entry_time: isoUtc(t.entryTs),
      exit_time: null,
      exit_price: null,
      realized_pnl: null,
    })

    // 平仓日：entry_time 置 null，保留 entry_price
    if (exitDay !== null) {
      ensure(exitDay).push({
        ...base,
        entry_time: null,
        exit_time: isoUtc(t.exitTs),
        exit_price: t.exitPrice,
        realized_pnl: t.realizedPnl,
      })
    }
  }

  return byDate
}

/**
 * 构造 backtest.json（回放交易点）
 *
 * 回放信号在实盘信号基础上加入微小的时间与价格偏差，模拟回测与实盘的
 * 执行差异——这正是 comparison.json 要度量的对象。少量信号被刻意丢弃，
 * 使「未匹配信号」一栏有内容可展示。
 */
export function buildBacktestTrades(strategy, symbol, positions, rows, decimals) {
  const rng = createRng(hashSeed(`backtest:${strategy.dirName}:${symbol}`))
  const rowByTs = new Map(rows.map((r) => [r.ts, r]))
  const trades = []

  for (const p of positions) {
    // 约 8% 的信号回放侧缺失，制造 unmatched_live
    if (rng() < 0.08) continue

    const pushPoint = (iso, side, price) => {
      const ts = Date.parse(iso)
      // 时间偏差 -2 ~ +2 分钟
      const shiftedTs = ts + randInt(rng, -2, 2) * MS_PER_MINUTE
      const row = rowByTs.get(shiftedTs)
      const basePrice = row ? row.close : price
      // 价格偏差 ±0.05%
      const drifted = basePrice * (1 + (rng() - 0.5) * 0.001)
      trades.push({
        timestamp: new Date(shiftedTs).toISOString().slice(0, 19),
        side,
        price: round(drifted, decimals),
        pnl: 0,
      })
    }

    if (p.entry_time) {
      pushPoint(p.entry_time, p.type === 'long' ? 'BUY' : 'SELL', p.entry_price)
    }
    if (p.exit_time && p.exit_price != null) {
      const side = p.type === 'long' ? 'SELL_CLOSE' : 'BUY_CLOSE'
      pushPoint(p.exit_time, side, p.exit_price)
      // 平仓点带上该笔盈亏
      trades[trades.length - 1].pnl = p.realized_pnl ?? 0
    }
  }

  trades.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return trades
}

/**
 * 构造 comparison.json（实盘 vs 回放信号对比）
 *
 * 统计量由上面两份数据真实计算，而非填写好看的常数——这样用户改动生成参数后
 * 报告依然自洽。
 */
export function buildComparison(strategy, symbol, compactDate, positions, backtestTrades) {
  // 实盘信号点：每个开仓/平仓动作各算一个
  const liveSignals = []
  for (const p of positions) {
    if (p.entry_time) liveSignals.push({ ts: Date.parse(p.entry_time), price: p.entry_price })
    if (p.exit_time && p.exit_price != null) {
      liveSignals.push({ ts: Date.parse(p.exit_time), price: p.exit_price })
    }
  }
  const btSignals = backtestTrades.map((t) => ({
    ts: Date.parse(`${t.timestamp}Z`),
    price: t.price,
  }))

  const TOLERANCE_MS = 5 * MS_PER_MINUTE
  const usedBt = new Set()
  const matchedPairs = []

  for (const live of liveSignals) {
    let bestIdx = -1
    let bestDiff = Infinity
    for (let i = 0; i < btSignals.length; i += 1) {
      if (usedBt.has(i)) continue
      const diff = Math.abs(btSignals[i].ts - live.ts)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = i
      }
    }
    if (bestIdx >= 0 && bestDiff <= TOLERANCE_MS) {
      usedBt.add(bestIdx)
      matchedPairs.push({ live, backtest: btSignals[bestIdx], diffMs: bestDiff })
    }
  }

  const timeDiffs = matchedPairs.map((m) => m.diffMs / 1000)
  const priceDiffs = matchedPairs.map(
    (m) => (Math.abs(m.backtest.price - m.live.price) / m.live.price) * 100,
  )
  const avg = (arr) => (arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length)
  const max = (arr) => (arr.length === 0 ? 0 : Math.max(...arr))
  const stdDev = (arr) => {
    if (arr.length === 0) return 0
    const m = avg(arr)
    return Math.sqrt(avg(arr.map((v) => (v - m) ** 2)))
  }

  const totalLive = liveSignals.length
  const matched = matchedPairs.length
  const accuracy = totalLive === 0 ? 0 : matched / totalLive

  let recommendation = 'NO_DATA'
  if (totalLive > 0) {
    if (accuracy >= 0.9) recommendation = 'GOOD'
    else if (accuracy >= 0.7) recommendation = 'ACCEPTABLE'
    else recommendation = 'NEEDS_REVIEW'
  }

  const unmatchedLive = liveSignals
    .filter((l) => !matchedPairs.some((m) => m.live === l))
    .map((l) => ({ timestamp: isoUtc(l.ts), price: l.price }))
  const unmatchedBacktest = btSignals
    .filter((_, i) => !usedBt.has(i))
    .map((b) => ({ timestamp: isoUtc(b.ts), price: b.price }))

  return {
    strategy: strategy.sourceStrategy,
    symbol,
    date: `${compactDate}-${compactDate}`,
    total_live: totalLive,
    total_backtest: btSignals.length,
    matched,
    accuracy_score: round(accuracy, 4),
    recommendation,
    time_accuracy: {
      avg_diff_seconds: round(avg(timeDiffs), 2),
      max_diff_seconds: round(max(timeDiffs), 2),
      std_dev_seconds: round(stdDev(timeDiffs), 2),
    },
    price_accuracy: {
      avg_diff_pct: round(avg(priceDiffs), 4),
      max_diff_pct: round(max(priceDiffs), 4),
      'within_0.1pct': priceDiffs.filter((d) => d <= 0.1).length,
      'within_0.5pct': priceDiffs.filter((d) => d <= 0.5).length,
    },
    // 示例数据没有真实 signal_id，全部归入时间窗口匹配
    signal_id_matched: 0,
    time_window_matched: matched,
    unmatched_live: unmatchedLive,
    unmatched_backtest: unmatchedBacktest,
    matched_signals: matchedPairs.map((m) => ({
      live_time: isoUtc(m.live.ts),
      backtest_time: isoUtc(m.backtest.ts),
      live_price: m.live.price,
      backtest_price: m.backtest.price,
      time_diff_seconds: round(m.diffMs / 1000, 2),
    })),
  }
}

/**
 * 构造 trading_positions_{date}.csv 的行
 *
 * **快照语义**：当天的文件既含当天平仓的仓位，也含此前开仓、当天仍持有的仓位。
 * 因此同一笔会在多天重复出现，前端按 (strategy_name, asset, created_at) 去重
 * （见 src/utils/modeFilter.ts 的 dedupePositions）——`created_at` 必须在各天
 * 保持一致，否则同一笔会被算成多笔。
 *
 * `strategy_name` 格式为 `{dirName}_{SYMBOL}`（不含模式后缀），这样前端去掉
 * 末段 SYMBOL 后得到的策略组名正好等于 manifest 的 `strategy` 字段。
 */
export function buildPerformanceRows(strategy, symbol, trades, dayStartMs, dayEndMs) {
  const rows = []
  for (const t of trades) {
    // 当天开盘后才开仓的，尚未发生
    if (t.entryTs > dayEndMs) continue
    // 当天开始前就已平仓的，不再出现在快照里
    if (t.exitTs !== null && t.exitTs < dayStartMs) continue

    const isClosed = t.exitTs !== null && t.exitTs <= dayEndMs
    // 名义本金按杠杆放大，把收益率换算成金额
    const notional = 1000 * strategy.leverage
    const pnlValue = isClosed ? round((t.realizedPnl / 100) * notional, 4) : 0

    rows.push({
      asset: symbol,
      strategy_name: `${strategy.dirName}_${symbol}`,
      pos_type: 2,
      pnl_value: pnlValue,
      deleted: isClosed ? 1 : 0,
      created_at: isoUtc(t.entryTs),
      close_time: isClosed ? isoUtc(t.exitTs) : '',
      leverage: strategy.leverage,
    })
  }
  return rows
}

/** 性能 CSV 表头（与 docs/DATA-SPEC.md 第 5 节一致） */
export const PERFORMANCE_HEADER =
  'asset,strategy_name,pos_type,pnl_value,deleted,created_at,close_time,leverage'

/** 行数组序列化为 CSV */
export function performanceRowsToCsv(rows) {
  const lines = [PERFORMANCE_HEADER]
  for (const r of rows) {
    lines.push(
      [
        r.asset,
        r.strategy_name,
        r.pos_type,
        r.pnl_value,
        r.deleted,
        r.created_at,
        r.close_time,
        r.leverage,
      ].join(','),
    )
  }
  return `${lines.join('\n')}\n`
}
