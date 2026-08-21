/**
 * 已实现 / 持仓中拆分口径的测试
 *
 * 这套断言锁定的是三个页面共用的同一份口径：曾因各页面自己写过滤条件而漂移，
 * 导致「每日收益」显示"持仓 1"、点进详情页却报"暂无交易数据"。
 */
import { describe, it, expect } from 'vitest'
import { splitRealizedAndOpen, isFuturesPosition } from './positionSplit'
import { dedupePositions } from './modeFilter'
import type { OrderPosition } from '@/models/performance'

/** 构造一条仓位，只覆盖测试关心的字段 */
function pos(over: Partial<OrderPosition> = {}): OrderPosition {
  return {
    asset: 'BTCUSDT',
    strategy_name: 'NEWOBV_4H_1_BTCUSDT',
    pos_type: 2,
    pnl_value: 1,
    deleted: 1,
    created_at: '2026-08-11T00:00:00Z',
    close_time: '2026-08-12T00:00:00Z',
    leverage: 1,
    ...over,
  }
}

describe('isFuturesPosition', () => {
  it('pos_type=2 是期货', () => {
    expect(isFuturesPosition(pos({ pos_type: 2 }))).toBe(true)
  })

  it('pos_type=3（期权）不是期货', () => {
    expect(isFuturesPosition(pos({ pos_type: 3 }))).toBe(false)
  })
})

describe('splitRealizedAndOpen', () => {
  it('deleted=1 归入 realized，deleted=0 归入 open', () => {
    const closed = pos({ deleted: 1, close_time: '2026-08-12T00:00:00Z' })
    const open = pos({ deleted: 0, close_time: null })
    const result = splitRealizedAndOpen([closed, open])
    expect(result.realized).toEqual([closed])
    expect(result.open).toEqual([open])
  })

  it('过滤掉非期货仓位（pos_type!==2），两侧都不含', () => {
    const option = pos({ pos_type: 3, strategy_name: 'SYNC_BTC-30OCT26-63000-P' })
    const result = splitRealizedAndOpen([option, pos({ pos_type: 3, deleted: 0 })])
    expect(result.realized).toEqual([])
    expect(result.open).toEqual([])
  })

  it('空输入返回两个空数组', () => {
    expect(splitRealizedAndOpen([])).toEqual({ realized: [], open: [] })
  })

  it('保持输入顺序（下游排序依赖稳定性）', () => {
    const a = pos({ asset: 'AAAUSDT' })
    const b = pos({ asset: 'BBBUSDT' })
    const c = pos({ asset: 'CCCUSDT' })
    expect(splitRealizedAndOpen([a, b, c]).realized).toEqual([a, b, c])
  })

  it('不修改入参数组', () => {
    const input = [pos({ deleted: 1 }), pos({ deleted: 0 })]
    const snapshot = [...input]
    splitRealizedAndOpen(input)
    expect(input).toEqual(snapshot)
  })

  /**
   * 真实数据里 deleted 与 close_time 100% 一致（532 行无例外），
   * deleted 是平仓标志而非软删除。但口径以 deleted 为准，
   * 万一数据源出现不一致也不该让仓位凭空消失。
   */
  it('以 deleted 为准，不依赖 close_time 是否为空', () => {
    const weird = pos({ deleted: 1, close_time: null })
    expect(splitRealizedAndOpen([weird]).realized).toEqual([weird])
  })

  it('deleted 为其它值时按未平仓处理，不丢数据', () => {
    const weird = pos({ deleted: 2 })
    expect(splitRealizedAndOpen([weird]).open).toEqual([weird])
  })
})

/**
 * 调用顺序的集成约束：必须先 dedupePositions 再 splitRealizedAndOpen。
 *
 * CSV 是每日快照，同一笔仓位会在 0811 以持仓中、0812 以已平仓各出现一次。
 * 先拆分再去重会让它同时进入"已实现"和"持仓中"两个分区，用户看到的笔数虚增
 * （表格里同一笔既算已平仓又算持仓中）。去重在前才能保证两侧互斥。
 *
 * 页面里的顺序见 PerformanceOverview.vue / PerformanceDetail.vue 的注释。
 */
describe('与 dedupePositions 的调用顺序', () => {
  /** 同一笔仓位的两天快照：0811 持仓中（浮盈），0812 平仓（实亏，方向反转） */
  const openSnapshot = pos({
    strategy_name: 'SAR_SNT3_V3_8H_3_XRPUSDC',
    asset: 'XRPUSDC',
    created_at: '2026-08-11T03:00:00Z',
    deleted: 0,
    close_time: null,
    pnl_value: 0.1073,
  })
  const closedSnapshot = pos({
    strategy_name: 'SAR_SNT3_V3_8H_3_XRPUSDC',
    asset: 'XRPUSDC',
    created_at: '2026-08-11T03:00:00Z',
    deleted: 1,
    close_time: '2026-08-12T07:00:00Z',
    pnl_value: -0.0488,
  })

  it('先去重再拆分：同一笔只进已实现，不出现在持仓中', () => {
    const result = splitRealizedAndOpen(dedupePositions([openSnapshot, closedSnapshot]))
    expect(result.realized).toHaveLength(1)
    expect(result.open).toHaveLength(0)
    // 保留的必须是平仓那条——它的 pnl 才是最终值（浮盈 +0.1073 实际是 -0.0488）
    expect(result.realized[0].pnl_value).toBe(-0.0488)
  })

  it('两侧笔数之和不超过唯一仓位数（互斥性）', () => {
    const deduped = dedupePositions([openSnapshot, closedSnapshot])
    const { realized, open } = splitRealizedAndOpen(deduped)
    expect(realized.length + open.length).toBe(deduped.length)
  })

  it('反例：先拆分再去重会让同一笔重复出现在两侧', () => {
    // 这个断言固化"错误顺序"的后果，防止未来重构把顺序换回去
    const wrong = splitRealizedAndOpen([openSnapshot, closedSnapshot])
    expect(wrong.realized).toHaveLength(1)
    expect(wrong.open).toHaveLength(1) // ← 同一笔被算了两次
  })

  it('未平仓且从未出现平仓快照的仓位，去重后仍在持仓中', () => {
    const stillOpen = pos({ deleted: 0, close_time: null, created_at: '2026-08-12T01:00:00Z' })
    const result = splitRealizedAndOpen(dedupePositions([stillOpen]))
    expect(result.open).toHaveLength(1)
    expect(result.realized).toHaveLength(0)
  })
})
