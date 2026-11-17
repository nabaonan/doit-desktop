import { describe, expect, it } from 'vitest'
import { fromSnapshot, normalizeSnapshot, toSnapshot, validateSnapshot, emptySnapshot } from '@/domain/snapshot'
import { buildIndex, createSubtask, liveSubs, markDeleted, recalcUp, subLeaves, subProgress, todayStats } from '@/domain/taskTree'
import { dayKey, startOfToday, monthGrid } from '@/domain/date'
import { heatLevel, dailyCounts, categoryShare, trendBuckets } from '@/domain/stats'
import { canComplete, nextHold } from '@/domain/completion'
import type { Category, SnapshotV2, Task, TaskNode } from '@/domain/types'

const NOW = Date.now()
const TODAY = startOfToday(NOW)
const CATS: Category[] = [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW }]

function t(uid: string, patch: Partial<Task> = {}): Task {
  return {
    uid, parentUid: null, title: `任务 ${uid}`, category: '工作', priority: 0,
    done: false, completedAt: null, createdAt: NOW, updatedAt: NOW,
    deletedAt: null, depth: 0, sortOrder: 0, ...patch,
  }
}

function s(tasks: Task[], patch: Partial<SnapshotV2> = {}): SnapshotV2 {
  return {
    version: 2, revision: 1, exportedAt: NOW, deviceId: 'test',
    lastSyncAt: null, categories: CATS, tasks, ...patch,
  }
}

describe('snapshot', () => {
  it('空快照与校验', () => {
    expect(validateSnapshot(emptySnapshot()).ok).toBe(true)
    expect(validateSnapshot({ version: 1 }).ok).toBe(false)
    expect(validateSnapshot(null).ok).toBe(false)
  })

  it('normalizeSnapshot 补齐 categories 兼容字段并去重 uid', () => {
    const raw = s([t('a'), t('a'), t('b')], {
      categories: [{ name: '生活', color: '#5B8DEF' } as Category],
    })
    const n = normalizeSnapshot(raw)
    expect(n.tasks).toHaveLength(2)
    expect(n.categories[0].sortOrder).toBe(0)
    expect(typeof n.categories[0].updatedAt).toBe('number')
  })

  it('toSnapshot / fromSnapshot 往返无损，含三层嵌套与墓碑', () => {
    const snap = s([
      t('p', { sortOrder: 0 }),
      t('c', { parentUid: 'p', depth: 1, sortOrder: 0 }),
      t('g', { parentUid: 'c', depth: 2, sortOrder: 0, done: true, completedAt: TODAY }),
      t('gone', { deletedAt: NOW, sortOrder: 1 }),
    ])
    const { root, categories } = fromSnapshot(snap)
    expect(root).toHaveLength(2)
    expect(root[0].subs[0].subs[0].uid).toBe('g')
    const back = toSnapshot(root, categories, {
      revision: 1, exportedAt: NOW, deviceId: 'test', lastSyncAt: null,
    })
    expect(back.tasks.map((x) => x.uid).sort()).toEqual(snap.tasks.map((x) => x.uid).sort())
    expect(back.tasks.find((x) => x.uid === 'g')?.depth).toBe(2)
    expect(back.tasks.find((x) => x.uid === 'gone')?.deletedAt).toBe(NOW)
  })

  it('孤儿节点提升为顶级，不会丢任务', () => {
    const { root } = fromSnapshot(s([t('orphan', { parentUid: 'missing', depth: 3 })]))
    expect(root.map((n) => n.uid)).toContain('orphan')
  })
})

