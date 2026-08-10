import Papa from 'papaparse'

/**
 * 解析 CSV 字符串为对象数组
 * @param csv CSV 字符串
 * @returns 解析后的对象数组
 * @example
 * const csv = 'name,age\nJohn,30\nJane,25'
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
