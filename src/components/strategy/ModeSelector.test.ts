import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ModeSelector from '@/components/strategy/ModeSelector.vue'

describe('ModeSelector', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should render mode labels with counts', () => {
    const wrapper = mount(ModeSelector, {
      props: {
        counts: { live: 13, paper_trading: 20, smoking: 11 },
        modelValue: 'paper_trading',
      },
    })

    expect(wrapper.text()).toContain('Live')
    expect(wrapper.text()).toContain('13')
    expect(wrapper.text()).toContain('Paper')
    expect(wrapper.text()).toContain('20')
    expect(wrapper.text()).toContain('Smoking')
    expect(wrapper.text()).toContain('11')
  })
})