import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '@/stores/app'

describe('AppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('should have default date and no loading', () => {
      const store = useAppStore()

      expect(store.date).toBe('')
      expect(store.loading).toBe(false)
    })
  })

  describe('setDate', () => {
    it('should update the date', () => {
      const store = useAppStore()
      store.setDate('20260720')

      expect(store.date).toBe('20260720')
    })
  })

  describe('formattedDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const store = useAppStore()
      store.setDate('20260720')

      expect(store.formattedDate).toBe('2026-07-20')
    })

    it('should return empty string when date is empty', () => {
      const store = useAppStore()

      expect(store.formattedDate).toBe('')
    })
  })
})
