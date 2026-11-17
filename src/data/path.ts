/** 路径模板参数 */
export type PathParams = Record<string, string | number | undefined | null>

/**
 * 将模板中的 `{key}` 替换为参数值。
 *
 * 缺失或空参数直接抛错：拼错日期/策略名时宁可显式失败，也不要静默请求
 * 一个 `undefined/...` 的地址。
 */
export function buildPath(template: string, params: PathParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key]
    if (value === undefined || value === null || String(value) === '') {
      throw new Error(`Missing path parameter: ${key}`)
    }
    return encodeURIComponent(String(value))
  })
}

/**
 * 拼接 baseUrl 与相对路径。
 *
 * - path 是绝对 URL 时原样返回（允许单文件覆盖到别的域名）；
 * - base 为空时返回 path；
 * - 其余情况保证中间只有一个 `/`。
 */
export function joinUrl(base: string, path: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path
  if (!base) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}
