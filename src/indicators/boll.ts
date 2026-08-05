/**
 * BOLL (Bollinger Bands) 布林带指标
 * 叠加在主图上，显示上中下三条轨
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface BOLLParams {
  period?: number
  std_dev?: number
}

export class BOLLIndicator extends BaseIndicator {
  name = 'BOLL'
  subplot = false

  private period: number
  private stdDev: number

  constructor(params: BOLLParams = {}) {
    super()
    this.period = params.period ?? 20
    this.stdDev = params.std_dev ?? 2.0
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const closes = klineData.map(d => d.close)
    const length = klineData.length

    const upper: (number | null)[] = new Array(length).fill(null)
    const middle: (number | null)[] = new Array(length).fill(null)
    const lower: (number | null)[] = new Array(length).fill(null)

    if (closes.length < this.period) {
      return { boll_upper: upper, boll_middle: middle, boll_lower: lower }
    }

    for (let i = this.period - 1; i < length; i++) {
      let sum = 0
      for (let j = i - this.period + 1; j <= i; j++) {
        sum += closes[j]
      }
      const avg = sum / this.period

      let variance = 0
      for (let j = i - this.period + 1; j <= i; j++) {
        variance += (closes[j] - avg) ** 2
      }
      const std = Math.sqrt(variance / this.period)

      middle[i] = avg
      upper[i] = avg + this.stdDev * std
      lower[i] = avg - this.stdDev * std
    }

    return { boll_upper: upper, boll_middle: middle, boll_lower: lower }
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.boll_upper,
        type: 'scatter',
        mode: 'lines',
        name: `BOLL Upper(${this.period},${this.stdDev})`,
        line: { color: colors.bb_line, width: 1, dash: 'dash' },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.boll_middle,
        type: 'scatter',
        mode: 'lines',
        name: `BOLL Middle(${this.period})`,
        line: { color: colors.bb_line, width: 1 },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.boll_lower,
        type: 'scatter',
        mode: 'lines',
        name: `BOLL Lower(${this.period},${this.stdDev})`,
        line: { color: colors.bb_line, width: 1, dash: 'dash' },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
    ]
  }
}
