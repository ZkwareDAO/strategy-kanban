import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { resolve, join } from 'node:path'
import {
  readdirSync,
  statSync,
  existsSync,
  realpathSync,
  readFileSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from 'node:fs'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { buildIndex, type RawRun } from './src/utils/backtestIndex.ts'

const BACKTEST_LINK = resolve('public/backtest-output')
const BACKTEST_INDEX = resolve('public/backtest-output-index.json')
const DEBOUNCE_MS = 2500
const THROTTLE_MS = 10000
const POLL_MS = 5000

/** 判断路径是否为目录（不存在返回 false，不抛错） */
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 列表页展示所需的指标字段（其余字段详情页自行读原始 result.json） */
const SUMMARY_METRIC_KEYS = [
  'annualized_return',
  'roe',
  'total_return',
  'max_drawdown',
  'win_rate',
  'total_trades',
  'sharpe_ratio',
] as const

/**
 * 从 backtest_result.json 摘取列表页展示所需字段。
 *
 * 列表页原本要为每个代币单独拉取完整 result.json（约 36KB），保留全部历史后
 * 请求数会随回测积累无上限增长；改为在索引里内嵌摘要，列表页只读一个索引文件。
 *
 * 解析失败返回空对象--该 run 仍进索引（目录结构完整即视为完成），
 * 只是列表页对应单元格显示 "-"，不中断整个索引生成。
 */
function readSummary(resultPath: string): Partial<RawRun> {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(resultPath, 'utf-8'))
  } catch {
    return {}
  }
  if (typeof raw !== 'object' || raw === null) return {}

  const result = raw as Record<string, unknown>
  const config = (result.config ?? {}) as Record<string, unknown>
  const rawMetrics = (result.metrics ?? {}) as Record<string, unknown>

  const metrics: Record<string, number> = {}
  for (const key of SUMMARY_METRIC_KEYS) {
    const value = rawMetrics[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      metrics[key] = value
    }
  }

  const pickString = (value: unknown): string | undefined =>
    typeof value === 'string' && value ? value : undefined

  return {
    start_date: pickString(config.start_date),
    end_date: pickString(config.end_date),
    completed_at: pickString(result.end_time),
    signals_processed:
      typeof result.signals_processed === 'number' ? result.signals_processed : undefined,
    metrics,
  }
}

/**
 * 扫描 backtest_output 目录树，收集存在 backtest_result.json 的 run。
 *
 * 保留全部历史 run（同一策略/代币的多次回测都收），并顺带读出摘要指标。
 */
function scanBacktestOutput(root: string): RawRun[] {
  const runs: RawRun[] = []
  for (const strategy of readdirSync(root)) {
    const stratDir = join(root, strategy)
    if (!isDir(stratDir)) continue
    for (const date of readdirSync(stratDir)) {
      const dateDir = join(stratDir, date)
      if (!isDir(dateDir)) continue
      for (const time of readdirSync(dateDir)) {
        const timeDir = join(dateDir, time)
        if (!isDir(timeDir)) continue
        for (const symbol of readdirSync(timeDir)) {
          const symDir = join(timeDir, symbol)
          if (!isDir(symDir)) continue
          const resultPath = join(symDir, 'backtest_result.json')
          if (existsSync(resultPath)) {
            runs.push({
              strategy,
              symbol,
              date,
              time,
              hasResult: true,
              ...readSummary(resultPath),
            })
          }
        }
      }
    }
  }
  return runs
}

/** 生成索引文件（目录缺失只 warn 并写空索引，不中断构建） */
function generateBacktestIndex(): void {
  let realRoot: string
  try {
    realRoot = realpathSync(BACKTEST_LINK)
  } catch {
    writeFileSync(
      BACKTEST_INDEX,
      JSON.stringify({ generated_at: new Date().toISOString(), entries: [] }, null, 2),
    )
    console.warn('[backtest-index] public/backtest-output 不存在，已写空索引')
    return
  }
  let runs: RawRun[] = []
  try {
    runs = scanBacktestOutput(realRoot)
  } catch (err) {
    console.warn('[backtest-index] 扫描失败:', err)
  }
  const entries = buildIndex(runs)
  writeFileSync(
    BACKTEST_INDEX,
    JSON.stringify({ generated_at: new Date().toISOString(), entries }, null, 2),
  )
  console.log(`[backtest-index] 生成 ${entries.length} 条索引`)
}

