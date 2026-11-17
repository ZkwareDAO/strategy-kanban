import { datasourceConfig } from './config'
import { http } from './http'
import { FrontendDataRepository } from './repository/frontendDataRepository'

export { datasourceConfig, normalizeConfig, DEFAULT_CONFIG } from './config'
export type { DatasourceConfig } from './config'
export { createHttpClient, http } from './http'
export type { HttpClient } from './http'
export { FrontendDataRepository } from './repository/frontendDataRepository'
export type { BacktestDataFilter, GetRunsOptions } from './repository/frontendDataRepository'

/** 页面共享的数据读取实例 */
export const dataRepository = new FrontendDataRepository(datasourceConfig, http)
