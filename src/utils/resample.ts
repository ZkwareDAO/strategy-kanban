/**
 * K线数据重采样工具
 */

import type { KlinePoint, TimeframeValue } from '@/models/kline'
import type { RawKlinePoint } from '@/models/klineV2'

function periodStartOf(timestamp: number, intervalSeconds: number): number {
  return Math.floor(timestamp / intervalSeconds) * intervalSeconds
}

function periodDatetime(periodStart: number): string {
  return new Date(periodStart * 1000).toISOString().replace('T', ' ').substring(0, 19)
}

/**
 * 将 1 分钟数据重采样到指定周期。
 *
 * 输入按时间升序；用「上一个桶」游标代替 findIndex，复杂度 O(n)。
 */
export function resampleKline(data: KlinePoint[], timeframe: TimeframeValue): KlinePoint[] {
  const intervalSeconds = timeframeMinutes(timeframe) * 60
  const resampled: KlinePoint[] = []
  let currentPeriod = -1
  let currentIndex = -1

  for (let i = 0; i < data.length; i++) {
    const current = data[i]
    const periodStart = periodStartOf(current.timestamp, intervalSeconds)

    if (periodStart !== currentPeriod) {
      const newKline: KlinePoint = {
        ...current,
        timestamp: periodStart,
        datetime: periodDatetime(periodStart),
        entry_time: current.is_entry ? current.datetime : undefined,
        exit_time: current.is_exit ? current.datetime : undefined,
        entries: current.is_entry
          ? [{
              position_id: current.position_id,
              position_type: current.position_type,
              entry_price: current.entry_price,
              entry_time: current.datetime,
            }]
          : [],
        exits: current.is_exit
          ? [{
              position_id: current.position_id,
              position_type: current.position_type,
              exit_price: current.close,
              exit_time: current.datetime,
            }]
          : [],
      }

      if (current.is_entry && current.entry_price) {
        const minPrice = Math.min(current.open, current.high, current.low, current.close)
        const maxPrice = Math.max(current.open, current.high, current.low, current.close)
        newKline.entry_price = Math.max(minPrice, Math.min(maxPrice, current.entry_price))
      }

      resampled.push(newKline)
      currentPeriod = periodStart
      currentIndex = resampled.length - 1
      continue
    }

    const existing = resampled[currentIndex]
    existing.high = Math.max(existing.high, current.high)
    existing.low = Math.min(existing.low, current.low)
    existing.close = current.close

    if (current.is_entry) {
      existing.is_entry = true
      existing.entry_time = current.datetime
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
      existing.exit_time = current.datetime
      if (!existing.exits) existing.exits = []
      existing.exits.push({
        position_id: current.position_id,
        position_type: current.position_type,
        exit_price: current.close,
        exit_time: current.datetime,
      })
    }

    if (current.position_id) existing.position_id = current.position_id
    if (current.entry_price) {
      const minPrice = Math.min(existing.open, existing.high, existing.low, existing.close)
      const maxPrice = Math.max(existing.open, existing.high, existing.low, existing.close)
      existing.entry_price = Math.max(minPrice, Math.min(maxPrice, current.entry_price))
    }
    if (current.position_type) existing.position_type = current.position_type
    if (current.pnl_pct !== undefined) existing.pnl_pct = current.pnl_pct
  }

  return resampled
}

/**
 * 纯 OHLC 重采样（无仓位字段），用于 K 线服务与预热段。
 * 单遍桶累积，O(n)。
 */
export function resampleRawKline(
  data: RawKlinePoint[],
  timeframe: TimeframeValue,
): RawKlinePoint[] {
  if (data.length === 0) return []
  const intervalSeconds = timeframeMinutes(timeframe) * 60
  const out: RawKlinePoint[] = []
  let currentPeriod = -1
  let current: RawKlinePoint | null = null

  for (const point of data) {
    const periodStart = periodStartOf(point.timestamp, intervalSeconds)
    if (!current || periodStart !== currentPeriod) {
      current = {
        timestamp: periodStart,
        datetime: periodDatetime(periodStart),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      }
      if (point.volume !== undefined) current.volume = point.volume
      out.push(current)
      currentPeriod = periodStart
      continue
    }

    if (point.high > current.high) current.high = point.high
    if (point.low < current.low) current.low = point.low
    current.close = point.close
    if (point.volume !== undefined) {
      current.volume = (current.volume ?? 0) + point.volume
    }
  }

  return out
}

/**
 * 解析时间周期字符串为分钟数
 */
export function timeframeMinutes(timeframe: TimeframeValue): number {
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
 */
export function getDefaultDisplayCount(timeframe: TimeframeValue): number {
  const map: Record<TimeframeValue, number> = {
    '1m': 100,
    '5m': 100,
    '15m': 100,
    '30m': 100,
    '1h': 80,
    '4h': 60,
    '1d': 50,
  }
  return map[timeframe] || 100
}
