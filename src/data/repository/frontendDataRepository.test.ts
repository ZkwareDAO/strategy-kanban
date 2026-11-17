import { describe, it, expect, vi } from 'vitest'
import { FrontendDataRepository } from '@/data/repository/frontendDataRepository'
import { normalizeConfig } from '@/data/config'
import type { HttpClient } from '@/data/http'

function createClient() {
  const fetchCsv = vi.fn(async () => [] as Record<string, string>[])
  const fetchJson = vi.fn(async () => null as unknown)
  const fetchText = vi.fn(async () => null as string | null)
  const client: HttpClient = {
    fetchCsv,
    fetchJson,
    fetchText,
    clearCache: vi.fn(),
  }
  return { client, fetchCsv, fetchJson }
}

const config = normalizeConfig({
  data: { frontendBaseUrl: '/data-root' },
})

describe('FrontendDataRepository', () => {
  it('reads catalog from the configured base url', async () => {
    const { client, fetchCsv } = createClient()
    fetchCsv.mockResolvedValueOnce([
      { day: '20261022', strategies: 'A|B', has_live: '1', has_backtest: '1', updated_at: 'x' },
    ])
    const repo = new FrontendDataRepository(config, client)

    const catalog = await repo.getCatalog()

    expect(fetchCsv).toHaveBeenCalledWith('/data-root/catalog.csv')
    expect(catalog[0].day).toBe('20261022')
    expect(catalog[0].strategies).toEqual(['A', 'B'])
  })

  it('reads the day manifest', async () => {
    const { client, fetchCsv } = createClient()
    const repo = new FrontendDataRepository(config, client)

    await repo.getDayManifest('20261022')

    expect(fetchCsv).toHaveBeenCalledWith('/data-root/20261022/manifest.csv')
  })

  it('reads live positions for a strategy and filters by symbol', async () => {
    const { client, fetchCsv } = createClient()
    fetchCsv.mockResolvedValueOnce([
      { strategy: 'X', symbol: 'BTCUSDT', position_id: '1', side: 'long', status: 'OPEN' },
      { strategy: 'X', symbol: 'ETHUSDT', position_id: '2', side: 'short', status: 'CLOSED' },
    ])
    const repo = new FrontendDataRepository(config, client)

    const rows = await repo.getLivePositions('20261022', 'X', 'ETHUSDT')

    expect(fetchCsv).toHaveBeenCalledWith('/data-root/20261022/X/live_positions.csv')
    expect(rows).toHaveLength(1)
    expect(rows[0].positionId).toBe('2')
  })

  it('honours path overrides', async () => {
    const { client, fetchCsv } = createClient()
    const overrideConfig = normalizeConfig({
      data: { frontendBaseUrl: '/data-root' },
      paths: { overrides: { livePositions: '{strategyDir}/positions.csv' } },
    })
    const repo = new FrontendDataRepository(overrideConfig, client)

    await repo.getLivePositions('20261022', 'X')

    expect(fetchCsv).toHaveBeenCalledWith('/data-root/20261022/X/positions.csv')
  })

  it('filters day runs to latest and source', async () => {
    const { client, fetchCsv } = createClient()
    fetchCsv.mockResolvedValueOnce([
      { strategy: 'A', symbol: 'BTCUSDT', source: 'discovery', is_latest: '1' },
      { strategy: 'A', symbol: 'ETHUSDT', source: 'discovery', is_latest: '0' },
      { strategy: 'B', symbol: 'BTCUSDT', source: 'replay', is_latest: '1' },
    ])
    const repo = new FrontendDataRepository(config, client)

    const rows = await repo.getDayRuns('20261022', { source: 'discovery' })

    expect(fetchCsv).toHaveBeenCalledWith('/data-root/20261022/backtest_runs.csv')
    expect(rows.map((r) => r.symbol)).toEqual(['BTCUSDT'])
  })

  it('can include non-latest runs', async () => {
    const { client, fetchCsv } = createClient()
    fetchCsv.mockResolvedValueOnce([
      { strategy: 'A', symbol: 'BTCUSDT', is_latest: '0' },
      { strategy: 'A', symbol: 'ETHUSDT', is_latest: '1' },
    ])
    const repo = new FrontendDataRepository(config, client)

    const rows = await repo.getDayRuns('20261022', { latestOnly: false })

    expect(rows).toHaveLength(2)
  })

  it('reads the global discovery runs index', async () => {
    const { client, fetchCsv } = createClient()
    fetchCsv.mockResolvedValueOnce([
      { source: 'discovery', strategy: 'demo_trend', symbol: 'BTCUSDT', is_latest: '1' },
    ])
    const repo = new FrontendDataRepository(config, client)

    const rows = await repo.getDiscoveryRuns()

    expect(fetchCsv).toHaveBeenCalledWith('/data-root/discovery/runs.csv')
    expect(rows[0].source).toBe('discovery')
  })

  it('reads discovery result and equity from the same json', async () => {
    const { client, fetchJson } = createClient()
    fetchJson.mockResolvedValue({
      metrics: { roe: 0.2 },
      daily_equity: [{ date: '2026-10-22', equity: 10, cash: 5 }],
    })
    const repo = new FrontendDataRepository(config, client)

    const result = await repo.getDiscoveryResult('demo_trend', '20261008T100841', 'BTCUSDT')
    const equity = await repo.getDiscoveryEquity('demo_trend', '20261008T100841', 'BTCUSDT')

    expect(fetchJson).toHaveBeenCalledWith(
      '/data-root/discovery/demo_trend/backtest_results/20261008T100841/BTCUSDT.json',
    )
    expect(result?.metrics?.roe).toBe(0.2)
    expect(equity).toHaveLength(1)
  })

  it('reads strategy meta', async () => {
    const { client, fetchJson } = createClient()
    fetchJson.mockResolvedValueOnce({ strategy: 'X', display_name: 'X', timeframe: '4h' })
    const repo = new FrontendDataRepository(config, client)

    const meta = await repo.getStrategyMeta('20261022', 'X')

    expect(fetchJson).toHaveBeenCalledWith('/data-root/20261022/X/meta.json')
    expect(meta?.timeframe).toBe('4h')
  })

  it('reads backtest result json', async () => {
    const { client, fetchJson } = createClient()
    fetchJson.mockResolvedValueOnce({ metrics: { roe: 0.1 } })
    const repo = new FrontendDataRepository(config, client)

    const result = await repo.getBacktestResult('20261022', 'X', '20261023T001530', 'BTCUSDT')

    expect(fetchJson).toHaveBeenCalledWith(
      '/data-root/20261022/X/backtest_results/20261023T001530/BTCUSDT.json',
    )
    expect(result?.metrics?.roe).toBe(0.1)
  })

  it('reads equity from the result json daily_equity', async () => {
    const { client, fetchJson } = createClient()
    fetchJson.mockResolvedValueOnce({
      metrics: { roe: 0.1 },
      daily_equity: [{ date: '2026-10-22', equity: 1000, cash: 900 }],
    })
    const repo = new FrontendDataRepository(config, client)

    const points = await repo.getBacktestEquity('20261022', 'X', '20261023T001530', 'BTCUSDT')

    expect(fetchJson).toHaveBeenCalledWith(
      '/data-root/20261022/X/backtest_results/20261023T001530/BTCUSDT.json',
    )
    expect(points).toEqual([{ date: '2026-10-22', equity: 1000, cash: 900 }])
  })

  it('returns empty equity when daily_equity is missing or invalid', async () => {
    const { client, fetchJson } = createClient()
    fetchJson
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ metrics: { roe: 0.1 } })
      .mockResolvedValueOnce({ daily_equity: [{ date: '', equity: 1, cash: 1 }] })
    const repo = new FrontendDataRepository(config, client)

    await expect(
      repo.getBacktestEquity('20261022', 'X', '20261023T001530', 'BTCUSDT'),
    ).resolves.toEqual([])
    await expect(
      repo.getBacktestEquity('20261022', 'X', '20261023T001530', 'BTCUSDT'),
    ).resolves.toEqual([])
    await expect(
      repo.getBacktestEquity('20261022', 'X', '20261023T001530', 'BTCUSDT'),
    ).resolves.toEqual([])
  })
})
