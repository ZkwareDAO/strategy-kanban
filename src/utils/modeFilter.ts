/**
 * 模式过滤工具
 *
 * 区间统计的仓位数据（trading_positions CSV）本身没有 trading_mode 字段，
 * 模式信息来自每日 manifest.json 的 (dir_name, symbol) -> trading_mode。
 *
 * 本工具把跨多日 manifest 收集到的 Runtime[] 聚合成索引，供区间统计按
 * 生产(live)/冒烟(smoking) 过滤仓位使用。
 *
 * ## 结算币漂移
 *
 * manifest 记录的是策略「配置」的交易对，实盘成交的可能是另一种结算币
 * （例：配置 WLDUSDT，实盘 WLDUSDC）。此时精确键匹配不上，仓位会被整条
 * 丢弃——曾导致整个策略在区间统计里消失。
 *
 * 因此匹配分三级：
 *   1. 精确匹配 (dir|SYMBOL)——同一策略同时跑 USDT 与 USDC 时各自命中，永不合并
 *   2. 精确未命中且 asset 有已知结算币后缀 → 按 (dir|BASE) 回退，
 *      **仅当该 base 在 manifest 中只对应一个交易对时**采用
 *   3. base 下有多个候选交易对 → 无法判定归属，返回 null，不猜
 *
 * 回退命中的仓位与精确命中**完全同等对待**（计入 PNL、胜率、可下钻），
 * 只在诊断信息里单独计数，供 UI 提示数据源存在结算币不一致。
 *
 * 已知残留风险：若某 dir 下 `XXXUSDT` 是真实策略，而 `XXXUSDC` 是另一个
 * 独立策略但漏配 manifest，第 2 级会把 USDC 仓位归到 USDT 策略的模式下。
 * 概率低（同策略不同结算币的模式通常一致），且 UI 会提示回退计数供人工核对。
 */
import type { Runtime, TradingMode } from '@/models/runtime'
import type { OrderPosition } from '@/models/performance'

/** 已知结算币后缀，按长度降序匹配，避免 FDUSD 被 USD 抢先切分 */
const QUOTE_CURRENCIES = ['FDUSD', 'BUSD', 'USDT', 'USDC', 'TUSD', 'USD'] as const

/** dir_name|asset 复合键 */
export function modeKey(dirName: string, asset: string): string {
  return `${dirName}|${asset}`
}

/**
 * 拆分交易对为 base + 结算币。
 * 无已知后缀（如期权代码 BTC-25DEC26-60000-P）时 quote 为 null。
 */
export function splitQuote(symbol: string): { base: string; quote: string | null } {
  for (const q of QUOTE_CURRENCIES) {
    if (symbol.length > q.length && symbol.endsWith(q)) {
      return { base: symbol.slice(0, -q.length), quote: q }
    }
  }
  return { base: symbol, quote: null }
}

/**
 * 模式索引：精确键 + base 键两级。
 * `byBase` 的值保留候选交易对全集，用于判断回退是否唯一（歧义时拒绝匹配）。
 */
export interface ModeIndex {
  /** dir|SYMBOL -> 模式集合 */
  exact: Map<string, Set<TradingMode>>
  /** dir|BASE -> (SYMBOL -> 模式集合) */
  byBase: Map<string, Map<string, Set<TradingMode>>>
}

/**
 * 构建模式索引。
 * 同一交易对在不同日期可能以不同模式运行，取并集后用交集判断更稳妥。
 */
export function buildModeIndex(runtimes: Runtime[]): ModeIndex {
  const exact = new Map<string, Set<TradingMode>>()
  const byBase = new Map<string, Map<string, Set<TradingMode>>>()

  for (const r of runtimes) {
    const key = modeKey(r.dir_name, r.symbol)
    let set = exact.get(key)
    if (!set) {
      set = new Set<TradingMode>()
      exact.set(key, set)
    }
    set.add(r.trading_mode)

    const { base, quote } = splitQuote(r.symbol)
    if (quote === null) continue
    const baseKey = modeKey(r.dir_name, base)
    let candidates = byBase.get(baseKey)
    if (!candidates) {
      candidates = new Map<string, Set<TradingMode>>()
      byBase.set(baseKey, candidates)
    }
    candidates.set(r.symbol, set)
  }

  return { exact, byBase }
}

