/**
 * OBV (On Balance Volume) 能量潮指标
 * 独立子图，显示OBV和OBV_MA两条线
 * 参考: indicators.py:compute_obv
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface OBVParams {
  ma_period?: number
}

export class OBVIndicator extends BaseIndicator {
  name = 'OBV'
  subplot = true

  private maPeriod: number

  constructor(params: OBVParams = {}) {
    super()
    this.maPeriod = params.ma_period ?? 20
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const closes = klineData.map(d => d.close)
    const volumes = klineData.map(d => d.volume ?? 0)
    const length = klineData.length

    const obv: (number | null)[] = new Array(length).fill(null)
    const obvMa: (number | null)[] = new Array(length).fill(null)

    if (closes.length < 2) {
      return { obv, obv_ma: obvMa }
    }

    // 计算 OBV
    obv[0] = volumes[0]
    for (let i = 1; i < length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv[i] = obv[i - 1]! + volumes[i]
      } else if (closes[i] < closes[i - 1]) {
        obv[i] = obv[i - 1]! - volumes[i]
      } else {
        obv[i] = obv[i - 1]
      }
    }

    // 计算 OBV MA (SMA)
    if (length >= this.maPeriod) {
      for (let i = this.maPeriod - 1; i < length; i++) {
        let sum = 0
        for (let j = i - this.maPeriod + 1; j <= i; j++) {
          sum += obv[j]!
        }
        obvMa[i] = sum / this.maPeriod
      }
    }

    return { obv, obv_ma: obvMa }
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.obv,
        type: 'scatter',
        mode: 'lines',
        name: 'OBV',
        line: { color: colors.obv_line, width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.obv_ma,
        type: 'scatter',
        mode: 'lines',
        name: `OBV MA(${this.maPeriod})`,
        line: { color: colors.obv_ma_line, width: 1 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
    ]
  }

  getYAxisConfig() {
    return { title: 'OBV' }
  }
}
