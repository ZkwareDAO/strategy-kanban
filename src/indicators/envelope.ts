/**
 * Envelope 均线包络通道指标
 * 叠加在主图上，显示上中下三条线
 * 参考: indicators.py:compute_envelope
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface EnvelopeParams {
  period?: number
  upper_pct?: number
  lower_pct?: number
}

export class EnvelopeIndicator extends BaseIndicator {
  name = 'Envelope'
  subplot = false

  private period: number
  private upperPct: number
  private lowerPct: number

  constructor(params: EnvelopeParams = {}) {
    super()
    this.period = params.period ?? 26
    this.upperPct = params.upper_pct ?? 0.618
    this.lowerPct = params.lower_pct ?? 0.618
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const closes = klineData.map(d => d.close)
    const length = klineData.length

    const upper: (number | null)[] = new Array(length).fill(null)
    const middle: (number | null)[] = new Array(length).fill(null)
    const lower: (number | null)[] = new Array(length).fill(null)

    if (closes.length < this.period) {
      return { envelope_upper: upper, envelope_middle: middle, envelope_lower: lower }
    }

    for (let i = this.period - 1; i < length; i++) {
      let sum = 0
      for (let j = i - this.period + 1; j <= i; j++) {
        sum += closes[j]
      }
      const avg = sum / this.period
      middle[i] = avg
      upper[i] = avg * (1 + this.upperPct / 100)
      lower[i] = avg * (1 - this.lowerPct / 100)
    }

    return { envelope_upper: upper, envelope_middle: middle, envelope_lower: lower }
  }

  getTraces(data: IndicatorResult, timestamps: string[], _colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.envelope_upper,
        type: 'scatter',
        mode: 'lines',
        name: `Envelope Upper(${this.upperPct}%)`,
        line: { color: '#FF9800', width: 1, dash: 'dash' },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.envelope_middle,
        type: 'scatter',
        mode: 'lines',
        name: `Envelope MA(${this.period})`,
        line: { color: '#FF9800', width: 1 },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.envelope_lower,
        type: 'scatter',
        mode: 'lines',
        name: `Envelope Lower(${this.lowerPct}%)`,
        line: { color: '#FF9800', width: 1, dash: 'dash' },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
    ]
  }
}
