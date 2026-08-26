import { describe, it, expect, vi, afterEach } from 'vitest'
import { getWarmupKline, MAX_WARMUP_1M_DAYS } from '@/api/klineWarmup'
import { KLINE_BASE_URL } from '@/config/klineSource'

/** 构造 CSV（与 klineV2.test.ts / klineRange.test.ts 同风格：open 值标识行） */
function buildCsv(rows: string[]): string {
  return `timestamp,open,high,low,close,volume\n${rows.join('\n')}\n`
}

/**
 * 模拟支持 Range 的 CSV 服务器。
 * 按 URL 分流数据；未在 map 中登记（或值为 undefined）的 URL 返回 404，
 * 用于模拟数据源未提供该周期聚合文件的情形。
 */
function mockRangeServer(csvForUrl: Record<string, string | undefined>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const csv = csvForUrl[url]
      if (csv == null) return new Response('Not Found', { status: 404 })

      const range = (init?.headers as Record<string, string> | undefined)?.Range ?? ''
      const m = /^bytes=(\d+)-(\d+)/.exec(range)
      if (!m) {
        // 非 Range 请求（降级路径会拉整文件）
        return new Response(csv, { status: 200 })
      }
      const s = Number(m[1])
      const e = Number(m[2])
      return new Response(csv.slice(s, e + 1), {
        status: 206,
        headers: { 'content-range': `bytes ${s}-${e}/${csv.length}` },
      })
    }),
  )
}

const URL_4H = `${KLINE_BASE_URL}/4h/BTCUSDT_4h.csv`
const URL_1M = `${KLINE_BASE_URL}/1m/BTCUSDT_1m.csv`

describe('getWarmupKline', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('should return the last N bars from the aggregate CSV, ascending', async () => {
    const rows = [
      '2026-07-26 00:00:00+00:00,1,1,1,1,1',
      '2026-07-26 04:00:00+00:00,2,2,2,2,2',
      '2026-07-26 08:00:00+00:00,3,3,3,3,3',
      '2026-07-26 12:00:00+00:00,4,4,4,4,4',
      '2026-07-26 16:00:00+00:00,5,5,5,5,5',
      '2026-07-26 20:00:00+00:00,6,6,6,6,6',
      '2026-07-27 00:00:00+00:00,10,10,10,10,10',
    ]
    mockRangeServer({ [URL_4H]: buildCsv(rows) })

    const result = await getWarmupKline('BTCUSDT', '4h', 3, '2026-07-27')

    expect(result.source).toBe('aggregate')
    expect(result.truncated).toBe(false)
    expect(result.lastDate).toBe('2026-07-26')
    // 取最靠近 beforeDate 的 3 根，且不含 07-27 当天
    expect(result.bars.map(p => p.open)).toEqual([4, 5, 6])
    expect(result.bars.map(p => p.datetime)).toEqual([
      '2026-07-26 12:00:00',
      '2026-07-26 16:00:00',
      '2026-07-26 20:00:00',
    ])
  })

  it('should flag truncated when the aggregate CSV has fewer bars than requested', async () => {
    const rows = [
      '2026-07-26 00:00:00+00:00,1,1,1,1,1',
      '2026-07-26 04:00:00+00:00,2,2,2,2,2',
    ]
    mockRangeServer({ [URL_4H]: buildCsv(rows) })

    const result = await getWarmupKline('BTCUSDT', '4h', 10, '2026-07-27')

    expect(result.source).toBe('aggregate')
    expect(result.truncated).toBe(true)
    expect(result.bars).toHaveLength(2)
  })

  it('should fall back to resampled 1m when the aggregate CSV is missing (404)', async () => {
    // 07-26 整天的 1m 数据 → 重采样成 6 根 4h
    const oneMin: string[] = []
    for (let i = 0; i < 1440; i++) {
      const h = String(Math.floor(i / 60)).padStart(2, '0')
      const m = String(i % 60).padStart(2, '0')
      oneMin.push(`2026-07-26 ${h}:${m}:00+00:00,${i + 1},${i + 1},${i + 1},${i + 1},1`)
    }
    mockRangeServer({
      [URL_4H]: undefined, // 聚合缺失
      [URL_1M]: buildCsv(oneMin),
    })

    const result = await getWarmupKline('BTCUSDT', '4h', 2, '2026-07-27')

    expect(result.source).toBe('resampled-1m')
    expect(result.truncated).toBe(false)
    expect(result.lastDate).toBe('2026-07-26')
    // 最后 2 根 4h：16:00 与 20:00
    expect(result.bars.map(p => p.datetime)).toEqual([
      '2026-07-26 16:00:00',
      '2026-07-26 20:00:00',
    ])
    // 重采样后 OHLC 聚合正确：20:00 桶收盘价 = 该桶最后一根 1m 的收盘价（第 1440 根）
    expect(result.bars[1].close).toBe(1440)
  })

  it('should treat the 1m CSV as its own aggregate when tf is 1m', async () => {
    // tf='1m' 时聚合路径 URL 就是 1m 文件本身，因此走 Range 字节切片、
    // 不会退化成整文件下载，也无需重采样。
    const oneMin = [
      '2026-07-26 23:56:00+00:00,1,1,1,1,1',
      '2026-07-26 23:57:00+00:00,2,2,2,2,2',
      '2026-07-26 23:58:00+00:00,3,3,3,3,3',
      '2026-07-26 23:59:00+00:00,4,4,4,4,4',
    ]
    mockRangeServer({
      [URL_1M]: buildCsv(oneMin),
    })

    const result = await getWarmupKline('BTCUSDT', '1m', 2, '2026-07-27')

    expect(result.source).toBe('aggregate')
    expect(result.bars.map(p => p.open)).toEqual([3, 4])
    expect(result.bars.map(p => p.datetime)).toEqual([
      '2026-07-26 23:58:00',
      '2026-07-26 23:59:00',
    ])
  })

  it('should short-circuit without fetching when bars is 0', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await getWarmupKline('BTCUSDT', '1h', 0, '2026-07-27')

    expect(result.source).toBe('none')
    expect(result.bars).toHaveLength(0)
    expect(result.truncated).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should return an empty result when both paths are unavailable', async () => {
    mockRangeServer({ [URL_4H]: undefined, [URL_1M]: undefined })

    const result = await getWarmupKline('BTCUSDT', '4h', 10, '2026-07-27')

    expect(result.source).toBe('none')
    expect(result.truncated).toBe(true)
    expect(result.bars).toHaveLength(0)
    expect(result.lastDate).toBeNull()
  })

  it('should cap the 1m fallback lookback at MAX_WARMUP_1M_DAYS', async () => {
    // 大周期 + 长窗口指标所需的预热天数可达数百天，若不封顶会拉取几十 MB 的 1m 数据。
    // 断言封顶生效：请求的起始日期不早于 beforeDate - MAX_WARMUP_1M_DAYS。
    const seenRanges: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === URL_1M) {
          const range = (init?.headers as Record<string, string> | undefined)?.Range ?? ''
          seenRanges.push(range)
          // 返回空文件体，令 1m 路径取不到数据（本用例只关心封顶行为）
          return new Response('', { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      }),
    )

    const result = await getWarmupKline('BTCUSDT', '1d', 400, '2026-07-27')

    // 聚合缺失 + 1m 空 → EMPTY，但确实尝试过 1m 路径
    expect(result.source).toBe('none')
    expect(seenRanges.length).toBeGreaterThan(0)
    expect(MAX_WARMUP_1M_DAYS).toBe(30)
  })
})
