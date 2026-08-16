/**
 * 策略元数据（展示用）
 *
 * 策略的中文名、简介、逻辑说明与默认指标由**数据源提供**，前端不内置：
 * 这些内容属于使用方的策略资产，不应写死在开源代码里。
 *
 * 数据位置：`public/frontend-data/strategies.json`（全局一份，非每日）。
 * 键为策略目录名，与 manifest.json 中的 `source_strategy` 对应。
 * 格式规范见 docs/DATA-SPEC.md。
 *
 * 文件缺失或字段不全均不影响功能——调用方会退回默认展示。
 */
import { ref } from 'vue'
import { FRONTEND_DATA_BASE_URL } from '@/config/frontendData'

/** 单个策略的展示元数据（全部字段可选，数据源可只提供其中一部分） */
export interface StrategyMeta {
  /** 中文显示名，缺省时调用方回退为原始标识 */
  display_name?: string
  /** 策略简介 */
  description?: string
  /** 该策略关注的技术指标名列表，用于设置默认勾选项 */
  indicators?: string[]
  /**
   * 指标参数覆盖（如 `{ EMA: { fast_period: 100 } }`）。
   * 缺省时各指标使用自身默认参数。
   */
  indicator_params?: Record<string, Record<string, unknown>>
  /** 策略逻辑说明（中文，逐条） */
  logic?: {
    entry?: string[]
    exit?: string[]
    risk?: string[]
  }
}

/** 策略目录名 → 元数据 */
export type StrategyMetaMap = Record<string, StrategyMeta>

/**
 * 已加载的策略元数据。
 * 初始为空对象，`loadStrategyMeta()` 完成后填充；加载失败时保持为空。
 * 组件用 computed 读取即可获得响应式更新。
 */
export const strategyMeta = ref<StrategyMetaMap>({})

/** 进行中的加载，确保并发调用只发一次请求 */
let inflight: Promise<void> | null = null
let loaded = false

/**
 * 加载策略元数据（幂等，重复调用不会重复请求）。
 *
 * 文件不存在时静默视为"无配置"——这是受支持的状态，
 * 不是错误：前端在无策略元数据时仍可完整工作。
 */
export function loadStrategyMeta(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const response = await fetch(`${FRONTEND_DATA_BASE_URL}/strategies.json`)
      if (!response.ok) return
      const data: unknown = await response.json()
      // 只接受对象；数组或其他类型说明格式不符，按无配置处理
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        strategyMeta.value = data as StrategyMetaMap
      }
    } catch {
      // 网络失败或 JSON 解析失败：保持空配置，不阻断页面
    } finally {
      loaded = true
      inflight = null
    }
  })()

  return inflight
}

/**
 * 按策略目录名查找元数据。
 *
 * 除精确匹配外，还尝试「去下划线转大写」的归一化形式
 * （如 `obv_atr_v2` → `OBVATRV2`），兼容以缩写为键的配置。
 */
export function getStrategyMeta(strategyDir: string): StrategyMeta | null {
  if (!strategyDir) return null
  const map = strategyMeta.value
  const exact = map[strategyDir]
  if (exact) return exact
  const normalized = strategyDir.replace(/_/g, '').toUpperCase()
  return map[normalized] ?? null
}
