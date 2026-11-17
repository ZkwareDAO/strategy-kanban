import type { BacktestResult } from '@/models/backtest'
import type {
  BacktestRunRow,
  CatalogDay,
  EquityPointV2,
  LivePositionRow,
  ManifestEntryV2,
  SignalComparisonRow,
  SignalRow,
  StrategyMetaV2,
} from '@/models/dataset'
import { datasourceConfig, type DatasourceConfig } from '@/data/config'
import { http, type HttpClient } from '@/data/http'
import { buildPath, joinUrl } from '@/data/path'
import type { OverridablePathKey } from '@/data/contract'
import {
  parseBacktestRunsRows,
  parseCatalogRows,
  parseLivePositionsRows,
  parseManifestRows,
  parseSignalComparisonRows,
  parseSignalsRows,
  parseStrategyMeta,
} from '@/data/adapters'

export interface GetRunsOptions {
  latestOnly?: boolean
  source?: string
}

export interface BacktestDataFilter {
  symbol?: string
  runStamp?: string
  latestOnly?: boolean
}

/** 解析结果 JSON 的 daily_equity 数组；字段缺失/非法时跳过该点 */
export function parseDailyEquity(value: unknown): EquityPointV2[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const point = item as Record<string, unknown>
    const date = typeof point.date === 'string' ? point.date : ''
    const equity = Number(point.equity)
    const cash = Number(point.cash)
    if (!date || !Number.isFinite(equity) || !Number.isFinite(cash)) return []
    return [{ date, equity, cash }]
  })
}

/**
 * frontend-data v2 读取入口。
 *
 * 只按契约拼 URL、解析文件，不做目录扫描、不生成索引。所有方法在文件缺失时
 * 返回空值（[] / null），由页面决定空态。
 */
export class FrontendDataRepository {
  private readonly config: DatasourceConfig
  private readonly client: HttpClient

  constructor(config: DatasourceConfig = datasourceConfig, client: HttpClient = http) {
    this.config = config
    this.client = client
  }

  private template(key: OverridablePathKey): string {
    return this.config.paths.overrides[key] ?? this.config.paths[key]
  }

  private relativePath(key: OverridablePathKey, params: Record<string, string>): string {
    let template = this.template(key)
    if (template.includes('{strategyDir}')) {
      const strategyDir = buildPath(this.template('strategyDir'), params)
      template = template.split('{strategyDir}').join(strategyDir)
    }
    return buildPath(template, params)
  }

  private url(key: OverridablePathKey, params: Record<string, string>): string {
    return joinUrl(this.config.data.frontendBaseUrl, this.relativePath(key, params))
  }

  /** 清空读取缓存（页面刷新时调用） */
  clearCache(): void {
    this.client.clearCache()
  }

  async getCatalog(): Promise<CatalogDay[]> {
    const rows = await this.client.fetchCsv(this.url('catalog', {}))
    return parseCatalogRows(rows)
  }

  async getDayManifest(day: string): Promise<ManifestEntryV2[]> {
    const rows = await this.client.fetchCsv(this.url('dayManifest', { day }))
    return parseManifestRows(rows)
  }

  async getStrategyMeta(day: string, strategy: string): Promise<StrategyMetaV2 | null> {
    const raw = await this.client.fetchJson<unknown>(
      this.url('meta', { day, strategy }),
    )
    return parseStrategyMeta(raw)
  }

  async getLivePositions(
    day: string,
    strategy: string,
    symbol?: string,
  ): Promise<LivePositionRow[]> {
    const rows = await this.client.fetchCsv(this.url('livePositions', { day, strategy }))
    const parsed = parseLivePositionsRows(rows)
    return symbol ? parsed.filter((row) => row.symbol === symbol) : parsed
  }

  async getLiveSignals(day: string, strategy: string, symbol?: string): Promise<SignalRow[]> {
    const rows = await this.client.fetchCsv(this.url('liveSignals', { day, strategy }))
    const parsed = parseSignalsRows(rows)
    return symbol ? parsed.filter((row) => row.symbol === symbol) : parsed
  }

