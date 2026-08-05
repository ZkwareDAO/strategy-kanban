import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePositionOverlay, toDatedPositions } from '@/composables/usePositionOverlay'
import type { DatedPosition } from '@/utils/klineV2'
import type { RawKlinePoint } from '@/models/klineV2'

const kline: RawKlinePoint[] = [
  { timestamp: 60, datetime: '2026-07-27 00:14:00', open: 100, high: 101, low: 99, close: 100 },
  { timestamp: 120, datetime: '2026-07-27 00:15:00', open: 100, high: 102, low: 100, close: 101 },
  { timestamp: 180, datetime: '2026-07-27 00:16:00', open: 101, high: 103, low: 101, close: 102 },
]

const p1 = {
  position_id: 'p1',
  type: 'long' as const,
  entry_time: '00:15',
  entry_price: 100.5,
  realized_pnl: 1,
  max_potential_pnl: 2,
  max_drawdown: -0.5,
}

describe('usePositionOverlay', () => {
  it('toDatedPositions tags each position with the date', () => {
    const dated = toDatedPositions([p1], '2026-07-27')
    expect(dated).toHaveLength(1)
    expect(dated[0].date).toBe('2026-07-27')
    expect(dated[0].position_id).toBe('p1')
  })

  it('merges positions onto kline reactively', () => {
    const { merged } = usePositionOverlay(
      ref(kline),
      ref<DatedPosition[]>(toDatedPositions([p1], '2026-07-27')),
    )
    expect(merged.value).toHaveLength(3)
    expect(merged.value[1].is_entry).toBe(true)
    expect(merged.value[1].position_id).toBe('p1')
  })

  it('returns all-neutral bars when positions empty', () => {
    const { merged } = usePositionOverlay(ref(kline), ref<DatedPosition[]>([]))
    expect(merged.value.every(p => p.is_entry === false && p.is_exit === false)).toBe(true)
  })

  it('reacts to position changes', () => {
    const posRef = ref<DatedPosition[]>([])
    const { merged } = usePositionOverlay(ref(kline), posRef)
    expect(merged.value[1].is_entry).toBe(false)
    posRef.value = toDatedPositions([p1], '2026-07-27')
    expect(merged.value[1].is_entry).toBe(true)
  })
})
