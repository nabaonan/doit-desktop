import { describe, expect, it } from 'vitest'
import { fingerprint, stableStringify } from '@/domain/fingerprint'
import { effectiveTime, isStaleRemote, merge3 } from '@/domain/merge'
import { mergeWithRemote, syncLocalWith } from '@/services/webdav'
import type { Category, SnapshotV2, Task } from '@/domain/types'

const NOW = 1700000000000
const CATS: Category[] = [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW , deletedAt: null }]

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

  it('墓碑式删除跨端传递：远端墓碑 vs 本地活跃 → 删除生效，分类不复活（复现用户链路）', () => {
    // 用户复现链路：
    //   桌/手机一端删分类「生活」（写墓碑）→ 同步到远端；
    //   另一端本地仍是活跃「生活」、且同步过（有 base 也含活跃「生活」）→ 点同步。
    // 期望：墓碑胜 → 合并结果里「生活」仍是墓碑，UI 层被过滤，不复活。
    const base = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW, deletedAt: null },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW, deletedAt: null },
      ],
    })
    const tomb = Date.now() // 删除发生在同步之后
    const remote = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW, deletedAt: null },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW, deletedAt: tomb },
      ],
    })
    const local = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW, deletedAt: null },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW, deletedAt: null },
      ],
    })
    const merged = merge3(local, remote, base, { now: Date.now() })
    const life = merged.snapshot.categories.find((c) => c.name === '生活')!
    expect(life.deletedAt).not.toBeNull()
  })

  it('墓碑式删除跨端传递：本地墓碑 vs 远端活跃（旧快照未同步）→ 本地删除仍生效', () => {
    const base = snap([t('a')], { categories: CATS })
    const tomb = Date.now()
    const local = snap([t('a')], {
      categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW, deletedAt: tomb }],
    })
    const remote = snap([t('a')], { categories: CATS }) // 远端还是旧的活跃「工作」
    const merged = merge3(local, remote, base, { now: Date.now() })
    const w = merged.snapshot.categories.find((c) => c.name === '工作')!
    expect(w.deletedAt).not.toBeNull()
  })

  it('墓碑 vs 活跃且活跃方在删除后编辑过 → 编辑胜，恢复分类', () => {
    const base = snap([t('a')], { categories: CATS })
    const tomb = Date.now()
    const remote = snap([t('a')], {
      categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW, deletedAt: tomb }],
    })
    const local = snap([t('a')], {
      categories: [{ name: '工作', color: '#FF0000', sortOrder: 0, updatedAt: tomb + 100, deletedAt: null }],
    })
    const merged = merge3(local, remote, base, { now: Date.now() })
    const w = merged.snapshot.categories.find((c) => c.name === '工作')!
    expect(w.deletedAt).toBeNull()
    expect(w.color).toBe('#FF0000')
  })

  it('本地删除分类、远端仍是旧快照 → 删除生效，分类不复活', () => {
    const base = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW , deletedAt: null },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW , deletedAt: null },
      ],
    })
    // 本地删除了「生活」，同时把引用它的任务分类清空
    const local = snap(
      [{ ...t('a'), category: '' }],
      { categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW , deletedAt: null }] },
    )
    const remote = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW , deletedAt: null },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW , deletedAt: null },
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
      categories: [CATS[0], { name: '学习', color: '#8A6DE9', sortOrder: 1, updatedAt: NOW + 50 , deletedAt: null }],
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
      categories: [{ name: '工作', color: '#FF0000', sortOrder: 0, updatedAt: NOW + 30 , deletedAt: null }],
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

  it('陈旧远端也不能丢掉远端独有的新任务', () => {
    const local = snap([t('a')], { revision: 10, exportedAt: NOW })
    const remote = snap(
      [t('a'), t('tui-new', { done: true, completedAt: NOW - 1000, updatedAt: NOW - 1000 })],
      { revision: 3, exportedAt: NOW - 1000 },
    )
    const result = mergeWithRemote(local, remote, null, NOW)
    const pulled = result.snapshot.tasks.find((x) => x.uid === 'tui-new')
    expect(pulled).toBeDefined()
    expect(pulled?.done).toBe(true)
    expect(result.snapshot.tasks.find((x) => x.uid === 'a')?.title).toBe('任务 a')
  })

  it('TUI 新建后立即完成的顶级任务，桌面端同步必须拉下来', () => {
    // 复现用户场景：TUI 新增顶级任务 → 立即按空格完成 → s 同步 → 桌面端点同步。
    // 远端独有的已完成任务必须并入本地；完成时间与优先级原样保留。
    const base = snap([t('old')])
    const local = snap([t('old')], { revision: 8, exportedAt: NOW - 5000 })
    const remote = snap(
      [
        t('old'),
        t('tui-done', {
          title: '终端新建并完成',
          done: true,
          completedAt: NOW - 100,
          updatedAt: NOW - 100,
          priority: 4,
        }),
      ],
      { revision: 9, exportedAt: NOW },
    )
    const merged = merge3(local, remote, base, { now: NOW }).snapshot
    const pulled = merged.tasks.find((x) => x.uid === 'tui-done')
    expect(pulled).toMatchObject({ done: true, completedAt: NOW - 100, priority: 4, parentUid: null })
    // showInToday 的口径：顶级、非墓碑、当天完成 → 今日列表可见
    expect(pulled!.deletedAt).toBeNull()
    expect(new Date(pulled!.completedAt!).toDateString()).toBe(new Date(NOW).toDateString())
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
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW , deletedAt: null },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW , deletedAt: null },
      ],
    })
    const local = snap(
      [{ ...t('a'), category: '' }],
      { categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW , deletedAt: null }] },
    )
    const remote = snap([t('a')], {
      categories: [
        { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW , deletedAt: null },
        { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW , deletedAt: null },
      ],
    })
    const outcome = syncLocalWith(local, remote, base, NOW)
    expect(outcome.snapshot.categories.map((c) => c.name)).toEqual(['工作'])
  })
})
