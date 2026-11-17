import { describe, it, expect } from 'vitest'
import { buildPath, joinUrl } from '@/data/path'

describe('data/path', () => {
  describe('buildPath', () => {
    it('substitutes all placeholders', () => {
      expect(
        buildPath('{day}/{strategy}/live_positions.csv', {
          day: '20261022',
          strategy: 'DEMO_FILTER_4H_1',
        }),
      ).toBe('20261022/DEMO_FILTER_4H_1/live_positions.csv')
    })

    it('returns template unchanged when it has no placeholders', () => {
      expect(buildPath('catalog.csv')).toBe('catalog.csv')
    })

    it('throws when a placeholder has no value', () => {
      expect(() => buildPath('{day}/{strategy}/meta.json', { day: '20261022' })).toThrow(
        /strategy/,
      )
    })

    it('throws when a placeholder value is empty', () => {
      expect(() => buildPath('{day}/manifest.csv', { day: '' })).toThrow(/day/)
    })
  })

  describe('joinUrl', () => {
    it('joins base and relative path with a single slash', () => {
      expect(joinUrl('/frontend-data/', '/20261022/manifest.csv')).toBe(
        '/frontend-data/20261022/manifest.csv',
      )
    })

    it('keeps absolute data urls untouched', () => {
      expect(joinUrl('/frontend-data', 'https://cdn.example.com/a.csv')).toBe(
        'https://cdn.example.com/a.csv',
      )
    })

    it('supports absolute base urls', () => {
      expect(joinUrl('https://cdn.example.com/data', 'catalog.csv')).toBe(
        'https://cdn.example.com/data/catalog.csv',
      )
    })

    it('returns relative path when base is empty', () => {
      expect(joinUrl('', 'catalog.csv')).toBe('catalog.csv')
    })
  })
})
