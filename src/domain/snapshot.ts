import { appError } from './errors'
import type { Category, Result, SnapshotMeta, SnapshotV2, Task, TaskNode } from './types'

export interface SnapshotError {
  code: 'E_SNAPSHOT_INVALID'
  field: string
  message: string
}

function invalid(field: string, message: string): Result<never, SnapshotError> {
  return { ok: false, error: { code: 'E_SNAPSHOT_INVALID', field, message } }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function nullableNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 校验 v2 快照：结构、版本、必填字段。错误信息不得包含任何凭据内容。 */
export function validateSnapshot(input: unknown): Result<SnapshotV2, SnapshotError> {
  if (!input || typeof input !== 'object') return invalid('root', '快照不是对象')
  const s = input as Record<string, unknown>
  if (s.version !== 2) return invalid('version', '仅支持数据契约 v2')
  if (!Array.isArray(s.tasks)) return invalid('tasks', 'tasks 必须是数组')
  if (!Array.isArray(s.categories)) return invalid('categories', 'categories 必须是数组')
  for (const [i, t] of s.tasks.entries()) {
    if (!t || typeof t !== 'object') return invalid(`tasks[${i}]`, '任务不是对象')
    const task = t as Record<string, unknown>
    if (typeof task.uid !== 'string' || !task.uid) return invalid(`tasks[${i}].uid`, 'uid 缺失')
    if (typeof task.title !== 'string') return invalid(`tasks[${i}].title`, 'title 缺失')
  }
  for (const [i, c] of s.categories.entries()) {
    if (!c || typeof c !== 'object') return invalid(`categories[${i}]`, '分类不是对象')
    const cat = c as Record<string, unknown>
    if (typeof cat.name !== 'string' || !cat.name) return invalid(`categories[${i}].name`, '分类名缺失')
  }
  return { ok: true, value: input as SnapshotV2 }
}

/** 补齐 v2 兼容字段（原型 categories 只有 name/color）、去重 uid、规范枚举值。 */
export function normalizeSnapshot(s: SnapshotV2): SnapshotV2 {
  const now = Date.now()
  const seen = new Set<string>()
  const tasks: Task[] = []
  for (const raw of s.tasks) {
    if (seen.has(raw.uid)) continue
    seen.add(raw.uid)
    const t = raw as Task & Record<string, unknown>
    const priority = t.priority === 1 || t.priority === 2 ? t.priority : 0
    const done = Boolean(t.done)
    tasks.push({
      uid: t.uid,
      parentUid: typeof t.parentUid === 'string' && t.parentUid ? t.parentUid : null,
      title: typeof t.title === 'string' ? t.title : '',
      category: typeof t.category === 'string' ? t.category : '',
      priority,
      done,
      completedAt: done ? nullableNum(t.completedAt) : null,
      createdAt: num(t.createdAt, now),
      updatedAt: num(t.updatedAt, now),
      deletedAt: nullableNum(t.deletedAt),
      depth: num(t.depth, 0),
      sortOrder: num(t.sortOrder, 0),
    })
  }
  const categories: Category[] = s.categories.map((raw, i) => {
    const c = raw as Category & Record<string, unknown>
    return {
      name: c.name,
      color: typeof c.color === 'string' ? c.color : '#3FBB9C',
      sortOrder: num(c.sortOrder, i),
      updatedAt: num(c.updatedAt, now),
    }
  })
  return {
    version: 2,
    revision: num(s.revision, 0),
    exportedAt: num(s.exportedAt, now),
    deviceId: typeof s.deviceId === 'string' ? s.deviceId : 'doit-desktop',
    lastSyncAt: nullableNum(s.lastSyncAt),
    categories,
    tasks,
  }
}

/** 内存 subs 树 → 扁平 tasks[] 快照（唯一出入口）。 */
export function toSnapshot(root: TaskNode[], categories: Category[], meta: SnapshotMeta): SnapshotV2 {
  const tasks: Task[] = []
  const walk = (nodes: TaskNode[], depth: number) => {
    nodes.forEach((n, i) => {
      tasks.push({
        uid: n.uid,
        parentUid: n.parentUid,
        title: n.title,
        category: n.category,
        priority: n.priority,
        done: n.done,
        completedAt: n.completedAt,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        deletedAt: n.deletedAt,
        depth,
        sortOrder: n.sortOrder >= 0 ? n.sortOrder : i,
      })
      walk(n.subs, depth + 1)
    })
  }
  walk(root, 0)
  return {
    version: 2,
    revision: meta.revision,
    exportedAt: meta.exportedAt,
    deviceId: meta.deviceId,
    lastSyncAt: meta.lastSyncAt,
    categories: categories.map((c, i) => ({ ...c, sortOrder: c.sortOrder || i })),
    tasks,
  }
}

/** 扁平 tasks[] → 内存 subs 树；孤儿节点提升为顶级，保证任何来源的快照都能渲染。 */
export function fromSnapshot(s: SnapshotV2): { root: TaskNode[]; categories: Category[] } {
  const n = normalizeSnapshot(s)
  const nodes = new Map<string, TaskNode>()
  for (const t of n.tasks) nodes.set(t.uid, { ...t, subs: [] })
  const root: TaskNode[] = []
  for (const t of n.tasks) {
    const node = nodes.get(t.uid)!
    const parent = t.parentUid ? nodes.get(t.parentUid) : undefined
    if (parent && parent !== node) parent.subs.push(node)
    else root.push(node)
  }
  const byOrder = (a: TaskNode, b: TaskNode) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt
  const sortTree = (list: TaskNode[]) => {
    list.sort(byOrder)
    for (const item of list) sortTree(item.subs)
  }
  sortTree(root)
  return { root, categories: [...n.categories].sort((a, b) => a.sortOrder - b.sortOrder) }
}

export function emptySnapshot(deviceId = 'doit-desktop', now = Date.now()): SnapshotV2 {
  return {
    version: 2,
    revision: 0,
    exportedAt: now,
    deviceId,
    lastSyncAt: null,
    categories: [],
    tasks: [],
  }
}

export function snapshotError(field: string, message: string) {
  return appError('E_SNAPSHOT_INVALID', `${field}: ${message}`)
}
