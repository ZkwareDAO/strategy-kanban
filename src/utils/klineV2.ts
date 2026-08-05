/**
 * v2 K线解析与持仓 overlay 工具
 *
 * 与 v1 (`src/utils/csv.ts` 的 parseKline) 的区别：
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
    exit_time: pos.exit_time,
  }
}

/**
 * 将持仓 overlay 到 K线，产出 v1 形状的 [[KlinePoint]] 数组
 *
 * - 按 `${date} ${HH:MM}` 匹配开/平仓 bar
 * - 命中开仓 bar：is_entry=true，写入 position_id/entry_price/position_type 与 entries
 * - 命中平仓 bar：is_exit=true，写入 position_id/entry_price/position_type 与 exits
 * - 其余 bar：中性默认（position_id=''、pnl_pct=0），OHLC 不变
 *
 * 无持仓时返回全中性数组，保证 `resampleKline` 可直接消费。
 */
export function mergePositions(kline: RawKlinePoint[], positions: DatedPosition[]): KlinePoint[] {
  const entryMap = new Map<string, DatedPosition[]>()
  const exitMap = new Map<string, DatedPosition[]>()
  const push = (map: Map<string, DatedPosition[]>, key: string, pos: DatedPosition) => {
    const arr = map.get(key)
    if (arr) arr.push(pos)
    else map.set(key, [pos])
  }
  for (const pos of positions) {
    push(entryMap, `${pos.date} ${padHM(pos.entry_time)}`, pos)
    if (pos.exit_time) push(exitMap, `${pos.date} ${padHM(pos.exit_time)}`, pos)
  }

  return kline.map(p => {
    const neutral = neutralKline(p)
    const minuteKey = `${p.datetime.slice(0, 10)} ${p.datetime.slice(11, 16)}`
    const entries = entryMap.get(minuteKey)
    if (entries && entries.length > 0) {
      const e = entries[0]
      return {
        ...neutral,
        is_entry: true,
        position_id: e.position_id,
        entry_price: e.entry_price,
        position_type: e.type,
        pnl_pct: e.realized_pnl,
        entries: entries.map(toEntryInfo),
      }
    }
    const exits = exitMap.get(minuteKey)
    if (exits && exits.length > 0) {
      const x = exits[0]
      return {
        ...neutral,
        is_exit: true,
        position_id: x.position_id,
        entry_price: x.entry_price,
        position_type: x.type,
        pnl_pct: x.realized_pnl,
        exits: exits.map(pos => toExitInfo(pos, p.close)),
      }
    }
    return neutral
  })
}
