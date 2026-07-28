/**
 * ATR (Average True Range) 平均真实波幅
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface ATRParams {
  period?: number
}

export class ATRIndicator extends BaseIndicator {
  name = 'ATR'
  subplot = true

  private period: number

  constructor(params: ATRParams = {}) {
    super()
    this.period = params.period ?? 14
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const length = klineData.length
    const atr: (number | null)[] = new Array(length).fill(null)

    if (length < this.period + 1) {
      return { atr }
    }

    const tr: number[] = []
    for (let i = 1; i < length; i++) {
      const high = klineData[i].high
      const low = klineData[i].low
      const prevClose = klineData[i - 1].close

      const trValue = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      )
      tr.push(trValue)
    }

    if (tr.length < this.period) {
      return { atr }
    }

    let sum = 0
    for (let i = 0; i < this.period; i++) {
      sum += tr[i]
    }
    atr[this.period] = sum / this.period

    for (let i = this.period; i < tr.length; i++) {
      atr[i + 1] = (atr[i]! * (this.period - 1) + tr[i]) / this.period
    }

    return { atr }
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.atr,
        type: 'scatter',
        mode: 'lines',
        name: `ATR(${this.period})`,
        line: { color: colors.atr_line, width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: false,
      },
    ]
  }
}
