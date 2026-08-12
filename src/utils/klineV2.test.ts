import { describe, it, expect } from 'vitest'
import { parseKlineRaw, filterKlineByDateRange, mergePositions, extractHm } from '@/utils/klineV2'
import type { DatedPosition } from '@/utils/klineV2'
import type { RawKlinePoint } from '@/models/klineV2'

function row(ts: string, o: number, h: number, l: number, c: number, v?: number): string {
  return v === undefined ? `${ts},${o},${h},${l},${c}` : `${ts},${o},${h},${l},${c},${v}`
}

describe('klineV2 utils', () => {
  describe('parseKlineRaw', () => {
    it('should convert string timestamp to epoch seconds + UTC datetime', () => {
      const csv = `timestamp,open,high,low,close,volume\n${row('2022-12-30 00:00:00+00:00', 246.13, 246.31, 246.12, 246.13, 1544.36)}`
      const points = parseKlineRaw(csv)
      expect(points).toHaveLength(1)
      const expectedTs = Math.floor(Date.parse('2022-12-30T00:00:00+00:00') / 1000)
      expect(points[0].timestamp).toBe(expectedTs)
      expect(points[0].datetime).toBe('2022-12-30 00:00:00')
      expect(points[0].open).toBe(246.13)
      expect(points[0].volume).toBe(1544.36)
    })

    it('should treat volume as optional when column absent', () => {
      const csv = `timestamp,open,high,low,close\n${row('2022-12-30 00:01:00+00:00', 1, 2, 0.5, 1.5)}`
      const points = parseKlineRaw(csv)
      expect(points).toHaveLength(1)
      expect(points[0].volume).toBeUndefined()
    })

    it('should return empty array for empty / header-only CSV', () => {
      expect(parseKlineRaw('')).toHaveLength(0)
      expect(parseKlineRaw('timestamp,open,high,low,close,volume')).toHaveLength(0)
    })

    it('should skip rows with unparseable timestamp or OHLC', () => {
      const csv = [
        'timestamp,open,high,low,close,volume',
        row('2022-12-30 00:00:00+00:00', 1, 2, 0.5, 1.5, 10),
        'not-a-date,1,2,0.5,1.5,10',
        '2022-12-30 00:01:00+00:00,,2,0.5,1.5,10',
      ].join('\n')
      const points = parseKlineRaw(csv)
      expect(points).toHaveLength(1)
      expect(points[0].datetime).toBe('2022-12-30 00:00:00')
    })
  })

  describe('filterKlineByDateRange', () => {
    const points: RawKlinePoint[] = [
      { timestamp: 1, datetime: '2026-07-26 23:59:00', open: 1, high: 1, low: 1, close: 1 },
      { timestamp: 2, datetime: '2026-07-27 00:00:00', open: 2, high: 2, low: 2, close: 2 },
      { timestamp: 3, datetime: '2026-07-27 12:30:00', open: 3, high: 3, low: 3, close: 3 },
      { timestamp: 4, datetime: '2026-07-28 00:00:00', open: 4, high: 4, low: 4, close: 4 },
      { timestamp: 5, datetime: '2026-07-29 00:00:00', open: 5, high: 5, low: 5, close: 5 },
    ]

    it('should keep rows within [start, end] inclusive (single day)', () => {
      const out = filterKlineByDateRange(points, '2026-07-27', '2026-07-27')
      expect(out).toHaveLength(2)
      expect(out.map(p => p.open)).toEqual([2, 3])
    })

    it('should keep rows across a multi-day range', () => {
      const out = filterKlineByDateRange(points, '2026-07-27', '2026-07-28')
      expect(out).toHaveLength(3)
    })

    it('should return empty when range matches nothing', () => {
      expect(filterKlineByDateRange(points, '2025-01-01', '2025-01-02')).toHaveLength(0)
    })

    it('should return empty for empty input', () => {
      expect(filterKlineByDateRange([], '2026-07-27', '2026-07-27')).toHaveLength(0)
    })
  })

  describe('extractHm', () => {
    it('should extract HH:MM from T-separated ISO string', () => {
      expect(extractHm('2026-08-06T16:45:00+00:00')).toBe('16:45')
    })
    it('should extract HH:MM from space-separated datetime', () => {
      expect(extractHm('2026-08-06 09:05:00')).toBe('09:05')
    })
    it('should return null for null/undefined/empty', () => {
      expect(extractHm(null)).toBeNull()
      expect(extractHm(undefined)).toBeNull()
      expect(extractHm('')).toBeNull()
    })
  })

  describe('mergePositions', () => {
    const kline: RawKlinePoint[] = [
      { timestamp: 60, datetime: '2026-07-27 00:14:00', open: 100, high: 101, low: 99, close: 100 },
      { timestamp: 120, datetime: '2026-07-27 00:15:00', open: 100, high: 102, low: 100, close: 101 },
      { timestamp: 180, datetime: '2026-07-27 00:16:00', open: 101, high: 103, low: 101, close: 102 },
      { timestamp: 240, datetime: '2026-07-27 05:11:00', open: 102, high: 104, low: 102, close: 103 },
      { timestamp: 300, datetime: '2026-07-28 00:00:00', open: 103, high: 105, low: 103, close: 104 },
    ]

    it('should mark entry/exit bars from ISO timestamps and keep OHLC', () => {
      const positions: DatedPosition[] = [
        {
          position_id: 'p1', type: 'long',
          entry_time: '2026-07-27T00:15:00+00:00',
          exit_time: '2026-07-27T05:11:00+00:00',
          entry_price: 100.5, exit_price: 103,
          realized_pnl: 2.3, max_potential_pnl: 3.0, max_drawdown: -0.5,
          date: '2026-07-27',
        },
      ]
      const merged = mergePositions(kline, positions)
      expect(merged[1].is_entry).toBe(true)
      expect(merged[1].position_id).toBe('p1')
      expect(merged[1].entry_price).toBe(100.5)
      expect(merged[3].is_exit).toBe(true)
      expect(merged[3].position_id).toBe('p1')
      expect(merged[1].open).toBe(100)
    })

    // 回归：连续开平仓（上一笔平仓与下一笔开仓落在同一分钟）时，
    // 该 bar 必须同时带 is_entry 和 is_exit，否则平仓标记会全部丢失，
    // 蜡烛图上表现为「N 个开仓点只剩 1 个平仓点」。
    it('should keep both entry and exit on a bar that closes one position and opens the next', () => {
      const backToBackKline: RawKlinePoint[] = [
        { timestamp: 1, datetime: '2026-08-06 00:00:00', open: 0.72, high: 0.72, low: 0.71, close: 0.7198 },
        { timestamp: 2, datetime: '2026-08-06 00:02:00', open: 0.72, high: 0.73, low: 0.72, close: 0.7204 },
        { timestamp: 3, datetime: '2026-08-06 00:04:00', open: 0.72, high: 0.73, low: 0.72, close: 0.7204 },
      ]
      const positions: DatedPosition[] = [
        {
          position_id: 'a', type: 'long',
          entry_time: '2026-08-06T00:00:00+00:00',
          exit_time: '2026-08-06T00:02:07.903235+00:00',
          entry_price: 0.7198, exit_price: 0.7204,
          realized_pnl: 0.0834, max_potential_pnl: 0.0834, max_drawdown: 0,
          date: '2026-08-06',
        },
        {
          position_id: 'b', type: 'long',
          entry_time: '2026-08-06T00:02:00+00:00',
          exit_time: '2026-08-06T00:04:10.221242+00:00',
          entry_price: 0.7198, exit_price: 0.7204,
          realized_pnl: 0.0834, max_potential_pnl: 0.0834, max_drawdown: 0,
          date: '2026-08-06',
        },
      ]
      const merged = mergePositions(backToBackKline, positions)

      // 00:02 既平掉 a 又开出 b
      expect(merged[1].is_exit).toBe(true)
      expect(merged[1].is_entry).toBe(true)
      expect(merged[1].exits?.map(x => x.position_id)).toContain('a')
      expect(merged[1].entries?.map(e => e.position_id)).toContain('b')
      // 平仓语义优先：该 bar 的 ROI 取已实现收益，不被浮动 ROI 覆盖
      expect(merged[1].pnl_pct).toBe(0.0834)
      // 00:04 是 b 的平仓点，同样不能丢
      expect(merged[2].is_exit).toBe(true)
      expect(merged[2].exits?.map(x => x.position_id)).toContain('b')
    })

    it('should leave all bars neutral when no positions', () => {
      const merged = mergePositions(kline, [])
      expect(merged).toHaveLength(kline.length)
      expect(merged.every(p => p.is_entry === false && p.is_exit === false)).toBe(true)
      expect(merged.every(p => p.position_id === '')).toBe(true)
      expect(merged[0].pnl_pct).toBe(0)
    })

    it('should handle open positions (null exit_time) with no exit bar', () => {
      const positions: DatedPosition[] = [
        {
          position_id: 'p1', type: 'short',
          entry_time: '2026-07-27T00:15:00+00:00',
          exit_time: null, entry_price: 100, exit_price: null,
          realized_pnl: null, max_potential_pnl: 0, max_drawdown: 0,
          date: '2026-07-27',
        },
      ]
      const merged = mergePositions(kline, positions)
      expect(merged[1].is_entry).toBe(true)
      expect(merged.every(p => p.is_exit === false)).toBe(true)
    })

    it('should support multi-day overlay via DatedPosition.date', () => {
      const positions: DatedPosition[] = [
        {
          position_id: 'p1', type: 'short',
          entry_time: '2026-07-27T00:15:00+00:00',
          exit_time: null, entry_price: 100, exit_price: null,
          realized_pnl: null, max_potential_pnl: 0, max_drawdown: 0,
          date: '2026-07-27',
        },
        {
          position_id: 'p2', type: 'long',
          entry_time: '2026-07-28T00:00:00+00:00',
          exit_time: null, entry_price: 103, exit_price: null,
          realized_pnl: null, max_potential_pnl: 0, max_drawdown: 0,
          date: '2026-07-28',
        },
      ]
      const merged = mergePositions(kline, positions)
      expect(merged[1].is_entry).toBe(true)
      expect(merged[1].position_type).toBe('short')
      expect(merged[4].is_entry).toBe(true)
      expect(merged[4].position_id).toBe('p2')
    })

    it('should not match a position whose date is outside the kline range', () => {
      const positions: DatedPosition[] = [
        {
          position_id: 'pX', type: 'long',
          entry_time: '2025-01-01T00:15:00+00:00',
          exit_time: null, entry_price: 100, exit_price: null,
          realized_pnl: null, max_potential_pnl: 0, max_drawdown: 0,
          date: '2025-01-01',
        },
      ]
      const merged = mergePositions(kline, positions)
      expect(merged.every(p => p.is_entry === false)).toBe(true)
    })
  })
})
