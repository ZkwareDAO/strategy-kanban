import { LruCache } from './cache'
import { parseCsv } from '@/utils/csv'

export interface HttpClientOptions {
  fetchImpl?: typeof fetch
  cacheEntries?: number
  maxConcurrent?: number
}

export interface HttpClient {
  /** 读取文本；404/网络错误返回 null */
  fetchText(url: string): Promise<string | null>
  /** 读取 JSON；缺失或解析失败返回 null */
  fetchJson<T>(url: string): Promise<T | null>
  /** 读取 CSV；缺失返回空数组 */
  fetchCsv(url: string): Promise<Record<string, string>[]>
  /** 清空缓存（页面“刷新”时使用） */
  clearCache(): void
}

const DEFAULT_CACHE_ENTRIES = 256
const DEFAULT_MAX_CONCURRENT = 6

/** 固定并发信号量：超过上限的调用排队等待 */
function createLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: Array<() => void> = []

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }
}

/**
 * 创建数据读取客户端。
 *
 * - 同一 URL 的并发请求合并为一次；
 * - 成功结果进入 LRU 缓存，失败不缓存；
 * - 所有请求共享固定并发上限。
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const impl: typeof fetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  const cache = new LruCache<string, string>(
    options.cacheEntries ?? DEFAULT_CACHE_ENTRIES,
  )
  const limit = Math.max(1, options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)
  const run = createLimiter(limit)
  const inFlight = new Map<string, Promise<string | null>>()

  async function fetchText(url: string): Promise<string | null> {
    const cached = cache.get(url)
    if (cached !== undefined) return cached

    const pending = inFlight.get(url)
    if (pending) return pending

    const request = (async (): Promise<string | null> => {
      try {
        const text = await run(async () => {
          const response = await impl(url)
          if (!response.ok) return null
          return response.text()
        })
        if (text !== null) cache.set(url, text)
        return text
      } catch {
        return null
      } finally {
        inFlight.delete(url)
      }
    })()

    inFlight.set(url, request)
    return request
  }

  async function fetchJson<T>(url: string): Promise<T | null> {
    const text = await fetchText(url)
    if (text === null) return null
    try {
      return JSON.parse(text) as T
    } catch {
      return null
    }
  }

  async function fetchCsv(url: string): Promise<Record<string, string>[]> {
    const text = await fetchText(url)
    if (text === null) return []
    return parseCsv(text)
  }

  return {
    fetchText,
    fetchJson,
    fetchCsv,
    clearCache: () => cache.clear(),
  }
}

/** 全局共享客户端 */
export const http = createHttpClient()
