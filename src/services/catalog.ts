import type { CatalogDay } from '@/models/dataset'
import { dataRepository } from '@/data'

export interface CatalogDayInfo {
  /** YYYYMMDD */
  compact: string
  /** YYYY-MM-DD */
  iso: string
}

export interface CatalogSource {
  getCatalog(): Promise<CatalogDay[]>
}

/** YYYYMMDD → YYYY-MM-DD */
export function compactToIso(day: string): string {
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`
}

/**
 * catalog 中最新的一天。
 *
 * 页面默认日期优先对齐数据而不是系统“昨天”：离线/回放数据往往滞后于当天，
 * 否则打开页面默认就是空态。
 */
export async function getLatestCatalogDay(
  repository: CatalogSource = dataRepository,
): Promise<CatalogDayInfo | null> {
  const days = await repository.getCatalog()
  let latest = ''
  for (const day of days) {
    if (/^\d{8}$/.test(day.day) && day.day > latest) latest = day.day
  }
  return latest ? { compact: latest, iso: compactToIso(latest) } : null
}
