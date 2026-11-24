import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import ConfirmDeleteDialog from '@/components/doit/ConfirmDeleteDialog.vue'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

vi.mock('@/services/persistence', () => ({ scheduleSave: vi.fn(), flushSave: vi.fn() }))

/** Portal 内容挂在 body（Teleport），用 document 查询按钮。 */
function deleteButtonInBody(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '删除')
}

describe('ConfirmDeleteDialog 删除回归：点确认后任务真实删除', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('confirmDeleteFor 被关闭逻辑先清空时，删除仍生效（本地捕获 uid）', async () => {
    const store = useTaskStore()
    const ui = useUIStore()
    const now = Date.now()
    store.load({
      version: 2, revision: 1, exportedAt: now, deviceId: 't', lastSyncAt: null,
      categories: [{ name: '工作', color: '#3FBB9C', sortOrder: 0, updatedAt: now , deletedAt: null }],
      tasks: [{ uid: 'x1', parentUid: null, title: '任务A', category: '工作', priority: 1, done: false, completedAt: null, createdAt: now, updatedAt: now, deletedAt: null, depth: 0, sortOrder: 0 }],
    })
    expect(store.visibleNodes.length).toBe(1)
    ui.askDelete('x1')
    expect(ui.confirmDeleteFor).toBe('x1')

    const wrapper = mount(ConfirmDeleteDialog, { attachTo: document.body })
    await flushPromises()
    const btn = deleteButtonInBody()
    expect(btn).toBeTruthy()
    // 先模拟 ConfirmDialog 的 update:open(false) 已把 store 状态清空（复现原 bug 时序）
    ui.closeDelete()
    expect(ui.confirmDeleteFor).toBe(null)
    btn!.click()
    await flushPromises()

    expect(store.root[0].deletedAt).not.toBe(null)           // 墓碑已写
    expect(store.visibleNodes.length).toBe(0)                 // 今日列表消失
    wrapper.unmount()
  })
})
