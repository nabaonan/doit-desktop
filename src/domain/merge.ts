import { stableStringify } from './fingerprint'
import { emptySnapshot, normalizeSnapshot } from './snapshot'
import { fingerprint } from './fingerprint'
import type { Category, ConflictLog, SnapshotV2, Task } from './types'

export interface MergeResult {
  snapshot: SnapshotV2
  changed: number
  putRequired: boolean
  conflicts: ConflictLog[]
}

export interface MergeContext {
  now?: number
  deviceId?: string
}

export function effectiveTime(t: Task): number {
  return Math.max(t.updatedAt || 0, t.completedAt || 0, t.deletedAt || 0, t.createdAt || 0)
}

export function isStaleRemote(remote: SnapshotV2, local: SnapshotV2): boolean {
  return remote.exportedAt < local.exportedAt && remote.revision <= local.revision
}

const TASK_FIELDS: Array<keyof Task> = [
  'parentUid', 'title', 'category', 'priority', 'done', 'completedAt',
  'createdAt', 'deletedAt', 'depth', 'sortOrder',
]

const CATEGORY_FIELDS: Array<keyof Category> = ['color', 'sortOrder']

function same(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

function mergeRecord<T extends object>(
  local: T,
  remote: T,
  base: T | null,
  fields: Array<keyof T>,
  uid: string,
  localEff: number,
  remoteEff: number,
  conflicts: ConflictLog[],
): T {
  const out = Object.assign({}, local) as Record<string, unknown>
  for (const f of fields) {
    const key = f as string
    const lv = local[f]
    const rv = remote[f]
    const bv = base ? base[f] : undefined
    const localChanged = !base || !same(lv, bv)
    const remoteChanged = !base || !same(rv, bv)
    if (localChanged && !remoteChanged) {
      out[key] = lv
    } else if (!localChanged && remoteChanged) {
      out[key] = rv
    } else if (localChanged && remoteChanged && !same(lv, rv)) {
      // 同字段两边都变且不同：effectiveTime 较新者胜；相同或缺失 → 远程优先
      const winner = localEff > remoteEff ? 'local' : 'remote'
      out[key] = winner === 'local' ? lv : rv
      conflicts.push({ uid, field: key, local: lv, remote: rv, winner })
    } else {
      out[key] = base ? bv : lv
    }
  }
  return out as T
}

function mergeTask(
  local: Task,
  remote: Task,
  base: Task | null,
  conflicts: ConflictLog[],
): Task {
  const merged = mergeRecord(
    local,
    remote,
    base,
    TASK_FIELDS,
    local.uid,
    effectiveTime(local),
    effectiveTime(remote),
    conflicts,
  ) as Task

  // 墓碑 vs 编辑：删除之后对方又编辑过 → 撤销删除（编辑胜），否则删除生效
  const lDel = local.deletedAt
  const rDel = remote.deletedAt
  if (lDel !== null || rDel !== null) {
    if (lDel !== null && rDel === null && effectiveTime(remote) > lDel) {
      merged.deletedAt = null
      conflicts.push({ uid: local.uid, field: 'deletedAt', local: lDel, remote: null, winner: 'remote' })
    } else if (rDel !== null && lDel === null && effectiveTime(local) > rDel) {
      merged.deletedAt = null
      conflicts.push({ uid: local.uid, field: 'deletedAt', local: null, remote: rDel, winner: 'local' })
    } else {
      merged.deletedAt = Math.max(lDel ?? 0, rDel ?? 0) || null
    }
  }

  // 完成态与完成时间必须自洽
  if (!merged.done) merged.completedAt = null
  if (merged.done && merged.completedAt === null) merged.completedAt = Math.max(effectiveTime(local), effectiveTime(remote))
  merged.updatedAt = Math.max(effectiveTime(local), effectiveTime(remote))
  merged.uid = local.uid
  return merged
}

function mergeCategory(local: Category, remote: Category, base: Category | null, conflicts: ConflictLog[]): Category {
  const merged = mergeRecord(
    local,
    remote,
    base,
    CATEGORY_FIELDS,
    local.name,
    local.updatedAt || 0,
    remote.updatedAt || 0,
    conflicts,
  ) as Category
  merged.name = local.name
  merged.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0)
  return merged
}

/**
 * 手机端同款三方合并：并集保留、字段级合并、同字段冲突按 effectiveTime 取新（平局远程优先）、
 * 墓碑删除、陈旧远端检测。纯函数，结果不依赖系统时间（可通过 ctx.now 注入）。
 */
export function merge3(
  local: SnapshotV2,
  remote: SnapshotV2,
  base: SnapshotV2 | null,
  ctx: MergeContext = {},
): MergeResult {
  const now = ctx.now ?? Math.max(local.exportedAt || 0, remote.exportedAt || 0)
  const L = normalizeSnapshot(local)
  const R = normalizeSnapshot(remote)
  const B = base ? normalizeSnapshot(base) : emptySnapshot('merge-base', 0)
  const lTasks = new Map(L.tasks.map((t) => [t.uid, t]))
  const rTasks = new Map(R.tasks.map((t) => [t.uid, t]))
  const bTasks = new Map(B.tasks.map((t) => [t.uid, t]))
  const lCats = new Map(L.categories.map((c) => [c.name, c]))
  const rCats = new Map(R.categories.map((c) => [c.name, c]))
  const bCats = new Map(B.categories.map((c) => [c.name, c]))
  const conflicts: ConflictLog[] = []

  const taskUids = [...new Set([...lTasks.keys(), ...rTasks.keys()])].sort()
  const tasks: Task[] = []
  for (const uid of taskUids) {
    const l = lTasks.get(uid)
    const r = rTasks.get(uid)
    const b = bTasks.get(uid) ?? null
    if (l && r) tasks.push(mergeTask(l, r, b, conflicts))
    else if (l) tasks.push(l)
    else if (r) tasks.push(r)
  }
  tasks.sort((a, b) => (a.depth - b.depth) || (a.sortOrder - b.sortOrder) || a.uid.localeCompare(b.uid))

  const catNames = [...new Set([...lCats.keys(), ...rCats.keys()])].sort()
  const categories: Category[] = []
  for (const name of catNames) {
    const l = lCats.get(name)
    const r = rCats.get(name)
    const b = bCats.get(name) ?? null
    if (l && r) categories.push(mergeCategory(l, r, b, conflicts))
    else if (l) categories.push(l)
    else if (r) categories.push(r)
  }

  const snapshot: SnapshotV2 = {
    version: 2,
    revision: Math.max(L.revision, R.revision) + 1,
    exportedAt: now,
    deviceId: ctx.deviceId ?? L.deviceId,
    lastSyncAt: now,
    categories,
    tasks,
  }

  const localByUid = new Map(L.tasks.map((t) => [t.uid, stableStringify(t)]))
  const changed = tasks.filter((t) => localByUid.get(t.uid) !== stableStringify(t)).length
  return {
    snapshot,
    changed,
    putRequired: fingerprint(snapshot) !== fingerprint(R),
    conflicts,
  }
}
