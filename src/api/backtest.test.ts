import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getBacktestIndex, getBacktestResult } from '@/api/backtest'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('backtest API', () => {
  beforeEach(() => {
    mockFetch.mockReset()
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
      expect(mockFetch).toHaveBeenCalledWith('/backtest-output-index.json')
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
  })
})
