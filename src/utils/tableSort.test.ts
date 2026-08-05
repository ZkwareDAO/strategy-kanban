import { describe, it, expect } from 'vitest'
import { numSorter } from './tableSort'

interface Row {
  v: number | null | undefined
}

const byV = numSorter<Row>(r => r.v)
const asc = (arr: Row[]) => [...arr].sort(byV)

describe('numSorter', () => {
  it('按数值升序排序', () => {
    expect(asc([{ v: 3 }, { v: 1 }, { v: 2 }])).toEqual([
      { v: 1 },
      { v: 2 },
      { v: 3 },
    ])
  })

  it('正确处理小数与负数', () => {
    expect(asc([{ v: 2.5 }, { v: -0.5 }, { v: 0 }])).toEqual([
      { v: -0.5 },
      { v: 0 },
      { v: 2.5 },
    ])
  })

  it('缺失值（null/undefined）排在最前（升序）', () => {
    const r = asc([{ v: 2 }, { v: null }, { v: 1 }, { v: undefined }])
    expect(r[0].v).toBeNull()
    expect(r[1].v).toBeUndefined()
    expect(r.slice(2)).toEqual([{ v: 1 }, { v: 2 }])
  })

  it('两个缺失值比较返回 0（稳定）', () => {
    expect(byV({ v: null }, { v: undefined })).toBe(0)
    expect(byV({ v: undefined }, { v: null })).toBe(0)
  })

  it('降序（取反比较器）时缺失值落到末尾', () => {
    const desc = [...([{ v: 2 }, { v: null }, { v: 1 }] as Row[])].sort(
      (a, b) => -byV(a, b),
    )
    expect(desc.map(r => r.v)).toEqual([2, 1, null])
  })
})
