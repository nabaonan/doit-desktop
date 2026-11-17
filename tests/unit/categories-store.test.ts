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
})
