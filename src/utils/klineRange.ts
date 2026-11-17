/**
 * v2 K线 HTTP Range 切片工具
 *
 * 1m K线 CSV 体积可达上百 MB，无法整文件加载。利用时间戳零填充
 * （字典序 == 时间序）做二分查找，仅下载目标日期区的字节，再用
 * [[filterKlineByDateRange]] 作为真值过滤，保证边界精确。
 * 服务端不支持 Range 时降级为整文件流式过滤（[[streamFilterByDateRange]]）。
 */
import type { RawKlinePoint } from '@/models/klineV2'
import { parseKlineLine, parseKlineRaw, filterKlineByDateRange } from '@/utils/klineV2'

/** HTTP Range 读取回调（start/end 均为含端点的字节偏移） */
export type RangeFetcher = (start: number, end: number) => Promise<string>

/** 单次探测读取的块大小 */
const PROBE_CHUNK = 8192
/** 切片时向区间两侧外扩的余量字节，覆盖跨块边界的行 */
const SLICE_MARGIN = 4096
/**
 * 单行字节数上界，用于反向切片时估算「往前读多少字节能覆盖 N 根」。
 * 实测各周期 CSV 行宽 68~80 字节（`2026-01-02 00:00:00+00:00,100.0,...` 形式），
 * 取 96 留足余量；估算偏大只是多读几 KB，偏小则会取不够根数。
 */
const ROW_BYTES_UPPER_BOUND = 96

/**
 * 日期加一天，返回 YYYY-MM-DD（正确处理月末/年末/闰年）
 */
