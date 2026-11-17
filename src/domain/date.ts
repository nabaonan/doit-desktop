/** 日期工具：全部按本地时区，与 Android 端「完成日」口径一致。 */

export function dayKey(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfDay(d: Date | number): number {
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function startOfToday(now = Date.now()): number {
  return startOfDay(now)
}

export function isSameDay(a: number | null, b: number): boolean {
  return a !== null && Number.isFinite(a) && dayKey(a) === dayKey(b)
}

export function addDays(d: Date | number, n: number): Date {
  const date = typeof d === 'number' ? new Date(d) : new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function fmtMD(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** 统计区间起点：近一周 7 天、近一月 30 天、近一年 365 天（含今天）。 */
export function rangeStart(range: 'week' | 'month' | 'year', today: number): number {
  const days = range === 'week' ? 7 : range === 'month' ? 30 : 365
  return startOfDay(addDays(today, -(days - 1)))
}

/** 月网格：固定 42 格（6 周），尾部 / 头部补位格带 inMonth=false。 */
export function monthGrid(year: number, month: number): Array<{ dayKey: string; day: number; inMonth: boolean }> {
  const first = new Date(year, month, 1)
  const offset = first.getDay()
  const gridStart = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, i) => {
    const d = addDays(gridStart, i)
    return { dayKey: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month }
  })
}
