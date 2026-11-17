/**
 * K线数据根路径。
 *
 * 实际值来自 `datasource.config.json` 的 `data.klineBaseUrl`，
 * 可用 `VITE_DATA_KLINE_BASE_URL` 覆盖。
 */
import { datasourceConfig } from '@/data/config'

export const KLINE_BASE_URL = datasourceConfig.data.klineBaseUrl
