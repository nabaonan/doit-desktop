import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

/** 全局快捷键：⌘/Ctrl+N 聚焦快速添加；Esc 统一收起编辑 / 子任务 / 弹框 / Tooltip。 */
export function useShortcuts() {
  const router = useRouter()
  const tasks = useTaskStore()
  const ui = useUIStore()

  function focusQuickAdd(): void {
    if (ui.page !== 'today') void router.push('/today')
    window.setTimeout(() => document.querySelector<HTMLInputElement>('#qaInput')?.focus(), 80)
  }

  function onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null
    const inField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault()
      focusQuickAdd()
      return
    }
    if (e.key === 'Escape') {
      ui.hideTooltip()
      ui.closeDelete()
      tasks.inlineEditFor = null
      tasks.inlineSubFor = null
      if (!inField) document.getElementById('qaInput')?.blur()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
  return { focusQuickAdd }
}
