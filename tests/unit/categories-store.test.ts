import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, storeToRefs } from 'pinia'
import { commitCategories, useTaskStore } from '@/stores/tasks'
import { emptySnapshot } from '@/domain/snapshot'

vi.mock('@/services/persistence', () => ({ scheduleSave: vi.fn(), flushSave: vi.fn() }))

describe('tasks.addCategories 分类管理', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('一次新增多个分类，写入快照并按顺序排 sortOrder', () => {
    const store = useTaskStore()
    store.load(emptySnapshot())
    const added = store.addCategories([
      { name: '工作', color: '#3FBB9C' },
      { name: '生活', color: '#5B8DEF' },
      { name: '学习', color: '#F2A65A' },
    ])
    expect(added).toBe(3)
    expect(store.categories.map((c) => c.name)).toEqual(['工作', '生活', '学习'])
    expect(store.categories.map((c) => c.sortOrder)).toEqual([0, 1, 2])
    expect(store.categories.map((c) => c.color)).toEqual(['#3FBB9C', '#5B8DEF', '#F2A65A'])
    // 写入快照并标记 dirty（统一 touch 链）
    expect(store.snapshot.categories.map((c) => c.name)).toEqual(['工作', '生活', '学习'])
    expect(store.dirty).toBe(true)
  })

  it('按名称去重：已存在的分类跳过、空白名跳过', () => {
    const store = useTaskStore()
    store.load(emptySnapshot())
    store.addCategories([{ name: '工作', color: '#111111' }, { name: '生活', color: '#222222' }])
    const added = store.addCategories([
      { name: '工作', color: '#999999' },  // 重复
      { name: '   ', color: '#333333' },   // 空白
      { name: '采购', color: '#C77DFF' },  // 新增
    ])
    expect(added).toBe(1)
    expect(store.categories.map((c) => c.name)).toEqual(['工作', '生活', '采购'])
    // 重复的分类未被覆盖颜色
    expect(store.categories.find((c) => c.name === '工作')?.color).toBe('#111111')
  })

  it('无有效输入时不产生变更', () => {
    const store = useTaskStore()
    store.load(emptySnapshot())
    const rev = store.revision
    const added = store.addCategories([{ name: '', color: '#fff' }])
    expect(added).toBe(0)
    expect(store.categories).toHaveLength(0)
    expect(store.revision).toBe(rev)
  })

  it('旧 store 实例缺少 addCategories 时，模块级 commitCategories 仍可写入（HMR 兼容回归）', () => {
    const store = useTaskStore()
    store.load(emptySnapshot())
    // 模拟运行中的应用持有旧实例：并没有 addCategories 这个 action
    expect(typeof (store as unknown as Record<string, unknown>).addCategories).toBe('function')
    const legacy = store as unknown as Record<string, unknown>
    delete legacy.addCategories
    expect(typeof legacy.addCategories).toBe('undefined')

    // 组件通过 storeToRefs 拿到一直存在的 ref，走模块函数完成保存
    const refs = storeToRefs(store)
    const added = commitCategories(
      { categories: refs.categories, root: refs.root, snapshot: refs.snapshot,
        revision: refs.revision, deviceId: refs.deviceId, dirty: refs.dirty },
      [{ name: '旧实例分类', color: '#E5688A' }],
    )
    expect(added).toBe(1)
    expect(store.categories.map((c) => c.name)).toContain('旧实例分类')
    expect(store.snapshot.categories.map((c) => c.name)).toContain('旧实例分类')
    expect(store.dirty).toBe(true)
  })

  it('categoryTaskCount 统计包含子任务且排除已删除', () => {
    const store = useTaskStore()
    const now = Date.now()
    store.load({
      version: 2, revision: 1, exportedAt: now, deviceId: 't', lastSyncAt: null,
      categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: now }],
      tasks: [
        { uid: 'a', parentUid: null, title: '父', category: '工作', priority: 0, done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: null, depth: 0, sortOrder: 0 },
        { uid: 'a1', parentUid: 'a', title: '子', category: '工作', priority: 0, done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: null, depth: 1, sortOrder: 0 },
        { uid: 'a2', parentUid: 'a', title: '已删子', category: '工作', priority: 0, done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: now, depth: 1, sortOrder: 1 },
      ],
    })
    expect(store.categoryTaskCount('工作')).toBe(2)
    expect(store.categoryTaskCount('不存在')).toBe(0)
  })

  it('removeCategory 清空引用任务分类、移除分类、回退当前筛选并返回受影响数', () => {
    const store = useTaskStore()
    const now = Date.now()
    store.load({
      version: 2, revision: 1, exportedAt: now, deviceId: 't', lastSyncAt: null,
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: now },
        { name: '生活', color: '#5B8DEF', sortOrder: 1, updatedAt: now },
      ],
      tasks: [
        { uid: 'a', parentUid: null, title: '任务A', category: '工作', priority: 0, done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: null, depth: 0, sortOrder: 0 },
        { uid: 'a1', parentUid: 'a', title: '任务A1', category: '工作', priority: 0, done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: null, depth: 1, sortOrder: 0 },
        { uid: 'b', parentUid: null, title: '任务B', category: '生活', priority: 0, done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: null, depth: 0, sortOrder: 1 },
      ],
    })
    store.setFilter('工作')
    const affected = store.removeCategory('工作')
    expect(affected).toBe(2)
    expect(store.categories.map((c) => c.name)).toEqual(['生活'])
    expect(store.categories[0].sortOrder).toBe(0)
    expect(store.filter).toBe('all')
    const a = store.root.find((n) => n.uid === 'a')!
    const a1 = a.subs.find((n) => n.uid === 'a1')!
    expect(a.category).toBe('')
    expect(a1.category).toBe('')
    expect(store.root.find((n) => n.uid === 'b')!.category).toBe('生活')
    expect(store.dirty).toBe(true)
  })
})
