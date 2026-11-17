import rawConfig from '../../datasource.config.json'
import { DEFAULT_PATHS, type OverridablePathKey } from './contract'

export interface DatasourceDataConfig {
  frontendBaseUrl: string
  klineBaseUrl: string
}

export interface DatasourceKlineConfig {
  basePeriod: string
  preferAggregate: boolean
  defaultTimeframe: string
  maxWarmupDays: number
  cacheEntries: number
}

export type DatasourcePaths = Record<OverridablePathKey, string> & {
  overrides: Partial<Record<OverridablePathKey, string>>
}

export interface DatasourceConfig {
  data: DatasourceDataConfig
  kline: DatasourceKlineConfig
  paths: DatasourcePaths
}

/** 环境变量覆盖项，便于不同部署环境指向不同数据根 */
export interface DatasourceEnv {
  frontendBaseUrl?: string
  klineBaseUrl?: string
}

export const DEFAULT_CONFIG: DatasourceConfig = {
  data: {
    frontendBaseUrl: '/frontend-data',
    klineBaseUrl: '/kline-data',
  },
  kline: {
    basePeriod: '1m',
    preferAggregate: true,
    defaultTimeframe: '5m',
    maxWarmupDays: 120,
    cacheEntries: 8,
  },
  paths: {
    ...DEFAULT_PATHS,
    overrides: {},
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

function pickPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function pickOverrides(value: unknown): Partial<Record<OverridablePathKey, string>> {
  if (!isRecord(value)) return {}
  const overrides: Partial<Record<OverridablePathKey, string>> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (key in DEFAULT_PATHS && typeof raw === 'string' && raw.trim() !== '') {
      overrides[key as OverridablePathKey] = raw
    }
  }
  return overrides
}

/**
 * 将用户配置与默认值合并。
 *
 * 任何缺失、类型错误或非正整数的值都回退默认值；env 覆盖优先于配置文件。
 * 纯函数，便于测试。
 */
export function normalizeConfig(raw: unknown, env: DatasourceEnv = {}): DatasourceConfig {
  const source = isRecord(raw) ? raw : {}
  const data = isRecord(source.data) ? source.data : {}
  const kline = isRecord(source.kline) ? source.kline : {}
  const paths = isRecord(source.paths) ? source.paths : {}

  const resolvedPaths = { ...DEFAULT_PATHS }
  for (const key of Object.keys(DEFAULT_PATHS) as OverridablePathKey[]) {
    resolvedPaths[key] = pickString(paths[key], DEFAULT_PATHS[key])
  }

  return {
    data: {
      frontendBaseUrl: pickString(
        env.frontendBaseUrl ?? data.frontendBaseUrl,
        DEFAULT_CONFIG.data.frontendBaseUrl,
      ),
      klineBaseUrl: pickString(
        env.klineBaseUrl ?? data.klineBaseUrl,
        DEFAULT_CONFIG.data.klineBaseUrl,
      ),
    },
    kline: {
      basePeriod: pickString(kline.basePeriod, DEFAULT_CONFIG.kline.basePeriod),
      preferAggregate: pickBoolean(kline.preferAggregate, DEFAULT_CONFIG.kline.preferAggregate),
      defaultTimeframe: pickString(
        kline.defaultTimeframe,
        DEFAULT_CONFIG.kline.defaultTimeframe,
      ),
      maxWarmupDays: pickPositiveNumber(
        kline.maxWarmupDays,
        DEFAULT_CONFIG.kline.maxWarmupDays,
      ),
      cacheEntries: pickPositiveNumber(kline.cacheEntries, DEFAULT_CONFIG.kline.cacheEntries),
    },
    paths: {
      ...resolvedPaths,
      overrides: pickOverrides(paths.overrides),
    },
  }
}

/** 运行时配置（构建时读取 JSON，环境变量可覆盖数据根） */
export const datasourceConfig: DatasourceConfig = normalizeConfig(rawConfig, {
  // 静态访问，确保 Vite 在 dev/build 都能替换 import.meta.env
  frontendBaseUrl: import.meta.env.VITE_DATA_FRONTEND_BASE_URL,
  klineBaseUrl: import.meta.env.VITE_DATA_KLINE_BASE_URL,
})
