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

/** 判断首列是否为时间戳数据行（用于跳过表头） */
function isDataRow(line: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(line.split(',')[0])
}

/** 安全数字解析：空串/非数返回 undefined */
function num(s: string | undefined): number | undefined {
  if (s == null || s === '') return undefined
  const v = Number(s)
  return Number.isNaN(v) ? undefined : v
}

/** 解析单行 CSV 为 RawKlinePoint，无法解析返回 null */
function parseRow(line: string): RawKlinePoint | null {
  const cols = line.split(',')
  if (cols.length < 5) return null
  const tsStr = cols[0]
  const open = num(cols[1])
  const high = num(cols[2])
  const low = num(cols[3])
  const close = num(cols[4])
  if (open == null || high == null || low == null || close == null) return null
  // 用 ISO 'T' 形式解析，确保按 UTC 正确解释 +00:00 偏移
  const ms = Date.parse(tsStr.replace(' ', 'T'))
  if (Number.isNaN(ms)) return null
  const point: RawKlinePoint = {
    timestamp: Math.floor(ms / 1000),
    datetime: tsStr.slice(0, 19).replace('T', ' '),
    open,
    high,
    low,
    close,
  }
  const volume = num(cols[5])
  if (volume != null) point.volume = volume
  return point
}

/**
 * 解析纯 OHLC K线 CSV 文本为 [[RawKlinePoint]] 数组
 * @param text CSV 文本，首行可为表头（自动跳过）；每行 `timestamp,open,high,low,close[,volume][,...]`
 */
export function parseKlineRaw(text: string): RawKlinePoint[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return []
  const startIdx = isDataRow(lines[0]) ? 0 : 1
  const result: RawKlinePoint[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const row = parseRow(lines[i])
    if (row) result.push(row)
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
    const eHm = extractHm(pos.entry_time)
    if (eHm) push(entryMap, `${pos.date} ${padHM(eHm)}`, pos)
    const xHm = extractHm(pos.exit_time)
    if (xHm) push(exitMap, `${pos.date} ${padHM(xHm)}`, pos)
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
