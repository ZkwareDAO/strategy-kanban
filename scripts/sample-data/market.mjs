/**
 * 合成 OHLCV 行情
 *
 * 前端实际只读两个周期（其余周期由 `resampleKline` 在浏览器端重采样得出）：
 *   - `kline-data/1m/{SYMBOL}_1m.csv`  详情页唯一数据源（api/klineV2.ts）
 *   - `kline-data/1d/{SYMBOL}_1d.csv`  回测详情页的价格叠加（api/backtest.ts）
 * 因此这里也只生成这两种。
 *
 * 价格用几何随机游走合成，不含任何真实历史行情。
 *
 * 两个硬性格式约束（否则前端读不出数据）：
 *   1. 行首必须是零填充的 `YYYY-MM-DD`——Range 二分查找靠字典序 == 时间序
 *      来定位字节区间（utils/klineRange.ts）
 *   2. 数据行按时间升序，首行为表头
 */
import { createRng, gaussian, hashSeed } from './rng.mjs'

/** 每分钟一根 K 线 */
const MINUTES_PER_DAY = 1440
/** 日线回溯长度，供回测详情页的权益/价格对比曲线使用 */
export const DAILY_HISTORY_DAYS = 540

/**
 * 示例标的：均为公开市场符号，基准价与波动率为便于观察而设定的虚构值。
 * `decimals` 控制价格小数位，贴近各标的常见报价精度。
 */
export const SYMBOLS = [
  { symbol: 'BTCUSDT', basePrice: 64000, dailyVol: 0.028, decimals: 1, baseVolume: 35 },
  { symbol: 'ETHUSDT', basePrice: 3200, dailyVol: 0.034, decimals: 2, baseVolume: 420 },
  { symbol: 'SOLUSDT', basePrice: 148, dailyVol: 0.045, decimals: 3, baseVolume: 1800 },
]

/** CSV 表头（与 docs/DATA-SPEC.md 第 6 节一致） */
const KLINE_HEADER = 'timestamp,open,high,low,close,volume'

const MS_PER_DAY = 86400000
const MS_PER_MINUTE = 60000

/** 格式化为 `YYYY-MM-DD HH:MM:SS+00:00`（UTC，零填充） */
export function formatTimestamp(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    ` ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`
  )
}

