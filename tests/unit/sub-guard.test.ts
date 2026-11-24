import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/tasks'

vi.mock('@/services/persistence', () => ({ scheduleSave: vi.fn(), flushSave: vi.fn() }))

describe('已完成父任务禁止添加子任务（回归）', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('对已完成父任务 createSub 不产生子任务、不翻转完成态', () => {
    const store = useTaskStore()
    const now = Date.now()
    const today = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
    store.load({
      version: 2, revision: 1, exportedAt: now, deviceId: 't', lastSyncAt: null,
      categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: now , deletedAt: null }],
      tasks: [{
        uid: 'd1', parentUid: null, title: '已完成', category: '工作', priority: 0,
        done: true, completedAt: today, createdAt: now, updatedAt: now, deletedAt: null, depth: 0, sortOrder: 0,
      }],
    })
    const rev = store.revision
    store.createSub('d1', '新子任务')
    const node = store.root[0]
    expect(node.subs.length).toBe(0)
    expect(node.done).toBe(true)      // 完成态未被 recalcUp 翻回未完成
    expect(store.revision).toBe(rev)  // 未产生任何变更
  })

  it('未完成父任务仍可正常添加子任务', () => {
    const store = useTaskStore()
    const now = Date.now()
    store.load({
      version: 2, revision: 1, exportedAt: now, deviceId: 't', lastSyncAt: null,
      categories: [],
      tasks: [{
        uid: 'a', parentUid: null, title: '未完成', category: '', priority: 0,
        done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: null, depth: 0, sortOrder: 0,
      }],
    })
    store.createSub('a', '子任务1')
    expect(store.root[0].subs.length).toBe(1)
    expect(store.root[0].done).toBe(false)
  })
})
