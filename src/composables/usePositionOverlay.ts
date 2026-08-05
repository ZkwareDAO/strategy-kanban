/**
 * v2 持仓 overlay 组合式函数
 *
 * 将 1m K线（[[RawKlinePoint]]，来自 [[getKlineV2]]）与持仓（[[DatedPosition]]）
 * overlay 成 v1 形状的 [[KlinePoint]]，供 `resampleKline` 与 TechnicalChartV2 复用。
 * 无持仓时返回全中性数组，蜡烛图照常绘制。
 */
import { computed, unref, type MaybeRef } from 'vue'
import type { RawKlinePoint } from '@/models/klineV2'
import type { KlinePoint } from '@/models/kline'
import type { Position } from '@/models/position'
import { mergePositions, type DatedPosition } from '@/utils/klineV2'

/** 把单日持仓列表打上日期标记，转为 [[DatedPosition]] */
export function toDatedPositions(positions: Position[], date: string): DatedPosition[] {
  return positions.map(p => ({ ...p, date }))
}

/**
 * @param kline 1m K线（ref 或原始数组）
 * @param positions 已打日期的持仓（ref 或原始数组）；空数组表示无持仓
 * @returns merged 计算属性：v1 形状 KlinePoint[]
 */
export function usePositionOverlay(
  kline: MaybeRef<RawKlinePoint[]>,
  positions: MaybeRef<DatedPosition[]>,
) {
  const merged = computed<KlinePoint[]>(() => mergePositions(unref(kline), unref(positions)))
  return { merged }
}
