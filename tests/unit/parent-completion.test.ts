import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { startOfToday } from '@/domain/date'
import { repairSnapshotTasks } from '@/domain/taskTree'
import { useTaskStore } from '@/stores/tasks'
import type { Category, SnapshotV2, Task } from '@/domain/types'

vi.mock('@/services/persistence', () => ({ scheduleSave: vi.fn(), flushSave: vi.fn() }))

const NOW = Date.now()
const TODAY = startOfToday(NOW)
const CATS: Category[] = [{ name: '工作', color: '#34C7A8', sortOrder: 0, updatedAt: NOW, deletedAt: null }]

function t(uid: string, patch: Partial<Task> = {}): Task {
  return {
    uid, parentUid: null, title: `任务 ${uid}`, category: '工作', priority: 0,
    done: false, completedAt: null, createdAt: NOW - 1000, updatedAt: NOW - 1000,
    deletedAt: null, depth: 0, sortOrder: 0, ...patch,
  }
}

function s(tasks: Task[]): SnapshotV2 {
  return { version: 2, revision: 1, exportedAt: NOW, deviceId: 'test', lastSyncAt: null, categories: CATS, tasks }
}

describe('父任务完成态：删除子任务后自愈', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('墓碑子任务不算在父任务完成判定里（模拟「2.1需求」）', () => {
    const parent = t('p')
    const healed = repairSnapshotTasks(s([
      parent,
      t('a', { parentUid: 'p', done: true, completedAt: TODAY }),
      t('gone', { parentUid: 'p', done: false, deletedAt: NOW }),
    ]), TODAY, NOW)
    expect(healed.changed).toBe(1)
    const after = healed.snapshot.tasks.find((x) => x.uid === 'p')!
    expect(after.done).toBe(true)
    expect(after.completedAt).toBe(TODAY)
    expect(after.updatedAt).toBe(NOW)
    // 原快照不被修改
    expect(parent.done).toBe(false)
  })

  it('被墓碑父节点遮住的后代不参与完成判定；祖孙两级同时脏也能一次修好', () => {
    const healed = repairSnapshotTasks(s([
      t('p'),
      t('c', { parentUid: 'p', done: false }),
      t('g', { parentUid: 'c', done: true, completedAt: TODAY }),
      t('gonep', { deletedAt: NOW }),
      t('gonec', { parentUid: 'gonep', done: false }),
    ]), TODAY, NOW)
    expect(healed.changed).toBe(2)
    expect(healed.snapshot.tasks.find((x) => x.uid === 'p')?.done).toBe(true)
    expect(healed.snapshot.tasks.find((x) => x.uid === 'c')?.done).toBe(true)
    expect(healed.snapshot.tasks.find((x) => x.uid === 'gonec')?.done).toBe(false)
  })

  it('新合入的未完成子任务会把已完成父任务退回未完成', () => {
    const healed = repairSnapshotTasks(s([
      t('p', { done: true, completedAt: TODAY }),
      t('a', { parentUid: 'p', done: true, completedAt: TODAY }),
      t('b', { parentUid: 'p', done: false }),
    ]), TODAY, NOW)
    const after = healed.snapshot.tasks.find((x) => x.uid === 'p')!
    expect(after.done).toBe(false)
    expect(after.completedAt).toBeNull()
  })

  it('删除最后一个未完成子任务：父任务立即自动完成', () => {
    const store = useTaskStore()
    store.load(s([
      t('p'),
      t('a', { parentUid: 'p', done: true, completedAt: TODAY }),
      t('b', { parentUid: 'p', done: false }),
    ]))
    store.remove('b')
    expect(store.snapshot.tasks.find((x) => x.uid === 'p')?.done).toBe(true)
    expect(store.snapshot.tasks.find((x) => x.uid === 'b')?.deletedAt).not.toBeNull()
  })

  it('load 历史脏数据：子任务全完成、父任务未完成 → 自动修正', () => {
    const store = useTaskStore()
    store.load(s([
      t('p'),
      t('a', { parentUid: 'p', done: true, completedAt: TODAY }),
      t('gone', { parentUid: 'p', done: false, deletedAt: NOW }),
    ]))
    expect(store.root[0].done).toBe(true)
    expect(store.snapshot.tasks.find((x) => x.uid === 'p')?.done).toBe(true)
    expect(store.dirty).toBe(false)
  })
})
