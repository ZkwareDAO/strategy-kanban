/**
 * K 线读取服务。
 *
 * 目标：一次取数、一次解析、一次聚合、可缓存。
 * - 大周期优先读取数据源聚合文件，不存在时回退 basePeriod 并在前端聚合；
 * - 预热段与业务段合并为一次 Range 请求；
 * - 结果按 (symbol, tf, start, end) 进入 LRU 缓存。
 */
import type { TimeframeValue } from '@/models/kline'
import type { RawKlinePoint } from '@/models/klineV2'
import { datasourceConfig, type DatasourceConfig } from '@/data/config'
import { LruCache } from '@/data/cache'
import { joinUrl } from '@/data/path'
import {
  probeRange,
  sliceCsvByDateRange,
  streamFilterByDateRange,
  type RangeFetcher,
} from '@/utils/klineRange'
import { resampleRawKline, timeframeMinutes } from '@/utils/resample'

export type KlineSource = 'aggregate' | 'base' | 'none'

export interface KlineSeries {
  points: RawKlinePoint[]
  source: KlineSource
}

export interface KlineWarmupSeries {
  /** 预热段（早于 startDate，最多 bars 根） */
  warmup: RawKlinePoint[]
  /** 业务段 [startDate, endDate] */
  business: RawKlinePoint[]
  source: KlineSource
  /** 预热不足（数据缺失或达到 maxWarmupDays 上限） */
  truncated: boolean
}

export interface WarmupWindow {
  warmupStart: string
  /** 理论所需天数超过 maxWarmupDays */
  truncated: boolean
}

export interface KlineService {
  getSeries(
    symbol: string,
    startDate: string,
    endDate: string,
    timeframe: TimeframeValue,
  ): Promise<RawKlinePoint[]>
  getSeriesWithWarmup(
    symbol: string,
    timeframe: TimeframeValue,
    bars: number,
    startDate: string,
    endDate: string,
  ): Promise<KlineWarmupSeries>
  getDailyClose(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; close: number }>>
  clearCache(): void
}

export interface KlineServiceOptions {
  config?: DatasourceConfig
  fetchImpl?: typeof fetch
}

/** `{base}/{period}/{symbol}_{period}.csv` */
export function buildKlineUrl(baseUrl: string, period: string, symbol: string): string {
  return joinUrl(baseUrl, `${period}/${symbol}_${period}.csv`)
}

/** 日期减 n 天（UTC） */
export function subtractDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - days))
  const yy = prev.getUTCFullYear()
  const mm = String(prev.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(prev.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * 计算指标预热窗口。
 * 目标周期下 bars 根所需天数按分钟折算，并受 maxWarmupDays 封顶。
 */
export function computeWarmupWindow(
  startDate: string,
  bars: number,
  timeframe: TimeframeValue,
  maxWarmupDays: number,
): WarmupWindow {
  const minutes = timeframeMinutes(timeframe)
  const needDays = Math.ceil((bars * minutes) / 1440) + 1
  const capped = Math.max(1, Math.min(needDays, maxWarmupDays))
  return {
    warmupStart: subtractDays(startDate, capped),
    truncated: needDays > capped,
  }
}

export function createKlineService(options: KlineServiceOptions = {}): KlineService {
  const config = options.config ?? datasourceConfig
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const cache = new LruCache<string, RawKlinePoint[]>(config.kline.cacheEntries)

  function rangeFetcher(url: string): RangeFetcher {
    return async (start, end) => {
      const res = await fetchImpl(url, { headers: { Range: `bytes=${start}-${end}` } })
      if (res.status !== 206) {
        throw new Error(`Range request not honored: status ${res.status} for ${url}`)
      }
      // 部分静态服务器返回 206 却发送整文件；校验 Content-Range 才能保证分片语义
      const match = /^bytes (\d+)-(\d+)\//.exec(res.headers.get('content-range') ?? '')
      if (!match || Number(match[1]) !== start || Number(match[2]) !== end) {
        throw new Error(`Range response mismatch for ${url}`)
      }
      return res.text()
    }
  }

  async function readPeriod(
    symbol: string,
    period: string,
    startDate: string,
    endDate: string,
  ): Promise<RawKlinePoint[]> {
    const url = buildKlineUrl(config.data.klineBaseUrl, period, symbol)
    const probe = await probeRange(url, fetchImpl)
    if (probe.supported && probe.fileSize > 0) {
      try {
        return await sliceCsvByDateRange(
          probe.fileSize,
          startDate,
          endDate,
          rangeFetcher(url),
        )
      } catch {
        // Range 读取异常时走流式降级
      }
    }
    return streamFilterByDateRange(url, startDate, endDate, fetchImpl)
  }

  async function getSeriesInternal(
    symbol: string,
    startDate: string,
    endDate: string,
    timeframe: TimeframeValue,
  ): Promise<KlineSeries> {
    const key = `${symbol}|${timeframe}|${startDate}|${endDate}`
    const cached = cache.get(key)
    if (cached) return { points: cached, source: 'base' }

    const basePeriod = config.kline.basePeriod
    let points: RawKlinePoint[] = []
    let source: KlineSource = 'none'

    if (timeframe !== basePeriod && config.kline.preferAggregate) {
      const aggregate = await readPeriod(symbol, timeframe, startDate, endDate)
      if (aggregate.length > 0) {
        points = aggregate
        source = 'aggregate'
      }
    }

    if (points.length === 0) {
      const raw = await readPeriod(symbol, basePeriod, startDate, endDate)
      points = timeframe === basePeriod ? raw : resampleRawKline(raw, timeframe)
      source = points.length > 0 ? 'base' : 'none'
    }

    if (points.length > 0) cache.set(key, points)
    return { points, source }
  }

  return {
    async getSeries(symbol, startDate, endDate, timeframe) {
      const { points } = await getSeriesInternal(symbol, startDate, endDate, timeframe)
      return points
    },

    async getSeriesWithWarmup(symbol, timeframe, bars, startDate, endDate) {
      if (bars <= 0) {
        const { points, source } = await getSeriesInternal(
          symbol,
          startDate,
          endDate,
          timeframe,
        )
        return { warmup: [], business: points, source, truncated: false }
      }

      const window = computeWarmupWindow(
        startDate,
        bars,
        timeframe,
        config.kline.maxWarmupDays,
      )
      const { points, source } = await getSeriesInternal(
        symbol,
        window.warmupStart,
        endDate,
        timeframe,
      )

      const warmupAll: RawKlinePoint[] = []
      const business: RawKlinePoint[] = []
      for (const point of points) {
        const date = point.datetime.slice(0, 10)
        if (date < startDate) warmupAll.push(point)
        else if (date <= endDate) business.push(point)
      }
      const warmup =
        warmupAll.length > bars ? warmupAll.slice(warmupAll.length - bars) : warmupAll

      return {
        warmup,
        business,
        source,
        truncated: window.truncated || warmup.length < bars,
      }
    },

    async getDailyClose(symbol, startDate, endDate) {
      const points = await this.getSeries(symbol, startDate, endDate, '1d')
      return points.map((point) => ({
        date: point.datetime.slice(0, 10),
        close: point.close,
      }))
    },

    clearCache() {
      cache.clear()
    },
  }
}

/** 页面共享实例 */
export const klineService = createKlineService()
