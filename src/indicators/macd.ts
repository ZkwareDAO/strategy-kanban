/**
 * MACD (Moving Average Convergence Divergence) 指数平滑异同移动平均线
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface MACDParams {
  fast?: number
  slow?: number
  signal?: number
}

export class MACDIndicator extends BaseIndicator {
  name = 'MACD'
  subplot = true

  private fastPeriod: number
  private slowPeriod: number
  private signalPeriod: number

  constructor(params: MACDParams = {}) {
    super()
    this.fastPeriod = params.fast ?? 12
    this.slowPeriod = params.slow ?? 26
    this.signalPeriod = params.signal ?? 9
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const closes = klineData.map(d => d.close)
    const length = klineData.length

    const macd: (number | null)[] = new Array(length).fill(null)
    const macdSignal: (number | null)[] = new Array(length).fill(null)
    const macdHist: (number | null)[] = new Array(length).fill(null)

    if (closes.length < this.slowPeriod + this.signalPeriod) {
      return { macd, macd_signal: macdSignal, macd_hist: macdHist }
    }

    const emaFast = this.calculateEMA(closes, this.fastPeriod)
    const emaSlow = this.calculateEMA(closes, this.slowPeriod)

    for (let i = 0; i < length; i++) {
      if (emaFast[i] !== null && emaSlow[i] !== null) {
        macd[i] = emaFast[i]! - emaSlow[i]!
      }
    }

    const macdValues = macd.map(v => v ?? 0).filter(v => v !== 0)
    const signalLine = this.calculateEMA(macdValues, this.signalPeriod)

    let signalIdx = 0
    for (let i = 0; i < length; i++) {
      if (macd[i] !== null && signalIdx < signalLine.length) {
        macdSignal[i] = signalLine[signalIdx]
        macdHist[i] = macd[i]! - macdSignal[i]!
        signalIdx++
      }
    }

    return { macd, macd_signal: macdSignal, macd_hist: macdHist }
  }

  private calculateEMA(data: number[], period: number): (number | null)[] {
    const ema: (number | null)[] = new Array(data.length).fill(null)
    if (data.length < period) return ema

    let sum = 0
    for (let i = 0; i < period; i++) {
      sum += data[i]
    }
    ema[period - 1] = sum / period

    const multiplier = 2 / (period + 1)
    for (let i = period; i < data.length; i++) {
      ema[i] = (data[i] - ema[i - 1]!) * multiplier + ema[i - 1]!
    }

    return ema
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    const histValues = data.macd_hist || []
    const colors_hist = histValues.map(v => v !== null && v >= 0 ? colors.macd_hist_pos : colors.macd_hist_neg)

    return [
      {
        x: timestamps,
        y: data.macd,
        type: 'scatter',
        mode: 'lines',
        name: 'MACD',
        line: { color: colors.macd_line, width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: false,
      },
      {
        x: timestamps,
        y: data.macd_signal,
        type: 'scatter',
        mode: 'lines',
        name: 'Signal',
        line: { color: colors.macd_signal, width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: false,
      },
      {
        x: timestamps,
        y: data.macd_hist,
        type: 'bar',
        name: 'Histogram',
        marker: { color: colors_hist },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: false,
      },
    ]
  }
}
