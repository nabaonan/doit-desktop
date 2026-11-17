<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import '@/services/echarts'
import { useChartPalette } from '@/composables/useChartPalette'

const props = defineProps<{
  data: Array<{ name: string; count: number }>
  colors: Record<string, string>
}>()

const palette = useChartPalette()
const hasData = computed(() => props.data.some((d) => d.count > 0))
// 图例按「所有分类」展示，无完成数据的分类也要出现（计数 0）
const legendNames = computed(() => props.data.map((d) => d.name))

const option = computed<EChartsOption>(() => {
  const p = palette.value
  return {
    animationDuration: 420,
    tooltip: {
      show: hasData.value,
      trigger: 'item',
      confine: true,
      backgroundColor: p.card,
      borderColor: p.line,
      borderWidth: 1,
      padding: [10, 13],
      extraCssText: 'border-radius:12px;box-shadow:0 12px 34px rgba(18,46,38,.18);z-index:120;',
      textStyle: { color: p.ink, fontSize: 12 },
      formatter: (raw: unknown) => {
        const params = raw as { name: string; value: number; percent: number }
        return `<div style="font-size:11px;color:${p.ink3};font-weight:700;margin-bottom:5px">占区间完成</div>` +
          `<div style="font-size:13px;color:${p.ink2}">${params.name} · 完成 <b style="font-size:18px;color:${p.mintDeep}">${params.value}</b> 项（${params.percent}%）</div>`
      },
    },
    legend: {
      show: legendNames.value.length > 0,
      data: legendNames.value,
      orient: 'vertical',
      left: '48%',
      top: 'middle',
      icon: 'circle',
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 12,
      textStyle: { color: p.ink2, fontSize: 12 },
      formatter: (name: string) => {
        const item = props.data.find((d) => d.name === name)
        return `${name} · ${item?.count ?? 0}`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['30%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: p.card, borderWidth: 2, borderRadius: 5 },
        emphasis: { scale: true, scaleSize: 6 },
        data: hasData.value
          ? props.data.map((d) => ({
              name: d.name,
              value: d.count,
              itemStyle: { color: props.colors[d.name] ?? p.mint },
            }))
          : [{ name: '暂无完成', value: 1, itemStyle: { color: p.line } }],
      },
    ],
  }
})
</script>

<template>
  <div class="ring-chart">
    <VChart :option="option" autoresize />
  </div>
</template>