/** `YYYY-MM-DD`（UTC） */
export function formatDate(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** `YYYYMMDD`（UTC） */
export function formatCompactDate(ms) {
  return formatDate(ms).replace(/-/g, '')
}

/** 当日 UTC 00:00 的毫秒时间戳 */
export function startOfUtcDay(ms) {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * 由一根 K 线的开收价与波动幅度推出 high/low。
 *
 * 保证 high >= max(open, close) 且 low <= min(open, close)——若违反此不变量，
 * 蜡烛图会画出上下影线穿过实体的畸形图形。
 */
function buildBar(openPrice, closePrice, wickRatio, decimals) {
  const hi = Math.max(openPrice, closePrice)
  const lo = Math.min(openPrice, closePrice)
  const span = Math.max(hi * wickRatio, hi - lo)
  const round = (v) => Number(v.toFixed(decimals))
  return {
    open: round(openPrice),
    high: round(hi + span * 0.45),
    low: round(Math.max(lo - span * 0.45, lo * 0.5)),
    close: round(closePrice),
  }
}

/**
 * 生成 1m K 线序列
 *
 * @param {object} cfg SYMBOLS 中的标的配置
 * @param {number} startMs 起始 UTC 日 00:00
 * @param {number} days 天数
 * @param {number} anchorPrice 起始价（与日线序列衔接，避免两个周期价位打架）
 * @returns {{rows: Array, csv: string}} rows 供推导交易，csv 供落盘
 */
export function generateMinuteSeries(cfg, startMs, days, anchorPrice) {
  const rng = createRng(hashSeed(`1m:${cfg.symbol}`))
  // 把日波动率摊到每分钟：sigma_1m = sigma_1d / sqrt(1440)
  const stepVol = cfg.dailyVol / Math.sqrt(MINUTES_PER_DAY)
  const rows = []
  const lines = [KLINE_HEADER]
  let price = anchorPrice

  for (let i = 0; i < days * MINUTES_PER_DAY; i += 1) {
    const ts = startMs + i * MS_PER_MINUTE
    const openPrice = price
    // 轻微均值回复，防止长序列价格漂移到不合理区间
    const pull = ((anchorPrice - price) / anchorPrice) * 0.002
    price = price * (1 + gaussian(rng) * stepVol + pull)
    const bar = buildBar(openPrice, price, stepVol * 1.6, cfg.decimals)
    // 日内成交量呈双峰（欧美盘时段活跃），让量柱不至于平坦
    const hour = new Date(ts).getUTCHours()
    const activity = 0.6 + 0.7 * Math.abs(Math.sin(((hour - 2) / 24) * Math.PI * 2))
    const volume = Number((cfg.baseVolume * activity * (0.5 + rng())).toFixed(3))

    rows.push({ ts, ...bar, volume })
    lines.push(`${formatTimestamp(ts)},${bar.open},${bar.high},${bar.low},${bar.close},${volume}`)
  }

  return { rows, csv: `${lines.join('\n')}\n` }
}

/**
 * 生成 1m 窗口之前的日线历史。
 *
 * 反向游走：从窗口起始价往回推，使历史末端自然衔接 1m 序列的起点。
 */
export function generateDailyHistory(cfg, endExclusiveMs, days) {
  const rng = createRng(hashSeed(`1d:${cfg.symbol}`))
  const backward = []
  let price = cfg.basePrice

  for (let i = 1; i <= days; i += 1) {
    const ts = endExclusiveMs - i * MS_PER_DAY
    const closePrice = price
    price = price * (1 - gaussian(rng) * cfg.dailyVol)
    const bar = buildBar(price, closePrice, cfg.dailyVol * 0.8, cfg.decimals)
    const volume = Number((cfg.baseVolume * MINUTES_PER_DAY * (0.5 + rng())).toFixed(3))
    backward.push({ ts, ...bar, volume })
  }

  return backward.reverse()
}

/** 把 1m 序列按 UTC 日聚合为日线（保证两个周期完全自洽） */
export function aggregateDaily(minuteRows) {
  const byDay = new Map()
  for (const row of minuteRows) {
    const day = startOfUtcDay(row.ts)
    const acc = byDay.get(day)
    if (!acc) {
      byDay.set(day, {
        ts: day,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      })
      continue
    }
    acc.high = Math.max(acc.high, row.high)
    acc.low = Math.min(acc.low, row.low)
    acc.close = row.close
    acc.volume += row.volume
  }
  return [...byDay.values()].map((d) => ({ ...d, volume: Number(d.volume.toFixed(3)) }))
}

/** 日线行数组序列化为 CSV */
export function dailyRowsToCsv(rows) {
  const lines = [KLINE_HEADER]
  for (const r of rows) {
    lines.push(`${formatTimestamp(r.ts)},${r.open},${r.high},${r.low},${r.close},${r.volume}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * 生成一个标的的完整行情
 *
 * @returns {{minuteRows: Array, minuteCsv: string, dailyRows: Array, dailyCsv: string}}
 */
export function generateSymbolMarket(cfg, windowStartMs, windowDays) {
  const history = generateDailyHistory(cfg, windowStartMs, DAILY_HISTORY_DAYS)
  // 以历史最后一根日线的收盘价作为 1m 序列的起点
  const anchor = history.length > 0 ? history[history.length - 1].close : cfg.basePrice
  const minute = generateMinuteSeries(cfg, windowStartMs, windowDays, anchor)
  const dailyRows = [...history, ...aggregateDaily(minute.rows)]

  return {
    minuteRows: minute.rows,
    minuteCsv: minute.csv,
    dailyRows,
    dailyCsv: dailyRowsToCsv(dailyRows),
  }
}
