/**
 * 技术指标预热 K线加载
 *
 * 指标都是滚动窗口或递归平滑算法，前若干根必然为 null。若加载区间等于展示区间，
 * 图表开头就会缺一段指标，且各指标缺失长度不同（窗口越长缺得越多）。
 * 本模块负责取业务区间**之前**的历史 bar 补足计算所需——这些 bar 只参与
 * `indicator.compute()`，不参与显示（见 TechnicalChart 的 `warmupCount`）。
 *
 * 取数优先级：
 * 1. 目标周期的聚合 CSV（`{tf}/{SYMBOL}_{tf}.csv`）——已是目标周期，无需重采样，
 *    N 根只需几十 KB
 * 2. 回退 1m CSV 重采样——数据源未提供该周期的聚合文件时使用。
 *    1m 体量大，故用 [[MAX_WARMUP_1M_DAYS]] 封顶
 *
 * 预热段不叠加任何仓位：它在业务区间之外，本就没有持仓语义。
 */
import { KLINE_BASE_URL } from '@/config/klineSource'
import type { RawKlinePoint } from '@/models/klineV2'
import type { KlinePoint, TimeframeValue } from '@/models/kline'
import { probeRange, sliceCsvBeforeDate, type RangeFetcher } from '@/utils/klineRange'
import { timeframeMinutes, resampleKline } from '@/utils/resample'
import { getKlineV2 } from '@/api/klineV2'

/**
 * 回退 1m 路径下最多往前取的天数。
 *
 * 1m 数据量按天线性增长，长窗口指标在大周期上所需的预热天数可达数百天，
 * 整体体积会到几十 MB——不可接受。超出时截断并置 `truncated`，
 * 由调用方提示「开头指标值可能不准确」，而不是静默给出失真数值。
 */
export const MAX_WARMUP_1M_DAYS = 30

/** 预热数据来源 */
export type WarmupSource = 'aggregate' | 'resampled-1m' | 'none'

/** getWarmupKline 返回 */
export interface WarmupResult {
  /** 预热 K线，按时间升序，全部早于 `beforeDate` */
  bars: RawKlinePoint[]
  /** 实际取数来源 */
  source: WarmupSource
  /** 最后一根预热 bar 的日期 YYYY-MM-DD；无数据时 null。用于检测与业务区间的缺口 */
  lastDate: string | null
  /** 是否因数据不足或封顶而没取够 `bars` 根 */
  truncated: boolean
}

/** 空结果（无可用预热数据） */
const EMPTY: WarmupResult = { bars: [], source: 'none', lastDate: null, truncated: true }

/** 构造 `{period}/{SYMBOL}_{period}.csv` 的 URL */
function klineUrl(symbol: string, period: string): string {
  return `${KLINE_BASE_URL}/${period}/${symbol}_${period}.csv`
}

/** 构造基于 fetch 的 Range 读取回调；服务端未兑现 Range（非 206）时抛错 */
function makeFetchRange(url: string): RangeFetcher {
  return async (start, end) => {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
    if (res.status !== 206) {
      throw new Error(`Range request not honored: status ${res.status} for ${url}`)
    }
    return res.text()
  }
}

/** 日期减 n 天，返回 YYYY-MM-DD（UTC 运算，正确处理月末/年末/闰年） */
function subtractDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - n))
  const yy = prev.getUTCFullYear()
  const mm = String(prev.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(prev.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 把 RawKlinePoint 补成 resampleKline 需要的 v1 形状（中性、无仓位） */
function toNeutralKlinePoint(p: RawKlinePoint): KlinePoint {
  return {
    timestamp: p.timestamp,
    datetime: p.datetime,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    position_id: '',
    entry_price: 0,
    position_type: 'long',
    pnl_pct: 0,
    is_entry: false,
    is_exit: false,
  }
}

/** 从目标周期的聚合 CSV 取预热段；文件不存在或不支持 Range 时返回 null 表示需回退 */
async function fromAggregate(
  symbol: string,
  tf: TimeframeValue,
  bars: number,
  beforeDate: string,
): Promise<RawKlinePoint[] | null> {
  const url = klineUrl(symbol, tf)
  try {
    // 数据源未必提供每个周期的聚合文件。404 时 probeRange 返回
    // supported=false，必须回退而不是去拉整文件——那会白拉一个不存在的 URL。
    const probe = await probeRange(url)
    if (!probe.supported || probe.fileSize <= 0) return null
    return await sliceCsvBeforeDate(probe.fileSize, beforeDate, bars, makeFetchRange(url))
  } catch {
    return null
  }
}

/** 回退：取 1m 区间后重采样到目标周期 */
async function fromResampled1m(
  symbol: string,
  tf: TimeframeValue,
  bars: number,
  beforeDate: string,
): Promise<RawKlinePoint[]> {
  const minutes = timeframeMinutes(tf)
  // +1 天覆盖边界不整齐的情况（业务区间起点未必落在周期边界上）
  const needDays = Math.ceil((bars * minutes) / 1440) + 1
  const days = Math.min(needDays, MAX_WARMUP_1M_DAYS)

  const end = subtractDays(beforeDate, 1)
  const start = subtractDays(beforeDate, days)
  const raw = await getKlineV2(symbol, start, end)
  if (raw.length === 0) return []

  // 1m 时无需重采样，省掉一次 O(n×m) 分桶
  if (tf === '1m') return raw.slice(-bars)

  const resampled = resampleKline(raw.map(toNeutralKlinePoint), tf)
  return resampled.slice(-bars).map(p => ({
    timestamp: p.timestamp,
    datetime: p.datetime,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }))
}

/**
 * 取 `beforeDate` 之前的 `bars` 根 K线，用于技术指标预热。
 *
 * @param symbol 交易对，如 BTCUSDT
 * @param tf 目标时间周期（与图表当前周期一致）
 * @param bars 需要的预热根数，来自 `warmupBarsFor(选中指标)`
 * @param beforeDate 业务区间起始日期 YYYY-MM-DD
 */
export async function getWarmupKline(
  symbol: string,
  tf: TimeframeValue,
  bars: number,
  beforeDate: string,
): Promise<WarmupResult> {
  if (bars <= 0) return { bars: [], source: 'none', lastDate: null, truncated: false }

  const aggregate = await fromAggregate(symbol, tf, bars, beforeDate)
  if (aggregate && aggregate.length > 0) {
    return {
      bars: aggregate,
      source: 'aggregate',
      lastDate: aggregate[aggregate.length - 1].datetime.slice(0, 10),
      truncated: aggregate.length < bars,
    }
  }

  try {
    const resampled = await fromResampled1m(symbol, tf, bars, beforeDate)
    if (resampled.length === 0) return EMPTY
    return {
      bars: resampled,
      source: 'resampled-1m',
      lastDate: resampled[resampled.length - 1].datetime.slice(0, 10),
      truncated: resampled.length < bars,
    }
  } catch (e) {
    console.warn('[klineWarmup] 预热数据加载失败，指标开头可能缺失', e)
    return EMPTY
  }
}
