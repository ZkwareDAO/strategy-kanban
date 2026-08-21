/**
 * 紧凑日期（YYYYMMDD）工具
 *
 * 页面上的「每日收益」「每日回放」都用 YYYYMMDD 作为日期键（与数据源的目录名
 * 一致）。日期步进原先内联在 StrategyList.vue 里，每日回放页也要同样的前一日/
 * 后一日行为，故抽出共用。
 *
 * 全部按 UTC 计算：数据目录名由数据生成端按 UTC 落盘，用本地时区会在东八区
 * 的凌晨算出前一天，导致翻页对不上目录。
 */

/** 紧凑日期格式校验 */
const COMPACT_DATE_RE = /^\d{8}$/

const MS_PER_DAY = 86400000

/** YYYYMMDD → UTC 零点毫秒；格式非法返回 null */
function toUtcMs(compact: string): number | null {
  if (!COMPACT_DATE_RE.test(compact)) return null
  const year = Number(compact.slice(0, 4))
  const month = Number(compact.slice(4, 6))
  const day = Number(compact.slice(6, 8))
  const ms = Date.UTC(year, month - 1, day)
  return Number.isNaN(ms) ? null : ms
}

/** UTC 毫秒 → YYYYMMDD */
export function toCompactDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * 日期步进。
 *
 * @param compact 紧凑日期 YYYYMMDD
 * @param delta 天数偏移（-1 前一日，1 后一日）
 * @returns 偏移后的紧凑日期；输入非法返回空串
 */
export function shiftCompactDate(compact: string, delta: number): string {
  const ms = toUtcMs(compact)
  if (ms === null) return ''
  return toCompactDate(ms + delta * MS_PER_DAY)
}

/**
 * 判断给定日期是否晚于今天（UTC）。
 *
 * 用于禁用「后一日」按钮--未来日期不会有数据。
 * 输入非法返回 false：宁可放开按钮，也不要把用户卡死在一个无法翻动的日期上。
 */
export function isAfterToday(compact: string): boolean {
  const ms = toUtcMs(compact)
  if (ms === null) return false
  const now = new Date()
  return ms > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

/**
 * 今天往前推 n 天的紧凑日期（UTC）。
 *
 * @param days 往前推的天数（1 = 昨天）
 */
export function compactDaysAgo(days: number): string {
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return toCompactDate(todayUtc - days * MS_PER_DAY)
}
