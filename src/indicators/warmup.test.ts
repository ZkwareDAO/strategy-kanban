import { describe, it, expect } from 'vitest'
import { createIndicator, warmupBarsFor, type IndicatorType, type KlinePoint } from '@/indicators'

/**
 * 构造 n 根合成 K线（价格带波动，避免 ATR/ADX 因零波幅退化）
 */
function buildKline(n: number): KlinePoint[] {
  const out: KlinePoint[] = []
  for (let i = 0; i < n; i++) {
    const base = 100 + Math.sin(i / 3) * 5 + i * 0.1
    const ts = 1767225600 + i * 60
    out.push({
      timestamp: ts,
      datetime: new Date(ts * 1000).toISOString().replace('T', ' ').substring(0, 19),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.5,
      volume: 10 + (i % 7),
      position_id: '',
      entry_price: 0,
      position_type: 'long',
      pnl_pct: 0,
      is_entry: false,
      is_exit: false,
    })
  }
  return out
}

/** 指标结果里第一个非 null 值的下标；全为 null 返回 -1 */
function firstValidIndex(values: (number | null)[]): number {
  return values.findIndex(v => v !== null && v !== undefined)
}

/**
 * 覆盖全部 11 个已实现指标。
 *
 * 参数刻意使用**合成值**：本测试验证的是 `warmupBars` 的推导公式
 * （窗口类取 period、递归平滑类取约 3×period），与任何具体调参无关。
 * 各指标自身的默认参数见 `indicators/config.ts`。
 */
const ALL_CASES: Array<[IndicatorType, Record<string, number>]> = [
  ['RSI', { period: 7 }],
  ['ATR', { period: 11 }],
  ['SMA', { period: 33 }],
  ['BOLL', { period: 13 }],
  ['Donchian', { period: 99 }],
  ['Envelope', { period: 33 }],
  ['EMA', { fast_period: 11, slow_period: 33 }],
  ['MACD', { fast: 7, slow: 13, signal: 7 }],
  ['KD', { k_period: 7, d_period: 11 }],
  ['ADX', { period: 13 }],
  ['OBV', { ma_period: 33 }],
]

describe('指标 warmupBars', () => {
  describe('窗口类指标取 period（首值即精确）', () => {
    it.each([
      ['SMA', { period: 33 }, 33],
      ['BOLL', { period: 13 }, 13],
      ['Donchian', { period: 99 }, 99],
      ['Envelope', { period: 200 }, 200],
    ])('%s %o → %i', (type, params, expected) => {
      expect(createIndicator(type as IndicatorType, params).warmupBars).toBe(expected)
    })
  })

  describe('递归平滑类指标取约 3 倍 period（等平滑收敛）', () => {
    it.each([
      // RSI / ATR: 1 + 3p（Wilder 平滑）
      ['RSI', { period: 7 }, 22],
      ['RSI', { period: 11 }, 34],
      ['ATR', { period: 11 }, 34],
      // EMA: 3 * max(fast, slow)
      ['EMA', { fast_period: 11, slow_period: 33 }, 99],
      ['EMA', { fast_period: 200, slow_period: 7 }, 600],
      // MACD: 3 * (slow + signal)，两级 EMA
      ['MACD', { fast: 7, slow: 13, signal: 7 }, 60],
      ['MACD', { fast: 11, slow: 33, signal: 7 }, 120],
      // KD: 3 * (k + d)
      ['KD', { k_period: 7, d_period: 11 }, 54],
      // ADX: 6p，两级 Wilder
      ['ADX', { period: 13 }, 78],
      ['ADX', { period: 33 }, 198],
    ])('%s %o → %i', (type, params, expected) => {
      expect(createIndicator(type as IndicatorType, params).warmupBars).toBe(expected)
    })
  })

  it('OBV 只需覆盖 MA 窗口（主线累积路径相关，无法预热到「正确」起点）', () => {
    expect(createIndicator('OBV', { ma_period: 33 }).warmupBars).toBe(33)
  })

  // 缺省值取自各指标类自身的默认参数（见 indicators/config.ts）
  it('缺省参数时使用各指标自身默认周期', () => {
    expect(createIndicator('RSI').warmupBars).toBe(43) // 默认 period 14 → 1 + 3*14
    expect(createIndicator('SMA').warmupBars).toBe(20) // 默认 period 20
    expect(createIndicator('Donchian').warmupBars).toBe(120) // 默认 period 120
  })

  // 本次修复的核心契约：喂 warmupBars 根预热 + 1 根业务 bar，
  // 业务 bar（下标 == warmupBars）必须已有非 null 指标值——否则图表开头仍会缺。
  describe('预热后第一根业务 bar 上就有指标值', () => {
    it.each(ALL_CASES)('%s 在下标 warmupBars 处有值', (type, params) => {
      const ind = createIndicator(type, params)
      const warmup = ind.warmupBars
      const kline = buildKline(warmup + 1)
      const result = ind.compute(kline)

      const seriesWithValue = Object.entries(result)
        .filter(([, values]) => values.length === kline.length)
        .filter(([, values]) => values[warmup] !== null && values[warmup] !== undefined)

      expect(seriesWithValue.length).toBeGreaterThan(0)
    })

    it.each(ALL_CASES)('%s 每条序列的首个有效下标都 <= warmupBars', (type, params) => {
      const ind = createIndicator(type, params)
      const warmup = ind.warmupBars
      const kline = buildKline(warmup + 1)
      const result = ind.compute(kline)

      for (const [key, values] of Object.entries(result)) {
        if (values.length !== kline.length) continue // 跳过阈值线等常量数组
        const idx = firstValidIndex(values)
        expect(
          idx,
          `${type}.${key} 首个有效下标为 ${idx}，超过 warmupBars ${warmup}`,
        ).toBeLessThanOrEqual(warmup)
      }
    })
  })
})

describe('warmupBarsFor', () => {
  it('未选指标时为 0', () => {
    expect(warmupBarsFor([])).toBe(0)
  })

  it('取所选指标的最大值（长窗口指标决定预热深度）', () => {
    // ATR(11)=34, SMA(33)=33, EMA(max 200)=600 → 600
    expect(
      warmupBarsFor(['ATR', 'SMA', 'EMA'], {
        ATR: { period: 11 },
        SMA: { period: 33 },
        EMA: { fast_period: 200, slow_period: 7 },
      }),
    ).toBe(600)
  })

  it('单个指标时等于该指标的 warmupBars', () => {
    expect(warmupBarsFor(['ADX'], { ADX: { period: 13 } })).toBe(78)
  })

  it('忽略未实现的指标类型', () => {
    expect(
      warmupBarsFor(['RSI', 'NotAnIndicator' as IndicatorType], { RSI: { period: 7 } }),
    ).toBe(22)
  })

  it('缺省参数时用各指标默认周期', () => {
    // 默认 RSI(14)=43, MACD(12,26,9)=105, ATR(14)=43 → 105
    expect(warmupBarsFor(['RSI', 'MACD', 'ATR'])).toBe(105)
  })
})
