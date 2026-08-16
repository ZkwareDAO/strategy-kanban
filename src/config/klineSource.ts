/**
 * v2 K线数据源配置
 *
 * `public/kline-data` 存放行情数据，布局为 `{period}/{SYMBOL}_{period}.csv`
 * （如 `1m/BTCUSDT_1m.csv`）。可以是真实目录，也可以是指向外部数据目录的
 * 符号链接。数据格式见 docs/DATA-SPEC.md。
 *
 * 将来若需支持多数据根或按策略覆盖路径，可在此读取 YAML 配置
 * （js-yaml 已是项目依赖）；当前保持单常量，YAGNI。
 */

/** 外部 K线数据在 Vite 静态服务下的根路径 */
export const KLINE_BASE_URL = '/kline-data'
