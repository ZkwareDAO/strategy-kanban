/**
 * v2 K线解析与持仓 overlay 工具
 *
 * 与 v1 K线解析 (`src/api/strategy.ts` 的 parseKline) 的区别：
 * - 输入是纯 OHLC CSV（无仓位字段），输出 [[RawKlinePoint]]
 * - 持仓通过 [[mergePositions]] 在数据加载层 overlay，产出 v1 形状的 [[KlinePoint]]，
 *   使 `resampleKline` 与指标逻辑无需改动即可复用
 */
import type { RawKlinePoint } from '@/models/klineV2'
import type { KlinePoint, EntryInfo, ExitInfo } from '@/models/kline'
import type { Position } from '@/models/position'

/**
 * 带日期标记的持仓（v2 多日场景下，持仓需绑定具体日期 YYYY-MM-DD）
 */
export interface DatedPosition extends Position {
  /** 持仓所属日期 YYYY-MM-DD */
  date: string
}

/** 从 [start,end) 取数字列；空串/非法返回 null */
function numberField(line: string, start: number, end: number): number | null {
  if (start >= end) return null
  const value = Number(line.slice(start, end))
  return Number.isFinite(value) ? value : null
}

/**
 * 固定格式时间解析：`YYYY-MM-DD[ T]HH:MM:SS[Z|+HH:MM]`。
 *
 * 避免每行 Date.parse 的字符串状态机开销；无法识别时返回 null。
 */
function parseTimestamp(ts: string): number | null {
  if (ts.length < 19) return null
  if (ts.charCodeAt(4) !== 45 || ts.charCodeAt(7) !== 45) return null
  if (ts.charCodeAt(10) !== 32 && ts.charCodeAt(10) !== 84) return null
  const year = Number(ts.slice(0, 4))
  const month = Number(ts.slice(5, 7))
  const day = Number(ts.slice(8, 10))
  const hour = Number(ts.slice(11, 13))
  const minute = Number(ts.slice(14, 16))
  const second = Number(ts.slice(17, 19))
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59
  ) {
    return null
  }
  let ms = Date.UTC(year, month - 1, day, hour, minute, second)
  const rest = ts.slice(19)
  const offset = /^([+-])(\d{2}):?(\d{2})/.exec(rest)
  if (offset) {
    const sign = offset[1] === '+' ? 1 : -1
    ms -= sign * (Number(offset[2]) * 3600 + Number(offset[3]) * 60) * 1000
  }
  return Math.floor(ms / 1000)
}

/**
 * 解析单行 CSV（不分配列数组），无法解析返回 null。
 * 行格式：`timestamp,open,high,low,close[,volume][,...]`
 */
export function parseKlineLine(line: string): RawKlinePoint | null {
  if (line.length < 21) return null
  const c1 = line.indexOf(',')
  if (c1 <= 0) return null
  const c2 = line.indexOf(',', c1 + 1)
  if (c2 < 0) return null
  const c3 = line.indexOf(',', c2 + 1)
  if (c3 < 0) return null
  const c4 = line.indexOf(',', c3 + 1)
  if (c4 < 0) return null
  const c5 = line.indexOf(',', c4 + 1)

  const timestamp = parseTimestamp(line.slice(0, c1))
  if (timestamp === null) return null
  const open = numberField(line, c1 + 1, c2)
  const high = numberField(line, c2 + 1, c3)
  const low = numberField(line, c3 + 1, c4)
  const close = numberField(line, c4 + 1, c5 < 0 ? line.length : c5)
  if (open === null || high === null || low === null || close === null) return null

  const point: RawKlinePoint = {
    timestamp,
    datetime: line.slice(0, 19).replace('T', ' '),
    open,
    high,
    low,
    close,
  }
  if (c5 >= 0) {
    const c6 = line.indexOf(',', c5 + 1)
    const volume = numberField(line, c5 + 1, c6 < 0 ? line.length : c6)
    if (volume !== null) point.volume = volume
  }
  return point
}

