import { computed, nextTick, ref } from 'vue'
import { PRIORITY_OPTIONS } from '@/constants/tokens'
import { useTaskStore } from '@/stores/tasks'
import type { TaskNode } from '@/domain/types'
import type { MenuItem } from '@/components/ui/types'

/** 右键菜单项构造 + 二级子菜单开合（点击展开、同时只开一个、靠右边界翻左）。 */
export function useContextMenu(getNode: () => TaskNode | null) {
  const tasks = useTaskStore()
  const openSub = ref<string | null>(null)
  const flipLeft = ref(false)

  const items = computed<MenuItem[]>(() => {
    const node = getNode()
    if (!node) return []
    const del: MenuItem = { key: 'del', label: '删除', icon: 'trash', danger: true }
    if (node.done) return [del]
    const prio: MenuItem = {
      key: 'prio', label: '优先级', icon: 'flag',
      // 与手机端一致：高 → 低，最后「不设」
      children: PRIORITY_OPTIONS.map((p) => ({
        key: String(p.value), label: p.label,
        color: `var(--prio-${p.varName})`, current: node.priority === p.value,
      })),
    }
    const cat: MenuItem = {
      key: 'cat', label: '改分类', icon: 'folder',
      children: tasks.visibleCategories.map((c) => ({
        key: c.name, label: c.name, color: c.color, current: node.category === c.name,
      })),
    }
    return [
      { key: 'edit', label: '编辑', icon: 'pencil' },
      { key: 'sub', label: '子任务', icon: 'sub' },
      prio,
      ...(node.parentUid === null ? [cat] : []),
      del,
    ]
  })

  function closeAll(): void {
    openSub.value = null
    flipLeft.value = false
  }

  async function toggleSub(item: MenuItem, event: MouseEvent): Promise<void> {
    if (!item.children) return
    const wasOpen = openSub.value === item.key
    closeAll()
    if (wasOpen) return
    openSub.value = item.key
    await nextTick()
    const row = (event.currentTarget as HTMLElement | null)?.closest('.ctx-row')
    const submenu = row?.querySelector<HTMLElement>('.submenu')
    if (submenu) {
      const rect = submenu.getBoundingClientRect()
      flipLeft.value = rect.right > window.innerWidth - 8
    }
  }

  return { items, openSub, flipLeft, toggleSub, closeAll }
}
