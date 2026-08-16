/**
 * v2 K线数据 API
 *
 * 始终从 1m CSV 切片获取纯 OHLC 数据（[[RawKlinePoint]]），与仓位解耦。
 * 1m 文件可达上百 MB，优先用 HTTP Range 二分切片（[[sliceCsvByDateRange]]）；
 * 服务端不支持 Range 或切片异常时降级为整文件流式过滤（[[streamFilterByDateRange]]）。
 * 时间周期（tf）由调用方对结果重采样，此处不处理。
 */
import { KLINE_BASE_URL } from '@/config/klineSource'
import type { RawKlinePoint } from '@/models/klineV2'
import { probeRange, sliceCsvByDateRange, streamFilterByDateRange, type RangeFetcher } from '@/utils/klineRange'

/** 构造 1m K线 CSV 的 URL（数据根路径见 config/klineSource.ts） */
function kline1mUrl(symbol: string): string {
  return `${KLINE_BASE_URL}/1m/${symbol}_1m.csv`
}

/** 构造基于 fetch 的 Range 读取回调；服务端未兑现 Range（非 206）时抛错以触发降级 */
function makeFetchRange(url: string): RangeFetcher {
  return async (start, end) => {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
    if (res.status !== 206) {
      throw new Error(`Range request not honored: status ${res.status} for ${url}`)
    }
    return res.text()
  }
}

/**
 * 获取 [startDate, endDate]（含）区间内的 1m K线
 * @param symbol 交易对，如 BTCUSDT
 * @param startDate 起始日期 YYYY-MM-DD
 * @param endDate 结束日期 YYYY-MM-DD（默认同 startDate，单日）
 */
export async function getKlineV2(
  symbol: string,
  startDate: string,
  endDate?: string,
): Promise<RawKlinePoint[]> {
  const end = endDate ?? startDate
  const url = kline1mUrl(symbol)
  try {
    const probe = await probeRange(url)
    if (probe.supported && probe.fileSize > 0) {
      return await sliceCsvByDateRange(probe.fileSize, startDate, end, makeFetchRange(url))
    }
  } catch (e) {
    console.warn('[klineV2] Range 切片失败，降级为整文件过滤', e)
  }
  return streamFilterByDateRange(url, startDate, end)
}
