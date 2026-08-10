/**
 * 前端开源数据根路径
 *
 * public/frontend-data 是符号链接，指向 cta-strategy-code/frontend_data。
 * 由 scripts/generate-frontend-data.py 生成，包含：
 *   - {date}/manifest.json
 *   - {date}/{strategy}/{symbol}/positions.json
 *   - {date}/{strategy}/{symbol}/backtest.json
 *   - {date}/{strategy}/{symbol}/comparison.json
 *   - trading_data/trading_positions_{date}.csv
 */
export const FRONTEND_DATA_BASE_URL = '/frontend-data'
