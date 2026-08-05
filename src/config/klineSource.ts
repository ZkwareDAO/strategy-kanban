/**
 * v2 K线数据源配置
 *
 * `public/kline-data` 是指向 `cta-strategy-code/data/strategies` 的符号链接
 * （与 `public/data -> signal_comparison_output` 同一模式，见 docs/RUNBOOK.md）。
 *
 * 将来若需支持多数据根或按策略覆盖路径，可在此读取 YAML 配置
 * （js-yaml 已是项目依赖）；当前保持单常量，YAGNI。
 */

/** 外部 K线数据在 Vite 静态服务下的根路径 */
export const KLINE_BASE_URL = '/kline-data'
