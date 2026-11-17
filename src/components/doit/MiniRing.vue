<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ pct: number; size?: number }>(), { size: 20 })
const circumference = 2 * Math.PI * 8
const dash = computed(() => `${(Math.max(0, Math.min(100, props.pct)) / 100) * circumference} ${circumference}`)
</script>

<template>
  <span class="task-ring" :title="`子任务进度 ${props.pct}%`">
    <svg :width="props.size" :height="props.size" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--line)" stroke-width="3" />
      <circle
        cx="10" cy="10" r="8" fill="none" stroke="var(--mint)" stroke-width="3"
        stroke-linecap="round" :stroke-dasharray="dash" transform="rotate(-90 10 10)"
      />
    </svg>
    <span class="ring-pct">{{ props.pct }}%</span>
  </span>
</template>
