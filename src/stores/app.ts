import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    date: '',
    /**
     * 「区间统计」tab 用户所选的日期范围（ISO YYYY-MM-DD 起止）。
     *
     * null 表示用户尚未主动选择过，此时由组件使用默认区间（上周一~今天）。
     * 存在 store 而非组件内，是因为三个 tab 用 v-if 切换：切走时
     * PerformanceOverview 被销毁、内部 ref 丢失，切回会重置为默认区间。
     *
     * 注意格式与上面的 date 不同（那个是 YYYYMMDD）——区间统计的
     * 日期选择器与 getOrderPositions 用的都是 ISO 形式。
     */
    performanceRange: null as [string, string] | null,
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

    /** 记住「区间统计」所选日期范围，使切换 tab / 进出详情页后仍保留 */
    setPerformanceRange(from: string, to: string) {
      this.performanceRange = [from, to]
    },
  },
})
