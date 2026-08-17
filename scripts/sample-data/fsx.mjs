/**
 * 文件与符号链接辅助
 *
 * 符号链接部分格外保守：开发机上 `public/frontend-data` 等往往是指向真实
 * 生产数据目录的软链。脚本绝不能把它们删掉换成示例数据，否则用户的真实
 * 数据入口就断了。因此除非目标已指向 sample-data，一律拒绝覆盖。
 */
import {
  mkdirSync,
  writeFileSync,
  lstatSync,
  readlinkSync,
  unlinkSync,
  symlinkSync,
  rmSync,
} from 'node:fs'
import { dirname, resolve, relative } from 'node:path'

/** 递归建目录（已存在则忽略） */
export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

/** 写文本文件，自动补齐父目录 */
export function writeText(filePath, text) {
  ensureDir(dirname(filePath))
  writeFileSync(filePath, text)
}

/** 写 JSON 文件（缩进 2 空格，便于用户直接阅读对照 DATA-SPEC） */
export function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

/** 路径是否存在（含断开的符号链接） */
function exists(path) {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

/** 删除目录（不存在则忽略） */
export function removeDir(dir) {
  rmSync(dir, { recursive: true, force: true })
}

/** linkDir 的结果取值 */
export const LinkResult = {
  CREATED: 'created',
  REPLACED: 'replaced',
  SKIPPED_EXISTING: 'skipped-existing',
}

/**
 * 把 `linkPath` 指向 `targetPath`。
 *
 * 安全规则：
 *   - 路径不存在 → 直接创建
 *   - 已是指向本次 target 的软链 → 视为已就绪（幂等）
 *   - 已是指向 sample-data 内部的软链 → 可安全替换（是脚本上次建的）
 *   - 其他情况（真实目录、指向别处的软链）→ **不动**，返回 skipped
 *     这类路径可能是用户的生产数据，宁可让用户自己决定怎么处理
 *
 * @param {string} linkPath 链接位置，如 public/frontend-data
 * @param {string} targetPath 链接目标，如 sample-data/frontend-data
 * @param {string} safeRoot 可安全替换的目标根目录（sample-data 绝对路径）
 * @returns {{result: string, current?: string}}
 */
export function linkDir(linkPath, targetPath, safeRoot) {
  const absTarget = resolve(targetPath)
  // 用相对路径建链，便于整个仓库目录被移动或挂载到别处
  const relTarget = relative(dirname(resolve(linkPath)), absTarget)

  if (!exists(linkPath)) {
    ensureDir(dirname(resolve(linkPath)))
    symlinkSync(relTarget, linkPath)
    return { result: LinkResult.CREATED }
  }

  const stat = lstatSync(linkPath)
  if (!stat.isSymbolicLink()) {
    return { result: LinkResult.SKIPPED_EXISTING, current: '真实目录' }
  }

  const currentTarget = resolve(dirname(resolve(linkPath)), readlinkSync(linkPath))
  if (currentTarget === absTarget) {
    return { result: LinkResult.CREATED } // 已就绪，幂等
  }

  // 仅当现有链接指向 sample-data 内部时才替换——那是脚本自己的产物
  if (currentTarget === safeRoot || currentTarget.startsWith(`${safeRoot}/`)) {
    unlinkSync(linkPath)
    symlinkSync(relTarget, linkPath)
    return { result: LinkResult.REPLACED }
  }

  return { result: LinkResult.SKIPPED_EXISTING, current: currentTarget }
}
