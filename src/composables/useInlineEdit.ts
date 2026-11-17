import { computed } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

/** 内联编辑草稿：Enter 保存、Esc 取消、点击外部自动保存；空标题取消。 */
export function useInlineEdit() {
  const tasks = useTaskStore()
  const ui = useUIStore()

  function start(uid: string): void {
    const node = tasks.index.get(uid)
    if (!node || node.done) { ui.notify('已完成任务不可编辑'); return }
    tasks.inlineSubFor = null
    tasks.inlineEditFor = uid
  }

  function commit(uid: string, value: string): void {
    if (tasks.inlineEditFor !== uid) return
    const title = value.trim()
    if (title) tasks.rename(uid, title)
    tasks.inlineEditFor = null
  }

  function cancel(): void {
    tasks.inlineEditFor = null
  }

  return { editingFor: computed(() => tasks.inlineEditFor), start, commit, cancel }
}
