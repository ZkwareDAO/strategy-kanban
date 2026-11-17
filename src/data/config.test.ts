import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/data/config'

describe('data/config', () => {
  it('returns defaults for an empty config', () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG)
  })

  it('merges partial user config with defaults', () => {
    const config = normalizeConfig({
      data: { frontendBaseUrl: 'https://cdn.example.com/frontend-data' },
      kline: { defaultTimeframe: '1h' },
      paths: { overrides: { livePositions: 'positions.csv' } },
    })

    expect(config.data.frontendBaseUrl).toBe('https://cdn.example.com/frontend-data')
    expect(config.data.klineBaseUrl).toBe(DEFAULT_CONFIG.data.klineBaseUrl)
    expect(config.kline.defaultTimeframe).toBe('1h')
    expect(config.kline.cacheEntries).toBe(DEFAULT_CONFIG.kline.cacheEntries)
    expect(config.paths.overrides.livePositions).toBe('positions.csv')
    expect(config.paths.catalog).toBe(DEFAULT_CONFIG.paths.catalog)
  })

  it('lets env variables override base urls', () => {
    const config = normalizeConfig(
      { data: { frontendBaseUrl: '/frontend-data', klineBaseUrl: '/kline-data' } },
      {
        frontendBaseUrl: 'https://data.example.com/frontend-data',
        klineBaseUrl: 'https://data.example.com/kline-data',
      },
    )

    expect(config.data.frontendBaseUrl).toBe('https://data.example.com/frontend-data')
    expect(config.data.klineBaseUrl).toBe('https://data.example.com/kline-data')
  })

  it('ignores invalid numeric options and falls back to defaults', () => {
    const config = normalizeConfig({
      kline: { cacheEntries: -3, maxWarmupDays: 'not-a-number' },
    })

    expect(config.kline.cacheEntries).toBe(DEFAULT_CONFIG.kline.cacheEntries)
    expect(config.kline.maxWarmupDays).toBe(DEFAULT_CONFIG.kline.maxWarmupDays)
  })

  it('ignores non-object config values', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(normalizeConfig('nope')).toEqual(DEFAULT_CONFIG)
  })
})