/**
 * 解析纯 OHLC K线 CSV 文本为 [[RawKlinePoint]] 数组。
 *
 * 单遍扫描：按 `\n` 定位行、按 `,` 定位列，避免 `split` 产生全量中间数组；
 * 表头与空行由 [[parseKlineLine]] 自然跳过。
 */
export function parseKlineRaw(text: string): RawKlinePoint[] {
  if (text.length === 0) return []
  const result: RawKlinePoint[] = []
  let pos = 0
  while (pos < text.length) {
    let next = text.indexOf('\n', pos)
    if (next < 0) next = text.length
    let end = next
    if (end > pos && text.charCodeAt(end - 1) === 13) end -= 1
    if (end > pos) {
      const row = parseKlineLine(text.slice(pos, end))
      if (row) result.push(row)
    }
    pos = next + 1
  }
  return result
}

/**
 * 按日期区间 [startDate, endDate] 过滤（含端点，YYYY-MM-DD）
 * 依赖零填充时间戳：字典序 == 时间序
 */
export function filterKlineByDateRange(
  data: RawKlinePoint[],
  startDate: string,
  endDate: string,
): RawKlinePoint[] {
  if (data.length === 0) return []
  return data.filter(p => {
    const d = p.datetime.slice(0, 10)
    return d >= startDate && d <= endDate
  })
}

/** 把 'H:MM' / 'HH:MM' 规整为 'HH:MM' */
function padHM(hm: string): string {
  const [h, m] = hm.split(':')
  return `${(h ?? '').padStart(2, '0')}:${(m ?? '').padStart(2, '0')}`
}

/**
 * 从 ISO 8601 时间字符串中提取 HH:MM
 * 支持 '2026-08-06T16:45:00+00:00' 和 '2026-08-06 16:45:00' 两种分隔
 * 无法解析时返回 null
 */
export function extractHm(iso: string | null | undefined): string | null {
  if (!iso) return null
  const sep = iso.includes('T') ? iso.indexOf('T') : iso.indexOf(' ')
  if (sep < 0) return null
  return iso.slice(sep + 1, sep + 6)
}

/**
 * ISO 时间 → `YYYY-MM-DD HH:MM` 键。
 * 用完整日期而非 DatedPosition.date，跨日平仓时平仓日才与 K线 bar 对得上。
 */
function minuteKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const sep = iso.includes('T') ? iso.indexOf('T') : iso.indexOf(' ')
  if (sep < 0) return null
  const hm = iso.slice(sep + 1, sep + 6)
  return `${iso.slice(0, 10)} ${padHM(hm)}`
}

/** 构造中性（无持仓）KlinePoint，OHLC 保留 */
function neutralKline(p: RawKlinePoint): KlinePoint {
  return {
    timestamp: p.timestamp,
    datetime: p.datetime,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    position_id: '',
    entry_price: 0,
    position_type: 'long',
    pnl_pct: 0,
    is_entry: false,
    is_exit: false,
  }
}

function toEntryInfo(pos: DatedPosition): EntryInfo {
  return {
    position_id: pos.position_id,
    position_type: pos.type,
    entry_price: pos.entry_price,
    entry_time: pos.entry_time,
  }
}

function toExitInfo(pos: DatedPosition, exitPrice: number): ExitInfo {
  return {
    position_id: pos.position_id,
    position_type: pos.type,
    exit_price: exitPrice,
    exit_time: pos.exit_time ?? undefined,
  }
}

/**
 * 计算浮动收益率 (%)
 */
function floatingPnl(positionType: 'long' | 'short', entryPrice: number, currentPrice: number): number {
  if (!entryPrice) return 0
  if (positionType === 'long') {
    return ((currentPrice - entryPrice) / entryPrice) * 100
  }
  return ((entryPrice - currentPrice) / entryPrice) * 100
}

/**
 * 将持仓 overlay 到 K线，产出 v1 形状的 [[KlinePoint]] 数组
 *
 * - 按时间匹配开/平仓 bar
 * - 开仓 bar：is_entry=true，写入 entries
 * - 平仓 bar：is_exit=true，写入 exits，pnl_pct=已实现收益率
 * - 持仓期间每根 bar：写入 position_id/entry_price/position_type，pnl_pct=按收盘价计算的浮动收益率
 * - 其余 bar：中性默认，OHLC 不变
 *
 * 无持仓时返回全中性数组，保证 `resampleKline` 可直接消费。
 */
