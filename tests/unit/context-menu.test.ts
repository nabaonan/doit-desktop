import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useContextMenu } from '@/composables/useContextMenu'

function node(patch: Record<string, unknown> = {}) {
  return {
    uid: 't1', parentUid: null, title: '任务', category: '工作', priority: 1, done: false,
    ...patch,
  } as any
}

describe('useContextMenu 右键菜单项', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('已完成任务仅保留删除', () => {
    const n = node({ done: true })
    const { items } = useContextMenu(() => n)
    expect(items.value.map((i) => i.key)).toEqual(['del'])
  })

  it('顶级未完成任务含编辑 / 子任务 / 优先级 / 改分类 / 删除', () => {
    const { items } = useContextMenu(() => node())
    expect(items.value.map((i) => i.key)).toEqual(['edit', 'sub', 'prio', 'cat', 'del'])
  })

  it('子任务不显示改分类', () => {
    const { items } = useContextMenu(() => node({ parentUid: 'p1' }))
    expect(items.value.map((i) => i.key)).not.toContain('cat')
  })

  it('优先级子菜单标记当前优先级', () => {
    const { items } = useContextMenu(() => node({ priority: 2 }))
    const prio = items.value.find((i) => i.key === 'prio')!
    expect(prio.children?.find((c) => c.key === '2')?.current).toBe(true)
    expect(prio.children?.find((c) => c.key === '1')?.current).toBe(false)
  })
})
