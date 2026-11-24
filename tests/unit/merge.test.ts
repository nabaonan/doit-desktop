import { describe, expect, it } from 'vitest'
import { fingerprint, stableStringify } from '@/domain/fingerprint'
import { effectiveTime, isStaleRemote, merge3 } from '@/domain/merge'
import { mergeWithRemote, syncLocalWith } from '@/services/webdav'
import type { Category, SnapshotV2, Task } from '@/domain/types'

const NOW = 1700000000000
const CATS: Category[] = [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW }]

function t(uid: string, patch: Partial<Task> = {}): Task {
  return {
    uid, parentUid: null, title: `任务 ${uid}`, category: '工作', priority: 0,
    done: false, completedAt: null, createdAt: NOW, updatedAt: NOW,
    deletedAt: null, depth: 0, sortOrder: 0, ...patch,
  }
}

function snap(tasks: Task[], patch: Partial<SnapshotV2> = {}): SnapshotV2 {
  return {
    version: 2, revision: 1, exportedAt: NOW, deviceId: 'a',
    lastSyncAt: null, categories: CATS, tasks, ...patch,
  }
}

describe('fingerprint', () => {
  it('内容相同即相同，忽略快照级元信息', () => {
    const a = snap([t('a')], { revision: 1, exportedAt: 1, deviceId: 'a' })
    const b = snap([t('a')], { revision: 99, exportedAt: 999, deviceId: 'b', lastSyncAt: 123 })
    expect(fingerprint(a)).toBe(fingerprint(b))
  })

  it('记录顺序不影响指纹，记录内容变化会改变指纹', () => {
    const a = snap([t('a'), t('b')])
    const b = snap([t('b'), t('a')])
    expect(fingerprint(a)).toBe(fingerprint(b))
    expect(fingerprint(a)).not.toBe(fingerprint(snap([t('a'), { ...t('b'), title: '改了' }])))
  })

  it('stableStringify 对象键排序', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })
})

