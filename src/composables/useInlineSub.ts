import { computed } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

/** 内联子任务：编辑框恒在列表最上方，提交后倒序置顶并自动展开祖先链。 */
export function useInlineSub() {
  const tasks = useTaskStore()
  const ui = useUIStore()

  function start(uid: string): void {
    const node = tasks.index.get(uid)
    if (!node || node.done) { ui.notify('已完成任务不可添加子任务'); return }
    tasks.inlineEditFor = null
    tasks.inlineSubFor = uid
  }

  function commit(uid: string, value: string): void {
    if (tasks.inlineSubFor !== uid) return
    const title = value.trim()
    if (title) tasks.createSub(uid, title)
    tasks.inlineSubFor = null
  }

  function cancel(): void {
    tasks.inlineSubFor = null
  }

  return { addingFor: computed(() => tasks.inlineSubFor), start, commit, cancel }
}
