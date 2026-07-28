import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PriceRoiChart from '@/components/detail/PriceRoiChart.vue'

// Mock echarts — component uses `import * as echarts from 'echarts'`
const mockSetOption = vi.fn()
const mockResize = vi.fn()
const mockDispose = vi.fn()

vi.mock('echarts', () => ({
  init: () => ({
    setOption: mockSetOption,
    resize: mockResize,
    dispose: mockDispose,
  }),
}))

describe('PriceRoiChart', () => {
  beforeEach(() => {
    mockSetOption.mockClear()
    mockResize.mockClear()
    mockDispose.mockClear()
  })

  it('should render title', () => {
    const wrapper = mount(PriceRoiChart, {
      props: { symbols: ['BTCUSDT'], timelineData: [] },
    })
    expect(wrapper.text()).toContain('价格与ROI趋势')
  })

  it('should render symbol selector element', () => {
    const wrapper = mount(PriceRoiChart, {
      props: { symbols: ['BTCUSDT', 'ETHUSDT'], timelineData: [] },
    })
    // el-select doesn't render option text in happy-dom
    // verify the select element exists
    expect(wrapper.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
  })

  it('should call echarts init and setOption on mount', () => {
    mount(PriceRoiChart, {
      props: { symbols: ['BTCUSDT'], timelineData: [] },
      attachTo: document.body,
    })
    expect(mockSetOption).toHaveBeenCalled()
  })

  it('should dispose chart on unmount', () => {
    const wrapper = mount(PriceRoiChart, {
      props: { symbols: ['BTCUSDT'], timelineData: [] },
      attachTo: document.body,
    })
    wrapper.unmount()
    expect(mockDispose).toHaveBeenCalled()
  })

  it('should render chart container element', () => {
    const wrapper = mount(PriceRoiChart, {
      props: { symbols: ['BTCUSDT'], timelineData: [] },
    })
    expect(wrapper.find('.chart-container').exists()).toBe(true)
  })
})