/**
 * 策略与仓位数据根路径。
 *
 * 实际值来自项目根目录 `datasource.config.json` 的 `data.frontendBaseUrl`，
 * 可用 `VITE_DATA_FRONTEND_BASE_URL` 覆盖。
 */
import { datasourceConfig } from '@/data/config'

export const FRONTEND_DATA_BASE_URL = datasourceConfig.data.frontendBaseUrl