/**
 * 从 strategy_name（格式 {dir_name}_{SYMBOL}，如 NEWOBV_4H_1_BTCUSDT）
 * 提取 dir_name。期权策略 SYNC_ 开头的整体作为组名（无代币后缀可拆）。
 */
export function extractStrategyGroup(strategyName: string): string {
  if (strategyName.startsWith('SYNC_')) return strategyName
  const lastUnderscore = strategyName.lastIndexOf('_')
  if (lastUnderscore <= 0) return strategyName
  return strategyName.slice(0, lastUnderscore)
}

/** 区间统计可筛选的真实模式 */
export type SelectableMode = 'live' | 'smoking'

/** 一条仓位的模式解析结果 */
export interface ModeMatch {
  modes: Set<TradingMode>
  /** 实际命中的 manifest 交易对（回退时与 position.asset 不同） */
  matchedSymbol: string
  /** 是否通过结算币回退命中 */
  viaQuoteFallback: boolean
}

/**
 * 解析某条仓位对应的模式（无法判定返回 null）。
 * 精确优先，回退仅在 base 唯一时采用——详见文件头注释。
 */
export function resolveModes(p: OrderPosition, index: ModeIndex): ModeMatch | null {
  const dir = extractStrategyGroup(p.strategy_name)

  const exact = index.exact.get(modeKey(dir, p.asset))
  if (exact) {
    return { modes: exact, matchedSymbol: p.asset, viaQuoteFallback: false }
  }

  const { base, quote } = splitQuote(p.asset)
  if (quote === null) return null

  const candidates = index.byBase.get(modeKey(dir, base))
  if (!candidates || candidates.size !== 1) return null

  const [matchedSymbol, modes] = [...candidates][0]
  return { modes, matchedSymbol, viaQuoteFallback: true }
}

/** 诊断条目：策略 + 币种 */
export interface ModeDiagnostic {
  strategy: string
  asset: string
}

/** 结算币回退明细，附带实际命中的 manifest 交易对 */
export interface QuoteFallbackDiagnostic extends ModeDiagnostic {
  matchedSymbol: string
}

/** 过滤结果：仓位 + 诊断信息 */
export interface FilterResult {
  positions: OrderPosition[]
  /** 通过结算币回退命中的 (策略, 币种) 去重列表——已计入 positions */
  quoteFallbacks: QuoteFallbackDiagnostic[]
  /** 完全无法关联模式的 (策略, 币种) 去重列表——未计入 positions */
  unmatched: ModeDiagnostic[]
}

/**
 * 按所选模式集合（多选）过滤仓位。
 *
 * 仓位命中的模式集合与 `selectedModes` 有交集即保留。
 * 调用方需保证 selectedModes 非空（UI 层不允许全部取消）。
 * 无法关联到任何 manifest 条目的仓位不计入结果，但会出现在 `unmatched` 里。
 */
export function filterPositionsByModes(
  positions: OrderPosition[],
  index: ModeIndex,
  selectedModes: Set<SelectableMode>,
): FilterResult {
  const kept: OrderPosition[] = []
  const fallbacks = new Map<string, QuoteFallbackDiagnostic>()
  const unmatched = new Map<string, ModeDiagnostic>()

  for (const p of positions) {
    const dir = extractStrategyGroup(p.strategy_name)
    const match = resolveModes(p, index)

    if (!match) {
      const key = modeKey(dir, p.asset)
      if (!unmatched.has(key)) unmatched.set(key, { strategy: dir, asset: p.asset })
      continue
    }

    let hit = false
    for (const m of selectedModes) {
      if (match.modes.has(m)) {
        hit = true
        break
      }
    }
    if (!hit) continue

    kept.push(p)
    if (match.viaQuoteFallback) {
      const key = modeKey(dir, p.asset)
      if (!fallbacks.has(key)) {
        fallbacks.set(key, { strategy: dir, asset: p.asset, matchedSymbol: match.matchedSymbol })
      }
    }
  }

  return {
    positions: kept,
    quoteFallbacks: [...fallbacks.values()],
    unmatched: [...unmatched.values()],
  }
}

