/**
 * 虚构示例策略定义
 *
 * 这些策略与本项目使用方的真实策略无关：前缀、逻辑描述、指标组合均为
 * 便于演示而编造，仅用于把页面填满。
 *
 * 前缀刻意不落在 `src/models/runtime.ts` 的 PREFIX_STRATEGY_MAP 中——
 * `extractDisplayPrefix` 未命中映射时会回退为 runtime_name 的首段，
 * 正好得到 `DEMOEMA` 这类短名，因此无需改动前端代码。
 */

/**
 * 示例策略清单
 *
 * 三个策略覆盖三种 trading_mode（live / paper_trading / smoking），
 * 使概览页的模式筛选每个 tab 都有内容。
 */
export const STRATEGIES = [
  {
    dirName: 'DEMOEMA_1H_1',
    sourceStrategy: 'demo_ema_cross',
    tradingMode: 'live',
    symbols: ['BTCUSDT', 'ETHUSDT'],
    leverage: 5,
    /** 日均开仓次数的期望值，决定图上标记的密度 */
    tradesPerDay: 1.6,
    /** 单笔持仓时长范围（分钟） */
    holdMinutes: [90, 420],
    /**
     * 止盈线（%）。止损线在 trades.mjs 中按 1.25 倍设定，
     * 「小亏多、大赚少」的形态使胜率自然落在 50% 出头。
     */
    pnlScale: 1.1,
  },
  {
    dirName: 'DEMOBOLL_4H_1',
    sourceStrategy: 'demo_boll_reversion',
    tradingMode: 'paper_trading',
    symbols: ['ETHUSDT', 'SOLUSDT'],
    leverage: 3,
    tradesPerDay: 1.0,
    holdMinutes: [240, 900],
    pnlScale: 1.8,
  },
  {
    dirName: 'DEMOATR_15M_1',
    sourceStrategy: 'demo_atr_breakout',
    tradingMode: 'smoking',
    symbols: ['BTCUSDT', 'SOLUSDT'],
    leverage: 10,
    tradesPerDay: 2.4,
    holdMinutes: [30, 180],
    pnlScale: 0.8,
  },
]

/** trading_mode → runtime_name 的模式后缀 */
const MODE_SUFFIX = {
  live: 'LIVE',
  paper_trading: 'PAPER',
  smoking: 'SMOKING',
}

/** 拼接 runtime_name：`{dirName}_{SYMBOL}_{MODE}` */
export function runtimeName(strategy, symbol) {
  return `${strategy.dirName}_${symbol}_${MODE_SUFFIX[strategy.tradingMode]}`
}

/**
 * 构造某一天的 manifest.json 内容
 *
 * 展开为 (策略 × 标的) 的扁平清单，与 docs/DATA-SPEC.md 第 1 节一致。
 */
export function buildManifest(compactDate) {
  const strategies = []
  for (const strategy of STRATEGIES) {
    for (const symbol of strategy.symbols) {
      strategies.push({
        strategy: strategy.dirName,
        symbol,
        trading_mode: strategy.tradingMode,
        runtime_name: runtimeName(strategy, symbol),
        status: 'success',
        source_strategy: strategy.sourceStrategy,
      })
    }
  }
  return { date: compactDate, strategies }
}

/**
 * strategies.json：策略中文名、简介、逻辑与默认指标
 *
 * 键为 source_strategy，与 manifest 对应（见 api/strategyMeta.ts 的匹配规则）。
 * 指标名必须是前端已实现的（DATA-SPEC「可用的指标名」一节），否则被忽略。
 */
export function buildStrategyMeta() {
  return {
    demo_ema_cross: {
      display_name: '示例：均线交叉',
      description: '演示用策略：EMA 快慢线交叉入场，ATR 跟踪止损。数据为程序合成。',
      indicators: ['EMA', 'ATR', 'RSI'],
      indicator_params: {
        EMA: { fast_period: 12, slow_period: 26 },
        ATR: { period: 14 },
      },
      logic: {
        entry: ['EMA12 上穿 EMA26 且 RSI 未超买', '成交量高于 20 周期均量'],
        exit: ['EMA12 下穿 EMA26', 'ATR 跟踪止损触发'],
        risk: ['单笔风险不超过账户 1%', '同一标的仅持有一个方向'],
      },
    },
    demo_boll_reversion: {
      display_name: '示例：布林带回归',
      description: '演示用策略：价格触及布林带外轨后反向入场，回归中轨止盈。数据为程序合成。',
      indicators: ['BOLL', 'RSI', 'ATR'],
      indicator_params: {
        BOLL: { period: 20, std_dev: 2 },
        RSI: { period: 14 },
      },
      logic: {
        entry: ['收盘价突破布林带上/下轨', 'RSI 出现顶/底背离'],
        exit: ['价格回归布林中轨', '持仓超过 15 小时强制平仓'],
        risk: ['外轨宽度过窄时不入场', '单日最多开仓 2 次'],
      },
    },
    demo_atr_breakout: {
      display_name: '示例：ATR 突破',
      description: '演示用策略：以 ATR 倍数构造通道，突破追势。数据为程序合成。',
      indicators: ['ATR', 'Donchian', 'ADX'],
      indicator_params: {
        ATR: { period: 20 },
        Donchian: { period: 20 },
      },
      logic: {
        entry: ['突破 20 周期唐奇安通道', 'ADX 高于 25 确认趋势'],
        exit: ['反向突破通道中线', '固定 2 倍 ATR 止损'],
        risk: ['震荡行情（ADX < 20）暂停开仓', '高杠杆下缩小仓位'],
      },
    },
  }
}
