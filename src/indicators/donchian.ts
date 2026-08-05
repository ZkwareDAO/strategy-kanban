/**
 * Donchian Channel 唐奇安通道指标
 * 叠加在主图上，显示上中下三条轨 + 填充
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface DonchianParams {
  period?: number
}

export class DonchianIndicator extends BaseIndicator {
  name = 'Donchian'
  subplot = false

  private period: number

  constructor(params: DonchianParams = {}) {
    super()
    this.period = params.period ?? 120
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const highs = klineData.map(d => d.high)
    const lows = klineData.map(d => d.low)
    const length = klineData.length

    const upper: (number | null)[] = new Array(length).fill(null)
    const middle: (number | null)[] = new Array(length).fill(null)
    const lower: (number | null)[] = new Array(length).fill(null)

    if (length < this.period) {
      return { donchian_upper: upper, donchian_middle: middle, donchian_lower: lower }
    }

    for (let i = this.period - 1; i < length; i++) {
      let maxHigh = -Infinity
      let minLow = Infinity
      for (let n = i - this.period + 1; n <= i; n++) {
        if (highs[n] > maxHigh) maxHigh = highs[n]
        if (lows[n] < minLow) minLow = lows[n]
      }
      upper[i] = maxHigh
      lower[i] = minLow
      middle[i] = (maxHigh + minLow) / 2
    }

    return { donchian_upper: upper, donchian_middle: middle, donchian_lower: lower }
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.donchian_upper,
        type: 'scatter',
        mode: 'lines',
        name: `Donchian Upper(${this.period})`,
        line: { color: colors.donchian_line, width: 1 },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.donchian_lower,
        type: 'scatter',
        mode: 'lines',
        name: `Donchian Lower(${this.period})`,
        line: { color: colors.donchian_line, width: 1 },
        fill: 'tonexty',
        fillcolor: colors.donchian_fill,
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.donchian_middle,
        type: 'scatter',
        mode: 'lines',
        name: `Donchian Middle(${this.period})`,
        line: { color: colors.donchian_line, width: 1, dash: 'dot' },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
    ]
  }
}
