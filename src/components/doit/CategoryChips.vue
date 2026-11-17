<script setup lang="ts">
import { ref } from 'vue'
import CategoryManagerDialog from '@/components/doit/CategoryManagerDialog.vue'
import { useTaskStore } from '@/stores/tasks'
import type { Category } from '@/domain/types'

const tasks = useTaskStore()
const showManager = ref(false)

function select(name: string): void {
  tasks.setFilter(name)
}

function activeStyle(c: Category): Record<string, string> | undefined {
  if (tasks.filter !== c.name) return undefined
  // 选中态不加投影：filterbar 横向滚动容器会裁掉投影，纯色底 + 白字已足够（与 .chip.active 的 CSS 一致）
  return { background: c.color, 'border-color': c.color, color: '#fff' }
}
</script>

<template>
  <div class="filter-sticky">
    <div class="filterbar">
      <div class="chip" :class="{ active: tasks.filter === 'all' }" @click="select('all')">全部</div>
      <div
        v-for="c in tasks.categories"
        :key="c.name"
        class="chip"
        :class="{ active: tasks.filter === c.name }"
        :style="activeStyle(c)"
        @click="select(c.name)"
      >
        <span v-if="tasks.filter !== c.name" class="cat-dot" :style="{ background: c.color }" />
        {{ c.name }}
      </div>
      <button type="button" class="chip chip-add" title="添加分类" @click="showManager = true">
        <span class="chip-add-plus">+</span> 添加分类
      </button>
    </div>
    <CategoryManagerDialog v-model:open="showManager" />
  </div>
</template>
