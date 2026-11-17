/**
 * 以固定并发上限执行异步映射，并按输入顺序返回结果。
 *
 * 固定数量的 worker 共享递增游标；某个任务结束后立即领取下一个，
 * 不做整批等待。limit < 1 时按 1 处理。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  if (items.length === 0) return results

  const workerCount = Math.min(Math.max(1, Math.floor(limit) || 1), items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
