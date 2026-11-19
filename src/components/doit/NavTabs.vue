<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import type { PageId } from '@/domain/types'

defineProps<{ page: PageId }>()
const router = useRouter()
const tabs: Array<{ id: PageId; icon: string; label: string }> = [
  { id: 'today', icon: 'today', label: '今日' },
  { id: 'stats', icon: 'stats', label: '统计' },
  { id: 'calendar', icon: 'calendar', label: '月历' },
  { id: 'settings', icon: 'settings', label: '设置' },
]

function go(id: PageId): void {
  void router.push(`/${id}`)
}
</script>

<template>
  <nav class="tb-nav">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      :class="{ active: page === tab.id }"
      type="button"
      @click="go(tab.id)"
    >
      <Icon :name="tab.icon" :size="16" />
      <span class="lbl">{{ tab.label }}</span>
    </button>
  </nav>
</template>
