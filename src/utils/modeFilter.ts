/**
 * 区间统计/详情页的模式过滤。
 *
 * v2 的 live_positions.csv 每行直接带 trading_mode，不再依赖 manifest 反查、
 * 策略名拆分或结算币回退。
 */
import type { OrderPosition } from '@/models/performance'

/** 区间统计可筛选的真实模式 */
export type SelectableMode = 'live' | 'smoking'

/** 无法判定模式的仓位（策略目录名 + 币种） */
export interface ModeDiagnostic {
  strategy: string
  asset: string
}

export interface FilterResult {
  positions: OrderPosition[]
  /** 模式缺失/未知、未计入统计的仓位 */
  unmatched: ModeDiagnostic[]
}

/**
 * 按行内 trading_mode 过滤。
 *
 * 当前 UI 只筛 Product(live) / Smoking(smoking)，paper_trading 按未选中处理；
 * unknown/缺失记录到 unmatched 供页面提示。
 */
export function filterPositionsByTradingMode(
  positions: OrderPosition[],
  selectedModes: Set<SelectableMode>,
): FilterResult {
  const kept: OrderPosition[] = []
  const unmatched = new Map<string, ModeDiagnostic>()

  for (const position of positions) {
    const mode = position.trading_mode
    if (mode === 'live' || mode === 'smoking') {
      if (selectedModes.has(mode)) kept.push(position)
      continue
    }
    if (mode === undefined || mode === 'unknown') {
      const key = `${position.strategy_name}|${position.asset}`
      if (!unmatched.has(key)) {
        unmatched.set(key, {
          strategy: position.strategy_name,
          asset: position.asset,
        })
      }
    }
  }

  return { positions: kept, unmatched: [...unmatched.values()] }
}
