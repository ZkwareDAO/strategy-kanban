import { describe, it, expect } from 'vitest'
import { parseCsv } from '@/utils/csv'

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
})
