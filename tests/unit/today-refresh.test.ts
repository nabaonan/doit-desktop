import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/tasks'
import { emptySnapshot } from '@/domain/snapshot'

vi.mock('@/services/persistence', () => ({ scheduleSave: vi.fn(), flushSave: vi.fn() }))

// 全部时间用本地时区的 Date 构造器 / startOfDay() 动态推导，而不是写死 +08:00：
// startOfToday()/isSameDay() 都按本地时区取当天，测试数据必须同口径，
// 否则 CI（UTC）与本机（GMT+8）算出的「今天」会错开一天导致假失败。
const at = (day: number, h: number, m: number, s: number): number =>
  new Date(2026, 10, day, h, m, s).getTime()
const completedAt = at(26, 0, 1, 0) // 11-26 完成

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
    vi.setSystemTime(at(26, 23, 59, 30))
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
    vi.setSystemTime(at(27, 0, 0, 30))
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
    vi.setSystemTime(at(28, 0, 0, 30))
    store.refreshToday()
    expect(store.visibleNodes.map((n) => n.uid)).toEqual(['pending'])
  })
})
