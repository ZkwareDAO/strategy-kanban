import type { StrategyMetaV2 } from '@/models/dataset'

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** meta.json → 策略元数据；非对象返回 null */
export function parseStrategyMeta(raw: unknown): StrategyMetaV2 | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const meta = raw as Record<string, unknown>
  const strategy = readString(meta.strategy)
  const sourceStrategy = readString(meta.source_strategy)
  const indicators = Array.isArray(meta.indicators)
    ? meta.indicators.filter((item): item is string => typeof item === 'string')
    : []
  const warmup = meta.warmup_days

  return {
    schemaVersion: readNumber(meta.schema_version, 0),
    day: readString(meta.day),
    strategy,
    sourceStrategy,
    displayName: readString(meta.display_name) || sourceStrategy || strategy,
    description: readString(meta.description),
    version: readString(meta.version),
    engine: readString(meta.engine),
    timeframe: readString(meta.timeframe),
    leverage: readNumber(meta.leverage, 1),
    warmupDays: typeof warmup === 'number' && Number.isFinite(warmup) ? warmup : null,
    indicators,
    indicatorParams: readObject(meta.indicator_params),
    logic: readObject(meta.logic),
    params: readObject(meta.params),
    capturedAt: readString(meta.captured_at),
  }
}
