/**
 * 策略与持仓数据根路径
 *
 * `public/frontend-data` 可以是真实目录，也可以是指向外部数据目录的符号链接。
 * 数据由使用方自行准备，需包含：
 *   - {date}/manifest.json
 *   - {date}/{strategy}/{symbol}/positions.json
 *   - {date}/{strategy}/{symbol}/backtest.json
 *   - {date}/{strategy}/{symbol}/comparison.json
 *   - trading_data/trading_positions_{date}.csv
 *
 * 各文件的字段规范见 docs/DATA-SPEC.md。
 */
export const FRONTEND_DATA_BASE_URL = '/frontend-data'
