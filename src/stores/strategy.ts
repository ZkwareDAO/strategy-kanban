import { defineStore } from 'pinia'
import type { Runtime, StrategySummary, ModeCounts } from '@/models/runtime'
import type { Position } from '@/models/position'
import { getRuntimes, getPositions } from '@/api/strategy'

export const useStrategyStore = defineStore('strategy', {
  state: () => ({
    runtimes: [] as Runtime[],
    positions: {} as Record<string, Position[]>,
    fetchedRuntimes: new Set<string>(), // 记录已尝试 fetch 的 runtime
    selectedMode: '' as 'live' | 'paper_trading' | 'smoking' | '', // 默认显示所有模式
    loading: false,
    error: null as string | null,
  }),

  getters: {
    filteredRuntimes: (state): Runtime[] => {
      if (!state.selectedMode) {
        return state.runtimes
      }
      return state.runtimes.filter((r) => r.trading_mode === state.selectedMode)
    },

    modeCounts: (state): ModeCounts => {
      return {
        live: state.runtimes.filter((r) => r.trading_mode === 'live').length,
        paper_trading: state.runtimes.filter((r) => r.trading_mode === 'paper_trading').length,
        smoking: state.runtimes.filter((r) => r.trading_mode === 'smoking').length,
      }
    },

    strategySummaries(): StrategySummary[] {
      const strategyMap = new Map<string, { runtimes: Runtime[]; positions: Position[] }>()

      // Group runtimes by strategy (only filtered ones)
      for (const runtime of this.filteredRuntimes) {
        if (!strategyMap.has(runtime.strategy)) {
          strategyMap.set(runtime.strategy, { runtimes: [], positions: [] })
        }
        strategyMap.get(runtime.strategy)!.runtimes.push(runtime)
      }

      // Collect positions for each strategy
      for (const [strategy, data] of strategyMap) {
        for (const runtime of data.runtimes) {
          const positions = this.positions[runtime.runtime_name]
          if (positions && positions.length > 0) {
            data.positions.push(...positions)
          }
        }
      }

      // Compute summaries - 只返回有持仓的策略
      const summaries: StrategySummary[] = []
      for (const [strategy, data] of strategyMap) {
        const positions = data.positions
        if (positions.length === 0) continue // 过滤掉没有持仓的策略

        const avgRoi =
          positions.length > 0
            ? positions.reduce((sum, p) => sum + p.realized_pnl, 0) / positions.length
            : 0

        // 计算胜率：盈利仓位数 / 总仓位数
        const winCount = positions.filter(p => p.realized_pnl > 0).length
        const winRate = positions.length > 0 ? (winCount / positions.length) * 100 : 0

        // 计算已完成和未完成交易数
        const completedCount = positions.filter(p => p.exit_time).length
        const holdingCount = positions.filter(p => !p.exit_time).length

        summaries.push({
          strategy,
          position_count: positions.length,
          completed_count: completedCount,
          holding_count: holdingCount,
          win_rate: winRate,
          avg_roi: avgRoi,
        })
      }

      return summaries
    },
  },

  actions: {
    async fetchRuntimes(date: string) {
      this.loading = true
      this.error = null
      try {
        // 获取运行实例列表（优先从索引文件）
        const runtimes = await getRuntimes(date)

        this.runtimes = runtimes
        this.positions = {}
        this.fetchedRuntimes = new Set<string>()

        // 加载持仓数据
        await Promise.all(
          runtimes.map(r => this.fetchPositions(r.runtime_name, date))
        )
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Unknown error'
      } finally {
        this.loading = false
      }
    },

    async fetchPositions(runtimeName: string, date: string) {
      this.fetchedRuntimes.add(runtimeName)
      try {
        const positions = await getPositions(runtimeName, date)
        // 只存储有实际数据的持仓，空数组不存储（保持 undefined）
        if (positions.length > 0) {
          this.positions[runtimeName] = positions
        }
      } catch (err) {
        console.error(`Failed to fetch positions for ${runtimeName}:`, err)
        // 不设空数组，保持 undefined，避免空数组被当作"已加载"
      }
    },

    setMode(mode: 'live' | 'paper_trading' | 'smoking' | '') {
      this.selectedMode = mode
    },
  },
})

/**
 * 从运行实例名称中提取交易模式
 */
function extractMode(runtime_name: string): 'live' | 'paper_trading' | 'smoking' {
  if (runtime_name.includes('_LIVE')) return 'live'
  if (runtime_name.includes('_PAPER')) return 'paper_trading'
  return 'smoking'
}
