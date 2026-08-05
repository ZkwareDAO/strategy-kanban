/**
 * v2 K线 HTTP Range 切片工具
 *
 * 1m K线 CSV 体积可达上百 MB，无法整文件加载。利用时间戳零填充
 * （字典序 == 时间序）做二分查找，仅下载目标日期区的字节，再用
 * [[filterKlineByDateRange]] 作为真值过滤，保证边界精确。
 * 服务端不支持 Range 时降级为整文件流式过滤（[[streamFilterByDateRange]]）。
 */
import type { RawKlinePoint } from '@/models/klineV2'
import { parseKlineRaw, filterKlineByDateRange } from '@/utils/klineV2'

/** HTTP Range 读取回调（start/end 均为含端点的字节偏移） */
export type RangeFetcher = (start: number, end: number) => Promise<string>

/** 单次探测读取的块大小 */
const PROBE_CHUNK = 8192
/** 切片时向区间两侧外扩的余量字节，覆盖跨块边界的行 */
const SLICE_MARGIN = 4096

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

/** probeRange 返回 */
export interface RangeProbe {
  /** 服务端是否支持 Range（206 响应） */
  supported: boolean
  /** 文件总字节数（supported=false 时为 0） */
  fileSize: number
}

/**
 * 探测 URL 是否支持 HTTP Range，并获取文件大小
 * 通过 `Range: bytes=0-0` 请求，206 + content-range 即支持
 */
export async function probeRange(url: string): Promise<RangeProbe> {
  const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
  if (res.status === 206) {
    const cr = res.headers.get('content-range') ?? ''
    const m = /\/(\d+)/.exec(cr)
    return { supported: true, fileSize: m ? Number(m[1]) : 0 }
  }
  return { supported: false, fileSize: 0 }
}

/**
 * 降级路径：整文件拉取后按日期过滤（服务端不支持 Range 时使用）
 */
export async function streamFilterByDateRange(
  url: string,
  startDate: string,
  endDate: string,
): Promise<RawKlinePoint[]> {
  const res = await fetch(url)
  const text = await res.text()
  return filterKlineByDateRange(parseKlineRaw(text), startDate, endDate)
}
