#!/usr/bin/env node
/**
 * 开发用只读静态数据服务。
 *
 * Vite dev server 对 public/ 下大文件的 Range 支持不完整（会返回整文件），
 * 而 K 线读取依赖 206 分片。本脚本提供标准 Range + CORS 的静态服务，
 * 由 vite.config.ts 的 `/kline-data-v2` 代理转发，保持前后端数据分离。
 *
 * 用法：
 *   npm run dev:data
 *   DATA_ROOT=/path/to/data npm run dev:data
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

/** 与 Vite 共用本机配置：.env.local 优先，其次 .env；不覆盖已有环境变量 */
function loadEnvFile(file) {
  const full = resolve(process.cwd(), file)
  if (!existsSync(full)) return
  for (const line of readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const dataRoot = process.env.DATA_ROOT
if (!dataRoot) {
  console.error(
    '[data-server] 缺少 DATA_ROOT。请在 .env.local 中配置，或以环境变量传入：\n' +
      '  DATA_ROOT=/path/to/data npm run dev:data',
  )
  process.exit(1)
}
const ROOT = resolve(dataRoot)
const PORT = Number(process.env.DATA_PORT || 3001)
const HOST = process.env.DATA_HOST || '127.0.0.1'

const CONTENT_TYPES = {
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!match) return null
  let start = match[1] === '' ? null : Number(match[1])
  let end = match[2] === '' ? null : Number(match[2])
  if (start === null && end === null) return null
  if (start === null) {
    const length = Math.min(end ?? 0, size)
    start = Math.max(0, size - length)
    end = size - 1
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return 'invalid'
  }
  return { start, end }
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length')

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method Not Allowed')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', `http://${HOST}`).pathname)
  } catch {
    res.writeHead(400).end('Bad Request')
    return
  }

  const filePath = resolve(ROOT, `.${pathname}`)
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  let stat
  try {
    stat = statSync(filePath)
    if (!stat.isFile()) throw new Error('not a file')
  } catch {
    res.writeHead(404).end('Not Found')
    return
  }

  const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(req.headers.range, stat.size)

  if (range === 'invalid') {
    res.writeHead(416, {
      'Content-Range': `bytes */${stat.size}`,
      'Accept-Ranges': 'bytes',
    }).end()
    return
  }

  if (range) {
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': range.end - range.start + 1,
      'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath, { start: range.start, end: range.end }).pipe(res)
    return
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
})

server.listen(PORT, HOST, () => {
  console.log(`[data-server] ${HOST}:${PORT} -> ${ROOT}`)
})
