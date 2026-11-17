<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()
const tasks = useTaskStore()
const open = computed(() => ui.confirmDeleteFor !== null)

// 关键：ConfirmDialog 的 confirm() 先 emit update:open(false)（触发 closeDelete 清空
// ui.confirmDeleteFor）再 emit confirm()；若 confirm() 里再读 store 状态必然是 null，
// 导致「点删除只关弹窗不生效」。这里在 askDelete 打开时就把 uid 捕获到本地 ref，
// 删除动作一律用本地值，不依赖可能已被清空的 store 状态。
const pendingUid = ref<string | null>(null)
watch(
  () => ui.confirmDeleteFor,
  (v) => { pendingUid.value = v },
  { immediate: true },
)
const message = computed(() => {
  const node = pendingUid.value ? tasks.index.get(pendingUid.value) : null
  return `确定要删除「${node?.title ?? ''}」吗？将记入墓碑并在下次同步生效。`
})

function confirm(): void {
  const uid = pendingUid.value
  pendingUid.value = null
  if (uid) tasks.remove(uid)
}
</script>

<template>
  <ConfirmDialog
    :open="open"
    :message="message"
    @update:open="(v) => { if (!v) ui.closeDelete() }"
    @confirm="confirm"
  />
</template>
