<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import TopBar from '@/components/doit/TopBar.vue'
import QuickAddBar from '@/components/doit/QuickAddBar.vue'
import Toast from '@/components/doit/Toast.vue'
import ConfirmDeleteDialog from '@/components/doit/ConfirmDeleteDialog.vue'
import { useTaskStore } from '@/stores/tasks'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { useTheme } from '@/composables/useTheme'
import { useShortcuts } from '@/composables/useShortcuts'
import { invokeCommand } from '@/services/ipc'
import { flushSave } from '@/services/persistence'
import { emptySnapshot, validateSnapshot } from '@/domain/snapshot'
import type { PageId, SnapshotV2 } from '@/domain/types'

const route = useRoute()
const tasks = useTaskStore()
const settings = useSettingsStore()
const ui = useUIStore()
useTheme()
useShortcuts()

const page = computed<PageId>(() => (route.name as PageId) ?? 'today')
watch(page, (p) => ui.navigate(p), { immediate: true })

async function bootstrap(): Promise<void> {
  await settings.load()
  const result = await invokeCommand<SnapshotV2>('load_snapshot')
  // 只使用真实持久化数据：合法快照（含空 tasks）直接采用；损坏时才回退空快照，绝不注入示例任务。
  const snapshot = result.ok && validateSnapshot(result.value).ok
    ? result.value
    : emptySnapshot()
  tasks.load(snapshot)
  tasks.refreshToday()
}

function onBeforeUnload(): void {
  void flushSave()
}

onMounted(() => {
  void bootstrap()
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <TopBar :page="page" />
  <main id="main"><RouterView /></main>
  <div id="qabar-layer"><QuickAddBar v-if="page === 'today'" /></div>
  <Toast />
  <ConfirmDeleteDialog />
  <div id="overlay-host" />
</template>
