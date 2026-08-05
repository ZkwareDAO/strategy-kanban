/**
 * K线数据重采样工具
 */

import type { KlinePoint, TimeframeValue, EntryInfo, ExitInfo } from '@/models/kline'

/**
 * 将 1 分钟数据重采样到指定周期
 * @param data 1 分钟 K 线数据
 * @param timeframe 目标时间周期
 * @returns 重采样后的 K 线数据
 */
export function resampleKline(data: KlinePoint[], timeframe: TimeframeValue): KlinePoint[] {
  // 解析周期。1m 时 intervalMinutes=1，periodStart 即分钟对齐的时间戳，
  // 此时下方分组逻辑会合并同一分钟内多个仓位产生的重复 K 线（v1 kline CSV 每个仓位一行），
  // 否则 category 轴上「数组下标 ≠ 唯一类别数」会导致 range 越界、1m 蜡烛图一片空白。
  const intervalMinutes = parseTimeframe(timeframe)

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
      const newKline: KlinePoint = {
        ...current,
        timestamp: periodStart,
        datetime: new Date(periodStart * 1000).toISOString().replace('T', ' ').substring(0, 19),
        // 保留开平仓的精确时间（用于显示）
        entry_time: current.is_entry ? current.datetime : undefined,
        exit_time: current.is_exit ? current.datetime : undefined,
        // 收集该K线上的所有开仓点
        entries: current.is_entry
          ? [{
              position_id: current.position_id,
              position_type: current.position_type,
              entry_price: current.entry_price,
              entry_time: current.datetime,
            }]
          : [],
        // 收集该K线上的所有平仓点
        exits: current.is_exit
          ? [{
              position_id: current.position_id,
              position_type: current.position_type,
              exit_price: current.close,
              exit_time: current.datetime,
            }]
          : [],
      }

      // 如果是开仓点，将 entry_price 限制在 K 线价格范围内
      if (current.is_entry && current.entry_price) {
        const minPrice = Math.min(current.open, current.high, current.low, current.close)
        const maxPrice = Math.max(current.open, current.high, current.low, current.close)
        newKline.entry_price = Math.max(minPrice, Math.min(maxPrice, current.entry_price))
      }

      resampled.push(newKline)
    } else {
      // 更新现有周期K线
      const existing = resampled[periodIndex]
      existing.high = Math.max(existing.high, current.high)
      existing.low = Math.min(existing.low, current.low)
      existing.close = current.close

      // 收集开仓点到 entries 数组（而不是覆盖）
      if (current.is_entry) {
        existing.is_entry = true
        existing.entry_time = current.datetime // 保留精确时间

        // 追加到 entries 数组
        if (!existing.entries) existing.entries = []
        existing.entries.push({
          position_id: current.position_id,
          position_type: current.position_type,
          entry_price: current.entry_price,
          entry_time: current.datetime,
        })
      }
      if (current.is_exit) {
        existing.is_exit = true
        existing.exit_time = current.datetime // 保留精确时间

        // 追加到 exits 数组
        if (!existing.exits) existing.exits = []
        existing.exits.push({
          position_id: current.position_id,
          position_type: current.position_type,
          exit_price: current.close,
          exit_time: current.datetime,
        })
      }

      // 保持其他信息（取最后一个的值）
      if (current.position_id) existing.position_id = current.position_id
      if (current.entry_price) {
        // 将 entry_price 限制在当前 K 线的价格范围内
        const minPrice = Math.min(existing.open, existing.high, existing.low, existing.close)
        const maxPrice = Math.max(existing.open, existing.high, existing.low, existing.close)
        existing.entry_price = Math.max(minPrice, Math.min(maxPrice, current.entry_price))
      }
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
