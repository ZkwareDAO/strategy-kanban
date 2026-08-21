import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
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
const REPLAY_LINK = resolve('public/data')
const REPLAY_INDEX = resolve('public/replay-index.json')
/** 每日回放数据源里每天一个的回测目录名 */
const REPLAY_SUBDIR = 'backtest_results'
/** 紧凑日期目录名 YYYYMMDD--数据源里混有 `20260727bak` 之类的备份目录，需排除 */
const DATE_DIR_RE = /^\d{8}$/
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
 * 扫描 `{strategy}/{YYYYMMDD}/{HHMMSS}/{SYMBOL}/` 四层目录树，
 * 收集存在 backtest_result.json 的 run。
 *
 * 策略发现（backtest_output）与每日回放（signal_comparison_output/{日期}/backtest_results）
 * 的叶子结构完全相同，故共用本函数。
 *
 * 保留全部历史 run（同一策略/代币的多次回测都收），并顺带读出摘要指标。
 */
function scanRunTree(root: string): RawRun[] {
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
    runs = scanRunTree(realRoot)
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
 * 生成每日回放索引：按日期分桶，每桶复用 buildIndex 的 sweep 分配与排序。
 *
 * 逐日 buildIndex 而非全量一次，是因为 sweep（同日轮次）按 (策略, 运行日期) 分组
 * 计算：跨日期目录混算会把不同天的 run 归进同一轮次。
 *
 * 保留 signals_processed === 0 的条目--前端「显示无信号策略」开关需要它们，
 * 过滤由 groupRuns 的 includeEmpty 在展示层决定。
 */
function generateReplayIndex(): void {
  let realRoot: string
  try {
    realRoot = realpathSync(REPLAY_LINK)
  } catch {
    writeFileSync(
      REPLAY_INDEX,
      JSON.stringify({ generated_at: new Date().toISOString(), days: {} }, null, 2),
    )
    console.warn('[replay-index] public/data 不存在，已写空索引')
    return
  }

  const days: Record<string, ReturnType<typeof buildIndex>> = {}
  let total = 0
  try {
    for (const day of readdirSync(realRoot)) {
      if (!DATE_DIR_RE.test(day)) continue
      const resultsDir = join(realRoot, day, REPLAY_SUBDIR)
      if (!isDir(resultsDir)) continue
      // path 相对 public/data，供前端拼成 /data/{path}/backtest_result.json
      const entries = buildIndex(scanRunTree(resultsDir)).map(entry => ({
        ...entry,
        path: `${day}/${REPLAY_SUBDIR}/${entry.path}`,
      }))
      if (entries.length === 0) continue
      days[day] = entries
      total += entries.length
    }
  } catch (err) {
    console.warn('[replay-index] 扫描失败:', err)
  }

  // 不缩进：条目数是策略发现索引的 20 倍以上，缩进会让前端多下载约 3 倍字节。
  // 本文件只由程序读取，可读性由 replay-index 的日志与前端类型保证。
  writeFileSync(REPLAY_INDEX, JSON.stringify({ generated_at: new Date().toISOString(), days }))
  console.log(`[replay-index] 生成 ${Object.keys(days).length} 天 / ${total} 条索引`)
}

/**
 * 目录指纹：只对给定的两层目录做 mtime 检查（不递归全量扫描）。
 *
 * 作为 fs.watch 的兜底--recursive 模式在 Linux 深层目录/软链接下不可靠。
 * 数据源有数千个子目录，递归取指纹会把轮询变成全量扫描，故只看两层。
 *
 * @param root 监听根
 * @param secondLevel 第二层要检查的目录名（固定名，如 backtest_results）；
 *   省略时遍历第二层的全部子目录（策略发现的 strategy/date 结构）
 */
function dirFingerprint(root: string, secondLevel?: string): string {
  const parts: string[] = []
  try {
    for (const first of readdirSync(root)) {
      const firstDir = join(root, first)
      if (!isDir(firstDir)) continue
      parts.push(`${first}:${statSync(firstDir).mtimeMs}`)
      if (secondLevel) {
        const fixed = join(firstDir, secondLevel)
        if (isDir(fixed)) parts.push(`${first}/${secondLevel}:${statSync(fixed).mtimeMs}`)
        continue
      }
      for (const second of readdirSync(firstDir)) {
        const secondDir = join(firstDir, second)
        if (!isDir(secondDir)) continue
        parts.push(`${second}:${statSync(secondDir).mtimeMs}`)
      }
    }
  } catch {
    return ''
  }
  return parts.join('|')
}

/**
 * 为一个索引根挂上「watch + 兜底轮询 → 重新生成 → 推送 HMR 事件」。
 *
 * @returns 清理函数（关闭 watcher 与轮询）；软链不存在时返回 noop
 */
function watchIndexRoot(options: {
  server: ViteDevServer
  link: string
  label: string
  event: string
  generate: () => void
  fingerprint: (root: string) => string
}): () => void {
  const { server, link, label, event, generate, fingerprint } = options

  let realRoot: string
  try {
    realRoot = realpathSync(link)
  } catch {
    return () => {} // symlink 不存在，跳过 watch（buildStart 已写空索引）
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
      generate()
      // 通过 HMR 通道通知前端索引已更新，前端收到后自行重新拉取
      server.ws.send({ type: 'custom', event })
    }, wait)
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(realRoot, { recursive: true }, (_event, filename) => {
      if (filename && filename.endsWith('backtest_result.json')) {
        schedule()
      }
    })
  } catch (err) {
    console.warn(`[${label}] watch 失败:`, err)
  }

  let lastFingerprint = fingerprint(realRoot)
  const poller = setInterval(() => {
    const fp = fingerprint(realRoot)
    if (fp && fp !== lastFingerprint) {
      lastFingerprint = fp
      schedule()
    }
  }, POLL_MS)

  return () => {
    if (timer) clearTimeout(timer)
    watcher?.close()
    clearInterval(poller)
  }
}

/**
 * Vite 插件：dev/build 启动时生成回测索引（策略发现 + 每日回放两份）；
 * dev 期间监听 backtest_result.json 落盘（完成信号）自动刷新（debounce + throttle）。
 */
function backtestIndexPlugin(): Plugin {
  return {
    name: 'backtest-index',
    buildStart() {
      generateBacktestIndex()
      generateReplayIndex()
    },
    configureServer(server) {
      const stopBacktest = watchIndexRoot({
        server,
        link: BACKTEST_LINK,
        label: 'backtest-index',
        event: 'backtest-index-updated',
        generate: generateBacktestIndex,
        fingerprint: root => dirFingerprint(root),
      })
      const stopReplay = watchIndexRoot({
        server,
        link: REPLAY_LINK,
        label: 'replay-index',
        event: 'replay-index-updated',
        generate: generateReplayIndex,
        fingerprint: root => dirFingerprint(root, REPLAY_SUBDIR),
      })

      server.httpServer?.on('close', () => {
        stopBacktest()
        stopReplay()
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