  async getBacktestPositions(
    day: string,
    strategy: string,
    filter: BacktestDataFilter = {},
  ): Promise<LivePositionRow[]> {
    const rows = await this.client.fetchCsv(this.url('backtestPositions', { day, strategy }))
    return this.filterBacktestRows(parseLivePositionsRows(rows), filter)
  }

  async getBacktestSignals(
    day: string,
    strategy: string,
    filter: BacktestDataFilter = {},
  ): Promise<SignalRow[]> {
    const rows = await this.client.fetchCsv(this.url('backtestSignals', { day, strategy }))
    return this.filterBacktestRows(parseSignalsRows(rows), filter)
  }

  async getSignalComparison(
    day: string,
    strategy: string,
    symbol?: string,
  ): Promise<SignalComparisonRow[]> {
    const rows = await this.client.fetchCsv(
      this.url('signalComparison', { day, strategy }),
    )
    const parsed = parseSignalComparisonRows(rows)
    return symbol ? parsed.filter((row) => row.symbol === symbol) : parsed
  }

  async getDayRuns(day: string, options: GetRunsOptions = {}): Promise<BacktestRunRow[]> {
    const rows = await this.client.fetchCsv(this.url('dayRuns', { day }))
    return this.filterRuns(parseBacktestRunsRows(rows), options)
  }

  /**
   * 全局 discovery 回测索引（`discovery/runs.csv`）。
   * 部分数据源把它写在每天 `backtest_runs.csv` 的 `source=discovery` 行里，
   * 缺失时调用方回退到按天读取。
   */
  async getDiscoveryRuns(options: GetRunsOptions = {}): Promise<BacktestRunRow[]> {
    const rows = await this.client.fetchCsv(this.url('discoveryRuns', {}))
    return this.filterRuns(parseBacktestRunsRows(rows), { ...options, source: 'discovery' })
  }

  async getDiscoveryResult(
    strategy: string,
    runStamp: string,
    symbol: string,
  ): Promise<BacktestResult | null> {
    const dir = this.url('discoveryResultsDir', { strategy, runStamp })
    return this.client.fetchJson<BacktestResult>(`${dir}/${symbol}.json`)
  }

  async getDiscoveryEquity(
    strategy: string,
    runStamp: string,
    symbol: string,
  ): Promise<EquityPointV2[]> {
    const dir = this.url('discoveryResultsDir', { strategy, runStamp })
    const raw = await this.client.fetchJson<{ daily_equity?: unknown }>(
      `${dir}/${symbol}.json`,
    )
    return parseDailyEquity(raw?.daily_equity)
  }

  async getBacktestResult(
    day: string,
    strategy: string,
    runStamp: string,
    symbol: string,
  ): Promise<BacktestResult | null> {
    const dir = this.url('backtestResultsDir', { day, strategy, runStamp })
    return this.client.fetchJson<BacktestResult>(`${dir}/${symbol}.json`)
  }

  /**
   * 读取权益曲线。v2 不再产出 backtest_equity.csv，权益在结果 JSON 的
   * `daily_equity` 数组里。
   */
  async getBacktestEquity(
    day: string,
    strategy: string,
    runStamp: string,
    symbol: string,
  ): Promise<EquityPointV2[]> {
    const dir = this.url('backtestResultsDir', { day, strategy, runStamp })
    const raw = await this.client.fetchJson<{ daily_equity?: unknown }>(
      `${dir}/${symbol}.json`,
    )
    return parseDailyEquity(raw?.daily_equity)
  }

  private filterRuns(rows: BacktestRunRow[], options: GetRunsOptions): BacktestRunRow[] {
    const latestOnly = options.latestOnly ?? true
    return rows.filter(
      (row) =>
        (!latestOnly || row.isLatest) &&
        (!options.source || row.source === options.source),
    )
  }

  private filterBacktestRows<T extends { symbol: string; isLatest: boolean; runStamp: string }>(
    rows: T[],
    filter: BacktestDataFilter,
  ): T[] {
    const latestOnly = filter.latestOnly ?? true
    return rows.filter(
      (row) =>
        (!filter.symbol || row.symbol === filter.symbol) &&
        (!filter.runStamp || row.runStamp === filter.runStamp) &&
        (!latestOnly || row.isLatest),
    )
  }
}
