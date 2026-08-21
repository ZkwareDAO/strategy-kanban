/**
 * 已实现 / 持仓中的统一拆分口径
 *
 * ## 为什么要抽出来
 *
 * 「每日收益」「区间统计」「策略详情」三个页面都要把仓位分成"已实现"与
 * "持仓中"，此前各自内联写 `p.deleted === 1 && p.pos_type === 2`，口径漂移过：
 * 每日收益把 deleted=0 单列成"持仓 N"，详情页却直接丢弃后报"暂无交易数据"——
 * 用户在上一页看到持仓、点进来被告知没数据。口径必须只有一个定义。
 *
 * ## 为什么持仓中不能混入已实现指标
 *
 * `deleted` 不是软删除，而是平仓标志（实测 532 行中 deleted 与 close_time
 * 100% 一致）。同一笔仓位跨日会从 0 变 1，且**浮盈与最终盈亏可以反向**：
 *
 *   SAR_SNT3_V3_8H_3_XRPUSDC
 *     0811 deleted=0 pnl=+0.1073   ← 浮盈
 *     0812 deleted=1 pnl=-0.0488   ← 平仓后实亏，方向反转
 *
 * 若把 deleted=0 计入 total_pnl / win_rate，指标会被未完成的交易污染，
 * 且每天变动——今天显示盈利策略，明天平仓后变亏损。因此两个口径必须分离，
 * 持仓中只做展示（浮盈），不参与胜率与合计。
 *
 * 相关：`modeFilter.dedupePositions` 在同键冲突时保留 deleted=1，原因同上。
 */
import type { OrderPosition } from '@/models/performance'

/** 期货仓位的 pos_type 取值；3 为期权（SYNC_ 开头的策略），不纳入统计 */
const POS_TYPE_FUTURES = 2

/** 已平仓标志：deleted=1 表示该仓位已平，pnl_value 为最终值 */
const DELETED_CLOSED = 1

/** 是否为期货仓位（统计只覆盖期货，期权另有口径） */
export function isFuturesPosition(p: OrderPosition): boolean {
  return p.pos_type === POS_TYPE_FUTURES
}

/** 拆分结果：两侧互斥，非期货仓位不出现在任何一侧 */
export interface PositionSplit {
  /** 已平仓（deleted=1）：pnl_value 为最终值，可计入 PNL / 胜率 */
  realized: OrderPosition[]
  /** 持仓中（deleted!==1）：pnl_value 是浮盈，仅供展示 */
  open: OrderPosition[]
}

/**
 * 按已实现 / 持仓中拆分期货仓位。
 *
 * 保持输入顺序（下游排序依赖稳定性），不修改入参。
 * `deleted` 非 0/1 的异常值按持仓中处理——宁可展示为未完成，
 * 也不让仓位凭空消失（消失过一次就是本函数存在的原因）。
 */
export function splitRealizedAndOpen(positions: OrderPosition[]): PositionSplit {
  const realized: OrderPosition[] = []
  const open: OrderPosition[] = []

  for (const p of positions) {
    if (!isFuturesPosition(p)) continue
    if (p.deleted === DELETED_CLOSED) realized.push(p)
    else open.push(p)
  }

  return { realized, open }
}
