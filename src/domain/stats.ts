import { addDays, dayKey, monthGrid, rangeStart, startOfDay } from './date'
import type { StatsRange, TaskNode } from './types'

export { monthGrid }

export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 4) return 2
  if (count <= 7) return 3
  return 4
}

/** 统计只数区间内「已完成的顶级任务」，与 Android StatsPage 口径一致。 */
function completedTop(root: TaskNode[], range: StatsRange, today: number): TaskNode[] {
  const from = rangeStart(range, today)
  const to = startOfDay(addDays(today, 1))
  return root.filter(
    (n) => n.parentUid === null && n.deletedAt === null && n.done && n.completedAt !== null &&
      n.completedAt >= from && n.completedAt < to,
  )
}

export function dailyCounts(root: TaskNode[], range: StatsRange, today: number): Map<string, number> {
  const result = new Map<string, number>()
  for (const n of completedTop(root, range, today)) {
    const key = dayKey(n.completedAt!)
    result.set(key, (result.get(key) ?? 0) + 1)
  }
  return result
}

/**
 * 分类占比：以已添加分类为基底，区间内无完成数据的分类补 0，
 * 这样图例会列出全部分类（用户要求「没有就是 0」），而不是只显示有数据的分类。
 * 第 4 个参数可选，保持旧调用方兼容；统计页会传入 tasks.categories。
 */
export function categoryShare(
  root: TaskNode[],
  range: StatsRange,
  today: number,
  categories: Array<{ name: string }> = [],
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const n of completedTop(root, range, today)) {
    counts.set(n.category, (counts.get(n.category) ?? 0) + 1)
  }
  // 已删除分类但区间内仍有完成记录时仍保留该项，避免数据凭空消失
  for (const c of categories) {
    if (!counts.has(c.name)) counts.set(c.name, 0)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function trendBuckets(
  root: TaskNode[],
  range: StatsRange,
  today: number,
): Array<{ label: string; count: number }> {
  const counts = dailyCounts(root, range, today)
  if (range === 'year') {
    const buckets = new Map<string, number>()
    for (const [key, count] of counts) {
      const monthKey = key.slice(0, 7)
      buckets.set(monthKey, (buckets.get(monthKey) ?? 0) + count)
    }
    const start = new Date(today)
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() - 11 + i, 1)
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return { label, count: buckets.get(label) ?? 0 }
    })
  }
  const days = range === 'week' ? 7 : 30
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, -(days - 1 - i))
    return { label: dayKey(d), count: counts.get(dayKey(d)) ?? 0 }
  })
}
