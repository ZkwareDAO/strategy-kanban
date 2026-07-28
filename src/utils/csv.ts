import Papa from 'papaparse'
import type { Position } from '@/models/position'
import type { KlinePoint } from '@/models/kline'

/**
 * 解析 CSV 字符串为对象数组
 * @param csv CSV 字符串
 * @returns 解析后的对象数组
 * @example
 * const csv = 'name,age\\nJohn,30\\nJane,25'
 * const result = parseCsv(csv)
 * // [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]
 */
export function parseCsv(csv: string): Record<string, string>[] {
  if (!csv || csv.trim() === '') {
    return []
  }

  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  return result.data || []
}

/**
 * 解析持仓汇总 CSV
 * @param csv CSV 字符串
 * @returns 持仓数组
 * @example
 * const csv = 'Position,Type,Entry,Exit,Entry Price,Realized PNL,...\\n1,long,...'
 * const positions = parsePositionSummary(csv)
 */
export function parsePositionSummary(csv: string): Position[] {
  const rows = parseCsv(csv)

  return rows
    .filter((row) => {
      // 过滤空行：position_id 为空则跳过
      const id = row.Position || row.position_id
      return id && id.trim() !== ''
    })
    .map((row) => ({
      position_id: row.Position || row.position_id,
      type: (row.Type || row.type) as 'long' | 'short',
      entry_time: row.Entry || row.entry_time,
      exit_time: parseExitTime(row.Exit || row.exit_time),
      entry_price: parsePrice(row['Entry Price'] || row.entry_price),
      realized_pnl: parsePercentage(row['Realized PNL'] || row.realized_pnl),
      max_potential_pnl: parsePercentage(row['Max Potential PNL'] || row.max_potential_pnl),
      max_drawdown: parsePercentage(row['Max Drawdown'] || row.max_drawdown),
    }))
}

/**
 * 解析平仓时间（如果为空则返回 undefined）
 */
function parseExitTime(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return undefined
  }
  return value
}

/**
 * 解析价格（移除 $ 符号）
 * @example
 * parsePrice('$65026.00') // 65026.00
 */
function parsePrice(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/[$,]/g, '')
  return parseFloat(cleaned)
}

/**
 * 解析百分比（移除 % 符号）
 * @example
 * parsePercentage('-1.12%') // -1.12
 */
function parsePercentage(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/%/g, '')
  return parseFloat(cleaned)
}

/**
 * 解析K线CSV
 * @param csv CSV 字符串
 * @returns K线数据点数组
 */
export function parseKline(csv: string): KlinePoint[] {
  const rows = parseCsv(csv)

  return rows
    .filter((row) => row.timestamp && row.datetime)
    .map((row) => ({
      timestamp: parseInt(row.timestamp, 10),
      datetime: row.datetime,
      open: parseFloat(row.open) || 0,
      high: parseFloat(row.high) || 0,
      low: parseFloat(row.low) || 0,
      close: parseFloat(row.close) || 0,
      position_id: row.position_id || '',
      entry_price: parseFloat(row.entry_price) || 0,
      position_type: (row.position_type === 'short' ? 'short' : 'long') as 'long' | 'short',
      pnl_pct: parseFloat(row.pnl_pct) || 0,
      is_entry: row.is_entry === 'True',
      is_exit: row.is_exit === 'True',
    }))
}