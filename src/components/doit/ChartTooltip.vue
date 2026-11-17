<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '@/stores/ui'

const ui = useUIStore()
const tip = computed(() => ui.tooltip)
const style = computed(() => tip.value
  ? { left: `${tip.value.anchor.x}px`, top: `${Math.max(8, tip.value.anchor.y - 12)}px` }
  : {})
</script>

<template>
  <Teleport to="#overlay-host">
    <div v-if="tip" class="chart-tip show vue-tip" :style="style" @click.stop>
      <div class="ct-label">{{ tip.extra ?? '完成情况' }}</div>
      <div class="ct-main">{{ tip.label }} · 完成 <b>{{ tip.count }}</b> 项任务</div>
      <div v-if="tip.pinned" class="ct-extra">已固定 · 点击其它位置或按 Esc 收起</div>
    </div>
  </Teleport>
</template>

<style>
.chart-tip.vue-tip { transform: translate(-50%, -100%); }
</style>
