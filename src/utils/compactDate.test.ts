import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  toCompactDate,
  shiftCompactDate,
  isAfterToday,
  compactDaysAgo,
} from '@/utils/compactDate'

describe('compactDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('toCompactDate', () => {
    it('formats UTC ms as YYYYMMDD', () => {
      expect(toCompactDate(Date.UTC(2026, 0, 2))).toBe('20260102')
    })
  })

  describe('shiftCompactDate', () => {
    it('steps forward and back by one day', () => {
      expect(shiftCompactDate('20260102', 1)).toBe('20260103')
      expect(shiftCompactDate('20260102', -1)).toBe('20260101')
    })

    it('crosses month boundaries', () => {
      expect(shiftCompactDate('20260131', 1)).toBe('20260201')
      expect(shiftCompactDate('20260301', -1)).toBe('20260228')
    })

    it('crosses year boundaries', () => {
      expect(shiftCompactDate('20251231', 1)).toBe('20260101')
      expect(shiftCompactDate('20260101', -1)).toBe('20251231')
    })

    it('handles leap day', () => {
      // 2028 是闰年，2/28 的后一天是 2/29 而非 3/1
      expect(shiftCompactDate('20280228', 1)).toBe('20280229')
      expect(shiftCompactDate('20280301', -1)).toBe('20280229')
    })

    it('returns empty string for malformed input', () => {
      expect(shiftCompactDate('', 1)).toBe('')
      expect(shiftCompactDate('2026-01-02', 1)).toBe('')
      expect(shiftCompactDate('202601', 1)).toBe('')
    })

    it('is a no-op for delta 0', () => {
      expect(shiftCompactDate('20260102', 0)).toBe('20260102')
    })
  })

  describe('isAfterToday', () => {
    it('is false for today and past dates', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-02T12:00:00Z'))
      expect(isAfterToday('20260102')).toBe(false)
      expect(isAfterToday('20260101')).toBe(false)
    })

    it('is true for future dates', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-02T12:00:00Z'))
      expect(isAfterToday('20260103')).toBe(true)
    })

    it('compares in UTC, not local time', () => {
      // 东八区已是 1/3 早晨，但 UTC 仍是 1/2--按 UTC 判定 20260103 属于未来。
      // 数据目录名按 UTC 落盘，若按本地时区会放开一个还没有数据的日期。
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-02T23:30:00Z'))
      expect(isAfterToday('20260103')).toBe(true)
    })

    it('returns false for malformed input (不把用户卡死)', () => {
      expect(isAfterToday('')).toBe(false)
      expect(isAfterToday('nope')).toBe(false)
    })
  })

  describe('compactDaysAgo', () => {
    it('returns yesterday for 1', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-02T12:00:00Z'))
      expect(compactDaysAgo(1)).toBe('20260101')
    })

    it('returns today for 0', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-02T12:00:00Z'))
      expect(compactDaysAgo(0)).toBe('20260102')
    })

    it('crosses a year boundary', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T05:00:00Z'))
      expect(compactDaysAgo(1)).toBe('20251231')
    })
  })
})