describe('merge3', () => {
  it('单边新增：并集保留，绝不互相覆盖', () => {
    const base = snap([t('a')])
    const local = snap([t('a'), t('l')])
    const remote = snap([t('a'), t('r')])
    const merged = merge3(local, remote, base, { now: NOW })
    expect(merged.snapshot.tasks.map((x) => x.uid).sort()).toEqual(['a', 'l', 'r'])
    expect(merged.putRequired).toBe(true)
  })

  it('本地同步后改过、远程与 base 一致 → 整条以本地为准', () => {
    const base = snap([t('a')])
    const local = snap([{ ...t('a'), title: '本地标题', priority: 2, updatedAt: NOW + 10 }])
    const remote = snap([t('a')])
    const merged = merge3(local, remote, base, { now: NOW })
    const a = merged.snapshot.tasks.find((x) => x.uid === 'a')!
    expect(a.title).toBe('本地标题')
    expect(a.priority).toBe(2)
  })

  it('两边改不同字段 → 两边都保留', () => {
    const base = snap([t('a')])
    const local = snap([{ ...t('a'), title: '本地标题' }])
    const remote = snap([{ ...t('a'), priority: 2 }])
    const a = merge3(local, remote, base, { now: NOW }).snapshot.tasks[0]
    expect(a.title).toBe('本地标题')
    expect(a.priority).toBe(2)
  })

  it('同字段冲突取 effectiveTime 较新者，时间相同远程优先', () => {
    const base = snap([t('a')])
    const local = snap([{ ...t('a'), title: '本地', updatedAt: NOW + 50 }])
    const remote = snap([{ ...t('a'), title: '远程', updatedAt: NOW + 10 }])
    expect(merge3(local, remote, base, { now: NOW }).snapshot.tasks[0].title).toBe('本地')
    expect(merge3(remote, local, base, { now: NOW }).snapshot.tasks[0].title).toBe('本地')

    const tieLocal = snap([{ ...t('a'), title: '本地', updatedAt: NOW + 10 }])
    const tieRemote = snap([{ ...t('a'), title: '远程', updatedAt: NOW + 10 }])
    const tied = merge3(tieLocal, tieRemote, base, { now: NOW })
    expect(tied.snapshot.tasks[0].title).toBe('远程')
    expect(tied.conflicts.length).toBeGreaterThan(0)
  })

  it('墓碑删除生效；删除之后对方编辑过则撤销删除', () => {
    const base = snap([t('a')])
    const deleted = snap([{ ...t('a'), deletedAt: NOW + 100, updatedAt: NOW + 100 }])
    const unchanged = snap([t('a')])
    expect(merge3(deleted, unchanged, base, { now: NOW }).snapshot.tasks[0].deletedAt).toBe(NOW + 100)

    const editedAfter = snap([{ ...t('a'), title: '删除后又编辑', updatedAt: NOW + 200 }])
    expect(merge3(deleted, editedAfter, base, { now: NOW }).snapshot.tasks[0].deletedAt).toBeNull()
  })

  it('无 base 时按并集合并，revision 单调递增', () => {
    const merged = merge3(snap([t('a')], { revision: 5 }), snap([t('b')], { revision: 9 }), null, { now: NOW })
    expect(merged.snapshot.revision).toBe(10)
    expect(merged.snapshot.tasks).toHaveLength(2)
  })

  it('本地删除分类、远端仍是旧快照 → 删除生效，分类不复活', () => {
    const base = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW },
      ],
    })
    // 本地删除了「生活」，同时把引用它的任务分类清空
    const local = snap(
      [{ ...t('a'), category: '' }],
      { categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW }] },
    )
    const remote = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW },
      ],
    })
    const merged = merge3(local, remote, base, { now: NOW })
    const names = merged.snapshot.categories.map((c) => c.name)
    expect(names).toEqual(['工作'])
    expect(names).not.toContain('生活')
  })

  it('远端新增分类、本地无 → 保留远端新增分类', () => {
    const base = snap([t('a')], { categories: CATS })
    const local = snap([t('a')], { categories: CATS })
    const remote = snap([t('a')], {
      categories: [CATS[0], { name: '学习', color: '#8A6DE9', sortOrder: 1, updatedAt: NOW + 50 }],
    })
    const merged = merge3(local, remote, base, { now: NOW })
    const names = merged.snapshot.categories.map((c) => c.name)
    expect(names).toContain('工作')
    expect(names).toContain('学习')
  })

  it('本地删除分类、远端同名分类相对 base 有更新 → 远端编辑胜（恢复分类）', () => {
    const base = snap([t('a')], { categories: CATS })
    const local = snap([t('a')], { categories: [] })
    const remote = snap([t('a')], {
      categories: [{ name: '工作', color: '#FF0000', sortOrder: 0, updatedAt: NOW + 30 }],
    })
    const merged = merge3(local, remote, base, { now: NOW })
    const names = merged.snapshot.categories.map((c) => c.name)
    expect(names).toContain('工作')
    expect(merged.snapshot.categories.find((c) => c.name === '工作')?.color).toBe('#FF0000')
  })

  it('完成态自洽：未完成不保留 completedAt', () => {
    const base = snap([t('a')])
    const local = snap([{ ...t('a'), done: false }])
    const remote = snap([{ ...t('a'), done: false, completedAt: NOW }])
    const merged = merge3(local, remote, base, { now: NOW }).snapshot.tasks[0]
    expect(merged.done).toBe(false)
    expect(merged.completedAt).toBeNull()
  })

  it('合并结果幂等：对同一输入重复合并内容指纹不变', () => {
    const local = snap([t('a', { title: 'A' })])
    const remote = snap([t('b')])
    const first = merge3(local, remote, null, { now: NOW }).snapshot
    const second = merge3(first, remote, null, { now: NOW }).snapshot
    expect(fingerprint(first)).toBe(fingerprint(second))
  })

  it('effectiveTime 取各类时间戳最大值', () => {
    expect(effectiveTime(t('a', { updatedAt: 5, completedAt: 9, createdAt: 1 }))).toBe(9)
  })

  it('陈旧远端检测与忽略', () => {
    const local = snap([t('a')], { revision: 10, exportedAt: NOW })
    const remote = snap([t('a')], { revision: 3, exportedAt: NOW - 1000 })
    expect(isStaleRemote(remote, local)).toBe(true)
    const result = mergeWithRemote(local, remote, null, NOW)
    expect(result.snapshot.tasks[0].uid).toBe('a')
    expect(result.putRequired).toBe(true)
  })
})

describe('syncLocalWith', () => {
  it('无远端时只落地本地与基线，不产生变更', async () => {
    const local = snap([t('a')])
    const outcome = syncLocalWith(local, null, null, NOW)
    expect(outcome.changed).toBe(0)
    expect(outcome.snapshot.tasks).toHaveLength(1)
  })

  it('本地删除分类后同步，远端旧快照含该分类 → merged 快照不再包含被删分类', async () => {
    const base = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW },
      ],
    })
    const local = snap(
      [{ ...t('a'), category: '' }],
      { categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW }] },
    )
    const remote = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW },
      ],
    })
    const outcome = syncLocalWith(local, remote, base, NOW)
    expect(outcome.snapshot.categories.map((c) => c.name)).toEqual(['工作'])
  })
})
