import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import StrategyList from '@/components/strategy/StrategyList.vue'
import type { StrategySummary } from '@/models/runtime'

describe('StrategyList', () => {
  const mockSummaries: StrategySummary[] = [
    { strategy: 'cta_ict_v4', runtime_count: 7, position_count: 4, avg_roi: 2.35 },
    { strategy: 'cta_rbreaker_v3', runtime_count: 2, position_count: 1, avg_roi: -1.12 },
    { strategy: 'obv_atr_v2', runtime_count: 5, position_count: 1, avg_roi: 0.5 },
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should render strategy items for each summary', () => {
    const wrapper = mount(StrategyList, {
      props: { summaries: mockSummaries },
    })

    expect(wrapper.text()).toContain('cta_ict_v4')
    expect(wrapper.text()).toContain('cta_rbreaker_v3')
    expect(wrapper.text()).toContain('obv_atr_v2')
  })

  it('should display runtime count and position count', () => {
    const wrapper = mount(StrategyList, {
      props: { summaries: mockSummaries },
    })

    expect(wrapper.text()).toContain('7') // runtime_count for cta_ict_v4
    expect(wrapper.text()).toContain('4') // position_count for cta_ict_v4
  })

  it('should display positive ROI with plus sign', () => {
    const wrapper = mount(StrategyList, {
      props: { summaries: mockSummaries },
    })

    expect(wrapper.text()).toContain('+2.35%')
  })

  it('should display negative ROI with minus sign', () => {
    const wrapper = mount(StrategyList, {
      props: { summaries: mockSummaries },
    })

    expect(wrapper.text()).toContain('-1.12%')
  })

  it('should show empty state when no summaries', () => {
    const wrapper = mount(StrategyList, {
      props: { summaries: [] },
    })

    expect(wrapper.text()).toContain('暂无策略数据')
  })
})