export function addOneDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  const yy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(next.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * 枚举 [start, end]（含端点，YYYY-MM-DD）区间内的每一天
 * @param maxDays 上限天数，防止异常输入导致死循环（默认 400）
 */
export function enumerateDates(start: string, end: string, maxDays = 400): string[] {
  const out: string[] = []
  let cur = start
  for (let i = 0; i < maxDays && cur <= end; i++) {
    out.push(cur)
    cur = addOneDay(cur)
  }
  return out
}

/**
 * 读取包含 `offset` 的那条完整数据行
 * 返回行起点 start、行尾 end（exclusive，= 下一行起点或 fileSize）与行文本
 *
 * 关键：返回的是“包含 offset 的行”而非“offset 之后的行”，否则二分时
 * 落在行内的探测点永远跳过该行，导致首行偏移被越过、区间误判为空。
 * 行文本可能被窗口右端截断，但前 10 字符日期一定完整。
 */
async function readLineContaining(
  offset: number,
  fileSize: number,
  fetchRange: RangeFetcher,
): Promise<{ start: number; end: number; text: string }> {
  if (offset >= fileSize) return { start: fileSize, end: fileSize, text: '' }
  const lo = Math.max(0, offset - PROBE_CHUNK)
  const hi = Math.min(fileSize - 1, offset + PROBE_CHUNK)
  const chunk = await fetchRange(lo, hi)
  const relOff = offset - lo
  // 行起点 = offset 之前最后一个 '\n' 的下一字节（无则取 lo）
  const lastNl = chunk.lastIndexOf('\n', relOff - 1)
  const start = lastNl === -1 ? lo : lo + lastNl + 1
  // 行尾 = start 起（含）第一个 '\n' 之后（exclusive end = 该 '\n' + 1）
  const nextNl = chunk.indexOf('\n', start - lo)
  const end = nextNl === -1 ? hi + 1 : lo + nextNl + 1
  const text = nextNl === -1 ? chunk.slice(start - lo) : chunk.slice(start - lo, nextNl)
  return { start, end, text }
}

/**
 * 二分查找第一条日期 >= target 的数据行的起始字节偏移
 * 时间戳零填充 -> 取行首 10 字符（YYYY-MM-DD）做字典序比较
 *
 * 收敛性：date < target 时 left = line.end（> mid，严格推进）；
 * date >= target 时 right = line.start（<= mid < right，严格收紧）。
 */
async function findFirstAtOrAfter(
  fileSize: number,
  lo: number,
  target: string,
  fetchRange: RangeFetcher,
): Promise<number> {
  let left = lo
  let right = fileSize
  while (left < right) {
    const mid = (left + right) >> 1
    const line = await readLineContaining(mid, fileSize, fetchRange)
    const date = line.text.slice(0, 10)
    if (date < target) {
      left = line.end
    } else {
      right = line.start
    }
  }
  return left
}

/**
 * 用 HTTP Range 二分切片，返回 [startDate, endDate]（含）区间内的 K线点
 * @param fileSize 文件总字节数
 * @param startDate 起始日期 YYYY-MM-DD
 * @param endDate 结束日期 YYYY-MM-DD
 * @param fetchRange Range 读取回调
 */
export async function sliceCsvByDateRange(
  fileSize: number,
  startDate: string,
  endDate: string,
  fetchRange: RangeFetcher,
): Promise<RawKlinePoint[]> {
  if (fileSize <= 0) return []

  // 定位表头结束（第一条数据行起点）
  const headEnd = Math.min(fileSize - 1, PROBE_CHUNK - 1)
  const headChunk = await fetchRange(0, headEnd)
  const firstNl = headChunk.indexOf('\n')
  const headerEnd = firstNl === -1 ? 0 : firstNl + 1

  const startOff = await findFirstAtOrAfter(fileSize, headerEnd, startDate, fetchRange)
  const endExclusive = await findFirstAtOrAfter(fileSize, startOff, addOneDay(endDate), fetchRange)
  if (endExclusive <= startOff) return []

  const lo = Math.max(headerEnd, startOff - SLICE_MARGIN)
  const hi = Math.min(fileSize - 1, endExclusive + SLICE_MARGIN)
  const chunk = await fetchRange(lo, hi)
  const parsed = parseKlineRaw(chunk)
  return filterKlineByDateRange(parsed, startDate, endDate)
}

/**
 * 用 HTTP Range 反向切片，返回 `beforeDate` **之前**的最后 `maxBars` 根 K线。
 *
 * 用于技术指标预热：指标都是滚动窗口或递归平滑算法，前若干根必然为 null，
 * 若加载区间等于展示区间，图表开头就会缺一段指标。这里取业务区间之前的历史 bar
 * 补足计算所需，这些 bar 只参与 compute 不参与显示。
 *
 * @param fileSize 文件总字节数
 * @param beforeDate 业务区间起始日期 YYYY-MM-DD（返回的 bar 全部早于这一天）
 * @param maxBars 最多返回多少根（取最靠近 beforeDate 的那些）
 * @param fetchRange Range 读取回调
 * @returns 按时间升序的 K线；`beforeDate` 早于文件全部数据时为空数组
 */
export async function sliceCsvBeforeDate(
  fileSize: number,
  beforeDate: string,
  maxBars: number,
  fetchRange: RangeFetcher,
): Promise<RawKlinePoint[]> {
  if (fileSize <= 0 || maxBars <= 0) return []

  // 定位表头结束（第一条数据行起点）
  const headEnd = Math.min(fileSize - 1, PROBE_CHUNK - 1)
  const headChunk = await fetchRange(0, headEnd)
  const firstNl = headChunk.indexOf('\n')
  const headerEnd = firstNl === -1 ? 0 : firstNl + 1

  // beforeDate 首行的偏移即预热段的右边界（exclusive）
  const endExclusive = await findFirstAtOrAfter(fileSize, headerEnd, beforeDate, fetchRange)
  // 全部数据都 >= beforeDate：这一天之前没有历史，无法预热
  if (endExclusive <= headerEnd) return []

  // 往前读足够覆盖 maxBars 根的字节；SLICE_MARGIN 兜住被截断的首行
  const want = maxBars * ROW_BYTES_UPPER_BOUND + SLICE_MARGIN
  const lo = Math.max(headerEnd, endExclusive - want)
  const chunk = await fetchRange(lo, Math.min(fileSize - 1, endExclusive))

  // 以日期为真值过滤（字节估算可能多读，也可能读进 beforeDate 当天的行）
  const parsed = parseKlineRaw(chunk).filter(p => p.datetime.slice(0, 10) < beforeDate)
  // 取最靠近 beforeDate 的 maxBars 根，保持时间升序
  return parsed.slice(-maxBars)
}

/** probeRange 返回 */
export interface RangeProbe {
  /** 服务端是否支持 Range（206 响应） */
  supported: boolean
  /** 文件总字节数（supported=false 时为 0） */
  fileSize: number
}

const probeCache = new Map<string, Promise<RangeProbe>>()

/** 清空 probe 缓存（测试或数据源切换时使用） */
export function clearProbeCache(): void {
  probeCache.clear()
}

/**
 * 探测 URL 是否支持 HTTP Range，并获取文件大小。
 * 结果按 URL 缓存：同一文件在一次会话中只探测一次。
 */
export async function probeRange(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RangeProbe> {
  const cached = probeCache.get(url)
  if (cached) return cached

  const request = (async (): Promise<RangeProbe> => {
    try {
      const res = await fetchImpl(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
      if (res.status === 206) {
        const cr = res.headers.get('content-range') ?? ''
        const m = /\/(\d+)/.exec(cr)
        return { supported: true, fileSize: m ? Number(m[1]) : 0 }
      }
    } catch {
      // 网络失败按不支持 Range 处理，走流式降级
    }
    return { supported: false, fileSize: 0 }
  })()

  probeCache.set(url, request)
  return request
}

/**
 * 降级路径：服务端不支持 Range 时流式读取，按日期过滤。
 *
 * 数据按时间升序，读到超过 endDate 的行即可停止，不必把整文件拉进内存。
 */
export async function streamFilterByDateRange(
  url: string,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RawKlinePoint[]> {
  const res = await fetchImpl(url)
  // 测试桩可能只提供 text()/body，没有 ok 字段；仅在明确失败时返回空
  if (res.ok === false) return []

  const result: RawKlinePoint[] = []
  const processLine = (line: string): boolean => {
    const point = parseKlineLine(line)
    if (!point) return false
    const date = point.datetime.slice(0, 10)
    if (date > endDate) return true
    if (date >= startDate) result.push(point)
    return false
  }

  if (!res.body) {
    return filterKlineByDateRange(parseKlineRaw(await res.text()), startDate, endDate)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let stopped = false
  while (!stopped) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      stopped = processLine(line)
      if (stopped) break
      newline = buffer.indexOf('\n')
    }
  }
  if (!stopped && buffer.length > 0) processLine(buffer)
  await reader.cancel().catch(() => undefined)
  return result
}
