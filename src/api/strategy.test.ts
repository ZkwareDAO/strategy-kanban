import { describe, it, expect, vi } from 'vitest'
import { getRuntimes, getPositions } from '@/api/strategy'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Strategy API', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('getRuntimes', () => {
    it('should fetch and parse manifest.yaml', async () => {
      const yamlContent = `
tasks:
  - runtime_name: ICT_1D_4_BTCUSDT_LIVE
    strategy: cta_ict_v4
    symbol: BTCUSDT
    status: success
  - runtime_name: RBREAKER_15M_3_BTCUSDT_PAPER
    strategy: cta_rbreaker_v3
    symbol: BTCUSDT
    status: success
`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(yamlContent)
      })

      const result = await getRuntimes('20260720')

      expect(result).toHaveLength(2)
      expect(result[0].runtime_name).toBe('ICT_1D_4_BTCUSDT_LIVE')
      expect(result[0].strategy).toBe('cta_ict_v4')
      expect(result[1].runtime_name).toBe('RBREAKER_15M_3_BTCUSDT_PAPER')
    })
  })

  describe('getPositions', () => {
    it('should fetch and parse position CSV', async () => {
      const csvContent = `Position,Type,Entry,Exit,Entry Price,Realized PNL,Max Potential PNL,Max Drawdown
1784506500,long,00:15,05:11,$65026.00,-1.12%,1.17%,-1.98%`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(csvContent)
      })

      const result = await getPositions('ICT_1D_4_BTCUSDT_LIVE', '20260720')

      expect(result).toHaveLength(1)
      expect(result[0].position_id).toBe('1784506500')
      expect(result[0].type).toBe('long')
      expect(result[0].entry_price).toBe(65026.00)
    })
  })
})