<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSyncStore } from '@/stores/sync'
import { useTaskStore } from '@/stores/tasks'
import Icon from '@/components/ui/Icon.vue'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import TodayRing from './TodayRing.vue'
import { fmtMD } from '@/domain/date'

const tasks = useTaskStore()
const sync = useSyncStore()
const router = useRouter()

const now = new Date()
const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
const dateLabel = `${fmtMD(now)} 周${weekday}`

const syncMeta = computed(() => {
  switch (sync.kind) {
    case 'syncing': return { icon: 'cloud', label: '同步中…', tip: '正在与远程同步…' }
    case 'off': return { icon: 'cloud', label: '同步已关闭', tip: '同步已关闭 · 可在设置中开启' }
    case 'error': return { icon: 'cloud', label: '同步异常', tip: sync.error?.message ?? '同步失败' }
    case 'dirty': return { icon: 'cloudDirty', label: '有未同步更改 · 点击同步', tip: '有本地更改尚未同步 · 点击立即同步' }
    default: return { icon: 'cloudOk', label: '已与远程同步', tip: '已与远程同步 · 点击立即同步' }
  }
})

function goToday(): void {
  void router.push('/today')
}
</script>

<template>
  <div class="tb-pills">
    <UiTooltip :text="syncMeta.tip">
      <div
        class="tb-pill sync-status clickable"
        :class="[sync.kind, { spin: sync.syncing }]"
        role="button"
        tabindex="0"
        @click="sync.syncNow()"
        @keydown.enter="sync.syncNow()"
      >
        <span class="cloud"><Icon :name="syncMeta.icon" :size="18" /></span>
        <span class="txt">{{ syncMeta.label }}</span>
        <Icon v-if="sync.syncing" name="sync" :size="14" />
      </div>
    </UiTooltip>
    <div
      class="tb-pill tb-dp clickable"
      role="button"
      tabindex="0"
      title="回到今日 · 今日完成进度"
      @click="goToday"
    >
      <span class="tb-dp-date">{{ dateLabel }}</span>
      <span class="tb-dp-sep" />
      <TodayRing :done="tasks.stats.done" :total="tasks.stats.total" :size="30" />
    </div>
  </div>
</template>
