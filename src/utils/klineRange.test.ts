import { describe, it, expect, vi } from 'vitest'
import { addOneDay, enumerateDates, sliceCsvByDateRange, probeRange, streamFilterByDateRange } from '@/utils/klineRange'

/**
 * 构造多日合成 K线 CSV（每行 open 值用于辨识行）
 */
function buildCsv(): string {
  const header = 'timestamp,open,high,low,close,volume'
  const rows = [
    '2026-07-26 00:00:00+00:00,1,1,1,1,1',
    '2026-07-26 00:01:00+00:00,2,2,2,2,2',
    '2026-07-27 00:00:00+00:00,3,3,3,3,3',
    '2026-07-27 00:01:00+00:00,4,4,4,4,4',
    '2026-07-28 00:00:00+00:00,5,5,5,5,5',
    '2026-07-29 00:00:00+00:00,6,6,6,6,6',
  ]
  return `${header}\n${rows.join('\n')}\n`
}

/** 基于合成 CSV 构造一个内存版 RangeFetcher（end 含） */
function makeFetchRange(csv: string) {
  return async (start: number, end: number): Promise<string> => {
    if (start >= csv.length) return ''
    return csv.slice(start, Math.min(end, csv.length - 1) + 1)
  }
}

describe('klineRange utils', () => {
  describe('addOneDay', () => {
    it('should increment a normal day', () => {
      expect(addOneDay('2026-07-27')).toBe('2026-07-28')
    })
    it('should roll over month boundary', () => {
      expect(addOneDay('2026-07-31')).toBe('2026-08-01')
    })
    it('should roll over year boundary', () => {
      expect(addOneDay('2026-12-31')).toBe('2027-01-01')
    })
    it('should handle non-leap February', () => {
      expect(addOneDay('2026-02-28')).toBe('2026-03-01')
    })
    it('it should handle leap February', () => {
      expect(addOneDay('2024-02-28')).toBe('2024-02-29')
    })
  })

  describe('enumerateDates', () => {
    it('should return a single date when start == end', () => {
      expect(enumerateDates('2026-07-27', '2026-07-27')).toEqual(['2026-07-27'])
    })
    it('should enumerate inclusive multi-day range', () => {
      expect(enumerateDates('2026-07-27', '2026-07-29')).toEqual([
        '2026-07-27',
        '2026-07-28',
        '2026-07-29',
      ])
    })
    it('should roll over month boundary', () => {
      expect(enumerateDates('2026-07-31', '2026-08-02')).toEqual([
        '2026-07-31',
        '2026-08-01',
        '2026-08-02',
      ])
    })
    it('should return empty when start > end', () => {
      expect(enumerateDates('2026-07-29', '2026-07-27')).toEqual([])
    })
    it('should cap at maxDays to avoid runaway loops', () => {
      expect(enumerateDates('2026-07-27', '2026-08-30', 2)).toEqual([
        '2026-07-27',
        '2026-07-28',
      ])
    })
  })

  describe('sliceCsvByDateRange', () => {
    it('should return exactly the rows of a single day', async () => {
      const csv = buildCsv()
      const out = await sliceCsvByDateRange(csv.length, '2026-07-27', '2026-07-27', makeFetchRange(csv))
      expect(out.map(p => p.open)).toEqual([3, 4])
    })

    it('should return rows across a multi-day range', async () => {
      const csv = buildCsv()
      const out = await sliceCsvByDateRange(csv.length, '2026-07-27', '2026-07-28', makeFetchRange(csv))
      expect(out.map(p => p.open)).toEqual([3, 4, 5])
    })

    it('should include from first data row when start is before file', async () => {
      const csv = buildCsv()
      const out = await sliceCsvByDateRange(csv.length, '2020-01-01', '2026-07-26', makeFetchRange(csv))
      expect(out.map(p => p.open)).toEqual([1, 2])
    })

    it('should include through last row when end is after file', async () => {
      const csv = buildCsv()
      const out = await sliceCsvByDateRange(csv.length, '2020-01-01', '2030-01-01', makeFetchRange(csv))
      expect(out.map(p => p.open)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('should return empty when range is entirely after file', async () => {
      const csv = buildCsv()
      const out = await sliceCsvByDateRange(csv.length, '2030-01-01', '2030-01-02', makeFetchRange(csv))
      expect(out).toHaveLength(0)
    })

    it('should return empty when range is entirely before file', async () => {
      const csv = buildCsv()
      const out = await sliceCsvByDateRange(csv.length, '2020-01-01', '2020-01-02', makeFetchRange(csv))
      expect(out).toHaveLength(0)
    })

    it('should parse timestamp/datetime on returned rows', async () => {
      const csv = buildCsv()
      const out = await sliceCsvByDateRange(csv.length, '2026-07-27', '2026-07-27', makeFetchRange(csv))
      expect(out[0].datetime).toBe('2026-07-27 00:00:00')
      expect(out[0].timestamp).toBe(Math.floor(Date.parse('2026-07-27T00:00:00+00:00') / 1000))
    })
  })

  describe('probeRange', () => {
    it('should report supported + fileSize on 206 with content-range', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        status: 206,
        headers: new Headers({ 'content-range': 'bytes 0-0/12345' }),
      })))
      const r = await probeRange('http://x/1m.csv')
      expect(r.supported).toBe(true)
      expect(r.fileSize).toBe(12345)
    })

    it('should report unsupported on 200 (no range support)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        status: 200,
        headers: new Headers({ 'content-length': '12345' }),
      })))
      const r = await probeRange('http://x/2m.csv')
      expect(r.supported).toBe(false)
    })
  })

  describe('streamFilterByDateRange (degraded path)', () => {
    it('should fetch full text and filter by date range', async () => {
      const csv = [
        'timestamp,open,high,low,close,volume',
        '2026-07-27 00:00:00+00:00,3,3,3,3,3',
        '2026-07-28 00:00:00+00:00,5,5,5,5,5',
      ].join('\n')
      vi.stubGlobal('fetch', vi.fn(async () => ({
        status: 200,
        headers: new Headers({ 'content-length': String(csv.length) }),
        text: async () => csv,
      })))
      const out = await streamFilterByDateRange('http://x/3m.csv', '2026-07-27', '2026-07-27')
      expect(out).toHaveLength(1)
      expect(out[0].open).toBe(3)
    })
  })
})
