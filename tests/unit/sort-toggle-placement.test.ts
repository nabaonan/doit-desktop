import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/services/persistence', () => ({ scheduleSave: vi.fn(), flushSave: vi.fn() }))

import CategoryChips from '@/components/doit/CategoryChips.vue'
import StatusPills from '@/components/doit/StatusPills.vue'
import { useTaskStore } from '@/stores/tasks'

function freshPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

describe('「紧急优先」开关位置：顶栏同步按钮左侧，不在分类导航里', () => {
  it('分类胶囊栏不再包含排序开关', () => {
    const w = mount(CategoryChips, { global: { plugins: [freshPinia()] } })
    expect(w.text()).not.toContain('紧急优先')
    expect(w.find('.chip-sort').exists()).toBe(false)
    expect(w.text()).toContain('添加分类')
  })

  it('今日页显示在同步胶囊左侧，其它页隐藏', async () => {
    const today = mount(StatusPills, {
      props: { page: 'today' },
      global: { plugins: [freshPinia()] },
    })
    const sort = today.get('button.sort-priority')
    expect(sort.text()).toContain('紧急优先')
    expect(sort.classes()).toContain('sort-priority')
    // DOM 顺序：排序开关在同步按钮之前
    const pills = today.findAll('.tb-pill')
    expect(pills.findIndex((p) => p.classes().includes('sort-priority')))
      .toBeLessThan(pills.findIndex((p) => p.classes().includes('sync-status')))

    await sort.trigger('click')
    expect(useTaskStore().sortByPriority).toBe(true)
    expect(sort.attributes('aria-pressed')).toBe('true')

    const stats = mount(StatusPills, {
      props: { page: 'stats' },
      global: { plugins: [freshPinia()] },
    })
    expect(stats.find('.sort-priority').exists()).toBe(false)
  })
})
