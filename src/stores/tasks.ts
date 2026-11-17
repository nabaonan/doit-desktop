import { defineStore } from 'pinia'
import { computed, ref, shallowRef, type Ref } from 'vue'
import { startOfToday } from '@/domain/date'
import { fromSnapshot, toSnapshot, validateSnapshot, emptySnapshot } from '@/domain/snapshot'
import {
  createSubtask,
  liveSubs,
  markDeleted,
  newUid,
  recalcUp,
  showInToday,
  todayStats,
} from '@/domain/taskTree'
import { scheduleSave } from '@/services/persistence'
import type { AppSettings, Category, Priority, SnapshotV2, TaskNode } from '@/domain/types'
import { DEFAULT_SETTINGS } from '@/constants/tokens'

/**
 * 分类写入的模块级纯逻辑：直接接收 store 的响应式 ref，不依赖 store 实例上的方法。
 * 这样即使运行中的应用持有的是旧 store 实例（HMR 保留了旧实例、没有新加的 action），
 * 组件也能通过 storeToRefs 拿到这些**一直存在**的 ref 完成保存，避免 "addCategories is not a function"。
 */
export interface CategoryCtx {
  categories: Ref<Category[]>
  root: Ref<TaskNode[]>
  snapshot: Ref<SnapshotV2>
  revision: Ref<number>
  deviceId: Ref<string>
  dirty: Ref<boolean>
}

export function commitCategories(ctx: CategoryCtx, inputs: Array<{ name: string; color: string }>): number {
  const existing = new Set(ctx.categories.value.map((c) => c.name))
  const now = Date.now()
  let added = 0
  for (const input of inputs) {
    const name = input.name.trim()
    if (!name || existing.has(name)) continue
    existing.add(name)
    ctx.categories.value.push({
      name,
      color: input.color || DEFAULT_SETTINGS.progressColor,
      sortOrder: ctx.categories.value.length,
      updatedAt: now,
    })
    added += 1
  }
  if (added) {
    ctx.revision.value += 1
    ctx.snapshot.value = toSnapshot(ctx.root.value, ctx.categories.value, {
      revision: ctx.revision.value,
      exportedAt: now,
      deviceId: ctx.deviceId.value,
      lastSyncAt: ctx.snapshot.value.lastSyncAt,
    })
    ctx.dirty.value = true
    scheduleSave(ctx.snapshot.value)
  }
  return added
}

