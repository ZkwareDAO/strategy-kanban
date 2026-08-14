import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ComparisonReport from '@/components/detail/ComparisonReport.vue'
import type { SignalComparison } from '@/models/detail'

const mockComparison: SignalComparison = {
  strategy: 'ERP_2H_1',
  symbol: 'BTCUSDT',
  date: '20260101',
  total_live: 12,
  total_backtest: 15,
  matched: 10,
  accuracy_score: 0.83,
  unmatched_live: [
    {
      signal_id: 'L1',
      timestamp: '2026-01-01T01:30:00+00:00',
      side: 'buy',
      action: 'buy',
      live_price: 65200,
      reason: '突发利好',
    },
  ],
  unmatched_backtest: [
    {
      signal_id: 'B1',
      timestamp: '2026-01-01T02:00:00+00:00',
      side: 'sell',
      action: 'sell',
      backtest_price: 65100,
      reason: 'RSI超卖',
    },
  ],
  matched_signals: [
    {
      signal_id: 'M1',
      timestamp: '2026-01-01T03:00:00+00:00',
      side: 'buy',
      action: 'buy',
      live_price: 65000,
      backtest_price: 65010,
      match_type: 'signal_id',
    },
  ],
}

describe('ComparisonReport', () => {
  it('should render title', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    expect(wrapper.text()).toContain('实盘与回放交易信号对比')
  })

  it('should render live and backtest signal counts', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    expect(wrapper.text()).toContain('实盘交易信号数')
    expect(wrapper.text()).toContain('回放交易信号数')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('15')
  })

  it('should render accuracy as a rounded percentage', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    expect(wrapper.text()).toContain('83%')
  })

  it('should label the four tabs with 交易信号 wording', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    const tabs = wrapper.findAll('.tab-btn').map(b => b.text())
    expect(tabs).toEqual(['全部交易信号', '实盘交易信号', '回放交易信号', '不一致交易信号'])
  })

  it('should show one-sided signals with 仅 wording on the default tab', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: mockComparison } })
    expect(wrapper.text()).toContain('仅实盘交易信号')
    expect(wrapper.text()).toContain('仅回放交易信号')
    expect(wrapper.text()).toContain('L1')
    expect(wrapper.text()).toContain('B1')
  })

  it('should not show one-sided sections when both lists are empty', () => {
    const noDiff: SignalComparison = { ...mockComparison, unmatched_live: [], unmatched_backtest: [] }
    const wrapper = mount(ComparisonReport, { props: { comparison: noDiff } })
    expect(wrapper.text()).not.toContain('仅实盘交易信号')
    expect(wrapper.text()).not.toContain('仅回放交易信号')
  })

  it('should show the mismatch empty state on the 不一致 tab when nothing differs', async () => {
    const noDiff: SignalComparison = { ...mockComparison, unmatched_live: [], unmatched_backtest: [] }
    const wrapper = mount(ComparisonReport, { props: { comparison: noDiff } })
    await wrapper.findAll('.tab-btn')[3].trigger('click')
    expect(wrapper.text()).toContain('无不一致交易信号')
  })

  it('should render title when comparison is undefined', () => {
    const wrapper = mount(ComparisonReport, { props: { comparison: undefined } })
    expect(wrapper.text()).toContain('实盘与回放交易信号对比')
  })
})
