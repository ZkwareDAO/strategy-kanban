import { describe, it, expect } from 'vitest'
import { resampleRawKline } from '@/utils/resample'
import type { RawKlinePoint } from '@/models/klineV2'

function point(datetime: string, open: number, high: number, low: number, close: number, volume?: number): RawKlinePoint {
  return {
    timestamp: Math.floor(Date.parse(`${datetime.replace(' ', 'T')}Z`) / 1000),
    datetime,
    open,
    high,
    low,
    close,
    ...(volume === undefined ? {} : { volume }),
  }
}

describe('resampleRawKline', () => {
  it('aggregates 1m bars into a larger bucket', () => {
    const raw = [
      point('2026-10-22 00:00:00', 100, 101, 99, 100, 1),
      point('2026-10-22 00:01:00', 100, 102, 100, 101, 2),
      point('2026-10-22 00:02:00', 101, 103, 101, 102, 3),
      point('2026-10-22 00:05:00', 102, 104, 102, 103, 4),
    ]

    const out = resampleRawKline(raw, '5m')

    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      datetime: '2026-10-22 00:00:00',
      open: 100,
      high: 103,
      low: 99,
      close: 102,
      volume: 6,
    })
    expect(out[1].open).toBe(102)
    expect(out[1].close).toBe(103)
  })

  it('returns the same bars for the 1m timeframe', () => {
    const raw = [point('2026-10-22 00:00:00', 1, 2, 0.5, 1.5)]
    expect(resampleRawKline(raw, '1m')[0]).toMatchObject({ open: 1, close: 1.5 })
  })

  it('keeps volume undefined when input has no volume', () => {
    const raw = [point('2026-10-22 00:00:00', 1, 2, 0.5, 1.5)]
    expect(resampleRawKline(raw, '5m')[0].volume).toBeUndefined()
  })

  it('returns empty for empty input', () => {
    expect(resampleRawKline([], '5m')).toEqual([])
  })
})
