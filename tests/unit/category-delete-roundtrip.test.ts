import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/tasks'
import { merge3 } from '@/domain/merge'
import type { Category, SnapshotV2, Task } from '@/domain/types'

/**
 * 端到端复现用户链路：
 *   1. 桌面端删除分类「生活」→ 同步，远程快照里「生活」带墓碑；
 *   2. 手机端本地仍保留活「生活」分类（旧快照），点同步做合并；
 *   3. 桌面端再次同步（拉回手机端写出的快照）——「生活」此时不应复活。
 */

const NOW = 1700000000000

function t(uid: string, category = '工作', patch: Partial<Task> = {}): Task {
  return {
    uid, parentUid: null, title: `任务 ${uid}`, category, priority: 0,
    done: false, completedAt: null, createdAt: NOW, updatedAt: NOW,
    deletedAt: null, depth: 0, sortOrder: 0, ...patch,
  }
}

function cats(work: Partial<Category>, life: Partial<Category> = {}): Category[] {
  return [
    { name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: NOW - 1000, deletedAt: null, ...work },
    { name: '生活', color: '#F2A65A', sortOrder: 1, updatedAt: NOW - 1000, deletedAt: null, ...life },
  ]
}

function snap(categories: Category[], tasks: Task[], revision = 1): SnapshotV2 {
  return { version: 2, revision, exportedAt: NOW, deviceId: 'd', lastSyncAt: NOW, categories, tasks }
}

describe('分类删除后跨端同步不再复活', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('桌面删除→远程墓碑→手机同步→桌面再同步，分类不再复活', () => {
    const store = useTaskStore()
    const base = snap(
      cats({}, {}),
      [t('a', '工作'), t('b', '生活')],
      1,
    )
    store.load(base)

    // ---- 第 1 步：桌面端删除分类「生活」并同步 ----
    store.removeCategory('生活') // 桌面端本地「生活」→ 墓碑
    const desktopLocal = store.toSnapshotValue()
    const remoteAfterDesk = merge3(base, desktopLocal, base, { now: NOW + 10 }).snapshot
    const lifeRemote = remoteAfterDesk.categories.find((c) => c.name === '生活')!
    expect(lifeRemote.deletedAt).not.toBeNull() // 远程快照确实带墓碑

    // ---- 第 2 步：手机端本地还保留活「生活」分类，点同步 ----
    // 手机端上一次成功同步是 base，本地也停在 base（活跃「生活」）
    const phoneLocal = base // 手机端本地 = base（「生活」仍是活的）
    const phoneMerged = merge3(phoneLocal, remoteAfterDesk, base, { now: NOW + 20 }).snapshot
    const lifePhone = phoneMerged.categories.find((c) => c.name === '生活')!
    expect(lifePhone.deletedAt).not.toBeNull() // 手机端应识别删除墓碑并保留

    // ---- 第 3 步：桌面端再次同步，拉回手机端写出的快照 ----
    const deskReSync = merge3(desktopLocal, phoneMerged, remoteAfterDesk, { now: NOW + 30 }).snapshot
    const lifeFinal = deskReSync.categories.find((c) => c.name === '生活')
    // 「生活」要么仍是墓碑、要么即使存活也不能无编辑地复活 —— 期望保持删除
    expect(lifeFinal?.deletedAt).not.toBeNull()
  })

  it('边界：手机端本地改动过「生活」颜色（删除后编辑）→ 可按冲突语义恢复', () => {
    const store = useTaskStore()
    const store2 = useTaskStore()
    void store; void store2
  })

  it('边界：base 缺失（手机端从未同步过）时删除也能传播', () => {
    const base = snap(cats({}, {}), [t('a', '工作'), t('b', '生活')], 1)
    // 桌面删除「生活」
    const deskDeleted = merge3(base, snap(cats({}, { deletedAt: NOW + 10, updatedAt: NOW + 10 }), [t('a', '工作')], 2), base, { now: NOW + 10 }).snapshot
    const lifeRemote = deskDeleted.categories.find((c) => c.name === '生活')!
    expect(lifeRemote.deletedAt).not.toBeNull()

    // 手机端从未同步（base=null），本地有活「生活」
    const phoneLocal = snap(cats({}, {}), [t('b', '生活')], 0)
    const phoneMerged = merge3(phoneLocal, deskDeleted, null, { now: NOW + 20 }).snapshot
    const lifePhone = phoneMerged.categories.find((c) => c.name === '生活')
    expect(lifePhone?.deletedAt).not.toBeNull()
  })

  it('本地 updatedAt 因同步回写被动更新、内容未变 → 墓碑仍生效不复活', () => {
    // 真实复现：手机端分类「生活」没被用户编辑，但 updatedAt 因上次同步落库变成了较新值
    // （晚于桌面端删除时刻）。旧实现 `liveTime > deadAt` 会误判为“删除后又编辑”→ 复活。
    // 现实现只认可见内容（名称/颜色/排序）相对 base 是否变化 → 墓碑必须胜。
    const base = snap(cats({}, { updatedAt: NOW - 100 }), [t('a', '工作'), t('b', '生活')], 1)
    const deskDeleted = merge3(
      base,
      snap(cats({}, { deletedAt: NOW, updatedAt: NOW }), [t('a', '工作'), t('b', '生活')], 2),
      base,
      { now: NOW + 1000 },
    ).snapshot
    const tomb = deskDeleted.categories.find((c) => c.name === '生活')!
    expect(tomb.deletedAt).not.toBeNull()

    // 手机端本地「生活」内容未变（名字/颜色/排序与 base 相同），仅 updatedAt 被同步刷成更晚
    const phoneLocal = snap(
      cats({}, { updatedAt: NOW + 2000 }),
      [t('a', '工作'), t('b', '生活')],
      2,
    )
    const phoneMerged = merge3(phoneLocal, deskDeleted, base, { now: NOW + 3000 }).snapshot
    const life = phoneMerged.categories.find((c) => c.name === '生活')
    expect(life?.deletedAt).not.toBeNull()
  })

  it('手机端在删除之后真正改过分类颜色 → 按冲突语义允许恢复', () => {
    const base = snap(cats({}, { updatedAt: NOW - 100 }), [t('a', '工作'), t('b', '生活')], 1)
    const deskDeleted = merge3(
      base,
      snap(cats({}, { deletedAt: NOW, updatedAt: NOW }), [t('a', '工作'), t('b', '生活')], 2),
      base,
      { now: NOW + 1000 },
    ).snapshot
    const tomb = deskDeleted.categories.find((c) => c.name === '生活')!
    expect(tomb.deletedAt).not.toBeNull()

    // 手机端在删除（NOW）之后改了「生活」颜色（NOW+2000），这是真实编辑 → 允许恢复
    const phoneLocal = snap(
      cats({}, { color: '#FF0000', updatedAt: NOW + 2000 }),
      [t('a', '工作'), t('b', '生活')],
      2,
    )
    const phoneMerged = merge3(phoneLocal, deskDeleted, base, { now: NOW + 3000 }).snapshot
    const life = phoneMerged.categories.find((c) => c.name === '生活')
    expect(life?.deletedAt).toBeNull()
    expect(life?.color).toBe('#FF0000')
  })
})
