/**
 * SMA (Simple Moving Average) 简单移动平均线
 * 叠加在主图上
 * 参考: indicators.py:compute_sma
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface SMAParams {
  period?: number
}

export class SMAIndicator extends BaseIndicator {
  name = 'SMA'
  subplot = false

  private period: number

  constructor(params: SMAParams = {}) {
    super()
    this.period = params.period ?? 20
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const closes = klineData.map(d => d.close)
    const length = klineData.length

    const sma: (number | null)[] = new Array(length).fill(null)

    if (closes.length < this.period) {
      return { sma }
    }

    // 初始窗口求和
    let sum = 0
    for (let i = 0; i < this.period; i++) {
      sum += closes[i]
    }
    sma[this.period - 1] = sum / this.period

    // 滑动窗口
    for (let i = this.period; i < length; i++) {
      sum += closes[i] - closes[i - this.period]
      sma[i] = sum / this.period
    }

    return { sma }
  }

  getTraces(data: IndicatorResult, timestamps: string[], _colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.sma,
        type: 'scatter',
        mode: 'lines',
        name: `SMA(${this.period})`,
        line: { color: '#2196F3', width: 2 },
        xaxis: 'x',
        yaxis: 'y',
        showlegend: true,
      },
    ]
  }
}
