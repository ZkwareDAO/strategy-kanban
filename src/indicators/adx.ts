/**
 * ADX (Average Directional Index) 趋势强度指标
 * 独立子图，显示ADX/+DI/-DI三条线
 * 参考: indicators.py:compute_adx + new_dolphin_core.py:wilder_adx
 */

import { BaseIndicator } from './base'
import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors } from './types'

export interface ADXParams {
  period?: number
}

export class ADXIndicator extends BaseIndicator {
  name = 'ADX'
  subplot = true

  private period: number

  constructor(params: ADXParams = {}) {
    super()
    this.period = params.period ?? 14
  }

  compute(klineData: KlinePoint[]): IndicatorResult {
    const highs = klineData.map(d => d.high)
    const lows = klineData.map(d => d.low)
    const closes = klineData.map(d => d.close)
    const length = klineData.length

    const adx: (number | null)[] = new Array(length).fill(null)
    const plusDI: (number | null)[] = new Array(length).fill(null)
    const minusDI: (number | null)[] = new Array(length).fill(null)

    if (closes.length < this.period * 2) {
      return { adx, plus_di: plusDI, minus_di: minusDI }
    }

    // 计算 +DM, -DM, TR
    const plusDM: number[] = new Array(length).fill(0)
    const minusDM: number[] = new Array(length).fill(0)
    const tr: number[] = new Array(length).fill(0)

    for (let i = 1; i < length; i++) {
      const upMove = highs[i] - highs[i - 1]
      const downMove = lows[i - 1] - lows[i]

      plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0
      minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0

      tr[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    }

    // Wilder smoothing (初始用简单求和，后续用递推)
    let smoothPlusDM = 0
    let smoothMinusDM = 0
    let smoothTR = 0

    for (let i = 1; i <= this.period; i++) {
      smoothPlusDM += plusDM[i]
      smoothMinusDM += minusDM[i]
      smoothTR += tr[i]
    }

    // 计算 +DI/-DI
    const diPlusArr: number[] = new Array(length).fill(0)
    const diMinusArr: number[] = new Array(length).fill(0)
    const dxArr: number[] = new Array(length).fill(0)

    if (smoothTR > 0) {
      diPlusArr[this.period] = (smoothPlusDM / smoothTR) * 100
      diMinusArr[this.period] = (smoothMinusDM / smoothTR) * 100
    }

    const diSum = diPlusArr[this.period] + diMinusArr[this.period]
    dxArr[this.period] = diSum > 0
      ? Math.abs(diPlusArr[this.period] - diMinusArr[this.period]) / diSum * 100
      : 0

    // 递推 Wilder smoothing
    for (let i = this.period + 1; i < length; i++) {
      smoothPlusDM = smoothPlusDM - smoothPlusDM / this.period + plusDM[i]
      smoothMinusDM = smoothMinusDM - smoothMinusDM / this.period + minusDM[i]
      smoothTR = smoothTR - smoothTR / this.period + tr[i]

      if (smoothTR > 0) {
        diPlusArr[i] = (smoothPlusDM / smoothTR) * 100
        diMinusArr[i] = (smoothMinusDM / smoothTR) * 100
      }

      const sum = diPlusArr[i] + diMinusArr[i]
      dxArr[i] = sum > 0
        ? Math.abs(diPlusArr[i] - diMinusArr[i]) / sum * 100
        : 0
    }

    // ADX = Wilder smoothed DX
    let adxVal = 0
    for (let i = this.period; i < this.period * 2; i++) {
      adxVal += dxArr[i]
    }
    adxVal /= this.period

    adx[this.period * 2 - 1] = adxVal
    plusDI[this.period] = diPlusArr[this.period]
    minusDI[this.period] = diMinusArr[this.period]

    // 填充 DI
    for (let i = this.period + 1; i < length; i++) {
      plusDI[i] = diPlusArr[i]
      minusDI[i] = diMinusArr[i]
    }

    // 递推 ADX
    for (let i = this.period * 2; i < length; i++) {
      adxVal = (adxVal * (this.period - 1) + dxArr[i]) / this.period
      adx[i] = adxVal
    }

    return { adx, plus_di: plusDI, minus_di: minusDI }
  }

  getTraces(data: IndicatorResult, timestamps: string[], colors: IndicatorColors): PlotlyTrace[] {
    return [
      {
        x: timestamps,
        y: data.adx,
        type: 'scatter',
        mode: 'lines',
        name: `ADX(${this.period})`,
        line: { color: colors.adx_line, width: 2 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.plus_di,
        type: 'scatter',
        mode: 'lines',
        name: '+DI',
        line: { color: '#26a69a', width: 1 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
      {
        x: timestamps,
        y: data.minus_di,
        type: 'scatter',
        mode: 'lines',
        name: '-DI',
        line: { color: '#ef5350', width: 1 },
        xaxis: 'x',
        yaxis: 'y2',
        showlegend: true,
      },
    ]
  }

  getYAxisConfig() {
    return { title: 'ADX', range: [0, 100] as [number, number] }
  }
}
