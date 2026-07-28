import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StrategyLogic from '@/components/detail/StrategyLogic.vue'
import type { StrategyLogic as StrategyLogicType } from '@/models/detail'

const mockLogic: StrategyLogicType = {
  entry_conditions: {
    title: '入场条件',
    rules: ['RSI < 30', 'MACD 金叉'],
  },
  exit_conditions: {
    title: '出场条件',
    rules: ['RSI > 70', '止损 -3%'],
  },
  risk_management: {
    title: '风控规则',
    rules: ['单笔最大仓位 10%'],
  },
}

describe('StrategyLogic', () => {
  it('should render header text', () => {
    const wrapper = mount(StrategyLogic, { props: { logic: mockLogic } })
    expect(wrapper.text()).toContain('策略逻辑')
  })

  it('should have expanded=false by default', () => {
    const wrapper = mount(StrategyLogic, { props: { logic: mockLogic } })
    // el-collapse-transition + v-show doesn't hide in happy-dom
    // verify via component state instead
    expect((wrapper.vm as any).expanded).toBe(false)
  })

  it('should toggle expanded on click', async () => {
    const wrapper = mount(StrategyLogic, { props: { logic: mockLogic } })
    await wrapper.find('.logic-header').trigger('click')
    expect((wrapper.vm as any).expanded).toBe(true)
    await wrapper.find('.logic-header').trigger('click')
    expect((wrapper.vm as any).expanded).toBe(false)
  })

  it('should render nothing when logic is undefined', async () => {
    const wrapper = mount(StrategyLogic, { props: { logic: undefined } })
    expect(wrapper.text()).toContain('策略逻辑')
    await wrapper.find('.logic-header').trigger('click')
    expect(wrapper.findAll('.logic-section')).toHaveLength(0)
  })
})