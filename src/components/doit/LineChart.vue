<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import '@/services/echarts'
import { useChartPalette } from '@/composables/useChartPalette'

const props = defineProps<{ buckets: Array<{ label: string; count: number }>; range: 'week' | 'month' | 'year' }>()

const palette = useChartPalette()

const option = computed<EChartsOption>(() => {
  const p = palette.value
  return {
    animationDuration: 420,
    grid: { left: 8, right: 12, top: 14, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: p.card,
      borderColor: p.line,
      borderWidth: 1,
      padding: [10, 13],
      extraCssText: 'border-radius:12px;box-shadow:0 12px 34px rgba(18,46,38,.18);z-index:120;',
      textStyle: { color: p.ink, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: p.mint, width: 1, type: 'dashed' } },
      formatter: (raw: unknown) => {
        const params = raw as Array<{ axisValue: string; value: number }>
        const point = params[0]
        if (!point) return ''
        return `<div style="font-size:11px;color:${p.ink3};font-weight:700;margin-bottom:5px">${props.range === 'year' ? '按月汇总' : '当日完成数'}</div>` +
          `<div style="font-size:13px;color:${p.ink2}">${point.axisValue} · 完成 <b style="font-size:18px;color:${p.mintDeep}">${point.value}</b> 项任务</div>`
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.buckets.map((b) => b.label),
      axisLine: { lineStyle: { color: p.line } },
      axisTick: { show: false },
      axisLabel: { color: p.ink3, fontSize: 10, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: p.line, type: 'dashed' } },
      axisLabel: { color: p.ink3, fontSize: 10 },
    },
    series: [
      {
        type: 'line',
        data: props.buckets.map((b) => b.count),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: props.buckets.length <= 12,
        lineStyle: { color: p.mint, width: 2.6 },
        itemStyle: { color: p.mint, borderColor: p.card, borderWidth: 2 },
        areaStyle: { color: p.mintSoft, opacity: 0.75 },
        emphasis: { focus: 'series', scale: 1.4 },
      },
    ],
  }
})
</script>

<template>
  <div class="line-chart">
    <VChart :option="option" autoresize />
  </div>
</template>
