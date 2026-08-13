import { describe, it, expect } from 'vitest'
import { buildIndex, groupRuns, pickLatestPerSymbol, type RawRun } from '@/utils/backtestIndex'
import type { BacktestOutputEntry } from '@/models/backtest'

function run(
  strategy: string,
  symbol: string,
  date: string,
  time: string,
  hasResult = true,
  extra: Partial<RawRun> = {},
): RawRun {
  return { strategy, symbol, date, time, hasResult, ...extra }
}

/** 构造带区间与年化的 run（分组测试用） */
function runWith(
  strategy: string,
  symbol: string,
  date: string,
  time: string,
  start_date: string,
  end_date: string,
  annualized_return?: number,
  extra: Partial<RawRun> = {},
): RawRun {
  return {
    strategy,
    symbol,
    date,
    time,
    hasResult: true,
    start_date,
    end_date,
    completed_at: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`,
    signals_processed: 100,
    metrics: annualized_return === undefined ? {} : { annualized_return },
    ...extra,
  }
}

describe('buildIndex', () => {
  it('returns empty for empty input', () => {
    expect(buildIndex([])).toEqual([])
  })

  it('keeps ALL historical runs per (strategy, symbol)', () => {
    const runs = [
      run('cta_ict_v3', 'BTCUSDT', '20260609', '091024'),
      run('cta_ict_v3', 'BTCUSDT', '20260629', '101907'),
      run('cta_ict_v3', 'BTCUSDT', '20260622', '153939'),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.date).sort()).toEqual(['20260609', '20260622', '20260629'])
  })

  it('keeps both runs when the same day has a rerun of the same symbol', () => {
    const runs = [
      run('obv_atr_v2', 'BTCUSDT', '20260623', '092753'),
      run('obv_atr_v2', 'BTCUSDT', '20260623', '152900'),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.time).sort()).toEqual(['092753', '152900'])
  })

  it('assigns sweep 0 to the first run of a symbol and 1 to a same-day rerun', () => {
    const runs = [
      run('obv_atr_v2', 'BTCUSDT', '20260623', '152900'),
      run('obv_atr_v2', 'BTCUSDT', '20260623', '092753'),
    ]
    const entries = buildIndex(runs)
    const bySweep = new Map(entries.map(e => [e.sweep, e.time]))
    // 轮次按 time 升序分配：早的进 sweep 0
    expect(bySweep.get(0)).toBe('092753')
    expect(bySweep.get(1)).toBe('152900')
  })

  it('keeps distinct symbols of the same batch in sweep 0', () => {
    const runs = [
      run('cta_ict_v3', 'BTCUSDT', '20260609', '081127'),
      run('cta_ict_v3', 'ETHUSDT', '20260609', '081127'),
      run('cta_ict_v3', 'SOLUSDT', '20260609', '081128'),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(3)
    expect(entries.every(e => e.sweep === 0)).toBe(true)
  })

  it('scopes sweep numbering per (strategy, date)', () => {
    const runs = [
      run('a_v1', 'BTCUSDT', '20260623', '090000'),
      run('a_v1', 'BTCUSDT', '20260623', '150000'),
      // 不同日期 → 重新从 0 开始
      run('a_v1', 'BTCUSDT', '20260624', '090000'),
      // 不同策略 → 独立编号
      run('b_v1', 'BTCUSDT', '20260623', '090000'),
    ]
    const entries = buildIndex(runs)
    const key = (e: BacktestOutputEntry) => `${e.strategy}/${e.date}/${e.time}`
    const sweeps = new Map(entries.map(e => [key(e), e.sweep]))
    expect(sweeps.get('a_v1/20260623/090000')).toBe(0)
    expect(sweeps.get('a_v1/20260623/150000')).toBe(1)
    expect(sweeps.get('a_v1/20260624/090000')).toBe(0)
    expect(sweeps.get('b_v1/20260623/090000')).toBe(0)
  })

  it('handles multiple strategies and symbols independently', () => {
    const runs = [
      run('cta_ict_v3', 'BTCUSDT', '20260629', '101907'),
      run('cta_rbreaker_v3', 'ETHUSDT', '20260630', '002951'),
      run('cta_ict_v3', 'ETHUSDT', '20260629', '101908'),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(3)
    expect(entries.map(e => `${e.strategy}/${e.symbol}`).sort()).toEqual([
      'cta_ict_v3/BTCUSDT',
      'cta_ict_v3/ETHUSDT',
      'cta_rbreaker_v3/ETHUSDT',
    ])
  })

  it('skips runs without result.json (incomplete backtests)', () => {
    const runs = [
      run('cta_ict_v3', 'ZECUSDT', '20260630', '000349', false),
      run('cta_ict_v3', 'ZECUSDT', '20260623', '040221', true),
    ]
    const entries = buildIndex(runs)
    expect(entries).toHaveLength(1)
    expect(entries[0].date).toBe('20260623')
  })

  it('drops a (strategy, symbol) entirely if no run has result.json', () => {
    const runs = [run('obv_atr_v2', 'SOLUSDT', '20260701', '030422', false)]
    expect(buildIndex(runs)).toEqual([])
  })

  it('computes path from strategy/date/time/symbol', () => {
    const entries = buildIndex([run('cta_ict_v3', 'BTCUSDT', '20260629', '101907')])
    expect(entries[0].path).toBe('cta_ict_v3/20260629/101907/BTCUSDT')
  })

  it('passes summary fields through to the entry', () => {
    const runs = [
      runWith('cta_ict_v3', 'BTCUSDT', '20260629', '101907', '2025-01-01', '2026-06-29', 2.787),
    ]
    const [entry] = buildIndex(runs)
    expect(entry.start_date).toBe('2025-01-01')
    expect(entry.end_date).toBe('2026-06-29')
    expect(entry.completed_at).toBe('2026-06-29T10:19:07')
    expect(entry.signals_processed).toBe(100)
    expect(entry.metrics?.annualized_return).toBe(2.787)
  })

  it('sorts entries by completed_at descending', () => {
    const runs = [
      runWith('a_v1', 'BTCUSDT', '20260609', '090000', '2025-01-01', '2026-06-09'),
      runWith('a_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-30'),
      runWith('a_v1', 'BTCUSDT', '20260623', '090000', '2025-01-01', '2026-06-23'),
    ]
    const entries = buildIndex(runs)
    expect(entries.map(e => e.date)).toEqual(['20260630', '20260623', '20260609'])
  })

  it('falls back to date+time for ordering when completed_at is missing', () => {
    const runs = [
      run('a_v1', 'BTCUSDT', '20260609', '090000'),
      run('a_v1', 'BTCUSDT', '20260630', '090000'),
    ]
    const entries = buildIndex(runs)
    expect(entries.map(e => e.date)).toEqual(['20260630', '20260609'])
  })
})

describe('groupRuns', () => {
  it('returns empty for empty input', () => {
    expect(groupRuns([])).toEqual([])
  })

  it('merges tokens of one run batch into a single row', () => {
    const entries = buildIndex([
      runWith('cta_ict_v3', 'BTCUSDT', '20260629', '101907', '2025-01-01', '2026-06-29', 1.0),
      runWith('cta_ict_v3', 'ETHUSDT', '20260629', '101908', '2025-01-01', '2026-06-29', 2.0),
      runWith('cta_ict_v3', 'SOLUSDT', '20260629', '101909', '2025-01-01', '2026-06-29', 0.5),
    ])
    const rows = groupRuns(entries)
    expect(rows).toHaveLength(1)
    expect(rows[0].symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
    expect(rows[0].best_annualized).toBe(2.0)
    expect(rows[0].token_entries).toHaveLength(3)
  })

  it('splits a same-day rerun into a separate row (history preserved)', () => {
    const entries = buildIndex([
      runWith('obv_atr_v2', 'BTCUSDT', '20260623', '092753', '2025-01-01', '2026-06-23', 0.568),
      runWith('obv_atr_v2', 'BTCUSDT', '20260623', '152900', '2025-01-01', '2026-06-23', 0.621),
    ])
    const rows = groupRuns(entries)
    expect(rows).toHaveLength(2)
    // 两行的 sweep 不同，年化各自独立
    expect(rows.map(r => r.best_annualized).sort()).toEqual([0.568, 0.621])
    expect(new Set(rows.map(r => r.sweep)).size).toBe(2)
  })

  it('splits different run dates into separate rows', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260623', '090000', '2025-01-01', '2026-06-23', 0.1),
      runWith('a_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-23', 0.2),
    ])
    const rows = groupRuns(entries)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.date)).toEqual(['20260630', '20260623'])
  })

  it('splits different backtest intervals into separate rows', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-30', 0.1),
      runWith('a_v1', 'ETHUSDT', '20260630', '090001', '2026-01-01', '2026-06-30', 0.2),
    ])
    const rows = groupRuns(entries)
    expect(rows).toHaveLength(2)
  })

  it('sorts rows by completed_at descending', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260609', '090000', '2025-01-01', '2026-06-09', 0.1),
      runWith('b_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-30', 0.2),
      runWith('c_v1', 'BTCUSDT', '20260623', '090000', '2025-01-01', '2026-06-23', 0.3),
    ])
    const rows = groupRuns(entries)
    expect(rows.map(r => r.strategy)).toEqual(['b_v1', 'c_v1', 'a_v1'])
  })

  it('uses the latest completed_at within a group as the row completion time', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260630', '080000', '2025-01-01', '2026-06-30', 0.1),
      runWith('a_v1', 'ETHUSDT', '20260630', '110000', '2025-01-01', '2026-06-30', 0.2),
    ])
    const rows = groupRuns(entries)
    expect(rows).toHaveLength(1)
    expect(rows[0].completed_at).toBe('2026-06-30T11:00:00')
  })

  it('filters out empty backtests (signals_processed === 0)', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-30', 0.1, {
        signals_processed: 0,
      }),
      runWith('a_v1', 'ETHUSDT', '20260630', '090001', '2025-01-01', '2026-06-30', 0.2),
    ])
    const rows = groupRuns(entries)
    expect(rows).toHaveLength(1)
    expect(rows[0].symbols).toEqual(['ETHUSDT'])
  })

  it('keeps a row whose signals_processed is missing (field optional)', () => {
    const entries = buildIndex([run('a_v1', 'BTCUSDT', '20260630', '090000')])
    expect(groupRuns(entries)).toHaveLength(1)
  })

  it('reports best_annualized as -Infinity when no token has a value', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-30', undefined),
    ])
    const rows = groupRuns(entries)
    expect(Number.isFinite(rows[0].best_annualized)).toBe(false)
  })

  it('loses no run when grouping a mixed history', () => {
    const runs = [
      runWith('a_v1', 'BTCUSDT', '20260623', '090000', '2025-01-01', '2026-06-23', 0.1),
      runWith('a_v1', 'BTCUSDT', '20260623', '150000', '2025-01-01', '2026-06-23', 0.2),
      runWith('a_v1', 'ETHUSDT', '20260623', '090100', '2025-01-01', '2026-06-23', 0.3),
      runWith('a_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-30', 0.4),
      runWith('b_v1', 'SOLUSDT', '20260630', '093000', '2026-01-01', '2026-06-30', 0.5),
    ]
    const entries = buildIndex(runs)
    const rows = groupRuns(entries)
    const total = rows.reduce((n, r) => n + r.token_entries.length, 0)
    expect(total).toBe(runs.length)
    // 每行内代币不重复
    for (const r of rows) {
      expect(new Set(r.symbols).size).toBe(r.symbols.length)
    }
  })

  it('groups entries lacking sweep (旧索引文件) instead of crashing', () => {
    // 模拟旧版本生成的索引：没有 sweep 字段
    const legacy = [
      { strategy: 'a_v1', symbol: 'BTCUSDT', date: '20260630', time: '090000', path: 'p1' },
      { strategy: 'a_v1', symbol: 'ETHUSDT', date: '20260630', time: '090001', path: 'p2' },
    ] as unknown as BacktestOutputEntry[]
    const rows = groupRuns(legacy)
    expect(rows).toHaveLength(1)
    expect(rows[0].symbols).toEqual(['BTCUSDT', 'ETHUSDT'])
    expect(rows[0].sweep).toBe(0)
  })
})

describe('pickLatestPerSymbol', () => {
  it('returns empty for empty input', () => {
    expect(pickLatestPerSymbol([])).toEqual([])
  })

  it('keeps one entry per symbol', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260623', '090000', '2025-01-01', '2026-06-23', 0.1),
      runWith('a_v1', 'ETHUSDT', '20260623', '090100', '2025-01-01', '2026-06-23', 0.3),
    ])
    expect(pickLatestPerSymbol(entries)).toHaveLength(2)
  })

  it('keeps the latest run when a symbol repeats', () => {
    const entries = buildIndex([
      runWith('obv_atr_v2', 'BTCUSDT', '20260623', '092753', '2025-01-01', '2026-06-23', 0.568),
      runWith('obv_atr_v2', 'BTCUSDT', '20260623', '152900', '2025-01-01', '2026-06-23', 0.621),
    ])
    const picked = pickLatestPerSymbol(entries)
    expect(picked).toHaveLength(1)
    // 保留完成时间较晚的那次
    expect(picked[0].time).toBe('152900')
    expect(picked[0].metrics?.annualized_return).toBe(0.621)
  })

  it('keeps the latest across different run dates', () => {
    const entries = buildIndex([
      runWith('a_v1', 'BTCUSDT', '20260623', '090000', '2025-01-01', '2026-06-23', 0.1),
      runWith('a_v1', 'BTCUSDT', '20260630', '090000', '2025-01-01', '2026-06-23', 0.2),
    ])
    const picked = pickLatestPerSymbol(entries)
    expect(picked).toHaveLength(1)
    expect(picked[0].date).toBe('20260630')
  })
})
