#!/usr/bin/env node
/**
 * 示例数据生成器（开源演示用）
 *
 * 生成一套符合 frontend-data v2 契约的**虚拟**数据，让新克隆的用户无需接入
 * 任何真实数据源即可 `npm run dev` 看到完整页面效果。
 *
 * ## 为什么是脚本而非提交静态文件
 *
 * 前端所有默认日期都相对「当天」计算：
 *   - 策略概览默认查昨天（src/views/StrategyOverview.vue）
 *   - 区间统计默认上周一至今天（src/components/PerformanceOverview.vue）
 *   - 详情页默认今天（src/views/TokenDetailV2.vue）
 * 固定日期的静态数据过几周就会全部落在窗口之外，用户打开仍是空页面。
 *
 * ## 数据全部为程序合成
 *
 * 价格是随机游走，策略是虚构的 DEMO*，不含任何真实行情、策略或账户信息。
 *
 * 用法：
 *   node scripts/sample-data/index.mjs            # 生成并链接到 public/
 *   node scripts/sample-data/index.mjs --days 30  # 自定义天数
 *   node scripts/sample-data/index.mjs --no-link  # 只生成，不碰 public/
 */
import { resolve, join } from 'node:path'
import { SYMBOLS, generateSymbolMarket, startOfUtcDay } from './market.mjs'
import { STRATEGIES } from './strategies.mjs'
import { writeText, ensureDir, removeDir, linkDir, LinkResult } from './fsx.mjs'
import { writeFrontendDataV2 } from './frontendV2.mjs'

const MS_PER_DAY = 86400000
/** 默认 21 天：覆盖区间统计「上周一 ~ 今天」的最坏情况 */
const DEFAULT_DAYS = 21

/** 解析命令行参数 */
function parseArgs(argv) {
  const opts = { days: DEFAULT_DAYS, link: true, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--days') {
      const value = Number(argv[i + 1])
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`--days 需为正整数，收到: ${argv[i + 1]}`)
      }
      opts.days = Math.floor(value)
      i += 1
    } else if (arg === '--no-link') {
      opts.link = false
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true
    } else {
      throw new Error(`未知参数: ${arg}`)
    }
  }
  return opts
}

const HELP = `示例数据生成器

用法: node scripts/sample-data/index.mjs [选项]

选项:
  --days <n>   生成天数（默认 ${DEFAULT_DAYS}，需覆盖区间统计的默认区间）
  --no-link    只写入 sample-data/，不建立 public/ 符号链接
  -h, --help   显示本帮助

产物写入 sample-data/frontend-data（v2 布局）与 sample-data/kline-data，
并链接到 public/frontend-data、public/kline-data。
已存在的真实目录或指向别处的软链不会被覆盖。
`

/** 建立 public/ 下的符号链接，返回被跳过路径的提示信息 */
function linkPublicDirs(repoRoot, sampleRoot) {
  const notes = []
  for (const name of ['frontend-data', 'kline-data']) {
    const linkPath = join(repoRoot, 'public', name)
    const targetPath = join(sampleRoot, name)
    const { result, current } = linkDir(linkPath, targetPath, sampleRoot)
    if (result === LinkResult.SKIPPED_EXISTING) {
      notes.push(`  public/${name} 已存在（${current}），未改动`)
    }
  }
  return notes
}

function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`参数错误: ${err.message}\n`)
    process.stderr.write(HELP)
    process.exit(1)
  }

  if (opts.help) {
    process.stdout.write(HELP)
    return
  }

  const repoRoot = resolve(import.meta.dirname, '..', '..')
  const sampleRoot = join(repoRoot, 'sample-data')

  // 今天（UTC）往前推 days-1 天，含今天。前端默认查昨天，窗口必须同时包含
  // 今天与昨天，并向前覆盖区间统计的默认起点。
  const todayMs = startOfUtcDay(Date.now())
  const startMs = todayMs - (opts.days - 1) * MS_PER_DAY
  const dates = []
  for (let i = 0; i < opts.days; i += 1) dates.push(startMs + i * MS_PER_DAY)

  console.log(`[sample-data] 生成 ${opts.days} 天示例数据（全部为程序合成的虚拟数据）`)
  console.log(
    `[sample-data] 日期窗口 ${new Date(startMs).toISOString().slice(0, 10)}` +
      ` ~ ${new Date(todayMs).toISOString().slice(0, 10)}`,
  )

  removeDir(sampleRoot)
  ensureDir(sampleRoot)

  console.log('[sample-data] 合成行情...')
  const marketBySymbol = new Map()
  for (const cfg of SYMBOLS) {
    const market = generateSymbolMarket(cfg, startMs, opts.days)
    marketBySymbol.set(cfg.symbol, market)
    writeText(join(sampleRoot, 'kline-data', '1m', `${cfg.symbol}_1m.csv`), market.minuteCsv)
    writeText(join(sampleRoot, 'kline-data', '1d', `${cfg.symbol}_1d.csv`), market.dailyCsv)
  }

  console.log('[sample-data] 生成 frontend-data v2（仓位/信号/对比/回测索引）...')
  const { positionCount, runCount } = writeFrontendDataV2({
    sampleRoot,
    dates,
    marketBySymbol,
    todayMs,
  })

  const runtimeCount = STRATEGIES.reduce((sum, strategy) => sum + strategy.symbols.length, 0)
  console.log(
    `[sample-data] 完成：${STRATEGIES.length} 个策略 / ${runtimeCount} 个运行实例 / ` +
      `${positionCount} 条仓位 / ${runCount} 次回测`,
  )

  if (!opts.link) {
    console.log(`[sample-data] 产物位于 ${sampleRoot}（--no-link，未修改 public/）`)
    return
  }

  const notes = linkPublicDirs(repoRoot, sampleRoot)
  if (notes.length === 0) {
    console.log('[sample-data] public/ 符号链接已就绪，运行 npm run dev 即可查看')
    return
  }

  console.log('[sample-data] 以下路径已存在，为避免覆盖你的真实数据未做改动：')
  for (const note of notes) console.log(note)
  console.log('[sample-data] 如需改用示例数据，请手动移除上述路径后重新运行本脚本')
}

main()
