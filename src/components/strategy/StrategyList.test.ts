import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import StrategyList from '@/components/strategy/StrategyList.vue'
import type { Runtime, StrategySummary } from '@/models/runtime'
import type { Position } from '@/models/position'
import type { StrategyPerformance } from '@/models/performance'

describe('StrategyList', () => {
  const mockRuntimes: Runtime[] = [
    {
      runtime_name: 'DEMO_TREND_BTCUSDT_LIVE',
      dir_name: 'DEMO_TREND',
      strategy: 'DEMO_TREND',
      symbol: 'BTCUSDT',
      trading_mode: 'live',
      status: 'success',
      display_name: 'DEMO_TREND',
    },
  ]

  const mockPositions: Record<string, Position[]> = {}

  const mockSummaries: StrategySummary[] = [
    {
      strategy: 'DEMO_TREND',
      display_name: '示例趋势',
      position_count: 1,
      completed_count: 1,
      holding_count: 0,
      win_rate: 100,
      avg_roi: 2.5,
    },
  ]

  const mockPerformances: Record<string, StrategyPerformance> = {
    DEMO_TREND: {
      strategy_name: 'DEMO_TREND',
      total_trades: 2,
      winning_trades: 1,
      losing_trades: 1,
      win_rate: 0.5,
      total_pnl: 2.5,
      max_leverage: 2,
      mode: 'live',
      open_trades: 1,
      floating_pnl: 0.75,
    },
  }

  const mountList = (summaries: StrategySummary[] = mockSummaries) =>
    mount(StrategyList, {
      props: {
        summaries,
        runtimes: mockRuntimes,
        positions: mockPositions,
        selectedDate: '20261117',
        performances: mockPerformances,
      },
    })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders strategy display name, token and mode', () => {
    const wrapper = mountList()

    expect(wrapper.text()).toContain('示例趋势')
    expect(wrapper.text()).toContain('BTC')
    expect(wrapper.text()).toContain('Product')
  })

  it('renders realized trade statistics', () => {
    const wrapper = mountList()

    expect(wrapper.text()).toContain('总交易')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('胜率')
    expect(wrapper.text()).toContain('50.0%')
    expect(wrapper.text()).toContain('盈亏')
    expect(wrapper.text()).toContain('2.5000')
  })

  it('renders open position statistics separately', () => {
    const wrapper = mountList()

    expect(wrapper.text()).toContain('持仓 1')
    expect(wrapper.text()).toContain('0.7500')
  })

  it('shows empty state when no summaries', () => {
    const wrapper = mountList([])

    expect(wrapper.text()).toContain('暂无策略数据')
  })
})
