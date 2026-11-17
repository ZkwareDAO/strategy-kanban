import { describe, it, expect } from 'vitest'
import { compactToIso, getLatestCatalogDay } from '@/services/catalog'
import type { CatalogDay } from '@/models/dataset'

function day(overrides: Partial<CatalogDay> = {}): CatalogDay {
  return {
    day: '20261027',
    strategies: ['A'],
    hasLive: true,
    hasBacktest: true,
    updatedAt: '',
    ...overrides,
  }
}

describe('services/catalog', () => {
  it('converts compact dates to ISO', () => {
    expect(compactToIso('20261027')).toBe('2026-10-27')
  })

  it('returns the latest catalog day regardless of order', async () => {
    const result = await getLatestCatalogDay({
      getCatalog: async () => [
        day({ day: '20261025' }),
        day({ day: '20261027' }),
        day({ day: '20261026' }),
      ],
    })
    expect(result).toEqual({ compact: '20261027', iso: '2026-10-27' })
  })

  it('returns null for an empty catalog', async () => {
    await expect(
      getLatestCatalogDay({ getCatalog: async () => [] }),
    ).resolves.toBeNull()
  })

  it('ignores malformed days', async () => {
    const result = await getLatestCatalogDay({
      getCatalog: async () => [day({ day: '20261027' }), day({ day: 'bak' })],
    })
    expect(result?.compact).toBe('20261027')
  })
})
