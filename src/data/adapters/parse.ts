import type { DatasetTradingMode } from '@/models/dataset'

export type CsvRow = Record<string, string>

/** 字符串列；缺失返回空串 */
export function readString(row: CsvRow, key: string): string {
  return row[key] ?? ''
}

/** 可空字符串列；空串归一为 null */
export function readNullableString(row: CsvRow, key: string): string | null {
  const value = row[key]
  return value === undefined || value === '' ? null : value
}

/** 数字列；缺失或非法返回 fallback */
export function readNumber(row: CsvRow, key: string, fallback = 0): number {
  const value = row[key]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 可空数字列 */
export function readNullableNumber(row: CsvRow, key: string): number | null {
  const value = row[key]
  if (value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 0/1 标志列 */
export function readFlag(row: CsvRow, key: string): boolean {
  const value = row[key]
  return value === '1' || value === 'true'
}

/** 交易模式归一 */
export function readTradingMode(row: CsvRow): DatasetTradingMode {
  switch (row.trading_mode) {
    case 'live':
      return 'live'
    case 'paper':
    case 'paper_trading':
      return 'paper_trading'
    case 'smoking':
      return 'smoking'
    case 'backtest':
      return 'backtest'
    default:
      return 'unknown'
  }
}
