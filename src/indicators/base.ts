/**
 * 技术指标基类
 */

import type { KlinePoint, IndicatorResult, PlotlyTrace, IndicatorColors, YAxisConfig } from './types'

/**
 * 指标基类
 */
export abstract class BaseIndicator {
  abstract name: string
  abstract subplot: boolean // 是否需要独立子图

  /**
   * 计算指标
   * @param klineData K线数据
   * @returns 指标计算结果
   */
  abstract compute(klineData: KlinePoint[]): IndicatorResult

  /**
   * 生成 Plotly traces
   * @param data 指标数据
   * @param timestamps 时间戳数组
   * @param colors 颜色配置
   * @returns Plotly trace 配置数组
   */
  abstract getTraces(
    data: IndicatorResult,
    timestamps: string[],
    colors: IndicatorColors
  ): PlotlyTrace[]

  /**
   * 获取 Y 轴配置 (子图指标需要)
   */
  getYAxisConfig?(): YAxisConfig
}