/**
 * RSI (Relative Strength Index) 相对强弱指标
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface RSIParams {
  period?: number
  upperThreshold?: number
  lowerThreshold?: number
}

export class RSIndicator extends BaseIndicator {
  name = 'RSI'
  subplot = true

  private period: number
  private upperThreshold: number
  private lowerThreshold: number

  constructor(params: RSIParams = {}) {
    super()
    this.period = params.period ?? 14
    this.upperThreshold = params.upperThreshold ?? 70
    this.lowerThreshold = params.lowerThreshold ?? 30
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const closes = klineData.map(d => d.close)
    const rsi: (number | null)[] = new Array(klineData.length).fill(null)

    if (closes.length < this.period + 1) {
      return { rsi, rsi_upper: [], rsi_lower: [] }
    }

    let gains = 0
    let losses = 0

    for (let i = 1; i <= this.period; i++) {
      const change = closes[i] - closes[i - 1]
      if (change > 0) gains += change
      else losses -= change
    }

    let avgGain = gains / this.period
    let avgLoss = losses / this.period

    for (let i = this.period; i < closes.length; i++) {
      if (i > this.period) {
        const change = closes[i] - closes[i - 1]
        avgGain = (avgGain * (this.period - 1) + (change > 0 ? change : 0)) / this.period
        avgLoss = (avgLoss * (this.period - 1) + (change < 0 ? -change : 0)) / this.period
      }

      if (avgLoss === 0) {
        rsi[i] = 100
      } else {
        const rs = avgGain / avgLoss
        rsi[i] = 100 - (100 / (1 + rs))
      }
    }

    return {
      rsi,
      rsi_upper: Array(klineData.length).fill(this.upperThreshold),
      rsi_lower: Array(klineData.length).fill(this.lowerThreshold),
    }
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.rsi,
        type: 'scatter',
        mode: 'lines',
        name: 'RSI',
        line: { color: colors.rsi_line, width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: false,
      },
      {
        x: timestamps,
        y: data.rsi_upper,
        type: 'scatter',
        mode: 'lines',
        name: 'Overbought',
        line: { color: 'red', width: 1, dash: 'dash' },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        x: timestamps,
        y: data.rsi_lower,
        type: 'scatter',
        mode: 'lines',
        name: 'Oversold',
        line: { color: 'green', width: 1, dash: 'dash' },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: false,
        hoverinfo: 'skip',
      },
    ]
  }

  getYAxisConfig() {
    return { title: 'RSI', range: [0, 100] as [number, number] }
  }
}