/**
 * Vite 插件：dev/build 启动时生成回测索引；
 * dev 期间监听 backtest_result.json 落盘（完成信号）自动刷新（debounce + throttle）。
 */
function backtestIndexPlugin(): Plugin {
  return {
    name: 'backtest-index',
    buildStart() {
      generateBacktestIndex()
    },
    configureServer(server) {
      let realRoot: string
      try {
        realRoot = realpathSync(BACKTEST_LINK)
      } catch {
        return // symlink 不存在，跳过 watch（buildStart 已写空索引）
      }

      let timer: ReturnType<typeof setTimeout> | null = null
      let lastRun = 0

      const schedule = () => {
        if (timer) clearTimeout(timer)
        const elapsed = Date.now() - lastRun
        const wait = Math.max(DEBOUNCE_MS, THROTTLE_MS - elapsed)
        timer = setTimeout(() => {
          timer = null
          lastRun = Date.now()
          generateBacktestIndex()
          // 通过 HMR 通道通知前端索引已更新，前端收到后自行重新拉取
          server.ws.send({ type: 'custom', event: 'backtest-index-updated' })
        }, wait)
      }

      let watcher: FSWatcher | null = null
      try {
        watcher = watch(
          realRoot,
          { recursive: true },
          (_event, filename) => {
            if (filename && filename.endsWith('backtest_result.json')) {
              schedule()
            }
          },
        )
      } catch (err) {
        console.warn('[backtest-index] watch 失败:', err)
      }

      // 兜底轮询：fs.watch 的 recursive 模式在 Linux 深层目录/软链接下不可靠，
      // 每 POLL_MS 只对 strategy/date 两层做 mtime 检查（不递归全量扫描），
      // 指纹变化才触发重新生成。
      const fingerprint = (): string => {
        const parts: string[] = []
        try {
          for (const strategy of readdirSync(realRoot)) {
            const stratDir = join(realRoot, strategy)
            if (!isDir(stratDir)) continue
            parts.push(`${strategy}:${statSync(stratDir).mtimeMs}`)
            for (const date of readdirSync(stratDir)) {
              const dateDir = join(stratDir, date)
              if (!isDir(dateDir)) continue
              parts.push(`${date}:${statSync(dateDir).mtimeMs}`)
            }
          }
        } catch {
          return ''
        }
        return parts.join('|')
      }

      let lastFingerprint = fingerprint()
      const poller = setInterval(() => {
        const fp = fingerprint()
        if (fp && fp !== lastFingerprint) {
          lastFingerprint = fp
          schedule()
        }
      }, POLL_MS)

      server.httpServer?.on('close', () => {
        watcher?.close()
        clearInterval(poller)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
      }),
      Components({
        resolvers: [ElementPlusResolver()],
      }),
      backtestIndexPlugin(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host: true,
      port: 3000,
      proxy: {
        [env.VITE_API_POSITION_PREFIX || '/api/position']: {
          target: env.VITE_API_POSITION_TARGET || 'https://api.example.com',
          changeOrigin: true,
        },
      },
      watch: {
        // public/ 下的 data / kline-data / backtest-output 是指向外部数据目录的符号链接，
        // 体量巨大且为静态数据（无需 HMR）。关闭符号链接跟随以免耗尽 inotify (ENOSPC)。
        followSymlinks: false,
        ignored: [
          '**/public/data/**',
          '**/public/kline-data/**',
          '**/public/backtest-output/**',
          '**/public/frontend-data/**',
        ],
      },
    }
  }
})
