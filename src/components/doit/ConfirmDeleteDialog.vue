<script setup lang="ts">
import { computed } from 'vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()
const tasks = useTaskStore()
const open = computed(() => ui.confirmDeleteFor !== null)
const message = computed(() => {
  const node = ui.confirmDeleteFor ? tasks.index.get(ui.confirmDeleteFor) : null
  return `确定要删除「${node?.title ?? ''}」吗？将记入墓碑并在下次同步生效。`
})

function confirm(): void {
  const uid = ui.confirmDeleteFor
  if (uid) tasks.remove(uid)
  ui.closeDelete()
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
