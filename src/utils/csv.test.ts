import { describe, it, expect } from 'vitest'
import { parseCsv, parsePositionSummary } from '@/utils/csv'

describe('CSV Utils', () => {
  describe('parseCsv', () => {
    it('should parse simple CSV string', () => {
      const csv = `name,age,city
John,30,Beijing
Jane,25,Shanghai`

      const result = parseCsv(csv)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('John')
      expect(result[0].age).toBe('30')
      expect(result[0].city).toBe('Beijing')
    })

    it('should handle empty CSV', () => {
      const csv = ''
      const result = parseCsv(csv)
      expect(result).toHaveLength(0)
    })

    it('should handle CSV with only headers', () => {
      const csv = 'name,age,city'
      const result = parseCsv(csv)
      expect(result).toHaveLength(0)
    })

    it('should handle CSV with quoted values', () => {
      const csv = `name,description
"John","A, B, C"
"Jane","Hello ""World"""`

      const result = parseCsv(csv)

      expect(result).toHaveLength(2)
      expect(result[0].description).toBe('A, B, C')
      expect(result[1].description).toBe('Hello "World"')
    })
  })

  describe('parsePositionSummary', () => {
    it('should parse position summary CSV correctly', () => {
      const csv = `Position,Type,Entry,Exit,Entry Price,Realized PNL,Max Potential PNL,Max Drawdown
1784506500,long,00:15,05:11,$65026.00,-1.12%,1.17%,-1.98%
1784506600,short,10:55,,$1877.20,-0.50%,0.80%,-1.20%`

      const result = parsePositionSummary(csv)

      expect(result).toHaveLength(2)

      // First position
      expect(result[0].position_id).toBe('1784506500')
      expect(result[0].type).toBe('long')
      expect(result[0].entry_time).toBe('00:15')
      expect(result[0].exit_time).toBe('05:11')
      expect(result[0].entry_price).toBe(65026.00)
      expect(result[0].realized_pnl).toBe(-1.12)
      expect(result[0].max_potential_pnl).toBe(1.17)
      expect(result[0].max_drawdown).toBe(-1.98)

      // Second position (holding)
      expect(result[1].position_id).toBe('1784506600')
      expect(result[1].type).toBe('short')
      expect(result[1].exit_time).toBeUndefined()
      expect(result[1].entry_price).toBe(1877.20)
    })

    it('should handle empty position summary', () => {
      const csv = 'Position,Type,Entry,Exit,Entry Price,Realized PNL,Max Potential PNL,Max Drawdown'
      const result = parsePositionSummary(csv)
      expect(result).toHaveLength(0)
    })

    it('should parse price with dollar sign', () => {
      const csv = `Position,Type,Entry,Exit,Entry Price,Realized PNL,Max Potential PNL,Max Drawdown
1,long,10:00,11:00,$64431.15,1.50%,2.00%,0.50%`

      const result = parsePositionSummary(csv)

      expect(result[0].entry_price).toBe(64431.15)
    })

    it('should parse percentage values correctly', () => {
      const csv = `Position,Type,Entry,Exit,Entry Price,Realized PNL,Max Potential PNL,Max Drawdown
1,long,10:00,11:00,$100,-1.12%,1.17%,-1.98%`

      const result = parsePositionSummary(csv)

      expect(result[0].realized_pnl).toBe(-1.12)
      expect(result[0].max_potential_pnl).toBe(1.17)
      expect(result[0].max_drawdown).toBe(-1.98)
    })
  })
})