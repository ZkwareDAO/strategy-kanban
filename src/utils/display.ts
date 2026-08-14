/**
 * 展示层格式化工具
 *
 * 这里的函数**只用于渲染出口**。原始 `symbol`（含结算币后缀）与完整
 * `strategy_name` 仍必须作为数据键、路由参数和列表 `:key` 使用——
 * 去后缀/去周期后可能产生同名（例 ICT_1D_3 与 ICT_1D_4 都显示为 ICT），
 * 一旦用作键会导致聚合错乱或渲染异常。
 */
import { splitQuote } from './modeFilter'

/**
 * 去掉交易对的结算币后缀，只保留标的名。
 *
 * 复用 `splitQuote` 的后缀表（按长度降序，避免 FDUSD 被 USD 抢先切分），
 * 因此 USDC 计价的交易对也能正确处理。
 *
 * @example
 * formatSymbol('BTCUSDT')  // 'BTC'
 * formatSymbol('PAXGUSDC') // 'PAXG'
 * formatSymbol('BTC-25DEC26-60000-P') // 原样返回（期权代码无已知后缀）
 */
export function formatSymbol(symbol: string): string {
  return splitQuote(symbol).base
}

/**
 * 匹配策略名结尾的「周期_版本」两段，如 _15M_1 / _2H_1 / _1D_3 / _8H_3。
 *
 * 锚定在结尾且只吃两段，因此 SAR_SNT3_V3_8H_3 中间的 _V3 不会被误删。
 */
const TIMEFRAME_VERSION_SUFFIX = /_(\d+(?:MIN|[MHD]))_\d+$/i

/**
 * 去掉策略名结尾的周期与版本，只保留策略主名（仅用于页面展示）。
 *
 * 不匹配的名字原样返回——期权策略 SYNC_ 前缀没有周期后缀，
 * 截断会让它变得无法识别。
 *
 * @example
 * formatStrategyName('VWAPMOM_15M_1')     // 'VWAPMOM'
 * formatStrategyName('ERP_2H_1')          // 'ERP'
 * formatStrategyName('SAR_SNT3_V3_8H_3')  // 'SAR_SNT3_V3'
 * formatStrategyName('SYNC_BTC-25DEC26-60000-P') // 原样返回
 */
export function formatStrategyName(name: string): string {
  return name.replace(TIMEFRAME_VERSION_SUFFIX, '')
}
