import { isSameDay, startOfToday } from './date'
import type { Priority, TaskNode } from './types'

export function newUid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 建立 uid → 节点索引，供 recalcUp / markDeleted / 各类 store action 使用。 */
export function buildIndex(root: TaskNode[]): Map<string, TaskNode> {
  const index = new Map<string, TaskNode>()
  const walk = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      index.set(n.uid, n)
      walk(n.subs)
    }
  }
  walk(root)
  return index
}

/** 有效子任务（排除墓碑）：父任务完成态与进度一律以它为准。 */
export function liveSubs(n: TaskNode): TaskNode[] {
  return (n.subs ?? []).filter((s) => s.deletedAt === null)
}

export function hasLiveSubs(n: TaskNode): boolean {
  return liveSubs(n).length > 0
}

/** 递归只数叶子：含子任务的节点本身不计入分母。 */
export function subLeaves(n: TaskNode): { total: number; done: number } {
  let total = 0
  let done = 0
  for (const s of liveSubs(n)) {
    if (hasLiveSubs(s)) {
      const r = subLeaves(s)
      total += r.total
      done += r.done
    } else {
      total += 1
      if (s.done) done += 1
    }
  }
  return { total, done }
}

export function subProgress(n: TaskNode): { done: number; total: number; pct: number } | null {
  if (!hasLiveSubs(n)) return null
  const r = subLeaves(n)
  return { done: r.done, total: r.total, pct: r.total ? Math.round((r.done / r.total) * 100) : 0 }
}

/** 子任务变化后自底向上重算：含子任务的父任务 done = 全部有效子任务完成。 */
export function recalcUp(uid: string, index: Map<string, TaskNode>, today = startOfToday()): void {
  let current = index.get(uid)
  while (current?.parentUid) {
    const parent = index.get(current.parentUid)
    if (!parent) break
    const kids = liveSubs(parent)
    if (kids.length > 0) {
      const all = kids.every((s) => s.done)
      parent.done = all
      parent.completedAt = all ? today : null
    }
    current = parent
  }
}

/** 今日待办：顶级任务、非墓碑、按筛选、未完成或今日完成。 */
export function showInToday(n: TaskNode, filter: string, today: number): boolean {
  if (n.deletedAt !== null || n.parentUid !== null) return false
  if (filter !== 'all' && n.category !== filter) return false
  return !n.done || isSameDay(n.completedAt, today)
}

/** 顶栏进度环恒按「今日全部」口径，与分类筛选解耦。 */
export function todayStats(root: TaskNode[], today: number): { total: number; done: number; remaining: number } {
  const todayNodes = root.filter((n) => showInToday(n, 'all', today))
  const done = todayNodes.filter((n) => n.done).length
  return { total: todayNodes.length, done, remaining: todayNodes.length - done }
}

/** 新建子任务：继承父任务分类与优先级、depth+1，由调用方 unshift 置顶。 */
export function createSubtask(parent: TaskNode, title: string, now: number, uid = newUid()): TaskNode {
  return {
    uid,
    parentUid: parent.uid,
    title,
    category: parent.category,
    priority: parent.priority as Priority,
    done: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    depth: parent.depth + 1,
    sortOrder: -1,
    subs: [],
  }
}

/** 删除 = 墓碑，子树级联，绝不物理删除。 */
export function markDeleted(uid: string, index: Map<string, TaskNode>, now: number): void {
  const node = index.get(uid)
  if (!node) return
  node.deletedAt = now
  node.updatedAt = now
  for (const child of node.subs) markDeleted(child.uid, index, now)
}

export function findNode(root: TaskNode[], uid: string): TaskNode | null {
  const walk = (nodes: TaskNode[]): TaskNode | null => {
    for (const n of nodes) {
      if (n.uid === uid) return n
      const found = walk(n.subs)
      if (found) return found
    }
    return null
  }
  return walk(root)
}
