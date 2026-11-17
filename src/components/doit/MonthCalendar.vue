<script setup lang="ts">
import { computed } from 'vue'
import { dayKey } from '@/domain/date'
import { monthGrid } from '@/domain/stats'

const props = defineProps<{ month: Date; selected: string; doneByDay: Map<string, number> }>()
const emit = defineEmits<{
  (e: 'select', key: string): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'today'): void
}>()

const grid = computed(() => monthGrid(props.month.getFullYear(), props.month.getMonth()))
const todayKey = dayKey(new Date())
const dows = ['日', '一', '二', '三', '四', '五', '六']
</script>

<template>
  <div class="cal-panel">
    <div class="cal-head">
      <div class="cal-mid">
        <div class="cal-nav" title="上个月" @click="emit('prev')">‹</div>
        <b>{{ props.month.getFullYear() }}年 {{ props.month.getMonth() + 1 }}月</b>
        <div class="cal-nav" title="下个月" @click="emit('next')">›</div>
      </div>
      <div class="cal-nav cal-today" @click="emit('today')">回到今天</div>
    </div>
    <div class="cal-grid">
      <div v-for="d in dows" :key="d" class="cal-dow">{{ d }}</div>
      <div
        v-for="cell in grid" :key="cell.dayKey"
        class="cal-cell"
        :class="{ today: cell.dayKey === todayKey, sel: cell.dayKey === props.selected }"
        @click="cell.inMonth && emit('select', cell.dayKey)"
      >
        <div class="d">{{ cell.day }}</div>
        <span v-if="(props.doneByDay.get(cell.dayKey) ?? 0) > 0" class="cal-dot" />
      </div>
    </div>
  </div>
</template>
