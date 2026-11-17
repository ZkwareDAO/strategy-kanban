/**
 * frontend-data v2 数据契约。
 *
 * 这里是数据生产侧与前端唯一约定的文件布局；所有读取都通过模板拼路径，
 * 不做目录扫描、不生成索引。改文件名只应改这里（或配置里的 overrides）。
 */

/** 数据文件标准名 */
export const FILE_NAMES = {
  catalog: 'catalog.csv',
  manifest: 'manifest.csv',
  backtestRuns: 'backtest_runs.csv',
  meta: 'meta.json',
  livePositions: 'live_positions.csv',
  liveSignals: 'live_signals.csv',
  backtestPositions: 'backtest_positions.csv',
  backtestSignals: 'backtest_signals.csv',
  signalComparison: 'signal_comparison.csv',
  backtestConfig: 'config.json',
} as const

/** 路径模板；{day} 为 YYYYMMDD，{strategy} 为策略目录名 */
export const PATH_TEMPLATES = {
  catalog: FILE_NAMES.catalog,
  dayManifest: `{day}/${FILE_NAMES.manifest}`,
  dayRuns: `{day}/${FILE_NAMES.backtestRuns}`,
  strategyDir: '{day}/{strategy}',
  backtestResultsDir: `{day}/{strategy}/backtest_results/{runStamp}`,
} as const

export type PathTemplateKey = keyof typeof PATH_TEMPLATES

/** 可被配置 overrides 覆盖的相对路径键 */
export type OverridablePathKey =
  | 'catalog'
  | 'dayManifest'
  | 'dayRuns'
  | 'strategyDir'
  | 'backtestResultsDir'
  | 'meta'
  | 'livePositions'
  | 'liveSignals'
  | 'backtestPositions'
  | 'backtestSignals'
  | 'signalComparison'
  | 'discoveryRuns'
  | 'discoveryResultsDir'

/** 默认相对路径：模板 + 策略目录内文件名 */
export const DEFAULT_PATHS: Record<OverridablePathKey, string> = {
  catalog: PATH_TEMPLATES.catalog,
  dayManifest: PATH_TEMPLATES.dayManifest,
  dayRuns: PATH_TEMPLATES.dayRuns,
  strategyDir: PATH_TEMPLATES.strategyDir,
  backtestResultsDir: PATH_TEMPLATES.backtestResultsDir,
  meta: `{strategyDir}/${FILE_NAMES.meta}`,
  livePositions: `{strategyDir}/${FILE_NAMES.livePositions}`,
  liveSignals: `{strategyDir}/${FILE_NAMES.liveSignals}`,
  backtestPositions: `{strategyDir}/${FILE_NAMES.backtestPositions}`,
  backtestSignals: `{strategyDir}/${FILE_NAMES.backtestSignals}`,
  signalComparison: `{strategyDir}/${FILE_NAMES.signalComparison}`,
  discoveryRuns: 'discovery/runs.csv',
  discoveryResultsDir: 'discovery/{strategy}/backtest_results/{runStamp}',
}
