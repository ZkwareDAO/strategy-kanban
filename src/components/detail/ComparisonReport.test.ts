import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ComparisonReport from '@/components/detail/ComparisonReport.vue'
import type { SignalComparison } from '@/models/detail'

const mockComparison: SignalComparison = {
  signal_count_live: 12,
  signal_count_backtest: 15,
  matched_count: 10,
  accuracy_rate: 0.83,
  live_only_signals: [
    { signal_id: 'L1', time: '09:30', direction: 'buy' as const, price: 65200, reason: '突发利好' },
  ],
  backtest_only_signals: [
    { signal_id: 'B1', time: '10:00', direction: 'sell' as const, price: 65100, reason: 'RSI超卖' },
  ],
}

describe('ComparisonReport', () => {
  it('should render title', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    expect(wrapper.text()).toContain('实盘与回测信号对比')
  })

  it('should compute summaryData with signal counts', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    const vm = wrapper.vm as any
    const data = vm.summaryData
    expect(data[0].live).toBe(12)
    expect(data[0].backtest).toBe(15)
  })

  it('should compute summaryData with accuracy rate', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    const vm = wrapper.vm as any
    const data = vm.summaryData
    expect(data[2].live).toBe('83%')
  })

  it('should show live-only signals section', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    expect(wrapper.text()).toContain('实盘独有信号')
    expect(wrapper.text()).toContain('09:30')
    expect(wrapper.text()).toContain('buy')
  })

  it('should show backtest-only signals section', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    expect(wrapper.text()).toContain('回测独有信号')
    expect(wrapper.text()).toContain('10:00')
    expect(wrapper.text()).toContain('sell')
  })

  it('should not show signal sections when lists are empty', () => {
    const noDiff = { ...mockComparison, live_only_signals: [], backtest_only_signals: [] }
    const wrapper = mount(ComparisonReport, { props: { comparison: noDiff } })
    expect(wrapper.text()).not.toContain('实盘独有信号')
    expect(wrapper.text()).not.toContain('回测独有信号')
  })

  it('should render empty when comparison is undefined', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: undefined } })
    expect(wrapper.text()).toContain('实盘与回测信号对比')
  })
})