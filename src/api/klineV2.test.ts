import { describe, it, expect, vi, afterEach } from 'vitest'
import { getKlineV2 } from '@/api/klineV2'

function buildCsv(): string {
  const rows = [
    '2026-07-26 00:00:00+00:00,1,1,1,1,1',
    '2026-07-27 00:00:00+00:00,3,3,3,3,3',
    '2026-07-27 00:01:00+00:00,4,4,4,4,4',
    '2026-07-28 00:00:00+00:00,5,5,5,5,5',
  ]
  return `timestamp,open,high,low,close,volume\n${rows.join('\n')}\n`
}

describe('getKlineV2', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses Range slice path when server supports 206', async () => {
    const csv = buildCsv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const range = (init?.headers as Record<string, string> | undefined)?.Range ?? ''
        if (range.startsWith('bytes=0-0')) {
          return new Response(csv.slice(0, 1), {
            status: 206,
            headers: { 'content-range': `bytes 0-0/${csv.length}` },
          })
        }
        const m = /^bytes=(\d+)-(\d+)/.exec(range)
        const [s, e] = m ? [Number(m[1]), Number(m[2])] : [0, csv.length - 1]
        return new Response(csv.slice(s, e + 1), { status: 206 })
      }),
    )
    const out = await getKlineV2('BTCUSDT', '2026-07-27', '2026-07-27')
    expect(out.map(p => p.open)).toEqual([3, 4])
  })

  it('falls back to stream filter when Range unsupported (200)', async () => {
    const csv = buildCsv()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(csv, { status: 200 })))
    const out = await getKlineV2('BTCUSDT', '2026-07-27')
    expect(out.map(p => p.open)).toEqual([3, 4])
  })

  it('defaults endDate to startDate (single day)', async () => {
    const csv = buildCsv()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(csv, { status: 200 })))
    const out = await getKlineV2('BTCUSDT', '2026-07-28')
    expect(out).toHaveLength(1)
    expect(out[0].open).toBe(5)
  })
})
