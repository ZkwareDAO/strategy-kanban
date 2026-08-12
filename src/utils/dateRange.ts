/**
 * 日期区间工具
 *
 * 将 RFC3339 时间区间展开为 YYYYMMDD 日期数组（含首尾，UTC）。
 * 抽出为独立工具，供 performance.ts 与 strategy.ts 的 getRuntimesForDateRange 复用。
 *
 * @param from RFC3339 起始时间
 * @param to   RFC3339 结束时间
 * @returns YYYYMMDD 日期数组；解析失败返回空数组
 */
export function enumerateDates(from: string, to: string): string[] {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return []

  const start = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()))
  const end = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()))

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