export const useTaskStore = defineStore('tasks', () => {
  const snapshot = ref<SnapshotV2>(emptySnapshot())
  const root = ref<TaskNode[]>([])
  const index = shallowRef<Map<string, TaskNode>>(new Map())
  const categories = ref<Category[]>([])
  const filter = ref('all')
  const collapsed = ref<Record<string, boolean>>({})
  const inlineEditFor = ref<string | null>(null)
  const inlineSubFor = ref<string | null>(null)
  const today = ref(startOfToday())
  const deviceId = ref('doit-desktop')
  const revision = ref(0)
  const dirty = ref(false)

  /** 顶栏进度环：恒按「今日全部」口径，与筛选解耦。 */
  const todayNodes = computed(() => root.value.filter((n) => showInToday(n, 'all', today.value)))
  const stats = computed(() => todayStats(root.value, today.value))
  const visibleNodes = computed(() => root.value.filter((n) => showInToday(n, filter.value, today.value)))
  const currentCategory = computed(() => (filter.value === 'all' ? categories.value[0]?.name ?? '' : filter.value))

  function rebuildIndex(): void {
    // 用 root 响应式树里的代理节点填充索引：index 是 shallowRef，若存原始对象，
    // 通过 index 改字段不会触发 Vue 依赖追踪（添加/删除子任务后视图不刷新）。
    const map = new Map<string, TaskNode>()
    const walk = (nodes: TaskNode[]) => {
      for (const n of nodes) {
        map.set(n.uid, n)                 // n 来自 root.value（代理数组）→ 响应式代理
        walk(n.subs ?? [])
      }
    }
    walk(root.value)
    index.value = map
  }

  /**
   * 从 root 响应式树里取节点（Vue ref 深层代理），供所有「修改」操作使用。
   * 关键：index 是 shallowRef，存的是未代理的原始对象；改原始对象不会触发 Vue 依赖追踪，
   * 导致「数据已写入 but 视图不刷新」（典型症状：添加子任务要切 tab 才显示）。
   * 只读/纯逻辑（recalcUp 等）仍可用 index，这里只服务需要触发响应的 mutate 路径。
   */
  function mutableNode(uid: string): TaskNode | undefined {
    const walk = (nodes: TaskNode[]): TaskNode | undefined => {
      for (const n of nodes) {
        if (n.uid === uid) return n
        const hit = walk(n.subs ?? [])
        if (hit) return hit
      }
      return undefined
    }
    return walk(root.value)
  }

  function load(input: SnapshotV2): void {
    const check = validateSnapshot(input)
    const safe = check.ok ? input : emptySnapshot()
    const parsed = fromSnapshot(safe)
    root.value = parsed.root
    categories.value = parsed.categories
    snapshot.value = safe
    revision.value = safe.revision
    deviceId.value = safe.deviceId
    dirty.value = false
    inlineEditFor.value = null
    inlineSubFor.value = null
    rebuildIndex()
  }

  /** 统一写入链：改树 → toSnapshot → 防抖落盘 → dirty。组件不得直接改 Task 字段。 */
  function touch(): void {
    revision.value += 1
    snapshot.value = toSnapshot(root.value, categories.value, {
      revision: revision.value,
      exportedAt: Date.now(),
      deviceId: deviceId.value,
      lastSyncAt: snapshot.value.lastSyncAt,
    })
    dirty.value = true
    scheduleSave(snapshot.value)
  }

  function nowStamp(): number {
    return Date.now()
  }

  function createTop(title: string, category: string, priority: Priority = 0): void {
    const now = nowStamp()
    const node: TaskNode = {
      uid: newUid(),
      parentUid: null,
      title: title.trim(),
      category,
      priority,
      done: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      depth: 0,
      sortOrder: -1,
      subs: [],
    }
    root.value = [node, ...root.value]
    index.value.set(node.uid, root.value[0])   // 存响应式代理，与 root 树共享引用
    touch()
  }

  function expandAncestors(uid: string): void {
    let cur = index.value.get(uid)
    while (cur?.parentUid) {
      collapsed.value = { ...collapsed.value, [cur.parentUid]: false }
      cur = index.value.get(cur.parentUid)
    }
  }

  /** 新建子任务：继承父分类/优先级、unshift 倒序置顶、自动展开祖先链。 */
  function createSub(parentUid: string, title: string): void {
    const parent = mutableNode(parentUid)          // 必须取响应式代理，否则 subs 变更不触发视图
    if (!parent || !title.trim()) return
    const child = createSubtask(parent, title.trim(), nowStamp())
    parent.subs = [child, ...parent.subs]
    index.value.set(child.uid, parent.subs[0])   // 取响应式代理，与 root 树共享引用
    root.value = [...root.value]
    expandAncestors(child.uid)
    collapsed.value = { ...collapsed.value, [parentUid]: false }
    recalcUp(child.uid, index.value, today.value)
    touch()
  }

  function rename(uid: string, title: string): void {
    const node = mutableNode(uid)
    if (!node || !title.trim()) return
    node.title = title.trim()
    node.updatedAt = nowStamp()
    root.value = [...root.value]
    touch()
  }

  function setPriority(uid: string, priority: Priority): void {
    const node = mutableNode(uid)
    if (!node) return
    node.priority = priority
    node.updatedAt = nowStamp()
    root.value = [...root.value]
    touch()
  }

  /** 只改当前顶级任务，不级联子任务。 */
  function setCategory(uid: string, name: string): void {
    const node = mutableNode(uid)
    if (!node || node.parentUid !== null) return
    node.category = name
    node.updatedAt = nowStamp()
    root.value = [...root.value]
    touch()
  }

  /** 标记完成（单向）：已完成任务不因再次点击恢复为未完成；含子任务父任务由子任务推导。 */
  function toggleDone(uid: string): void {
    const node = mutableNode(uid)
    if (!node || node.done || liveSubs(node).length > 0) return
    const now = nowStamp()
    node.done = true
    node.completedAt = today.value
    node.updatedAt = now
    recalcUp(uid, index.value, today.value)
    root.value = [...root.value]
    touch()
  }

  function remove(uid: string): void {
    markDeleted(uid, index.value, nowStamp())
    root.value = [...root.value]
    touch()
  }

  /**
   * 批量新增分类：按名称去重（已存在的跳过），追加到末尾并重排 sortOrder。
   * 一次保存可提交多个分类；写入后走统一 touch() 链即时持久化并刷新视图。
   * 返回实际新增的数量，便于 UI 提示。
   */
  function addCategories(inputs: Array<{ name: string; color: string }>): number {
    return commitCategories(
      { categories, root, snapshot, revision, deviceId, dirty },
      inputs,
    )
  }

  function setFilter(next: string): void {
    // 与原型一致：切换分类即退出内联添加 / 编辑态，避免输入框跨分类残留
    inlineEditFor.value = null
    inlineSubFor.value = null
    filter.value = next
  }

  function toggleCollapsed(uid: string): void {
    collapsed.value = { ...collapsed.value, [uid]: !collapsed.value[uid] }
  }

  function markClean(): void {
    dirty.value = false
  }

  function refreshToday(): void {
    today.value = startOfToday()
  }

  function resetToSeed(seed: SnapshotV2, settings: AppSettings = DEFAULT_SETTINGS): void {
    void settings
    load(seed)
  }

  function toSnapshotValue(): SnapshotV2 {
    return snapshot.value
  }

  return {
    snapshot, root, index, categories, filter, collapsed, inlineEditFor, inlineSubFor,
    today, deviceId, revision, dirty,
    todayNodes, stats, visibleNodes, currentCategory,
    load, createTop, createSub, rename, setPriority, setCategory, toggleDone, remove, addCategories,
    setFilter, toggleCollapsed, markClean, refreshToday, resetToSeed, toSnapshotValue,
  }
})
