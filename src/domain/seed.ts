import { addDays, startOfToday } from './date'
import type { Category, Priority, SnapshotV2, Task } from './types'

/** 确定性伪随机，保证首启演示数据每次一致（不写盘，仅用于空快照时的演示）。 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CATEGORIES: Category[] = [
  { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: 0 },
  { name: '生活', color: '#5B8DEF', sortOrder: 1, updatedAt: 0 },
  { name: '学习', color: '#F2A65A', sortOrder: 2, updatedAt: 0 },
  { name: '采购', color: '#C77DFF', sortOrder: 3, updatedAt: 0 },
]

function task(partial: Partial<Task> & Pick<Task, 'uid' | 'title'>, now: number): Task {
  return {
    parentUid: null,
    category: '',
    priority: 0 as Priority,
    done: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    depth: 0,
    sortOrder: 0,
    ...partial,
  }
}

/** 空快照时的演示数据；真实数据一律来自 load_snapshot（不覆盖用户数据）。 */
export function createSeedSnapshot(now = Date.now()): SnapshotV2 {
  const today = startOfToday(now)
  const yesterday = today - 86400000
  const tasks: Task[] = [
    task({ uid: 't1', title: '完成 Q4 季度复盘报告', category: '工作', priority: 2, sortOrder: 0 }, now),
    task({ uid: 't1a', parentUid: 't1', title: '收集各部门数据', category: '工作', done: true, completedAt: today - 2 * 86400000, depth: 1, sortOrder: 0 }, now),
    task({ uid: 't1b', parentUid: 't1', title: '撰写执行摘要', category: '工作', depth: 1, sortOrder: 1 }, now),
    task({ uid: 't1b1', parentUid: 't1b', title: '列出核心要点', category: '工作', depth: 2, sortOrder: 0 }, now),
    task({ uid: 't1b2', parentUid: 't1b', title: '起草段落', category: '工作', depth: 2, sortOrder: 1 }, now),
    task({ uid: 't1c', parentUid: 't1', title: '制作汇报 PPT', category: '工作', depth: 1, sortOrder: 2 }, now),
    task({ uid: 't2', title: '预约周末体检', category: '生活', priority: 1, done: true, completedAt: today, sortOrder: 1 }, now),
    task({ uid: 't3', title: '读完《设计心理学》第 3 章', category: '学习', priority: 1, sortOrder: 2 }, now),
    task({ uid: 't3a', parentUid: 't3', title: '做章节笔记', category: '学习', depth: 1, sortOrder: 0 }, now),
    task({ uid: 't4', title: '采购冬季保暖用品', category: '采购', sortOrder: 3 }, now),
    task({ uid: 't4a', parentUid: 't4', title: '羽绒服', category: '采购', depth: 1, sortOrder: 0 }, now),
    task({ uid: 't4b', parentUid: 't4', title: '暖手宝', category: '采购', depth: 1, sortOrder: 1 }, now),
    task({ uid: 't4c', parentUid: 't4', title: '厚袜子', category: '采购', depth: 1, sortOrder: 2 }, now),
    task({ uid: 't5', title: '给妈妈回电话', category: '生活', priority: 2, sortOrder: 4 }, now),
    task({ uid: 't6', title: '准备技术分享：WebDAV 同步原理', category: '工作', priority: 1, done: true, completedAt: yesterday, sortOrder: 5 }, now),
    task({ uid: 't6a', parentUid: 't6', title: '画流程图', category: '工作', done: true, completedAt: yesterday, depth: 1, sortOrder: 0 }, now),
    task({ uid: 't6b', parentUid: 't6', title: '写讲稿', category: '工作', done: true, completedAt: yesterday, depth: 1, sortOrder: 1 }, now),
  ]

  // 近 90 天的完成日志（顶级任务），用于热力图 / 环图 / 折线与月历
  const rng = mulberry32(20261114)
  for (let i = 1; i <= 90; i++) {
    const date = addDays(today, -i)
    const weekend = date.getDay() === 0 || date.getDay() === 6
    let count = Math.floor(rng() * 4)
    if (weekend) count = Math.floor(count / 2)
    if (rng() < 0.08) count += Math.floor(rng() * 5)
    for (let j = 0; j < count; j++) {
      const completedAt = date.getTime() + j * 3600000
      tasks.push(
        task(
          {
            uid: `seed-${i}-${j}`,
            title: `已完成事项 ${i}-${j}`,
            category: CATEGORIES[(i + j) % CATEGORIES.length].name,
            priority: ((i + j) % 3) as Priority,
            done: true,
            completedAt,
            createdAt: completedAt - 86400000,
            updatedAt: completedAt,
            sortOrder: 100 + i,
          },
          now,
        ),
      )
    }
  }

  return {
    version: 2,
    revision: 12,
    exportedAt: now,
    deviceId: 'doit-desktop',
    lastSyncAt: now,
    categories: CATEGORIES.map((c) => ({ ...c, updatedAt: now })),
    tasks,
  }
}
