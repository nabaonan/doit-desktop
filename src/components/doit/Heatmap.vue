<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import '@/services/echarts'
import { useChartPalette } from '@/composables/useChartPalette'
import { addDays, dayKey, rangeStart } from '@/domain/date'
import type { StatsRange } from '@/domain/types'

const props = defineProps<{ counts: Map<string, number>; range: StatsRange; today: number }>()

const palette = useChartPalette()
/** 横轴固定为周一 → 周日，每行恰好一周。 */
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 周一 = 0 … 周日 = 6，与横轴标签顺序一致。 */
function mondayIdx(d: Date): number {
  return (d.getDay() + 6) % 7
}

interface Layout {
  cols: number
  rows: number
  points: Array<{ value: [number, number, number]; key: string }>
}

/**
 * 布局（格子恒为正方形，高度按容器宽度动态推导）：
 * - week：近 7 天各占一列（col = 周几），1 行；
 * - month：起点对齐周一，每行一周，col = 周几、row = 第几周；
 * - year：53 列 × 7 行，col = 第几周、row = 周几。
 * 范围外（早于区间起点 / 晚于今天）的格子不进 data，天然留空。
 */
const layout = computed<Layout>(() => {
  const startTs = rangeStart(props.range, props.today)
  const start = new Date(startTs)
  const points: Layout['points'] = []

  if (props.range === 'week') {
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i)
      const key = dayKey(d)
      points.push({ value: [mondayIdx(d), 0, props.counts.get(key) ?? 0], key })
    }
    return { cols: 7, rows: 1, points }
  }

  const aligned = addDays(start, -mondayIdx(start))
  if (props.range === 'month') {
    const offset = mondayIdx(start)
    const rows = Math.ceil((offset + 30) / 7)
    for (let i = 0; i < rows * 7; i++) {
      const d = addDays(aligned, i)
      if (d.getTime() < startTs || d.getTime() > props.today) continue
      const key = dayKey(d)
      points.push({ value: [i % 7, Math.floor(i / 7), props.counts.get(key) ?? 0], key })
    }
    return { cols: 7, rows, points }
  }

  for (let i = 0; i < 371; i++) {
    const d = addDays(aligned, i)
    if (d.getTime() < startTs || d.getTime() > props.today) continue
    const key = dayKey(d)
    points.push({ value: [Math.floor(i / 7), i % 7, props.counts.get(key) ?? 0], key })
  }
  return { cols: 53, rows: 7, points }
})

/** grid 留白：week/month 底部给星期标签留 20px，year 无标签。 */
const margin = computed(() =>
  props.range === 'year'
    ? { left: 2, right: 2, top: 4, bottom: 4 }
    : { left: 2, right: 2, top: 4, bottom: 20 },
)

const wrap = ref<HTMLElement | null>(null)
const wrapW = ref(600)
let ro: ResizeObserver | null = null

onMounted(() => {
  ro = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width
    if (w) wrapW.value = w
  })
  if (wrap.value) ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())

/** 正方形关键：容器高 = 上下留白 + (容器宽 - 左右留白) / cols × rows。方块随容器宽度自适应。 */
const chartH = computed(() => {
  const { cols, rows } = layout.value
  const plotW = Math.max(140, wrapW.value - margin.value.left - margin.value.right)
  return Math.round(margin.value.top + margin.value.bottom + (plotW / cols) * rows)
})

/** 单格边长（px），驱动 borderWidth / borderRadius 随格子缩放。 */
const cellPx = computed(() => {
  const plotW = Math.max(140, wrapW.value - margin.value.left - margin.value.right)
  return plotW / layout.value.cols
})

const option = computed<EChartsOption>(() => {
  const p = palette.value
  const isYear = props.range === 'year'
  const { cols, rows } = layout.value
  const data = layout.value.points

  return {
    animation: false,
    grid: { ...margin.value, containLabel: false },
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      confine: true,
      backgroundColor: p.card,
      borderColor: p.line,
      borderWidth: 1,
      padding: [10, 13],
      extraCssText: 'border-radius:12px;box-shadow:0 12px 34px rgba(18,46,38,.18);z-index:120;',
      textStyle: { color: p.ink, fontSize: 12 },
      formatter: (raw: unknown) => {
        const params = raw as { data?: { key?: string; value?: [number, number, number] } }
        const key = params.data?.key ?? ''
        const count = params.data?.value?.[2] ?? 0
        return `<div style="font-size:11px;color:${p.ink3};font-weight:700;margin-bottom:5px">当日完成数</div>` +
          `<div style="font-size:13px;color:${p.ink2}">${key} · 完成 <b style="font-size:18px;color:${p.mintDeep}">${count}</b> 项任务</div>`
      },
    },
    xAxis: {
      type: 'category',
      data: isYear ? Array.from({ length: cols }, (_, i) => String(i)) : WEEKDAYS,
      show: !isYear,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.ink3, fontSize: 10, interval: 0, margin: 6 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: Array.from({ length: rows }, (_, i) => String(i)),
      inverse: true,
      show: false,
      axisLine: { show: false },
      axisTick: { show: false },
      splitArea: { show: false },
    },
    visualMap: {
      show: false,
      type: 'piecewise',
      pieces: [
        { min: 0, max: 0, color: p.heat[0] },
        { min: 1, max: 2, color: p.heat[1] },
        { min: 3, max: 4, color: p.heat[2] },
        { min: 5, max: 7, color: p.heat[3] },
        { min: 8, color: p.heat[4] },
      ],
    },
    series: [
      {
        type: 'heatmap',
        data,
        progressive: 0,
        itemStyle: {
          borderColor: p.card,
          borderWidth: Math.min(5, Math.max(2, Math.round(cellPx.value * 0.05))),
          // 圆角随格边长放大：week/month 大格子约 10px，year 小格子最小 3px，避免过于方正
          borderRadius: Math.min(10, Math.max(3, Math.round(cellPx.value * 0.2))),
        },
        emphasis: {
          itemStyle: { borderColor: p.mint, borderWidth: Math.min(6, Math.max(3, Math.round(cellPx.value * 0.05) + 1)), shadowBlur: 8, shadowColor: p.mint },
        },
      },
    ],
  }
})
</script>

<template>
  <div>
    <div ref="wrap" class="heat-scroll">
      <VChart class="heat-chart" :style="{ height: chartH + 'px' }" :option="option" autoresize />
    </div>
    <div class="heat-legend">
      少
      <i v-for="(color, i) in palette.heat" :key="i" :style="{ background: color }" />
      多
    </div>
  </div>
</template>
