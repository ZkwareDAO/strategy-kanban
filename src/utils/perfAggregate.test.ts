/**
 * 盈亏拆分聚合的不变量测试
 *
 * 核心断言是 `profit_sum + loss_sum === total_pnl`——区间统计表格把这三列
 * 并排展示，用户会直接验算，等式不成立就是可见的 bug。
 */
import { describe, it, expect } from 'vitest'
import { accumulatePnlSplit, initPnlSplit, type PnlSplitBucket } from './perfAggregate'

/** 把一串盈亏依次聚合，返回最终的桶与总和（模拟组件里的累加流程） */
function aggregate(pnls: number[]): { bucket: PnlSplitBucket; totalPnl: number } {
  const [first, ...rest] = pnls
  const bucket = initPnlSplit(first)
  let totalPnl = first
  for (const pnl of rest) {
    accumulatePnlSplit(bucket, pnl)
    totalPnl += pnl
  }
  return { bucket, totalPnl }
}

describe('initPnlSplit', () => {
  it('盈利首笔只填 profit_sum', () => {
    expect(initPnlSplit(120.5)).toEqual({ profit_sum: 120.5, loss_sum: 0 })
  })

  it('亏损首笔只填 loss_sum', () => {
    expect(initPnlSplit(-80.25)).toEqual({ profit_sum: 0, loss_sum: -80.25 })
  })

  it('盈亏为 0 的首笔两侧都是 0', () => {
    expect(initPnlSplit(0)).toEqual({ profit_sum: 0, loss_sum: 0 })
  })
})

describe('accumulatePnlSplit', () => {
  it('盈利累加到 profit_sum，不影响 loss_sum', () => {
    const bucket: PnlSplitBucket = { profit_sum: 10, loss_sum: -5 }
    accumulatePnlSplit(bucket, 20)
    expect(bucket).toEqual({ profit_sum: 30, loss_sum: -5 })
  })

  it('亏损累加到 loss_sum，不影响 profit_sum', () => {
    const bucket: PnlSplitBucket = { profit_sum: 10, loss_sum: -5 }
    accumulatePnlSplit(bucket, -15)
    expect(bucket).toEqual({ profit_sum: 10, loss_sum: -20 })
  })

  it('盈亏为 0 时两侧都不变——它既不是盈利也不是亏损', () => {
    const bucket: PnlSplitBucket = { profit_sum: 10, loss_sum: -5 }
    accumulatePnlSplit(bucket, 0)
    expect(bucket).toEqual({ profit_sum: 10, loss_sum: -5 })
  })
})

describe('不变量：profit_sum + loss_sum === total_pnl', () => {
  const cases: { name: string; pnls: number[] }[] = [
    { name: '全部盈利', pnls: [12.5, 30, 7.25] },
    { name: '全部亏损', pnls: [-12.5, -30, -7.25] },
    { name: '盈亏混合', pnls: [120.5, -80.25, 33, -14.75, 6] },
    { name: '含 0 值', pnls: [50, 0, -20, 0] },
    { name: '单笔盈利', pnls: [99.99] },
    { name: '单笔亏损', pnls: [-99.99] },
    { name: '净额刚好为 0', pnls: [50, -50] },
  ]

  for (const { name, pnls } of cases) {
    it(name, () => {
      const { bucket, totalPnl } = aggregate(pnls)
      expect(bucket.profit_sum + bucket.loss_sum).toBeCloseTo(totalPnl, 10)
    })
  }
})

describe('符号约束', () => {
  it('profit_sum 恒 >= 0，loss_sum 恒 <= 0', () => {
    const samples = [
      [12.5, 30, 7.25],
      [-12.5, -30],
      [120.5, -80.25, 33, -14.75],
      [0, 0],
    ]
    for (const pnls of samples) {
      const { bucket } = aggregate(pnls)
      expect(bucket.profit_sum).toBeGreaterThanOrEqual(0)
      expect(bucket.loss_sum).toBeLessThanOrEqual(0)
    }
  })

  it('全亏损时 profit_sum 为 0（而非 undefined，保持可加性）', () => {
    const { bucket } = aggregate([-10, -20])
    expect(bucket.profit_sum).toBe(0)
  })

  it('全盈利时 loss_sum 为 0', () => {
    const { bucket } = aggregate([10, 20])
    expect(bucket.loss_sum).toBe(0)
  })
})
