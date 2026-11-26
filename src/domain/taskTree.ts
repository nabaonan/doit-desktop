import { isSameDay, startOfToday } from './date'
import type { Priority, SnapshotV2, Task, TaskNode } from './types'

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

/**
 * 修复历史快照里的父任务完成态：有效子任务（墓碑及其子树不算）全完成，但父任务仍是未完成。
 * 删除子任务时若没有触发 recalcUp 就会发现这种脏数据；同步合并拉入墓碑时同样可能出现。
 * 自底向上修，已被墓碑父节点遮住的后代不计入任何父任务的完成判定。
 * 返回新快照（无变化时原样返回），调用方在 load / 同步写回前使用。
 */
export function repairSnapshotTasks(s: SnapshotV2, today = startOfToday(), now = Date.now()): { snapshot: SnapshotV2; changed: number } {
  const byUid = new Map(s.tasks.map((t) => [t.uid, t]))
  const isLive = (t: Task): boolean => {
    if (t.deletedAt !== null) return false
    const seen = new Set<string>([t.uid])
    let parentUid = t.parentUid
    while (parentUid) {
      if (seen.has(parentUid)) return false
      seen.add(parentUid)
      const parent = byUid.get(parentUid)
      if (!parent || parent.deletedAt !== null) return false
      parentUid = parent.parentUid
    }
    return true
  }
  const children = new Map<string, Task[]>()
  for (const t of s.tasks) {
    if (!t.parentUid || !isLive(t)) continue
    const list = children.get(t.parentUid) ?? []
    list.push(t)
    children.set(t.parentUid, list)
  }
  const patched = new Map<string, Task>()
  let changed = 0
  const walk = (t: Task): void => {
    const kids = children.get(t.uid) ?? []
    for (const kid of kids) walk(kid)
    if (!kids.length) return
    // 用修完后的子任务状态判父任务，避免祖孙两级同时脏时只修一层。
    const all = kids.every((kid) => (patched.get(kid.uid) ?? kid).done)
    if (all && !t.done) {
      patched.set(t.uid, { ...t, done: true, completedAt: today, updatedAt: Math.max(now, t.updatedAt) })
      changed += 1
    } else if (!all && t.done) {
      patched.set(t.uid, { ...t, done: false, completedAt: null, updatedAt: Math.max(now, t.updatedAt) })
      changed += 1
    }
  }
  for (const t of s.tasks) if (!t.parentUid) walk(t)
  if (!changed) return { snapshot: s, changed: 0 }
  return { snapshot: { ...s, tasks: s.tasks.map((t) => patched.get(t.uid) ?? t) }, changed }
}

/** 今日待办：顶级任务、非墓碑、按筛选、未完成或今日完成。 */
export function showInToday(n: TaskNode, filter: string, today: number): boolean {
  if (n.deletedAt !== null || n.parentUid !== null) return false
  if (filter !== 'all' && n.category !== filter) return false
  return !n.done || isSameDay(n.completedAt, today)
}

/**
 * 今日待办的「按优先级排序」：只重排传入的顶级任务，子任务顺序原样保留。
 * 优先级 4（紧急）→ 0（不设），同优先级保持原有顺序（稳定排序）；返回新数组，不改入参。
 */
export function sortTopByPriority(nodes: TaskNode[], enabled: boolean): TaskNode[] {
  if (!enabled) return nodes
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => (b.node.priority - a.node.priority) || (a.index - b.index))
    .map(({ node }) => node)
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
