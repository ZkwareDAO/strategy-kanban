/**
 * KD (Stochastic Oscillator) 随机指标
 * 独立子图，显示K/D/J三条线
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface KDParams {
  k_period?: number
  d_period?: number
}

export class KDIndicator extends BaseIndicator {
  name = 'KD'
  subplot = true

  private kPeriod: number
  private dPeriod: number

  constructor(params: KDParams = {}) {
    super()
    this.kPeriod = params.k_period ?? 9
    this.dPeriod = params.d_period ?? 3
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const highs = klineData.map(d => d.high)
    const lows = klineData.map(d => d.low)
    const closes = klineData.map(d => d.close)
    const length = klineData.length

    const k: (number | null)[] = new Array(length).fill(null)
    const d: (number | null)[] = new Array(length).fill(null)
    const j: (number | null)[] = new Array(length).fill(null)

    if (closes.length < this.kPeriod) {
      return { kd_k: k, kd_d: d, kd_j: j }
    }

    // 计算 RSV
    const rsv: (number | null)[] = new Array(length).fill(null)
    for (let i = this.kPeriod - 1; i < length; i++) {
      let highest = -Infinity
      let lowest = Infinity
      for (let n = i - this.kPeriod + 1; n <= i; n++) {
        if (highs[n] > highest) highest = highs[n]
        if (lows[n] < lowest) lowest = lows[n]
      }
      const range = highest - lowest
      rsv[i] = range === 0 ? 50 : ((closes[i] - lowest) / range) * 100
    }

    // EMA 平滑计算 K 和 D
    const kMultiplier = 2 / (this.kPeriod + 1)
    const dMultiplier = 2 / (this.dPeriod + 1)

    // 找到第一个有效 RSV 作为 K 的初始值
    let firstValidIdx = -1
    for (let i = 0; i < length; i++) {
      if (rsv[i] !== null) {
        firstValidIdx = i
        break
      }
    }

    if (firstValidIdx < 0) {
      return { kd_k: k, kd_d: d, kd_j: j }
    }

    // K = EMA(RSV)
    k[firstValidIdx] = rsv[firstValidIdx]
    for (let i = firstValidIdx + 1; i < length; i++) {
      if (rsv[i] !== null && k[i - 1] !== null) {
        k[i] = (rsv[i]! - k[i - 1]!) * kMultiplier + k[i - 1]!
      }
    }

    // D = EMA(K)
    d[firstValidIdx] = k[firstValidIdx]
    for (let i = firstValidIdx + 1; i < length; i++) {
      if (k[i] !== null && d[i - 1] !== null) {
        d[i] = (k[i]! - d[i - 1]!) * dMultiplier + d[i - 1]!
      }
    }

    // J = 3K - 2D
    for (let i = 0; i < length; i++) {
      if (k[i] !== null && d[i] !== null) {
        j[i] = 3 * k[i]! - 2 * d[i]!
      }
    }

    return { kd_k: k, kd_d: d, kd_j: j }
  }

  getTraces(data: IndicatorResult, timestamps: string[], _colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.kd_k,
        type: 'scatter',
        mode: 'lines',
        name: `K(${this.kPeriod})`,
        line: { color: '#2196F3', width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.kd_d,
        type: 'scatter',
        mode: 'lines',
        name: `D(${this.dPeriod})`,
        line: { color: '#FF9800', width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.kd_j,
        type: 'scatter',
        mode: 'lines',
        name: 'J',
        line: { color: '#9C27B0', width: 1, dash: 'dot' },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
    ]
  }

  getYAxisConfig() {
    return { title: 'KD', range: [0, 100] as [number, number] }
  }
}
