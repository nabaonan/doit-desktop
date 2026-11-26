import { describe, expect, it } from 'vitest'
import { sortTopByPriority } from '@/domain/taskTree'
import type { Priority, TaskNode } from '@/domain/types'

function node(uid: string, priority: Priority, subs: TaskNode[] = []): TaskNode {
  return {
    uid,
    parentUid: null,
    title: uid,
    category: '',
    priority,
    done: false,
    completedAt: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    depth: 0,
    sortOrder: 0,
    subs,
  }
}

describe('sortTopByPriority', () => {
  it('紧急 4 → 不设 0，同优先级保持原顺序', () => {
    const input = [node('a', 0), node('b', 4), node('c', 2), node('d', 4), node('e', 3)]
    const sorted = sortTopByPriority(input, true)
    expect(sorted.map((n) => n.uid)).toEqual(['b', 'd', 'e', 'c', 'a'])
    expect(input.map((n) => n.uid)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('关闭时原样返回，不复制数组', () => {
    const input = [node('a', 0), node('b', 4)]
    expect(sortTopByPriority(input, false)).toBe(input)
  })

  it('只重排顶级任务，子任务顺序完全不动', () => {
    const subs = [node('s1', 1), node('s2', 4)]
    const parent = node('p1', 0, subs)
    const urgent = node('p2', 4, [node('s3', 0), node('s4', 3)])
    const sorted = sortTopByPriority([parent, urgent], true)
    expect(sorted.map((n) => n.uid)).toEqual(['p2', 'p1'])
    expect(sorted[0].subs.map((s) => s.uid)).toEqual(['s3', 's4'])
    expect(sorted[1].subs.map((s) => s.uid)).toEqual(['s1', 's2'])
    // 子任务数组仍是同一引用（未被复制/重排）
    expect(sorted[1].subs).toBe(subs)
  })
})
