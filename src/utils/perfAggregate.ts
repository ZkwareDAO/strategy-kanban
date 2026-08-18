/**
 * 区间统计的盈亏拆分聚合
 *
 * 「盈利单合计」与「亏损单合计」把 total_pnl 拆成两个构成部分：
 *   - profit_sum：所有盈利仓位的 PNL 之和，恒 >= 0
 *   - loss_sum： 所有亏损仓位的 PNL 之和，恒 <= 0
 *
 * 不变量：`profit_sum + loss_sum === total_pnl`。表格里三列并排展示，
 * 用户能直接验算，因此这个等式必须成立——这也是本模块被抽成纯函数、
 * 而非内联在两个组件里的原因（策略级与标的级共用同一套累加逻辑）。
 *
 * 盈亏为 0 的仓位不计入任何一侧：它既不是盈利也不是亏损，
 * 计入哪边都会让对应列的符号约束（>=0 / <=0）失去意义。
 */

/** 可累加盈亏拆分的聚合桶（策略级与标的级的汇总对象都满足） */
export interface PnlSplitBucket {
  profit_sum: number
  loss_sum: number
}

/**
 * 把一笔仓位的盈亏累加到对应的一侧（原地修改 bucket）。
 *
 * @param bucket 聚合桶，调用方需已初始化两个字段为 0
 * @param pnlValue 单笔仓位的 pnl_value
 */
export function accumulatePnlSplit(bucket: PnlSplitBucket, pnlValue: number): void {
  if (pnlValue > 0) bucket.profit_sum += pnlValue
  else if (pnlValue < 0) bucket.loss_sum += pnlValue
}

/**
 * 构造盈亏拆分的初始值，用于新建聚合桶。
 *
 * @param pnlValue 该桶首笔仓位的 pnl_value
 */
export function initPnlSplit(pnlValue: number): PnlSplitBucket {
  return {
    profit_sum: pnlValue > 0 ? pnlValue : 0,
    loss_sum: pnlValue < 0 ? pnlValue : 0,
  }
}
