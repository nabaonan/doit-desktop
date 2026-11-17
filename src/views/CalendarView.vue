<script setup lang="ts">
import { computed } from 'vue'
import MonthCalendar from '@/components/doit/MonthCalendar.vue'
import DayDoneList from '@/components/doit/DayDoneList.vue'
import { addMonths, dayKey, startOfMonth } from '@/domain/date'
import { dailyCounts } from '@/domain/stats'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'

const tasks = useTaskStore()
const ui = useUIStore()
const doneByDay = computed(() => dailyCounts(tasks.root, 'year', tasks.today))
const doneOn = computed(() => [...tasks.index.values()].filter(
  (n) => n.parentUid === null && n.done && n.completedAt !== null && dayKey(n.completedAt) === ui.calSel,
))

function prev(): void { ui.calMonth = addMonths(ui.calMonth, -1) }
function next(): void { ui.calMonth = addMonths(ui.calMonth, 1) }
function today(): void {
  ui.calMonth = startOfMonth(new Date())
  ui.calSel = dayKey(new Date())
}
</script>

<template>
  <div class="page">
    <div class="cal-layout">
      <MonthCalendar
        :month="ui.calMonth"
        :selected="ui.calSel"
        :done-by-day="doneByDay"
        @select="(key) => { ui.calSel = key }"
        @prev="prev"
        @next="next"
        @today="today"
      />
      <DayDoneList :date-key="ui.calSel" :tasks="doneOn" />
    </div>
  </div>
</template>
