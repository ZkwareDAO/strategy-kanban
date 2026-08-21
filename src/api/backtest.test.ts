import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getBacktestIndex,
  getBacktestResult,
  getReplayIndex,
  clearReplayIndexCache,
  REPLAY_BASE,
} from '@/api/backtest'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('backtest API', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    // 缓存是模块级的，不清会让上一个用例的索引泄漏到下一个
    clearReplayIndexCache()
  })

  describe('getBacktestIndex', () => {
    it('returns entries on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          generated_at: '2026-08-03T00:00:00.000Z',
          entries: [
            { strategy: 'cta_ict_v3', symbol: 'BTCUSDT', date: '20260629', time: '101907', path: 'cta_ict_v3/20260629/101907/BTCUSDT' },
          ],
        }),
      })
      const entries = await getBacktestIndex()
      expect(entries).toHaveLength(1)
      expect(entries[0].strategy).toBe('cta_ict_v3')
      // 带时间戳绕过浏览器缓存，确保拿到刚重新生成的索引
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/backtest-output-index\.json\?t=\d+$/),
        { cache: 'no-store' },
      )
    })

    it('returns empty array when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      expect(await getBacktestIndex()).toEqual([])
    })

    it('returns empty array when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'))
      expect(await getBacktestIndex()).toEqual([])
    })

    it('returns empty array when entries field missing', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ generated_at: 'x' }) })
      expect(await getBacktestIndex()).toEqual([])
    })
  })

  describe('getBacktestResult', () => {
    it('returns parsed result on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ metrics: { roe: 0.1 }, trades_count: 5 }),
      })
      const result = await getBacktestResult('cta_ict_v3/20260629/101907/BTCUSDT')
      expect(result?.metrics?.roe).toBe(0.1)
      expect(mockFetch).toHaveBeenCalledWith('/backtest-output/cta_ict_v3/20260629/101907/BTCUSDT/backtest_result.json')
    })

    it('returns null when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      expect(await getBacktestResult('x/y/z/s')).toBeNull()
    })

    it('returns null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'))
      expect(await getBacktestResult('x/y/z/s')).toBeNull()
    })

    it('reads from the given base (每日回放走 /data)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ metrics: { roe: 0.2 } }) })
      const path = '20260102/backtest_results/demo_strat_v2/20260103/031500/BTCUSDT'
      await getBacktestResult(path, REPLAY_BASE)
      expect(mockFetch).toHaveBeenCalledWith(`/data/${path}/backtest_result.json`)
    })
  })

  describe('getReplayIndex', () => {
    /** 单日索引响应，结构与 vite 插件产出的 replay-index.json 一致 */
    function replayResponse() {
      return {
        ok: true,
        json: async () => ({
          generated_at: '2026-01-04T00:00:00.000Z',
          days: {
            '20260102': [
              {
                strategy: 'demo_strat_v2',
                symbol: 'BTCUSDT',
                // 跨零点运行：date 比所属日期 20260102 晚一天
                date: '20260103',
                time: '031500',
                path: '20260102/backtest_results/demo_strat_v2/20260103/031500/BTCUSDT',
                sweep: 0,
                signals_processed: 2,
                metrics: { roe: 0.01 },
              },
            ],
          },
        }),
      }
    }

    it('returns entries of the requested day', async () => {
      mockFetch.mockResolvedValueOnce(replayResponse())
      const entries = await getReplayIndex('20260102')
      expect(entries).toHaveLength(1)
      expect(entries[0].strategy).toBe('demo_strat_v2')
      // 运行日期与所属日期不同，不可互相推导
      expect(entries[0].date).toBe('20260103')
      // 带时间戳绕过浏览器缓存，确保拿到刚重新生成的索引
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/replay-index\.json\?t=\d+$/),
        { cache: 'no-store' },
      )
    })

    it('returns empty array for a day with no data', async () => {
      mockFetch.mockResolvedValueOnce(replayResponse())
      expect(await getReplayIndex('20991231')).toEqual([])
    })

    it('serves later days from cache without refetching', async () => {
      mockFetch.mockResolvedValueOnce(replayResponse())
      await getReplayIndex('20260102')
      await getReplayIndex('20260102')
      await getReplayIndex('20260103')
      // 索引含全部日期，切换日期不该重复下载
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('refetches after the cache is cleared', async () => {
      mockFetch.mockResolvedValueOnce(replayResponse())
      await getReplayIndex('20260102')
      clearReplayIndexCache()
      mockFetch.mockResolvedValueOnce(replayResponse())
      expect(await getReplayIndex('20260102')).toHaveLength(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns empty array when response not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      expect(await getReplayIndex('20260102')).toEqual([])
    })

    it('returns empty array when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'))
      expect(await getReplayIndex('20260102')).toEqual([])
    })

    it('does not cache a failed response', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'))
      await getReplayIndex('20260102')
      mockFetch.mockResolvedValueOnce(replayResponse())
      expect(await getReplayIndex('20260102')).toHaveLength(1)
    })

    it('returns empty array when days field missing', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ generated_at: 'x' }) })
      expect(await getReplayIndex('20260102')).toEqual([])
    })
  })
})