export function mergePositions(kline: RawKlinePoint[], positions: DatedPosition[]): KlinePoint[] {
  // 构建时间→持仓的映射
  const entryMap = new Map<string, DatedPosition[]>()
  const exitMap = new Map<string, DatedPosition[]>()
  const push = (map: Map<string, DatedPosition[]>, key: string, pos: DatedPosition) => {
    const arr = map.get(key)
    if (arr) arr.push(pos)
    else map.set(key, [pos])
  }
  for (const pos of positions) {
    const entryKey = minuteKey(pos.entry_time)
    if (entryKey) push(entryMap, entryKey, pos)
    const exitKey = minuteKey(pos.exit_time)
    if (exitKey) push(exitMap, exitKey, pos)
  }

  // 先构建基础数组，标记 entry/exit bar
  //
  // 注意：同一根 bar 可能既是某笔的平仓点、又是下一笔的开仓点（连续开平仓，
  // 如 00:02 平掉第1笔同时开第2笔）。因此 entry 与 exit 必须同时判断并共存，
  // 不能命中 entry 就提前返回，否则这些 bar 的平仓标记会全部丢失。
  const result = kline.map(p => {
    const neutral = neutralKline(p)
    const minuteKey = `${p.datetime.slice(0, 10)} ${p.datetime.slice(11, 16)}`
    const entries = entryMap.get(minuteKey)
    const exits = exitMap.get(minuteKey)
    const hasEntry = !!(entries && entries.length > 0)
    const hasExit = !!(exits && exits.length > 0)
    if (!hasEntry && !hasExit) return neutral

    const bar: KlinePoint = { ...neutral }

    if (hasExit) {
      const x = exits![0]
      bar.is_exit = true
      bar.exits = exits!.map(pos => toExitInfo(pos, p.close))
      // 平仓语义优先用于 ROI 展示：该 bar 的 pnl_pct 取已实现收益率
      bar.position_id = x.position_id
      bar.entry_price = x.entry_price
      bar.position_type = x.type
      bar.pnl_pct = x.realized_pnl ?? 0
    }

    if (hasEntry) {
      const e = entries![0]
      bar.is_entry = true
      bar.entries = entries!.map(toEntryInfo)
      // 仅当该 bar 不是平仓 bar 时，才把主字段指向新开的仓位；
      // 同时既平又开时保留平仓的 pnl_pct，避免已实现收益被覆盖为 0。
      if (!hasExit) {
        bar.position_id = e.position_id
        bar.entry_price = e.entry_price
        bar.position_type = e.type
        bar.pnl_pct = 0
      }
    }

    return bar
  })

  // 第二遍：为每个持仓填充持仓期间的浮动 ROI
  //
  // 定位开/平仓 bar 用 entries/exits 数组匹配，而非 bar.position_id——
  // 连续开平仓时一根 bar 同时承载多笔（既是上一笔平仓又是下一笔开仓），
  // bar.position_id 只能保存其中一个，用它匹配会漏掉其余仓位。
  for (const pos of positions) {
    // 找到开仓 bar（entry_time 为 null 的跨日仓位没有开仓标记）
    let entryIdx = -1
    for (let i = 0; i < result.length; i++) {
      const bar = result[i]
      if (bar.is_entry && bar.entries?.some(e => e.position_id === pos.position_id)) {
        entryIdx = i
        break
      }
    }

    // 找到平仓 bar
    let exitIdx = -1
    for (let i = 0; i < result.length; i++) {
      const bar = result[i]
      if (bar.is_exit && bar.exits?.some(x => x.position_id === pos.position_id)) {
        exitIdx = i
        break
      }
    }

    // 有开仓标记：从开仓 bar 开始；跨日仓位无开仓标记：从当天第一根 bar 开始
    const startIdx = entryIdx >= 0 ? entryIdx : 0
    const endIdx = exitIdx >= 0 ? exitIdx : result.length

    // 填充持仓期间每根 bar 的浮动 ROI（平仓 bar 保留 realized_pnl）
    for (let i = startIdx; i < endIdx; i++) {
      const bar = result[i]
      // 该 bar 是任一仓位的平仓点时，保留其已实现收益，不被浮动 ROI 覆盖
      if (bar.is_exit) continue

      if (!bar.position_id) {
        bar.position_id = pos.position_id
        bar.entry_price = pos.entry_price
        bar.position_type = pos.type
      }
      bar.pnl_pct = floatingPnl(pos.type, pos.entry_price, kline[i].close)
    }
  }

  return result
}

