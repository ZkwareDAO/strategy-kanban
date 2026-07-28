import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    date: '',
    loading: false,
  }),

  getters: {
    formattedDate: (state): string => {
      if (!state.date) return ''
      // Convert YYYYMMDD to YYYY-MM-DD
      return `${state.date.slice(0, 4)}-${state.date.slice(4, 6)}-${state.date.slice(6, 8)}`
    },
  },

  actions: {
    setDate(date: string) {
      this.date = date
    },
  },
})
