import { describe, it, expect } from 'vitest'
import { formatSymbol, formatStrategyName } from '@/utils/display'

describe('formatSymbol', () => {
  it('strips USDT suffix', () => {
    expect(formatSymbol('BTCUSDT')).toBe('BTC')
  })

  it('strips USDC suffix', () => {
    expect(formatSymbol('PAXGUSDC')).toBe('PAXG')
  })

  it('strips FDUSD without letting USD match first', () => {
    expect(formatSymbol('BTCFDUSD')).toBe('BTC')
  })

  it('returns option codes unchanged when no known quote suffix', () => {
    expect(formatSymbol('BTC-25DEC26-60000-P')).toBe('BTC-25DEC26-60000-P')
  })

  it('returns bare base names unchanged', () => {
    expect(formatSymbol('BTC')).toBe('BTC')
  })

  it('does not strip a suffix that is the entire symbol', () => {
    expect(formatSymbol('USDT')).toBe('USDT')
  })
})

describe('formatStrategyName', () => {
  it('strips minute timeframe and version', () => {
    expect(formatStrategyName('DEMO_FLOW_15M_1')).toBe('DEMO_FLOW')
  })

  it('strips hour timeframe and version', () => {
    expect(formatStrategyName('DEMO_MA_2H_1')).toBe('DEMO_MA')
  })

  it('strips day timeframe and version', () => {
    expect(formatStrategyName('DEMO_TREND_1D_3')).toBe('DEMO_TREND')
  })

  it('keeps an inner version segment intact', () => {
    expect(formatStrategyName('DEMO_SCORE_V3_8H_3')).toBe('DEMO_SCORE_V3')
  })

  it('strips only the trailing two segments, not the whole tail', () => {
    expect(formatStrategyName('DEMOCHANNEL_4H_2')).toBe('DEMOCHANNEL')
    expect(formatStrategyName('DEMOMACROSS_4H_2')).toBe('DEMOMACROSS')
  })

  it('returns SYNC_ option strategies unchanged', () => {
    expect(formatStrategyName('SYNC_BTC-25DEC26-60000-P')).toBe('SYNC_BTC-25DEC26-60000-P')
    expect(formatStrategyName('SYNC_ETH-14AUG26-1900-P')).toBe('SYNC_ETH-14AUG26-1900-P')
  })

  it('returns snake_case source strategy names unchanged', () => {
    expect(formatStrategyName('demo_trend_b')).toBe('demo_trend_b')
    expect(formatStrategyName('demo_trend')).toBe('demo_trend')
  })

  it('returns names without a timeframe suffix unchanged', () => {
    expect(formatStrategyName('DEMO_FLOW')).toBe('DEMO_FLOW')
  })
})
