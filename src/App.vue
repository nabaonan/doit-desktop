<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ScrollAreaCorner, ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport,
} from 'reka-ui'
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
  tasks.setSortByPriority(settings.settings.sortByPriority)
  tasks.refreshToday()
}

function onBeforeUnload(): void {
  void flushSave()
}

// 今日待办按本地日期过滤；启动后一直开着时 today 会停留在昨天，
// 导致跨午夜后仍显示昨天已完成的任务（gpui/tui 每次渲染实时取日期，表现不同）。
let todayTimer: number | undefined
function refreshToday(): void {
  tasks.refreshToday()
}

onMounted(() => {
  void bootstrap()
  window.addEventListener('beforeunload', onBeforeUnload)
  // 页面重新获得焦点 / 从后台切回时立即校正日期
  window.addEventListener('focus', refreshToday)
  document.addEventListener('visibilitychange', refreshToday)
  // 兜底：即使窗口一直前台且无焦点变化，也每分钟校正一次
  todayTimer = window.setInterval(refreshToday, 60_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('focus', refreshToday)
  document.removeEventListener('visibilitychange', refreshToday)
  if (todayTimer !== undefined) window.clearInterval(todayTimer)
})
</script>

<template>
  <TopBar :page="page" />
  <!-- 页面纵向滚动用 Reka ScrollArea：自定义滚动条与分类横向滚动条统一样式（.ui-scroll-*） -->
  <ScrollAreaRoot id="main" class="ui-scroll-root ui-scroll-root--v">
    <ScrollAreaViewport class="ui-scroll-viewport"><RouterView /></ScrollAreaViewport>
    <ScrollAreaScrollbar orientation="vertical" class="ui-scrollbar ui-scrollbar--v" force-mount>
      <ScrollAreaThumb class="ui-scroll-thumb" />
    </ScrollAreaScrollbar>
    <ScrollAreaCorner class="ui-scroll-corner" />
  </ScrollAreaRoot>
  <div id="qabar-layer"><QuickAddBar v-if="page === 'today'" /></div>
  <Toast />
  <ConfirmDeleteDialog />
  <div id="overlay-host" />
</template>
