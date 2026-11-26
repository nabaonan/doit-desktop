import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/tasks'
import { emptySnapshot } from '@/domain/snapshot'

vi.mock('@/services/persistence', () => ({ scheduleSave: vi.fn(), flushSave: vi.fn() }))

const completedAt = new Date('2026-11-26T00:00:00+08:00').getTime()

function loadOneCompletedTask(store: ReturnType<typeof useTaskStore>): void {
  store.load({
    ...emptySnapshot(),
    tasks: [{
      uid: 'v1-2',
      parentUid: null,
      title: '2.1需求',
      category: '工作',
      priority: 2,
      done: true,
      completedAt,
      createdAt: completedAt - 86_400_000,
      updatedAt: completedAt,
      deletedAt: null,
      depth: 0,
      sortOrder: 0,
    }],
  })
}

describe('今日口径跨午夜刷新', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-26T23:59:30+08:00'))
    setActivePinia(createPinia())
  })

  afterEach(() => vi.useRealTimers())

  it('跨午夜后 refreshToday() 把昨天完成的任务从今日列表移除（与 gpui 口径一致）', () => {
    const store = useTaskStore()
    loadOneCompletedTask(store)

    // 11-26 当天仍算「今日完成」，可见
    expect(store.visibleNodes.map((n) => n.uid)).toEqual(['v1-2'])
    expect(store.todayNodes).toHaveLength(1)

    // 跨到 11-27：不调用 refreshToday 时 today 仍是昨天（旧行为，差异来源）
    vi.setSystemTime(new Date('2026-11-27T00:00:30+08:00'))
    expect(store.visibleNodes.map((n) => n.uid)).toEqual(['v1-2'])

    // App.vue 的定时器 / 焦点 / 可见性事件调用 refreshToday 后归档
    store.refreshToday()
    expect(store.visibleNodes).toHaveLength(0)
    expect(store.todayNodes).toHaveLength(0)
    expect(store.stats).toEqual({ total: 0, done: 0, remaining: 0 })
  })

  it('同一天内反复刷新不改变今日列表', () => {
    const store = useTaskStore()
    loadOneCompletedTask(store)
    store.refreshToday()
    store.refreshToday()
    expect(store.visibleNodes.map((n) => n.uid)).toEqual(['v1-2'])
  })

  it('未完成任务不受跨午夜影响', () => {
    const store = useTaskStore()
    store.load({
      ...emptySnapshot(),
      tasks: [{
        uid: 'pending',
        parentUid: null,
        title: '待办',
        category: '工作',
        priority: 4,
        done: false,
        completedAt: null,
        createdAt: completedAt,
        updatedAt: completedAt,
        deletedAt: null,
        depth: 0,
        sortOrder: 0,
      }],
    })
    vi.setSystemTime(new Date('2026-11-28T00:00:30+08:00'))
    store.refreshToday()
    expect(store.visibleNodes.map((n) => n.uid)).toEqual(['pending'])
  })
})
