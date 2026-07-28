import { describe, it, expect } from 'vitest'
import type { Position, PositionSummary } from '@/models/position'

describe('Position Model', () => {
  describe('Position type definition', () => {
    it('should have correct structure for long position', () => {
      const position: Position = {
        position_id: '1784506500',
        type: 'long',
        entry_time: '00:15',
        exit_time: '05:11',
        entry_price: 65026.00,
        realized_pnl: -1.12,
        max_potential_pnl: 1.17,
        max_drawdown: -1.98
      }

      expect(position.position_id).toBe('1784506500')
      expect(position.type).toBe('long')
      expect(position.entry_time).toBe('00:15')
      expect(position.exit_time).toBe('05:11')
      expect(position.entry_price).toBe(65026.00)
      expect(position.realized_pnl).toBe(-1.12)
    })

    it('should allow optional exit_time for holding positions', () => {
      const position: Position = {
        position_id: '1784506600',
        type: 'short',
        entry_time: '10:55',
        entry_price: 1877.20,
        realized_pnl: -0.50,
        max_potential_pnl: 0.80,
        max_drawdown: -1.20
      }

      expect(position.exit_time).toBeUndefined()
      expect(position.type).toBe('short')
    })
  })

  describe('PositionSummary type definition', () => {
    it('should have correct structure for position summary', () => {
      const summary: PositionSummary = {
        symbol: 'BTCUSDT',
        positions: [
          {
            position_id: '1784506500',
            type: 'long',
            entry_time: '00:15',
            exit_time: '05:11',
            entry_price: 65026.00,
            realized_pnl: -1.12,
            max_potential_pnl: 1.17,
            max_drawdown: -1.98
          }
        ]
      }

      expect(summary.symbol).toBe('BTCUSDT')
      expect(summary.positions).toHaveLength(1)
      expect(summary.positions[0].position_id).toBe('1784506500')
    })
  })
})