/**
 * 跨日快照去重。
 *
 * 每日 CSV 是快照语义：含当天平仓的仓位，也含此前开仓、当天仍未平的仓位。
 * 因此区间统计合并多日文件时，同一笔仓位会在多天各出现一次，
 * 若不去重会被重复计入 PNL 与交易数（实测 0805-0812 区间虚增 24.6% 交易笔数）。
 *
 * 以 (strategy_name, asset, created_at) 为仓位身份——同一策略同一币种的
 * 同一开仓时刻即同一笔。同键冲突时保留已平仓记录（deleted=1），
 * 因为平仓那天的 pnl_value 才是最终值，未平仓快照里的只是中途浮盈。
 * 取舍会实质改变结果：实测某笔 XRPUSDC 未平快照为 +0.1073、平仓后为 -0.0488，
 * 保留错误的一条会让盈亏方向反转，并连带算错胜率。
 *
 * ## 已知限制：无法区分同秒开仓的多笔仓位
 *
 * CSV 没有 position_id 字段，仓位身份只能由上述三元组推断。若同一策略在
 * **同一币种、同一秒**开出两笔独立仓位，会被误合并为一条，导致少计一笔交易。
 * 实测 0805-0812 区间无此情况（73 个唯一身份均无同秒冲突），但高频策略
 * （分钟级或更快）存在触发可能。
 *
 * 彻底解决需数据源侧在 CSV 中补 position_id——frontend_data 的 positions.json
 * 已有该字段（见 models/position.ts），trading_positions CSV 补齐后，
 * 此处应改用 position_id 作为身份键。
 */
export function dedupePositions(positions: OrderPosition[]): OrderPosition[] {
  const byId = new Map<string, OrderPosition>()

  for (const p of positions) {
    const id = `${p.strategy_name}|${p.asset}|${p.created_at}`
    const prev = byId.get(id)
    if (!prev) {
      byId.set(id, p)
      continue
    }
    // 已平仓记录优先；两者同状态时保留先出现的（稳定）
    if (prev.deleted !== 1 && p.deleted === 1) byId.set(id, p)
  }

  return [...byId.values()]
}

/**
 * 按 (dir_name, asset, 选中模式) 反查 runtime，用于跳转蜡烛图时补齐参数。
 *
 * 与 resolveModes 同样支持结算币回退：仓位 asset 为 WLDUSDC 时也能找到
 * manifest 里的 WLDUSDT runtime，使漂移策略的下钻体验与精确匹配一致。
 */
export function findRuntimeForAsset(
  runtimes: Runtime[],
  dirName: string,
  asset: string,
  selectedModes: Set<SelectableMode>,
): Runtime | undefined {
  const inDir = runtimes.filter((r) => r.dir_name === dirName)

  let candidates = inDir.filter((r) => r.symbol === asset)
  if (candidates.length === 0) {
    const { base, quote } = splitQuote(asset)
    if (quote === null) return undefined
    candidates = inDir.filter((r) => splitQuote(r.symbol).base === base)
    // 多个不同交易对时无法判定归属，与 resolveModes 保持一致
    const distinct = new Set(candidates.map((r) => r.symbol))
    if (distinct.size > 1) return undefined
  }
  if (candidates.length === 0) return undefined

  // 优先匹配当前选中的模式；全选时按 selectedModes 迭代序（live 先于 smoking）
  for (const m of selectedModes) {
    const hit = candidates.find((r) => r.trading_mode === m)
    if (hit) return hit
  }
  return candidates[0]
}
