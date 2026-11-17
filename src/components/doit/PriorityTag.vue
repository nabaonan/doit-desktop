<script setup lang="ts">
import { computed } from 'vue'
import { PRIORITY_META } from '@/constants/tokens'
import type { Priority } from '@/domain/types'

const props = defineProps<{ value: Priority }>()
const meta = computed(() => PRIORITY_META[props.value] ?? PRIORITY_META[0])
</script>

<template>
  <span
    class="prio-tag prio-readonly"
    :class="`prio-${meta.varName}`"
    :title="`优先级：${meta.label}（仅可通过右键菜单调整）`"
  >
    <span class="prio-dot" />{{ meta.label }}
  </span>
</template>
