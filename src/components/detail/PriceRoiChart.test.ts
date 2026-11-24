import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PriceRoiChart from '@/components/detail/PriceRoiChart.vue'

// Mock echarts — component uses `import * as echarts from 'echarts'`
vi.mock('echarts', () => ({
  init: () => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }),
}))

describe('PriceRoiChart', () => {
  it('should render title', () => {
    const wrapper = mount(PriceRoiChart, {
      props: { timelineData: [] },
    })
    expect(wrapper.text()).toContain('价格与ROI趋势')
  })

  it('should render chart container element', () => {
    const wrapper = mount(PriceRoiChart, {
      props: { timelineData: [] },
    })
    expect(wrapper.find('.chart-container').exists()).toBe(true)
  })
})
