<script setup lang="ts">
import { computed } from 'vue'
import { PRIORITY_META } from '@/constants/tokens'
import UiTooltip from '@/components/ui/UiTooltip.vue'
import type { Priority } from '@/domain/types'

const props = defineProps<{ value: Priority }>()
// 与手机端一致：值为 0（不设）时不展示优先级标签
const meta = computed(() => PRIORITY_META[props.value] ?? PRIORITY_META[1])
const tip = computed(() => `优先级：${meta.value.label}（仅可通过右键菜单调整）`)
</script>

<template>
  <UiTooltip v-if="props.value !== 0" :text="tip">
    <span
      class="prio-tag prio-readonly"
      :class="`prio-${meta.varName}`"
    >
      <span class="prio-dot" />{{ meta.label }}
    </span>
  </UiTooltip>
</template>
