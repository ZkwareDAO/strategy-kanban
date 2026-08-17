/**
 * 确定性伪随机数
 *
 * 示例数据需要可复现：同一天多次运行 `npm run sample-data` 应产出完全相同的
 * 文件，否则用户每次刷新看到的图形都在变，也无法据此对照 DATA-SPEC 排查问题。
 * 因此不用 Math.random，改用固定种子的 mulberry32。
 */

/** 32 位整数种子的 mulberry32 生成器，返回 [0, 1) 均匀分布 */
export function createRng(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 把任意字符串散列为 32 位种子（FNV-1a）。
 *
 * 让每个交易对/策略拥有各自稳定的种子，互不干扰：BTCUSDT 的行情不会因为
 * 新增一个标的而改变。
 */
export function hashSeed(text) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 标准正态分布采样（Box-Muller），用于生成价格收益率 */
export function gaussian(rng) {
  // u 取 (0,1] 避免 log(0)
  const u = 1 - rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** 返回 [min, max] 内的整数 */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

/** 从数组中等概率取一个元素 */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)]
}
