/**
 * 数值列排序比较器：按原始数值升序比较，缺失值（null/undefined）排在前。
 *
 * el-table 的列 `sort-method` 需要一个 `(a, b) => number` 的比较器；
 * el-table 会把返回值取反来实现降序，因此缺失值在降序时自然落到末尾。
 *
 * 之所以按「原始数值」而非渲染后的字符串比较，是因为字符串排序会让
 * `"11.49%" < "5.00%"`（按字符比较），导致数值列排序错误。
 */
export function numSorter<T>(
  get: (row: T) => number | undefined | null,
): (a: T, b: T) => number {
  return (a, b) => {
    const va = get(a)
    const vb = get(b)
    if (va == null) return vb == null ? 0 : -1
    if (vb == null) return 1
    return va - vb
  }
}
