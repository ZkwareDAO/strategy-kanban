import Papa from 'papaparse'
import { FRONTEND_DATA_BASE_URL } from '@/config/frontendData'
import type { OrderPosition } from '@/models/performance'

function toNumber(value: string | undefined, fallback = 0): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  return Number.isNaN(n) ? fallback : n
}

function csvRowToOrderPosition(row: Record<string, string>): OrderPosition {
  return {
    asset: row.asset ?? '',
    strategy_name: row.strategy_name ?? '',
    pos_type: toNumber(row.pos_type, 0),
    pnl_value: toNumber(row.pnl_value),
    deleted: toNumber(row.deleted, 0),
    created_at: row.created_at ?? '',
    close_time: row.close_time || null,
  }
}

/** 读取单日 CSV，文件不存在时返回空数组 */
async function readOneDay(yyyymmdd: string): Promise<OrderPosition[]> {
  const url = `${FRONTEND_DATA_BASE_URL}/trading_data/trading_positions_${yyyymmdd}.csv`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const text = await res.text()
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    })
    return (parsed.data || []).map(csvRowToOrderPosition)
  } catch {
    return []
  }
}

/** 将 RFC3339 时间区间展开为 YYYYMMDD 日期数组（含首尾，UTC） */
function enumerateDates(createdFrom: string, createdTo: string): string[] {
  const from = new Date(createdFrom)
  const to = new Date(createdTo)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return []

  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))

  const dates: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const y = cur.getUTCFullYear()
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d = String(cur.getUTCDate()).padStart(2, '0')
    dates.push(`${y}${m}${d}`)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

/**
 * 获取策略表现仓位数据（从静态 CSV 文件读取，与后端 service 解耦）
 *
 * 遍历日期区间内的每一天，读取 trading_positions_{date}.csv 并合并。
 * 缺失的日期文件会被静默跳过（开源环境正常）。
 *
 * @param createdFrom RFC3339 起始时间
 * @param createdTo   RFC3339 结束时间
 */
export async function getOrderPositions(
  createdFrom: string,
  createdTo: string,
): Promise<OrderPosition[]> {
  const dates = enumerateDates(createdFrom, createdTo)
  if (dates.length === 0) return []

  const perDay = await Promise.all(dates.map(readOneDay))
  return perDay.flat()
}
