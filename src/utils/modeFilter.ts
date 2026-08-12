/**
 * 模式过滤工具
 *
 * 区间统计的仓位数据（trading_positions CSV）本身没有 trading_mode 字段，
 * 模式信息来自每日 manifest.json 的 (dir_name, symbol) -> trading_mode。
 *
 * 本工具把跨多日 manifest 收集到的 Runtime[] 聚合成
 * (dir_name|asset) -> Set<TradingMode> 的并集映射，供区间统计按
 * 生产(live)/冒烟(smoking) 过滤仓位使用。
 */
import type { Runtime, TradingMode } from '@/models/runtime'
import type { OrderPosition } from '@/models/performance'

/** dir_name|asset 复合键 */
export function modeKey(dirName: string, asset: string): string {
  return `${dirName}|${asset}`
}

/**
 * 构建 (dir_name|asset) -> Set<TradingMode> 的并集映射。
 * 同一代币在不同日期可能以不同模式运行，取并集后用 intersects 判断更稳妥。
 */
export function buildModeMap(runtimes: Runtime[]): Map<string, Set<TradingMode>> {
  const map = new Map<string, Set<TradingMode>>()
  for (const r of runtimes) {
    const key = modeKey(r.dir_name, r.symbol)
    let set = map.get(key)
    if (!set) {
      set = new Set<TradingMode>()
      map.set(key, set)
    }
    set.add(r.trading_mode)
  }
  return map
}

/**
 * 从 strategy_name（格式 {dir_name}_{SYMBOL}，如 NEWOBV_4H_1_BTCUSDT）
 * 提取 dir_name。期权策略 SYNC_ 开头的整体作为组名（无代币后缀可拆）。
 */
export function extractStrategyGroup(strategyName: string): string {
  if (strategyName.startsWith('SYNC_')) return strategyName
  const lastUnderscore = strategyName.lastIndexOf('_')
  if (lastUnderscore <= 0) return strategyName
  return strategyName.slice(0, lastUnderscore)
}

/** 区间统计可筛选的真实模式 */
export type SelectableMode = 'live' | 'smoking'

/**
 * 返回某条仓位在 manifest 中对应的模式集合（无匹配返回 null）。
 */
export function positionModes(
  p: OrderPosition,
  modeMap: Map<string, Set<TradingMode>>,
): Set<TradingMode> | null {
  const dir = extractStrategyGroup(p.strategy_name)
  return modeMap.get(modeKey(dir, p.asset)) ?? null
}

/**
 * 按所选模式集合（多选）过滤仓位。
 *
 * 仓位命中的模式集合与 `selectedModes` 有交集即保留。
 * 调用方需保证 selectedModes 非空（UI 层不允许全部取消）。
 * 未匹配到任何 manifest 条目的仓位（unknown）始终隐藏。
 */
export function filterPositionsByModes(
  positions: OrderPosition[],
  modeMap: Map<string, Set<TradingMode>>,
  selectedModes: Set<SelectableMode>,
): OrderPosition[] {
  return positions.filter((p) => {
    const modes = positionModes(p, modeMap)
    if (!modes) return false
    for (const m of selectedModes) {
      if (modes.has(m)) return true
    }
    return false
  })
}
