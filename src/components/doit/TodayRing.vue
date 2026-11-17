<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ done: number; total: number; size?: number }>(), { size: 28 })
const pct = computed(() => (props.total > 0 ? props.done / props.total : 0))
const pctText = computed(() => `${Math.round(pct.value * 100)}%`)
const r = 18
const circumference = 2 * Math.PI * r
const dash = computed(() => `${pct.value * circumference} ${circumference}`)
</script>

<template>
  <div class="ring-wrap ring-sm">
    <svg :width="props.size" :height="props.size" viewBox="0 0 44 44">
      <circle cx="22" cy="22" :r="r" fill="none" stroke="var(--line)" stroke-width="4" />
      <circle
        cx="22" cy="22" :r="r" fill="none" stroke="var(--mint)" stroke-width="4"
        stroke-linecap="round" :stroke-dasharray="dash" transform="rotate(-90 22 22)"
      />
      <text x="22" y="25.5" text-anchor="middle" class="ring-pct">{{ pctText }}</text>
    </svg>
  </div>
</template>
