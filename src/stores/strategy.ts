import { defineStore } from 'pinia'
import type { Runtime, StrategySummary, ModeCounts, TradingMode } from '@/models/runtime'
import type { Position } from '@/models/position'
import { getRuntimes, getPositions } from '@/api/strategy'

export const useStrategyStore = defineStore('strategy', {
  state: () => ({
    runtimes: [] as Runtime[],
    positions: {} as Record<string, Position[]>,
    selectedMode: '' as TradingMode | '',
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

    modeCounts(state): ModeCounts {
      const counts: ModeCounts = { live: 0, paper_trading: 0, smoking: 0, unknown: 0 }
      for (const r of state.runtimes) {
        counts[r.trading_mode] += 1
      }
      return counts
    },

    strategySummaries(): StrategySummary[] {
      const strategyMap = new Map<string, { runtimes: Runtime[]; positions: Position[] }>()

      for (const runtime of this.filteredRuntimes) {
        if (!strategyMap.has(runtime.strategy)) {
          strategyMap.set(runtime.strategy, { runtimes: [], positions: [] })
        }
        strategyMap.get(runtime.strategy)!.runtimes.push(runtime)
      }

      for (const [, data] of strategyMap) {
        for (const runtime of data.runtimes) {
          const positions = this.positions[runtime.runtime_name]
          if (positions && positions.length > 0) {
            data.positions.push(...positions)
          }
        }
      }

      const summaries: StrategySummary[] = []
      for (const [strategy, data] of strategyMap) {
        const positions = data.positions
        const displayName = data.runtimes[0]?.display_name || strategy

        const completedPositions = positions.filter(p => p.exit_time != null)
        const avgRoi =
          completedPositions.length > 0
            ? completedPositions.reduce((sum, p) => sum + (p.realized_pnl ?? 0), 0) / completedPositions.length
            : 0

        const winCount = completedPositions.filter(p => (p.realized_pnl ?? 0) > 0).length
        const winRate = completedPositions.length > 0 ? (winCount / completedPositions.length) * 100 : 0

        const completedCount = completedPositions.length
        const holdingCount = positions.filter(p => p.exit_time == null).length

        summaries.push({
          strategy,
          display_name: displayName,
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
        const runtimes = await getRuntimes(date)
        this.runtimes = runtimes
        this.positions = {}

        // K线与仓位解耦：所有 runtime 都可点击，预加载仓位数据（空数组不影响）
        await Promise.all(
          runtimes.map(r => this.fetchPositions(r.dir_name, r.symbol, date, r.runtime_name)),
        )
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Unknown error'
      } finally {
        this.loading = false
      }
    },

    async fetchPositions(dirName: string, symbol: string, date: string, runtimeName: string) {
      try {
        const positions = await getPositions(dirName, symbol, date)
        if (positions.length > 0) {
          this.positions[runtimeName] = positions
        }
      } catch (err) {
        console.error(`Failed to fetch positions for ${dirName}/${symbol}:`, err)
      }
    },

    setMode(mode: TradingMode | '') {
      this.selectedMode = mode
    },
  },
})
