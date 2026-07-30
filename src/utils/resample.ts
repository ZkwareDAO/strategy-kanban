/**
 * K线数据重采样工具
 */

import type { KlinePoint, TimeframeValue } from '@/models/kline'

/**
 * 将 1 分钟数据重采样到指定周期
 * @param data 1 分钟 K 线数据
 * @param timeframe 目标时间周期
 * @returns 重采样后的 K 线数据
 */
export function resampleKline(data: KlinePoint[], timeframe: TimeframeValue): KlinePoint[] {
  // 如果是 1 分钟，直接返回
  if (timeframe === '1m') {
    return data
  }

  // 解析周期
  const intervalMinutes = parseTimeframe(timeframe)
  if (intervalMinutes === 1) {
    return data
  }

  const resampled: KlinePoint[] = []

  // 按时间分组
  for (let i = 0; i < data.length; i++) {
    const current = data[i]
    const timestamp = current.timestamp

    // 计算当前K线属于哪个周期的开始时间
    const periodStart = Math.floor(timestamp / (intervalMinutes * 60)) * (intervalMinutes * 60)
    const periodIndex = resampled.findIndex(d => d.timestamp === periodStart)

    if (periodIndex === -1) {
      // 创建新的周期K线
      resampled.push({
        ...current,
        timestamp: periodStart,
        datetime: new Date(periodStart * 1000).toISOString().replace('T', ' ').substring(0, 19),
        // 保留开平仓的精确时间（用于显示）
        entry_time: current.is_entry ? current.datetime : undefined,
        exit_time: current.is_exit ? current.datetime : undefined,
      })
    } else {
      // 更新现有周期K线
      const existing = resampled[periodIndex]
      existing.high = Math.max(existing.high, current.high)
      existing.low = Math.min(existing.low, current.low)
      existing.close = current.close

      // 保持开平仓标记
      if (current.is_entry) {
        existing.is_entry = true
        existing.entry_time = current.datetime // 保留精确时间
      }
      if (current.is_exit) {
        existing.is_exit = true
        existing.exit_time = current.datetime // 保留精确时间
      }

      // 保持其他信息（取最后一个的值）
      if (current.position_id) existing.position_id = current.position_id
      if (current.entry_price) existing.entry_price = current.entry_price
      if (current.position_type) existing.position_type = current.position_type
      if (current.pnl_pct !== undefined) existing.pnl_pct = current.pnl_pct
    }
  }

  return resampled
}

/**
 * 解析时间周期字符串为分钟数
 * @param timeframe 时间周期
 * @returns 分钟数
 */
function parseTimeframe(timeframe: TimeframeValue): number {
  const map: Record<TimeframeValue, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  }
  return map[timeframe] || 1
}

/**
 * 根据数据量和时间周期，计算合适的默认显示数量
 * @param timeframe 时间周期
 * @returns 建议显示的 K 线数量
 */
export function getDefaultDisplayCount(timeframe: TimeframeValue): number {
  const map: Record<TimeframeValue, number> = {
    '1m': 100,   // 1分钟：100根
    '5m': 100,   // 5分钟：100根
    '15m': 100,  // 15分钟：100根
    '30m': 100,  // 30分钟：100根
    '1h': 80,    // 1小时：80根
    '4h': 60,    // 4小时：60根
    '1d': 50,    // 1天：50根
  }
  return map[timeframe] || 100
}