describe('taskTree', () => {
  function tree(): TaskNode[] {
    return fromSnapshot(s([
      t('p'), t('c1', { parentUid: 'p', depth: 1 }), t('c2', { parentUid: 'p', depth: 1 }),
      t('x', { done: true, completedAt: TODAY, sortOrder: 1 }),
      t('old', { done: true, completedAt: TODAY - 3 * 86400000, sortOrder: 2 }),
      t('deleted', { deletedAt: NOW, sortOrder: 3 }),
    ])).root
  }

  it('liveSubs / subLeaves / subProgress 只数有效叶子', () => {
    const root = tree()
    const p = root.find((n) => n.uid === 'p')!
    expect(liveSubs(p)).toHaveLength(2)
    expect(subLeaves(p)).toEqual({ total: 2, done: 0 })
    expect(subProgress(p)?.pct).toBe(0)
    p.subs[0].done = true
    expect(subProgress(p)).toEqual({ done: 1, total: 2, pct: 50 })
    expect(subProgress(root[1])).toBeNull()
  })

  it('recalcUp：子任务全完成后父任务自动整体完成', () => {
    const root = tree()
    const index = buildIndex(root)
    const p = index.get('p')!
    p.subs[0].done = true
    recalcUp('c1', index, TODAY)
    expect(p.done).toBe(false)
    p.subs[1].done = true
    recalcUp('c2', index, TODAY)
    expect(p.done).toBe(true)
    expect(p.completedAt).toBe(TODAY)
  })

  it('todayStats 恒按「今日全部」口径，排除墓碑与历史完成', () => {
    const root = tree()
    expect(todayStats(root, TODAY)).toEqual({ total: 2, done: 1, remaining: 1 })
  })

  it('createSubtask 继承父分类/优先级，markDeleted 级联墓碑', () => {
    const root = tree()
    const p = root.find((n) => n.uid === 'p')!
    p.category = '生活'
    p.priority = 2
    const child = createSubtask(p, '新子任务', NOW, 'new-sub')
    p.subs.unshift(child)
    expect(child.category).toBe('生活')
    expect(child.priority).toBe(2)
    expect(child.depth).toBe(1)
    const index = buildIndex(root)
    markDeleted('p', index, NOW)
    expect(index.get('new-sub')?.deletedAt).toBe(NOW)
    expect(liveSubs(p)).toHaveLength(0)
  })

  it('canComplete：含子任务的父任务与已完成任务不可完成', () => {
    const root = tree()
    const p = root.find((n) => n.uid === 'p')!
    expect(canComplete(p)).toBe(false)
    expect(canComplete(p.subs[0])).toBe(true)
    expect(canComplete(root.find((n) => n.uid === 'x')!)).toBe(false)
  })
})

describe('completion / stats / date', () => {
  it('nextHold：走满才完成，中途松手回退', () => {
    const ctx = { canComplete: true }
    expect(nextHold('idle', { type: 'down', at: 0 }, ctx)).toBe('pending')
    expect(nextHold('pending', { type: 'timer', at: 150 }, ctx)).toBe('filling')
    expect(nextHold('filling', { type: 'up', at: 400 }, ctx)).toBe('rolledback')
    expect(nextHold('filling', { type: 'timer', at: 1050 }, ctx)).toBe('completed')
    expect(nextHold('idle', { type: 'down', at: 0 }, { canComplete: false })).toBe('idle')
  })

  it('heatLevel 五阶分档', () => {
    expect([0, 1, 3, 5, 8].map(heatLevel)).toEqual([0, 1, 2, 3, 4])
  })

  it('dailyCounts / categoryShare / trendBuckets 只数区间内已完成的顶级任务', () => {
    const root = fromSnapshot(s([
      t('a', { done: true, completedAt: TODAY }),
      t('b', { done: true, completedAt: TODAY - 86400000, category: '生活' }),
      t('child', { parentUid: 'a', depth: 1, done: true, completedAt: TODAY }),
      t('old', { done: true, completedAt: TODAY - 400 * 86400000 }),
    ])).root
    const counts = dailyCounts(root, 'week', TODAY)
    expect(counts.get(dayKey(TODAY))).toBe(1)
    expect(categoryShare(root, 'week', TODAY)).toHaveLength(2)
    expect(trendBuckets(root, 'week', TODAY)).toHaveLength(7)
    expect(trendBuckets(root, 'year', TODAY)).toHaveLength(12)
  })

  it('categoryShare 传入全部分类后，无完成数据的分类也以 0 出现在图例中', () => {
    const root = fromSnapshot(s([
      t('a', { done: true, completedAt: TODAY, category: '工作' }),
      t('b', { done: true, completedAt: TODAY, category: '生活' }),
    ])).root
    const share = categoryShare(root, 'week', TODAY, [
      { name: '工作' }, { name: '生活' }, { name: '学习' }, { name: '其他' },
    ])
    expect(share).toEqual([
      { name: '工作', count: 1 },
      { name: '生活', count: 1 },
      { name: '其他', count: 0 },
      { name: '学习', count: 0 },
    ])
    // 旧调用方式（不传分类列表）保持原行为
    expect(categoryShare(root, 'week', TODAY)).toHaveLength(2)
  })

  it('monthGrid 固定 42 格并标记非本月', () => {
    const grid = monthGrid(2026, 10)
    expect(grid).toHaveLength(42)
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30)
  })
})
