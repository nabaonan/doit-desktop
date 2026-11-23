<script setup lang="ts">
import { computed } from 'vue'
import Heatmap from '@/components/doit/Heatmap.vue'
import DonutChart from '@/components/doit/DonutChart.vue'
import LineChart from '@/components/doit/LineChart.vue'
import { categoryShare, dailyCounts, trendBuckets } from '@/domain/stats'
import { useTaskStore } from '@/stores/tasks'
import { useUIStore } from '@/stores/ui'
import type { StatsRange } from '@/domain/types'

const tasks = useTaskStore()
const ui = useUIStore()
const ranges: Array<{ id: StatsRange; label: string }> = [
  { id: 'week', label: '近一周' },
  { id: 'month', label: '近一月' },
  { id: 'year', label: '近一年' },
]

const counts = computed(() => dailyCounts(tasks.root, ui.range, tasks.today))
const share = computed(() => categoryShare(tasks.root, ui.range, tasks.today, tasks.categories))
const buckets = computed(() => trendBuckets(tasks.root, ui.range, tasks.today))
const colors = computed<Record<string, string>>(() =>
  Object.fromEntries(tasks.categories.map((c) => [c.name, c.color])))
</script>

<template>
  <div class="page page-stats">
    <div class="range-sticky"><div class="range-tabs">
      <button v-for="r in ranges" :key="r.id" :class="{ on: ui.range === r.id }" @click="ui.setRange(r.id)">
        {{ r.label }}
      </button>
    </div></div>
    <div class="stat-grid">
      <div class="stat-card">
        <h3>完成热力图</h3>
        <p class="chart-hint">悬停或点击色块查看当日完成了几项任务</p>
        <Heatmap :counts="counts" :range="ui.range" :today="tasks.today" />
      </div>
      <div class="stat-card">
        <h3>分类占比（区间完成）</h3>
        <p class="chart-hint">悬停扇区或图例查看该分类完成数</p>
        <DonutChart :data="share" :colors="colors" />
      </div>
      <div class="stat-card">
        <h3>{{ ui.range === 'year' ? '每月完成趋势' : '每日完成趋势' }}</h3>
        <p class="chart-hint">悬停数据点查看{{ ui.range === 'year' ? '当月' : '当日' }}完成了几项任务</p>
        <LineChart :buckets="buckets" :range="ui.range" />
      </div>
    </div>
  </div>
</template>
