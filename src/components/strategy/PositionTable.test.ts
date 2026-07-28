import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PositionTable from '@/components/strategy/PositionTable.vue'
import type { Position } from '@/models/position'

describe('PositionTable', () => {
  const mockPositions: Position[] = [
    {
      position_id: '1784506500',
      type: 'long',
      entry_time: '00:15',
      exit_time: '05:11',
      entry_price: 65026.0,
      realized_pnl: -1.12,
      max_potential_pnl: 1.17,
      max_drawdown: -1.98,
    },
    {
      position_id: '1784506600',
      type: 'short',
      entry_time: '10:55',
      exit_time: undefined,
      entry_price: 1877.2,
      realized_pnl: -0.5,
      max_potential_pnl: 0.8,
      max_drawdown: -1.2,
    },
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should render table with positions', () => {
    const wrapper = mount(PositionTable, {
      props: { positions: mockPositions },
    })

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.text()).toContain('00:15')
    expect(wrapper.text()).toContain('10:55')
  })

  it('should display entry and exit times', () => {
    const wrapper = mount(PositionTable, {
      props: { positions: mockPositions },
    })

    expect(wrapper.text()).toContain('00:15')
    expect(wrapper.text()).toContain('05:11')
  })

  it('should show "持仓中" for open positions', () => {
    const wrapper = mount(PositionTable, {
      props: { positions: mockPositions },
    })

    expect(wrapper.text()).toContain('持仓中')
  })

  it('should format entry price with $ and commas', () => {
    const wrapper = mount(PositionTable, {
      props: { positions: mockPositions },
    })

    expect(wrapper.text()).toContain('$65,026.00')
  })

  it('should display positive ROI with plus sign', () => {
    const positionsWithPositive: Position[] = [
      { ...mockPositions[0], realized_pnl: 2.5 },
    ]

    const wrapper = mount(PositionTable, {
      props: { positions: positionsWithPositive },
    })

    expect(wrapper.text()).toContain('+2.50%')
  })

  it('should display negative ROI with minus sign', () => {
    const wrapper = mount(PositionTable, {
      props: { positions: mockPositions },
    })

    expect(wrapper.text()).toContain('-1.12%')
  })

  it('should show empty state when no positions', () => {
    const wrapper = mount(PositionTable, {
      props: { positions: [] },
    })

    expect(wrapper.text()).toContain('暂无持仓数据')
  })
})