/** ISO 时间 → epoch 秒；缺失时回退到 date 当天 00:00 */
function isoSeconds(iso: string | null | undefined, fallbackDate?: string): number | null {
  const raw = iso || (fallbackDate ? `${fallbackDate}T00:00:00Z` : null)
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

/** 二分查找包含 timestamp 的 bar 下标；早于首根或晚于末根返回 -1 */
function findBarIndex(bars: RawKlinePoint[], timestamp: number, intervalSeconds: number): number {
  if (bars.length === 0) return -1
  if (timestamp < bars[0].timestamp) return -1
  const last = bars[bars.length - 1]
  if (timestamp >= last.timestamp + intervalSeconds) return -1
  let lo = 0
  let hi = bars.length - 1
  let answer = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].timestamp <= timestamp) {
      answer = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return answer
}

/**
 * 在**已重采样**的 K 线上叠加仓位（按时间区间，而非精确分钟）。
 *
 * 大周期 bar 的 datetime 是周期起点，仓位可能在周期中间开平；用时间戳二分
 * 定位所属 bar，开仓/平仓标记落在包含该时刻的 bar 上，持仓期间按收盘价计算
 * 浮动 ROI。适用于服务端已聚合或前端重采样后的任意周期。
 */
export function mergePositionsByTime(
  kline: RawKlinePoint[],
  positions: DatedPosition[],
  intervalSeconds: number,
): KlinePoint[] {
  const result = kline.map(neutralKline)
  if (positions.length === 0) return result

  const interval = intervalSeconds > 0 ? intervalSeconds : 60
  for (const pos of positions) {
    const hasEntryTime = Boolean(pos.entry_time)
    const entryTs = isoSeconds(pos.entry_time, pos.date)
    const exitTs = isoSeconds(pos.exit_time)

    const entryIdx =
      hasEntryTime && entryTs !== null ? findBarIndex(kline, entryTs, interval) : -1
    // 无开仓时间（跨日持仓）：从 `date` 当天第一根开始计算浮动 ROI
    const fallbackStart = kline.findIndex(bar => bar.datetime.slice(0, 10) >= pos.date)
    const fillStart = entryIdx >= 0 ? entryIdx : Math.max(0, fallbackStart)
    const exitIdx = exitTs === null ? -1 : findBarIndex(kline, exitTs, interval)
    if (entryIdx < 0 && exitIdx < 0 && fallbackStart < 0) continue

    if (entryIdx >= 0) {
      const bar = result[entryIdx]
      bar.is_entry = true
      bar.entry_time = pos.entry_time ?? undefined
      if (!bar.entries) bar.entries = []
      bar.entries.push(toEntryInfo(pos))
    }
    if (exitIdx >= 0) {
      const bar = result[exitIdx]
      bar.is_exit = true
      bar.exit_time = pos.exit_time ?? undefined
      if (!bar.exits) bar.exits = []
      bar.exits.push(toExitInfo(pos, kline[exitIdx].close))
    }

    const start = fillStart
    const end = exitIdx >= 0 ? exitIdx : result.length
    for (let i = start; i < end; i++) {
      const bar = result[i]
      if (bar.is_exit) continue
      if (!bar.position_id) {
        bar.position_id = pos.position_id
        bar.entry_price = pos.entry_price
        bar.position_type = pos.type
      }
      bar.pnl_pct = floatingPnl(pos.type, pos.entry_price, kline[i].close)
    }
  }

  return result
}
