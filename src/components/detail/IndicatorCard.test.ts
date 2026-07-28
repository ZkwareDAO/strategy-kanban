import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import IndicatorCard from '@/components/detail/IndicatorCard.vue'
import type { TechnicalIndicator } from '@/models/detail'

const mockIndicators: TechnicalIndicator[] = [
  { name: 'RSI(14)', value: '45.2', signal: '中性' },
  { name: 'MACD', value: '-120.5', signal: '看空' },
  { name: 'MA20', value: '65,200' },
]

describe('IndicatorCard', () => {
  it('should render title', () => {
    const wrapper = mount(IndicatorCard, { props: { indicators: mockIndicators } })
    expect(wrapper.text()).toContain('技术指标')
  })

  it('should render all indicator names', () => {
    const wrapper = mount(IndicatorCard, { props: { indicators: mockIndicators } })
    expect(wrapper.text()).toContain('RSI(14)')
    expect(wrapper.text()).toContain('MACD')
    expect(wrapper.text()).toContain('MA20')
  })

  it('should render indicator values', () => {
    const wrapper = mount(IndicatorCard, { props: { indicators: mockIndicators } })
    expect(wrapper.text()).toContain('45.2')
    expect(wrapper.text()).toContain('-120.5')
    expect(wrapper.text()).toContain('65,200')
  })

  it('should render signal when present', () => {
    const wrapper = mount(IndicatorCard, { props: { indicators: mockIndicators } })
    expect(wrapper.text()).toContain('中性')
    expect(wrapper.text()).toContain('看空')
  })

  it('should not render signal element when signal is undefined', () => {
    const wrapper = mount(IndicatorCard, { props: { indicators: mockIndicators } })
    const cards = wrapper.findAll('.indicator-card')
    const ma20Card = cards.find(c => c.text().includes('MA20'))
    expect(ma20Card?.find('.indicator-signal').exists()).toBe(false)
  })

  it('should render empty grid when indicators is empty', () => {
    const wrapper = mount(IndicatorCard, { props: { indicators: [] } })
    expect(wrapper.findAll('.indicator-card')).toHaveLength(0)
  })
})