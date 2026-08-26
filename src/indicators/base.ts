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
   * 计算本指标所需的预热 K线根数（业务区间之前额外加载、只参与计算不参与显示）。
   *
   * 指标都是滚动窗口或递归平滑算法，前若干根必然为 null；若加载区间等于展示区间，
   * 图表开头就会出现空白，且各指标空白长度不同（窗口越长空白越长）。
   *
   * 取值分两类：
   * - **窗口类**（SMA/BOLL/Donchian/Envelope）：第 period 根起即为精确值，取 `period`
   * - **递归平滑类**（RSI/ATR/EMA/MACD/KD/ADX，Wilder 或 EMA 递推）：首值只是种子
   *   （简单均值），需若干倍 period 才收敛到真值，取约 `3 * period`。
   *   例：RSI(14) 第 15 根即有值，但与用长历史算出的收敛值可差 10+ 个点，
   *   直接展示会误导策略复盘。
   */
  abstract get warmupBars(): number

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